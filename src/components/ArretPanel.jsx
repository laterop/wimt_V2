import { useState, useEffect, useRef, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import Papa from "papaparse";

// ─── Utilitaires ────────────────────────────────────────────────────────────

function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateMinutes(vehicule, stopLat, stopLon) {
  const d = distKm(vehicule.lat, vehicule.lon, stopLat, stopLon);
  const kmh = vehicule.speed > 5 ? vehicule.speed : 20;
  return Math.round((d / kmh) * 60);
}

// Cache des arrêts parsés
let stopsCache = null;
async function loadStops() {
  if (stopsCache) return stopsCache;
  const text = await fetch("/stops.txt").then(r => r.text());
  const stops = [];
  Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    step: ({ data: d }) => {
      if (d.stop_lat && d.stop_lon && d.stop_name) {
        stops.push({
          id: d.stop_id?.trim(),
          name: d.stop_name?.trim(),
          lat: parseFloat(d.stop_lat),
          lon: parseFloat(d.stop_lon),
        });
      }
    },
  });
  stopsCache = stops;
  return stops;
}

// ─── Sous-composants carte ────────────────────────────────────────────────────

function FlyTo({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 16, { duration: 0.7 });
  }, [position, map]);
  return null;
}

// ─── Composant principal ─────────────────────────────────────────────────────

