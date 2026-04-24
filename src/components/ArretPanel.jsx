import { useState, useEffect, useRef, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import Papa from "papaparse";

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateMinutes(v, stopLat, stopLon) {
  const d = distKm(v.lat, v.lon, stopLat, stopLon);
  const kmh = (v.speed || 0) > 5 ? v.speed : 20;
  return Math.round((d / kmh) * 60);
}

let stopsCache = null;
async function loadStops() {
  if (stopsCache) return stopsCache;
  // Supprime BOM UTF-8 et retours chariot Windows avant parsing
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
        stops.push({
          id:   (d.stop_id || "").trim(),
          name: d.stop_name.trim(),
          lat,
          lon,
        });
      }
    },
  });
  stopsCache = stops;
  return stops;
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

export default function ArretPanel({ theme: t, vehicules }) {
  const [query, setQuery]             = useState("");
  const [allStops, setAllStops]       = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showDrop, setShowDrop]       = useState(false);
  const [selectedStop, setSelectedStop] = useState(null);
  const [tick, setTick]               = useState(0);
  const mapRef = useRef(null);

  useEffect(() => { loadStops().then(setAllStops); }, []);
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 10000);
    return () => clearInterval(id);
  }, []);

  // Calcul suggestions
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

  const selectStop = (stop) => {
    setSelectedStop(stop);
    setQuery(stop.name);
    setSuggestions([]);
    setShowDrop(false);
  };

  const selectByName = (name) => {
    const q = name.toLowerCase();
    const match = allStops.find(s => s.name.toLowerCase() === q)
      || allStops.find(s => s.name.toLowerCase().includes(q));
    if (match) selectStop(match);
    else { setQuery(name); setShowDrop(true); }
  };

  const passages = useMemo(() => {
    if (!selectedStop || vehicules.length === 0) return [];
    return vehicules
      .filter(v => v.lat && v.lon && distKm(v.lat, v.lon, selectedStop.lat, selectedStop.lon) <= 2.5)
      .map(v => ({
        ...v,
        minutes: estimateMinutes(v, selectedStop.lat, selectedStop.lon),
        dist:    distKm(v.lat, v.lon, selectedStop.lat, selectedStop.lon),
      }))
      .filter(v => v.minutes <= 20)
      .sort((a, b) => a.minutes - b.minutes)
      .slice(0, 10);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStop, vehicules, tick]);

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

      {/* ── Barre de recherche ── */}
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
              onClick={() => { setQuery(""); setSelectedStop(null); setSuggestions([]); setShowDrop(false); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: t.textHint, fontSize: 20, lineHeight: 1, padding: 0 }}
            >×</button>
          )}
        </div>

        {/* Dropdown suggestions — en dehors du flux pour ne pas être coupé */}
        {showSugg && (
          <div style={{ position: "absolute", top: "calc(100% - 2px)", left: 14, right: 14, background: t.panelBg, borderRadius: "0 0 14px 14px", border: `0.5px solid ${t.borderStrong}`, borderTop: "none", boxShadow: "0 12px 32px rgba(0,0,0,0.18)", zIndex: 200, overflow: "hidden" }}>
            {suggestions.map((s, i) => (
              <button
                key={s.id}
                onMouseDown={e => e.preventDefault()}
                onClick={() => selectStop(s)}
                style={{ width: "100%", padding: "11px 16px", background: "none", border: "none", borderTop: i > 0 ? `0.5px solid ${t.border}` : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left", fontFamily: "'Inter',system-ui,sans-serif" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={t.accent} strokeWidth="2.5" style={{ flexShrink: 0 }}>
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                </svg>
                <span style={{ fontSize: 13, color: t.text, fontWeight: 500 }}>{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Contenu ── */}
      {!selectedStop ? (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.textHint, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 12 }}>Arrêts populaires</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
            {POPULAR.map(name => (
              <button
                key={name}
                onClick={() => selectByName(name)}
                style={{ padding: "8px 14px", borderRadius: 20, background: t.cardBg, border: `0.5px solid ${t.border}`, cursor: "pointer", fontSize: 13, color: t.textSub, fontFamily: "'Inter',system-ui,sans-serif", display: "flex", alignItems: "center", gap: 6 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill={t.textHint} stroke="none">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                {name}
              </button>
            ))}
          </div>
          <div style={{ padding: "24px 20px", background: t.cardBg, borderRadius: 16, border: `0.5px solid ${t.border}`, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🚏</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 8 }}>Prochain passage</div>
            <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.7 }}>Recherche ou sélectionne un arrêt pour voir les prochains trams et bus en temps réel.</div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Mini-carte */}
          <div style={{ height: 200, flexShrink: 0 }}>
            <MapContainer
              center={[selectedStop.lat, selectedStop.lon]}
              zoom={16}
              style={{ height: "100%", width: "100%" }}
              ref={mapRef}
              zoomControl={false}
            >
              <TileLayer attribution="&copy; OpenStreetMap contributors &copy; CARTO" url={t.mapTile} />

              {nearbyStops.map(s => (
                <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={4}
                  fillColor={t.textHint} color="#fff" weight={1.5} fillOpacity={0.7}
                  eventHandlers={{ click: () => selectStop(s) }}>
                  <Popup><span style={{ fontSize: 11, fontFamily: "'Inter',system-ui,sans-serif" }}>{s.name}</span></Popup>
                </CircleMarker>
              ))}

              <Marker position={[selectedStop.lat, selectedStop.lon]} icon={stopIcon}>
                <Popup><strong style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>{selectedStop.name}</strong></Popup>
              </Marker>

              {passages.map(v => {
                const lbl = v.route_short_name.length > 3 ? v.route_short_name.slice(0, 3) : v.route_short_name;
                const vIcon = L.divIcon({
                  className: "",
                  html: `<div style="width:22px;height:22px;border-radius:6px;background:#${v.route_color};border:2px solid rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#${v.route_text_color||"fff"};font-family:'Inter',system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${lbl}</div>`,
                  iconSize: [22, 22], iconAnchor: [11, 11],
                });
                return (
                  <Marker key={v.id} position={[v.lat, v.lon]} icon={vIcon}>
                    <Popup>
                      <div style={{ fontFamily: "'Inter',system-ui,sans-serif", fontSize: 12, padding: "2px 0" }}>
                        <div style={{ fontWeight: 700 }}>Ligne {v.route_short_name}</div>
                        <div style={{ color: "#666", marginTop: 2 }}>{v.headsign}</div>
                        <div style={{ marginTop: 4, color: "#0074c9", fontWeight: 600 }}>~{v.minutes} min</div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              <FlyTo position={[selectedStop.lat, selectedStop.lon]} />
            </MapContainer>
          </div>

          {/* Header arrêt */}
          <div style={{ padding: "11px 16px 8px", background: t.panelBg, borderBottom: `0.5px solid ${t.border}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0074c9", flexShrink: 0 }}></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedStop.name}</div>
              <div style={{ fontSize: 11, color: t.textSub, marginTop: 1 }}>
                {passages.length > 0
                  ? `${passages.length} passage${passages.length > 1 ? "s" : ""} dans les 20 prochaines min`
                  : "Aucun passage détecté à proximité"}
              </div>
            </div>
            <button
              onClick={() => { setSelectedStop(null); setQuery(""); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: t.textHint, fontSize: 20, padding: 0, lineHeight: 1, flexShrink: 0 }}
            >×</button>
          </div>

          {/* Liste passages */}
          <div style={{ flex: 1, overflowY: "auto", background: t.bg }}>
            {passages.length === 0 ? (
              <div style={{ padding: "36px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🚏</div>
                <div style={{ fontSize: 13, color: t.textSub, lineHeight: 1.7 }}>Aucun véhicule détecté dans un rayon de 2,5 km. Réessaie dans quelques instants.</div>
              </div>
            ) : (
              passages.map((v, i) => <PassageRow key={v.id} v={v} t={t} isFirst={i === 0} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PassageRow({ v, t, isFirst }) {
  const color = `#${v.route_color}`;
  const mins  = v.minutes;
  const minLabel = mins === 0 ? "Imm." : `${mins} min`;
  const minColor = mins <= 1 ? "#22c55e" : mins <= 4 ? "#f59e0b" : t.accent;

  return (
    <div style={{ padding: "12px 16px", borderBottom: `0.5px solid ${t.border}`, display: "flex", alignItems: "center", gap: 12, background: isFirst ? `${color}08` : t.panelBg }}>
      <div style={{ minWidth: 36, height: 28, borderRadius: 8, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: `#${v.route_text_color || "fff"}`, padding: "0 6px", flexShrink: 0 }}>
        {v.route_short_name}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.headsign}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
          <span style={{ fontSize: 10, color: t.textHint }}>{v.vehicleType === "tram" ? "Tramway" : v.vehicleType === "bustram" ? "BRT" : "Bus"}</span>
          <span style={{ fontSize: 10, color: t.textHint }}>·</span>
          <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: (v.speed || 0) > 0 ? "#22c55e" : "#f59e0b" }}></span>
          <span style={{ fontSize: 10, color: t.textHint }}>{(v.speed || 0) > 0 ? `${Math.round(v.speed)} km/h` : "À l'arrêt"}</span>
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: minColor, lineHeight: 1 }}>{minLabel}</div>
        <div style={{ fontSize: 9, color: t.textHint, marginTop: 2 }}>{(v.dist * 1000).toFixed(0)} m</div>
      </div>
    </div>
  );
}
