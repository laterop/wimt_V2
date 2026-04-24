import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import Papa from "papaparse";

// ─── Cache stops ──────────────────────────────────────────────────────────────

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

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Convertit "HH:MM:SS" (peut dépasser 24h en GTFS) en secondes depuis minuit aujourd'hui
function depToTimestamp(dep) {
  const parts = dep.split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parseInt(parts[2] || "0", 10);
  const now = new Date();
  const midnightToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
  return midnightToday + h * 3600 + m * 60 + s;
}

// Filtre les service_id actifs selon le jour courant (sans calendar.txt)
// Les service_id TAM contiennent "LAV" (semaine), "SAM" (samedi), "DIM" (dimanche)
// et les codes courts 23_1 à 23_8 (dont 23_7 = samedi, 23_8 = dimanche selon convention)
function isServiceActive(serviceId) {
  const dow = new Date().getDay(); // 0=dim, 1=lun, ..., 6=sam
  const id = (serviceId || "").toUpperCase();

  if (id.includes("LAV") || id.includes("SEMAINE")) {
    return dow >= 1 && dow <= 5; // lun-ven
  }
  if (id.includes("RED")) {
    return dow >= 1 && dow <= 5; // semaine réduit
  }
  if (id.includes("SAM") || id.includes("SAMEDI")) {
    return dow === 6;
  }
  if (id.includes("DIM") || id.includes("DIMANCHE")) {
    return dow === 0;
  }
  // Codes courts 23_x : convention TAM approximative
  // Sans calendar.txt, on accepte tous les codes courts (meilleur que rien)
  return true;
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

export default function ArretPanel({ theme: t }) {
  const [query, setQuery]               = useState("");
  const [allStops, setAllStops]         = useState([]);
  const [suggestions, setSuggestions]   = useState([]);
  const [showDrop, setShowDrop]         = useState(false);
  const [selectedStop, setSelectedStop] = useState(null);
  const [passages, setPassages]         = useState([]);
  const [loading, setLoading]           = useState(false);
  const [loadedAt, setLoadedAt]         = useState(null);
  const mapRef = useRef(null);

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

  // Charge les passages pour un arrêt depuis /stops/{id}.json
  const fetchPassages = useCallback(async (stop) => {
    if (!stop) return;
    setLoading(true);
    try {
      const data = await fetch(`/stops/${stop.id}.json`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });

      const now = Math.floor(Date.now() / 1000);
      const results = [];

      for (const p of data) {
        // Filtrer par service actif
        if (!isServiceActive(p.s)) continue;

        const ts = depToTimestamp(p.dep);
        if (ts == null) continue;

        const mins = Math.round((ts - now) / 60);
        if (mins < -1 || mins > 90) continue;

        results.push({
          key:     `${p.dep}|${p.n}|${p.h}`,
          ts,
          mins,
          dep:     p.dep.slice(0, 5), // "HH:MM"
          name:    p.n,               // route_short_name
          headsign:p.h,               // trip_headsign
          color:   p.c,               // route_color (hex sans #)
          dir:     p.d,               // direction_id
        });
      }

      // Dédoublonnage sur (dep + nom + headsign) et tri
      const seen = new Set();
      const deduped = results
        .filter(r => { if (seen.has(r.key)) return false; seen.add(r.key); return true; })
        .sort((a, b) => a.ts - b.ts)
        .slice(0, 15);

      setPassages(deduped);
      setLoadedAt(new Date());
    } catch (err) {
      console.error("Passages fetch error:", err);
      setPassages([]);
    }
    setLoading(false);
  }, []);

  // Refresh toutes les 30s
  useEffect(() => {
    if (!selectedStop) return;
    fetchPassages(selectedStop);
    const timer = setInterval(() => fetchPassages(selectedStop), 30000);
    return () => clearInterval(timer);
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
          <div style={{ height: 180, flexShrink: 0 }}>
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
          <div style={{ padding: "10px 16px", background: t.panelBg, borderBottom: `0.5px solid ${t.border}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0074c9", flexShrink: 0 }}></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedStop.name}</div>
              <div style={{ fontSize: 10, color: t.textSub, marginTop: 1 }}>
                {loading ? "Chargement..." : loadedAt ? `Horaires du ${loadedAt.toLocaleDateString("fr-FR", { weekday: "long" })}` : ""}
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
                <PassageRow key={p.key + i} p={p} t={t} isFirst={i === 0} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Ligne de passage ─────────────────────────────────────────────────────────

function PassageRow({ p, t, isFirst }) {
  const color = p.color ? `#${p.color}` : "#0074c9";
  const mins  = p.mins;
  const minLabel = mins <= 0 ? "Imm." : `${mins} min`;
  const minColor = mins <= 1 ? "#22c55e" : mins <= 4 ? "#f59e0b" : t.accent;

  return (
    <div style={{ padding: "11px 16px", borderBottom: `0.5px solid ${t.border}`, display: "flex", alignItems: "center", gap: 12, background: isFirst ? `${color}08` : t.panelBg }}>
      <div style={{ minWidth: 36, height: 28, borderRadius: 8, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", padding: "0 6px", flexShrink: 0 }}>
        {p.name}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {p.headsign}
        </div>
        <div style={{ fontSize: 10, color: t.textHint, marginTop: 2 }}>départ {p.dep}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: minColor, lineHeight: 1 }}>{minLabel}</div>
        {mins > 0 && <div style={{ fontSize: 9, color: t.textHint, marginTop: 2 }}>min</div>}
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
        <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 8 }}>Prochains passages</div>
        <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.7 }}>Recherche un arrêt pour voir les prochains passages avec l'heure exacte.</div>
      </div>
    </div>
  );
}