export default function ArretPanel({ theme: t, vehicules }) {
  const [query, setQuery]           = useState("");
  const [allStops, setAllStops]     = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedStop, setSelectedStop] = useState(null);
  const [now, setNow]               = useState(Date.now());
  const inputRef                    = useRef(null);
  const mapRef                      = useRef(null);

  // Charger stops.txt au montage
  useEffect(() => {
    loadStops().then(setAllStops);
  }, []);

  // Tick toutes les 10s pour recalculer les minutes
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  // Filtrer les suggestions
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) { setSuggestions([]); return; }
    const seen = new Set();
    const results = allStops.filter(s => {
      const key = s.name.toLowerCase();
      if (!key.includes(q)) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
    setSuggestions(results);
  }, [query, allStops]);

  // Calculer prochains passages pour l'arrêt sélectionné
  const passages = useMemo(() => {
    if (!selectedStop || vehicules.length === 0) return [];
    const RAYON_KM = 2.5;

    return vehicules
      .filter(v => {
        if (!v.lat || !v.lon) return false;
        const d = distKm(v.lat, v.lon, selectedStop.lat, selectedStop.lon);
        return d <= RAYON_KM;
      })
      .map(v => ({
        ...v,
        minutes: estimateMinutes(v, selectedStop.lat, selectedStop.lon),
        dist: distKm(v.lat, v.lon, selectedStop.lat, selectedStop.lon),
      }))
      .filter(v => v.minutes <= 20)
      .sort((a, b) => a.minutes - b.minutes)
      .slice(0, 10);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStop, vehicules, now]);

  const selectStop = (stop) => {
    setSelectedStop(stop);
    setQuery(stop.name);
    setSuggestions([]);
    if (mapRef.current) mapRef.current.flyTo([stop.lat, stop.lon], 16, { duration: 0.7 });
  };

  const stopIcon = L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:#0074c9;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,116,201,0.5);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

  // Arrêts proches visibles sur la carte (dans un rayon de ~1km)
  const nearbyStops = useMemo(() => {
    if (!selectedStop) return [];
    return allStops.filter(s => distKm(s.lat, s.lon, selectedStop.lat, selectedStop.lon) < 0.4 && s.id !== selectedStop.id);
  }, [selectedStop, allStops]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: t.bg }}>

      {/* ── Barre de recherche ── */}
      <div style={{ padding: "12px 14px", background: t.panelBg, borderBottom: `0.5px solid ${t.border}`, position: "relative", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: t.inputBg, borderRadius: 12, padding: "9px 12px", border: `0.5px solid ${t.borderStrong}` }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={t.textHint} strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Rechercher un arrêt..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 14, color: t.text, fontFamily: "'Inter',system-ui,sans-serif" }}
          />
          {query && (
            <button onClick={() => { setQuery(""); setSelectedStop(null); setSuggestions([]); }} style={{ background: "none", border: "none", cursor: "pointer", color: t.textHint, fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
          )}
        </div>

        {/* Suggestions dropdown */}
        {suggestions.length > 0 && (
          <div style={{ position: "absolute", top: "100%", left: 14, right: 14, background: t.panelBg, borderRadius: 12, border: `0.5px solid ${t.borderStrong}`, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", overflow: "hidden", zIndex: 100 }}>
            {suggestions.map((s, i) => (
              <button
                key={s.id}
                onClick={() => selectStop(s)}
                style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", borderBottom: i < suggestions.length - 1 ? `0.5px solid ${t.border}` : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left", fontFamily: "'Inter',system-ui,sans-serif" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.textHint} strokeWidth="2" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M2 12h4M18 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
                </svg>
                <span style={{ fontSize: 13, color: t.text, fontWeight: 500 }}>{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Contenu principal ── */}
      {!selectedStop ? (
        <EmptyState t={t} />
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Mini-carte */}
          <div style={{ height: 200, flexShrink: 0, position: "relative" }}>
            <MapContainer
              center={[selectedStop.lat, selectedStop.lon]}
              zoom={16}
              style={{ height: "100%", width: "100%" }}
              ref={mapRef}
              zoomControl={false}
            >
              <TileLayer
                attribution="&copy; OpenStreetMap contributors &copy; CARTO"
                url={t.mapTile}
              />

              {/* Arrêts proches */}
              {nearbyStops.map(s => (
                <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={4} fillColor={t.textHint} color="#fff" weight={1.5} fillOpacity={0.7}
                  eventHandlers={{ click: () => selectStop(s) }}>
                  <Popup><span style={{ fontSize: 11, fontFamily: "'Inter',system-ui,sans-serif" }}>{s.name}</span></Popup>
                </CircleMarker>
              ))}

              {/* Arrêt sélectionné */}
              <Marker position={[selectedStop.lat, selectedStop.lon]} icon={stopIcon}>
                <Popup><span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'Inter',system-ui,sans-serif" }}>{selectedStop.name}</span></Popup>
              </Marker>

              {/* Véhicules proches */}
              {passages.map(v => {
                const s = v.route_short_name.length > 2 ? v.route_short_name.slice(0, 2) : v.route_short_name;
                const vIcon = L.divIcon({
                  className: "",
                  html: `<div style="width:22px;height:22px;border-radius:6px;background:#${v.route_color};border:2px solid rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#${v.route_text_color||"fff"};font-family:'Inter',system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${s}</div>`,
                  iconSize: [22, 22], iconAnchor: [11, 11],
                });
                return (
                  <Marker key={v.id} position={[v.lat, v.lon]} icon={vIcon}>
                    <Popup>
                      <div style={{ fontFamily: "'Inter',system-ui,sans-serif", fontSize: 12 }}>
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

          {/* Panneau passages */}
          <div style={{ flex: 1, overflowY: "auto", background: t.panelBg }}>

            {/* Nom de l'arrêt */}
            <div style={{ padding: "12px 16px 8px", borderBottom: `0.5px solid ${t.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0074c9", flexShrink: 0 }}></div>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{selectedStop.name}</div>
              </div>
              <div style={{ fontSize: 11, color: t.textSub, marginTop: 3, paddingLeft: 16 }}>
                {passages.length > 0 ? `${passages.length} passage${passages.length > 1 ? "s" : ""} dans les 20 prochaines minutes` : "Aucun passage détecté à proximité"}
              </div>
            </div>

            {passages.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🚏</div>
                <div style={{ fontSize: 13, color: t.textSub, lineHeight: 1.6 }}>Aucun véhicule détecté dans un rayon de 2,5 km. Réessaie dans quelques instants.</div>
              </div>
            ) : (
              <div>
                {passages.map((v, i) => (
                  <PassageRow key={v.id} v={v} t={t} isFirst={i === 0} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PassageRow({ v, t, isFirst }) {
  const color = `#${v.route_color}`;
  const mins = v.minutes;

  const minLabel = mins === 0 ? "Imm." : `${mins} min`;
  const minColor = mins === 0 ? "#22c55e" : mins <= 3 ? "#f59e0b" : t.accent;

  return (
    <div style={{ padding: "11px 16px", borderBottom: `0.5px solid ${t.border}`, display: "flex", alignItems: "center", gap: 12, background: isFirst ? `${color}08` : "none" }}>

      {/* Badge ligne */}
      <div style={{ minWidth: 36, height: 28, borderRadius: 8, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: `#${v.route_text_color || "fff"}`, padding: "0 6px", flexShrink: 0 }}>
        {v.route_short_name}
      </div>

      {/* Infos */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {v.headsign}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 10, color: t.textHint }}>
            {v.vehicleType === "tram" ? "🚊 Tram" : v.vehicleType === "bustram" ? "🚌 BRT" : "🚌 Bus"}
          </span>
          <span style={{ fontSize: 10, color: t.textHint }}>·</span>
          <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: (v.speed || 0) > 0 ? "#22c55e" : "#f59e0b" }}></span>
          <span style={{ fontSize: 10, color: t.textHint }}>
            {(v.speed || 0) > 0 ? `${Math.round(v.speed)} km/h` : "À l'arrêt"}
          </span>
        </div>
      </div>

      {/* Temps */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: minColor, lineHeight: 1 }}>{minLabel}</div>
        <div style={{ fontSize: 9, color: t.textHint, marginTop: 2 }}>~{(v.dist * 1000).toFixed(0)} m</div>
      </div>
    </div>
  );
}

function EmptyState({ t }) {
  const suggestions = ["Corum", "Comédie", "Gare Saint-Roch", "Mosson", "Odysseum", "Place de France"];
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: t.textHint, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 12 }}>
        Arrêts populaires
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {suggestions.map(name => (
          <button key={name} style={{ padding: "7px 14px", borderRadius: 20, background: t.cardBg, border: `0.5px solid ${t.border}`, cursor: "pointer", fontSize: 13, color: t.textSub, fontFamily: "'Inter',system-ui,sans-serif" }}
            onClick={() => {}}>
            🚏 {name}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 32, padding: "20px", background: t.cardBg, borderRadius: 14, border: `0.5px solid ${t.border}`, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🚏</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 6 }}>Prochain passage</div>
        <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.7 }}>Recherche un arrêt pour voir les prochains trams et bus en temps réel, avec le temps d'arrivée estimé.</div>
      </div>
    </div>
  );
}
