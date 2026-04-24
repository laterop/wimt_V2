import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import Papa from "papaparse";
import protobuf from "protobufjs";

// ─── Config ───────────────────────────────────────────────────────────────────

const PROXY_URL = import.meta.env.VITE_GTFS_RT_URL || "https://tam-proxy.drivedemerde.workers.dev";
const TRIP_UPDATE_URL = `${PROXY_URL}?feed=tripupdate`;

// ─── Cache stops ─────────────────────────────────────────────────────────────

let stopsCache = null;
async function loadStops() {
  if (stopsCache) return stopsCache;
  const raw = await fetch("/stops.txt").then(r => r.text());
  const text = raw.replace(/^\uFEFF/, "").replace(/\r/g, "");
  const stops = [];
  Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    step: ({ data: d }) => {
      const lat = parseFloat(d.stop_lat);
      const lon = parseFloat(d.stop_lon);
      if (d.stop_name && !isNaN(lat) && !isNaN(lon)) {
        stops.push({ id: (d.stop_id || "").trim(), name: d.stop_name.trim(), lat, lon });
      }
    },
  });
  stopsCache = stops;
  return stops;
}

// ─── Cache proto ──────────────────────────────────────────────────────────────

let FeedMessageCache = null;
async function getFeedMessage() {
  if (FeedMessageCache) return FeedMessageCache;
  const protoText = await fetch("/gtfs-realtime.proto").then(r => r.text());
  const root = protobuf.parse(protoText).root;
  FeedMessageCache = root.lookupType("transit_realtime.FeedMessage");
  return FeedMessageCache;
}

// ─── Fetch TripUpdate ─────────────────────────────────────────────────────────

async function fetchTripUpdates() {
  const [FeedMessage, buffer] = await Promise.all([
    getFeedMessage(),
    fetch(TRIP_UPDATE_URL).then(r => r.arrayBuffer()),
  ]);
  const msg = FeedMessage.decode(new Uint8Array(buffer));
  return msg.entity || [];
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toSeconds(t) {
  // Long protobuf (low/high) ou number
  if (t == null) return null;
  if (typeof t === "object" && t.low != null) return t.low;
  return Number(t);
}

function FlyTo({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 16, { duration: 0.7 });
  }, [position, map]);
  return null;
}

const POPULAR = ["Corum", "Comédie", "Gare Saint-Roch", "Mosson", "Odysseum", "Place de France"];

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ArretPanel({ theme: t, routesMap }) {
  const [query, setQuery]               = useState("");
  const [allStops, setAllStops]         = useState([]);
  const [suggestions, setSuggestions]   = useState([]);
  const [showDrop, setShowDrop]         = useState(false);
  const [selectedStop, setSelectedStop] = useState(null);
  const [passages, setPassages]         = useState([]);
  const [loading, setLoading]           = useState(false);
  const [lastFetch, setLastFetch]       = useState(null);
  const mapRef = useRef(null);
  const timerRef = useRef(null);

  // Charger stops au montage
  useEffect(() => { loadStops().then(setAllStops); }, []);

  // Suggestions
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) { setSuggestions([]); return; }
    const seen = new Set();
    const res = allStops.filter(s => {
      const k = s.name.toLowerCase();
      if (!k.includes(q) || seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 8);
    setSuggestions(res);
  }, [query, allStops]);

  // Fetch TripUpdate pour l'arrêt sélectionné
  const fetchPassages = useCallback(async (stop) => {
    if (!stop) return;
    setLoading(true);
    try {
      const entities = await fetchTripUpdates();
      const now = Math.floor(Date.now() / 1000);
      const results = [];

      for (const entity of entities) {
        const tu = entity.tripUpdate;
        if (!tu || !tu.stopTimeUpdate) continue;
        const trip = tu.trip || {};
        const route_id = (trip.routeId || "").replace(/^.*:/, "");

        for (const stu of tu.stopTimeUpdate) {
          const sid = String(stu.stopId || "").trim();
          if (sid !== stop.id) continue;

          // Prendre departure ou arrival
          const dep = stu.departure || stu.arrival;
          if (!dep) continue;
          const ts = toSeconds(dep.time);
          if (!ts) continue;

          const mins = Math.round((ts - now) / 60);
          if (mins < 0 || mins > 60) continue;

          results.push({
            trip_id:   trip.tripId || "",
            route_id,
            mins,
            ts,
            headsign:  tu.vehicle?.label || "",
          });
        }
      }

      // Dédupliquer par trip_id et trier
      const seen = new Set();
      const deduped = results
        .filter(r => { if (seen.has(r.trip_id)) return false; seen.add(r.trip_id); return true; })
        .sort((a, b) => a.mins - b.mins)
        .slice(0, 12);

      setPassages(deduped);
      setLastFetch(new Date());
    } catch (err) {
      console.error("TripUpdate fetch error:", err);
    }
    setLoading(false);
  }, []);

  // Refresh toutes les 20s
  useEffect(() => {
    if (!selectedStop) return;
    fetchPassages(selectedStop);
    timerRef.current = setInterval(() => fetchPassages(selectedStop), 20000);
    return () => clearInterval(timerRef.current);
  }, [selectedStop, fetchPassages]);

  const selectStop = (stop) => {
    setSelectedStop(stop);
    setQuery(stop.name);
    setSuggestions([]);
    setShowDrop(false);
    setPassages([]);
  };

  const selectByName = (name) => {
    const q = name.toLowerCase();
    const match = allStops.find(s => s.name.toLowerCase() === q)
      || allStops.find(s => s.name.toLowerCase().includes(q));
    if (match) selectStop(match);
    else { setQuery(name); setShowDrop(true); }
  };

  const nearbyStops = useMemo(() => {
    if (!selectedStop) return [];
    return allStops.filter(s => s.id !== selectedStop.id && distKm(s.lat, s.lon, selectedStop.lat, selectedStop.lon) < 0.35);
  }, [selectedStop, allStops]);

  const stopIcon = L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:#0074c9;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,116,201,0.5);"></div>`,
    iconSize: [16, 16], iconAnchor: [8, 8],
  });

  const showSugg = showDrop && suggestions.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: t.bg }}>

      {/* ── Recherche ── */}
      <div style={{ padding: "12px 14px 10px", background: t.panelBg, borderBottom: `0.5px solid ${t.border}`, position: "relative", zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: t.inputBg, borderRadius: 12, padding: "10px 14px", border: `0.5px solid ${showSugg ? t.accent : t.borderStrong}`, transition: "border-color 0.15s" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={t.textHint} strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Rechercher un arrêt..."
            value={query}
            onChange={e => { setQuery(e.target.value); setShowDrop(true); }}
            onFocus={() => setShowDrop(true)}
            onBlur={() => setTimeout(() => setShowDrop(false), 150)}
            style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 14, color: t.text, fontFamily: "'Inter',system-ui,sans-serif" }}
          />
          {query && (
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={() => { setQuery(""); setSelectedStop(null); setSuggestions([]); setPassages([]); setShowDrop(false); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: t.textHint, fontSize: 20, lineHeight: 1, padding: 0 }}
            >×</button>
          )}
        </div>

        {showSugg && (
          <div style={{ position: "absolute", top: "calc(100% - 2px)", left: 14, right: 14, background: t.panelBg, borderRadius: "0 0 14px 14px", border: `0.5px solid ${t.borderStrong}`, borderTop: "none", boxShadow: "0 12px 32px rgba(0,0,0,0.18)", zIndex: 200, overflow: "hidden" }}>
            {suggestions.map((s, i) => (
              <button key={s.id}
                onMouseDown={e => e.preventDefault()}
                onClick={() => selectStop(s)}
                style={{ width: "100%", padding: "11px 16px", background: "none", border: "none", borderTop: i > 0 ? `0.5px solid ${t.border}` : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left", fontFamily: "'Inter',system-ui,sans-serif" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill={t.accent} stroke="none">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                <span style={{ fontSize: 13, color: t.text, fontWeight: 500 }}>{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Contenu ── */}
      {!selectedStop ? (
        <EmptyState t={t} onSelect={selectByName} />
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Mini-carte */}
          <div style={{ height: 190, flexShrink: 0 }}>
            <MapContainer center={[selectedStop.lat, selectedStop.lon]} zoom={16}
              style={{ height: "100%", width: "100%" }} ref={mapRef} zoomControl={false}>
              <TileLayer attribution="&copy; OpenStreetMap contributors &copy; CARTO" url={t.mapTile} />

              {nearbyStops.map(s => (
                <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={5}
                  fillColor={t.textHint} color="#fff" weight={1.5} fillOpacity={0.7}
                  eventHandlers={{ click: () => selectStop(s) }}>
                  <Popup><span style={{ fontSize: 11, fontFamily: "'Inter',system-ui,sans-serif" }}>{s.name}</span></Popup>
                </CircleMarker>
              ))}

              <Marker position={[selectedStop.lat, selectedStop.lon]} icon={stopIcon}>
                <Popup><strong style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>{selectedStop.name}</strong></Popup>
              </Marker>

              <FlyTo position={[selectedStop.lat, selectedStop.lon]} />
            </MapContainer>
          </div>

          {/* Header arrêt */}
          <div style={{ padding: "11px 16px", background: t.panelBg, borderBottom: `0.5px solid ${t.border}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0074c9", flexShrink: 0 }}></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedStop.name}</div>
              <div style={{ fontSize: 10, color: t.textSub, marginTop: 1 }}>
                {loading ? "Chargement..." : lastFetch ? `Mis à jour à ${lastFetch.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
              </div>
            </div>
            <button onClick={() => { setSelectedStop(null); setQuery(""); setPassages([]); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: t.textHint, fontSize: 20, padding: 0, lineHeight: 1 }}>×</button>
          </div>

          {/* Liste passages */}
          <div style={{ flex: 1, overflowY: "auto", background: t.bg }}>
            {loading && passages.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: t.textHint, fontSize: 13 }}>Chargement des prochains passages...</div>
            ) : passages.length === 0 ? (
              <div style={{ padding: "36px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🚏</div>
                <div style={{ fontSize: 13, color: t.textSub, lineHeight: 1.7 }}>Aucun passage prévu dans la prochaine heure pour cet arrêt.</div>
              </div>
            ) : (
              passages.map((p, i) => (
                <PassageRow key={p.trip_id + i} p={p} t={t} routesMap={routesMap} isFirst={i === 0} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Ligne de passage ─────────────────────────────────────────────────────────

function PassageRow({ p, t, routesMap, isFirst }) {
  const route = routesMap?.get(p.route_id) || {};
  const color = route.route_color ? `#${route.route_color}` : "#0074c9";
  const fg    = route.route_text_color ? `#${route.route_text_color}` : "#ffffff";
  const name  = route.route_short_name || p.route_id || "?";
  const mins  = p.mins;

  const minLabel = mins === 0 ? "Imm." : `${mins} min`;
  const minColor = mins <= 1 ? "#22c55e" : mins <= 4 ? "#f59e0b" : t.accent;

  // Heure de passage
  const heure = new Date(p.ts * 1000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ padding: "12px 16px", borderBottom: `0.5px solid ${t.border}`, display: "flex", alignItems: "center", gap: 12, background: isFirst ? `${color}08` : t.panelBg }}>
      <div style={{ minWidth: 36, height: 28, borderRadius: 8, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: fg, padding: "0 6px", flexShrink: 0 }}>
        {name}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {route.route_long_name || `Ligne ${name}`}
        </div>
        <div style={{ fontSize: 10, color: t.textHint, marginTop: 2 }}>départ {heure}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: minColor, lineHeight: 1 }}>{minLabel}</div>
      </div>
    </div>
  );
}

// ─── État vide ────────────────────────────────────────────────────────────────

function EmptyState({ t, onSelect }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: t.textHint, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 12 }}>Arrêts populaires</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
        {POPULAR.map(name => (
          <button key={name} onClick={() => onSelect(name)}
            style={{ padding: "8px 14px", borderRadius: 20, background: t.cardBg, border: `0.5px solid ${t.border}`, cursor: "pointer", fontSize: 13, color: t.textSub, fontFamily: "'Inter',system-ui,sans-serif", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill={t.accent} stroke="none">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            {name}
          </button>
        ))}
      </div>
      <div style={{ padding: "24px 20px", background: t.cardBg, borderRadius: 16, border: `0.5px solid ${t.border}`, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🚏</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 8 }}>Prochain passage</div>
        <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.7 }}>Recherche un arrêt pour voir les prochains passages en temps réel avec l'heure exacte.</div>
      </div>
    </div>
  );
}
