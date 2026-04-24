import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

// ─── Cache ────────────────────────────────────────────────────────────────────

let metaCache = null;
async function loadMeta() {
  if (metaCache) return metaCache;
  const data = await fetch("/stop-meta.json").then(r => r.json());
  metaCache = data;
  return data;
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function depToTimestamp(dep) {
  const parts = dep.split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parseInt(parts[2] || "0", 10);
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
  return midnight + h * 3600 + m * 60 + s;
}

function isServiceActive(serviceId) {
  const dow = new Date().getDay();
  const id = (serviceId || "").toUpperCase();
  if (id.includes("LAV") || id.includes("SEMAINE")) return dow >= 1 && dow <= 5;
  if (id.includes("RED")) return dow >= 1 && dow <= 5;
  if (id.includes("SAM") || id.includes("SAMEDI")) return dow === 6;
  if (id.includes("DIM") || id.includes("DIMANCHE")) return dow === 0;
  return true;
}

// Trouve le véhicule le plus probable pour un passage donné.
// Utilise le prochain arrêt calculé (nextStops Map) pour chaque véhicule :
// un véhicule dont le prochain arrêt est notre stop_id est un candidat direct.
// Parmi les candidats, on trie par minutes restantes.
function findVehicle(vehicules, nextStops, passage, stopId, stopLat, stopLon) {
  const candidates = vehicules.filter(v =>
    v.route_short_name === passage.name &&
    String(v.direction_id) === String(passage.dir)
  );
  if (candidates.length === 0) return null;

  // Candidats dont le prochain arrêt calculé = notre arrêt
  const exact = candidates.filter(v => {
    const ns = nextStops.get(v.id);
    return ns && String(ns.stopId) === String(stopId);
  });

  if (exact.length > 0) {
    // Parmi ceux dont le prochain stop = notre arrêt, prendre le plus proche
    return exact.reduce((best, v) => {
      const ns = nextStops.get(v.id);
      const bestNs = nextStops.get(best.id);
      return (ns?.distM ?? Infinity) < (bestNs?.distM ?? Infinity) ? v : best;
    });
  }

  // Fallback : aucun véhicule n'a notre arrêt comme prochain stop.
  // Le passage est peut-être encore loin, ou le véhicule n'est pas en service.
  // On retourne null pour ne pas afficher un mauvais résultat.
  return null;
}

const TYPE_CONFIG = {
  tram: { label: "Tram", icon: "🚊", color: "#3b8eea", bg: "rgba(59,142,234,0.12)" },
  brt:  { label: "BRT",  icon: "🚌", color: "#e87fa3", bg: "rgba(232,127,163,0.12)" },
  bus:  { label: "Bus",  icon: "🚌", color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
};

const TYPE_ORDER = ["tram", "brt", "bus"];

function FlyTo({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 16, { duration: 0.7 });
  }, [position, map]);
  return null;
}

const POPULAR = ["Corum", "Comédie", "Gare Saint-Roch", "Mosson", "Odysseum", "Place de France"];

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ArretPanel({ theme: t, vehicules = [], nextStops = new Map(), onTrackVehicle }) {
  const [query, setQuery]               = useState("");
  const [allMeta, setAllMeta]           = useState([]);     // [{name, entries:[{id,lat,lon,types}]}]
  const [suggestions, setSuggestions]   = useState([]);
  const [showDrop, setShowDrop]         = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null); // une entrée du meta (nom + entries)
  const [selectedEntry, setSelectedEntry] = useState(null); // {id, lat, lon, types}
  const [activeType, setActiveType]     = useState(null);   // "tram"|"brt"|"bus" sélectionné
  const [passages, setPassages]         = useState([]);
  const [loading, setLoading]           = useState(false);
  const [loadedAt, setLoadedAt]         = useState(null);
  const mapRef = useRef(null);

  useEffect(() => { loadMeta().then(setAllMeta); }, []);

  // Suggestions
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) { setSuggestions([]); return; }
    const res = allMeta.filter(m => m.name.toLowerCase().includes(q)).slice(0, 8);
    setSuggestions(res);
  }, [query, allMeta]);

  // Charger les passages pour un stop_id
  const fetchPassages = useCallback(async (stopId) => {
    if (!stopId) return;
    setLoading(true);
    try {
      const data = await fetch(`/stops/${stopId}.json`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
      const now = Math.floor(Date.now() / 1000);
      const results = [];
      for (const p of data) {
        if (!isServiceActive(p.s)) continue;
        const ts = depToTimestamp(p.dep);
        if (ts == null) continue;
        const mins = Math.round((ts - now) / 60);
        if (mins < -1 || mins > 90) continue;
        results.push({
          key:      `${p.dep}|${p.n}|${p.h}`,
          ts, mins,
          dep:      p.dep.slice(0, 5),
          name:     p.n,
          headsign: p.h,
          color:    p.c,
          dir:      p.d,
        });
      }
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

  useEffect(() => {
    if (!selectedEntry) return;
    fetchPassages(selectedEntry.id);
    const timer = setInterval(() => fetchPassages(selectedEntry.id), 30000);
    return () => clearInterval(timer);
  }, [selectedEntry, fetchPassages]);

  // Sélectionner un groupe depuis la recherche
  const selectGroup = (group) => {
    setSelectedGroup(group);
    setQuery(group.name);
    setSuggestions([]);
    setShowDrop(false);
    setPassages([]);
    setLoadedAt(null);

    // Calculer les types disponibles
    const typesSet = new Set(group.entries.flatMap(e => e.types));
    const availTypes = TYPE_ORDER.filter(t => typesSet.has(t));

    // Auto-sélectionner le premier type disponible
    const firstType = availTypes[0] || null;
    setActiveType(firstType);

    // Auto-sélectionner le premier stop du type choisi
    if (firstType) {
      const entry = group.entries.find(e => e.types.includes(firstType));
      setSelectedEntry(entry || group.entries[0]);
    } else {
      setSelectedEntry(group.entries[0]);
    }
  };

  // Changer de type pour un même nom d'arrêt
  const switchType = (type) => {
    setActiveType(type);
    setPassages([]);
    setLoadedAt(null);
    const entry = selectedGroup.entries.find(e => e.types.includes(type));
    if (entry) setSelectedEntry(entry);
  };

  const selectByName = (name) => {
    const q = name.toLowerCase();
    const match = allMeta.find(m => m.name.toLowerCase() === q)
      || allMeta.find(m => m.name.toLowerCase().includes(q));
    if (match) selectGroup(match);
    else { setQuery(name); setShowDrop(true); }
  };

  // Types disponibles pour le groupe courant
  const availableTypes = useMemo(() => {
    if (!selectedGroup) return [];
    const typesSet = new Set(selectedGroup.entries.flatMap(e => e.types));
    return TYPE_ORDER.filter(t => typesSet.has(t));
  }, [selectedGroup]);

  // Stops proches (même nom, autre type)
  const nearbyEntries = useMemo(() => {
    if (!selectedEntry || !selectedGroup) return [];
    return selectedGroup.entries.filter(e => e.id !== selectedEntry.id);
  }, [selectedEntry, selectedGroup]);

  // Tous les stops du même nom pour la carte
  const allEntries = useMemo(() => {
    if (!selectedGroup) return [];
    return selectedGroup.entries;
  }, [selectedGroup]);

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
              onClick={() => { setQuery(""); setSelectedGroup(null); setSelectedEntry(null); setPassages([]); setShowDrop(false); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: t.textHint, fontSize: 20, lineHeight: 1, padding: 0 }}
            >×</button>
          )}
        </div>

        {showSugg && (
          <div style={{ position: "absolute", top: "calc(100% - 2px)", left: 14, right: 14, background: t.panelBg, borderRadius: "0 0 14px 14px", border: `0.5px solid ${t.borderStrong}`, borderTop: "none", boxShadow: "0 12px 32px rgba(0,0,0,0.18)", zIndex: 200, overflow: "hidden" }}>
            {suggestions.map((s, i) => {
              const typesSet = new Set(s.entries.flatMap(e => e.types));
              const types = TYPE_ORDER.filter(t => typesSet.has(t));
              return (
                <button key={s.name + i}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => selectGroup(s)}
                  style={{ width: "100%", padding: "10px 16px", background: "none", border: "none", borderTop: i > 0 ? `0.5px solid ${t.border}` : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left", fontFamily: "'Inter',system-ui,sans-serif" }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill={t.accent} stroke="none">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                  <span style={{ fontSize: 13, color: t.text, fontWeight: 500, flex: 1 }}>{s.name}</span>
                  <span style={{ display: "flex", gap: 4 }}>
                    {types.map(type => {
                      const tc = TYPE_CONFIG[type];
                      return (
                        <span key={type} style={{ fontSize: 10, fontWeight: 600, color: tc.color, background: tc.bg, borderRadius: 6, padding: "2px 6px" }}>
                          {tc.label}
                        </span>
                      );
                    })}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Contenu ── */}
      {!selectedGroup ? (
        <EmptyState t={t} onSelect={selectByName} />
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Sélecteur de type (tram / bus) si plusieurs types disponibles */}
          {availableTypes.length > 1 && (
            <div style={{ display: "flex", gap: 6, padding: "10px 14px 6px", background: t.panelBg, borderBottom: `0.5px solid ${t.border}`, flexShrink: 0 }}>
              {availableTypes.map(type => {
                const tc = TYPE_CONFIG[type];
                const isActive = activeType === type;
                return (
                  <button key={type} onClick={() => switchType(type)}
                    style={{ flex: 1, padding: "7px 6px", borderRadius: 10, border: `1.5px solid ${isActive ? tc.color : t.border}`, background: isActive ? tc.bg : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontFamily: "'Inter',system-ui,sans-serif", transition: "all 0.15s" }}>
                    <span style={{ fontSize: 13 }}>{tc.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 400, color: isActive ? tc.color : t.textSub }}>{tc.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Mini-carte */}
          {selectedEntry && (
            <div style={{ height: 160, flexShrink: 0 }}>
              <MapContainer center={[selectedEntry.lat, selectedEntry.lon]} zoom={15}
                style={{ height: "100%", width: "100%" }} ref={mapRef} zoomControl={false}>
                <TileLayer attribution="&copy; OpenStreetMap contributors &copy; CARTO" url={t.mapTile} />
                {allEntries.filter(e => e.id !== selectedEntry.id).map(e => (
                  <CircleMarker key={e.id} center={[e.lat, e.lon]} radius={5}
                    fillColor={e.types.includes("tram") ? "#3b8eea" : "#fbbf24"} color="#fff" weight={1.5} fillOpacity={0.8}
                    eventHandlers={{ click: () => { setSelectedEntry(e); setActiveType(e.types[0]); setPassages([]); fetchPassages(e.id); } }}>
                    <Popup><span style={{ fontSize: 11, fontFamily: "'Inter',system-ui,sans-serif" }}>{selectedGroup.name} ({e.types.join("/")})</span></Popup>
                  </CircleMarker>
                ))}
                <Marker position={[selectedEntry.lat, selectedEntry.lon]} icon={stopIcon}>
                  <Popup><strong style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>{selectedGroup.name}</strong></Popup>
                </Marker>
                <FlyTo position={[selectedEntry.lat, selectedEntry.lon]} />
              </MapContainer>
            </div>
          )}

          {/* Header arrêt */}
          <div style={{ padding: "10px 16px", background: t.panelBg, borderBottom: `0.5px solid ${t.border}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {activeType && TYPE_CONFIG[activeType] && (
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: TYPE_CONFIG[activeType].color, flexShrink: 0 }}></div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedGroup.name}</div>
              <div style={{ fontSize: 10, color: t.textSub, marginTop: 1 }}>
                {loading ? "Chargement..." : loadedAt ? `Horaires du ${loadedAt.toLocaleDateString("fr-FR", { weekday: "long" })}` : ""}
              </div>
            </div>
            <button onClick={() => { setSelectedGroup(null); setSelectedEntry(null); setQuery(""); setPassages([]); }}
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
              passages.map((p, i) => {
                const matched = selectedEntry
                  ? findVehicle(vehicules, nextStops, p, selectedEntry.id, selectedEntry.lat, selectedEntry.lon)
                  : null;
                const ns = matched ? nextStops.get(matched.id) : null;
                return (
                  <PassageRow
                    key={p.key + i}
                    p={p}
                    t={t}
                    isFirst={i === 0}
                    matchedVehicle={matched}
                    nextStopInfo={ns}
                    onTrack={matched && onTrackVehicle ? () => onTrackVehicle(matched) : null}
                  />
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Ligne de passage ─────────────────────────────────────────────────────────

function PassageRow({ p, t, isFirst, matchedVehicle, nextStopInfo, onTrack }) {
  const color = p.color ? `#${p.color}` : "#0074c9";
  const mins  = p.mins;
  const minLabel = mins <= 0 ? "Imm." : `${mins} min`;
  const minColor = mins <= 1 ? "#22c55e" : mins <= 4 ? "#f59e0b" : t.accent;

  // Description de la position du véhicule
  let vehicleStatus = null;
  if (matchedVehicle && nextStopInfo) {
    if (nextStopInfo.isAtStop) {
      vehicleStatus = `À l'arrêt « ${nextStopInfo.currentStop} »`;
    } else {
      const distM = Math.round(nextStopInfo.distM);
      const distLabel = distM >= 1000
        ? `${(distM / 1000).toFixed(1)} km`
        : `${distM} m`;
      vehicleStatus = `À ${distLabel} de cet arrêt`;
    }
  }

  return (
    <div style={{ borderBottom: `0.5px solid ${t.border}`, background: isFirst ? `${color}08` : t.panelBg }}>
      <div style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ minWidth: 34, height: 26, borderRadius: 7, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", padding: "0 6px", flexShrink: 0 }}>
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

      {/* Bandeau véhicule localisé */}
      {onTrack ? (
        <button
          onClick={onTrack}
          style={{
            width: "100%", padding: "7px 16px 9px",
            background: `${color}0a`, border: "none", borderTop: `0.5px solid ${color}22`,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            fontFamily: "'Inter',system-ui,sans-serif", textAlign: "left",
          }}
        >
          <span style={{ fontSize: 13 }}>
            {nextStopInfo?.isAtStop ? "🚏" : "🚃"}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color }}>
              {nextStopInfo?.isAtStop ? "En cours de chargement" : "En approche"}
            </div>
            {vehicleStatus && (
              <div style={{ fontSize: 10, color: t.textHint, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {vehicleStatus}
                {matchedVehicle.speed > 1 ? ` · ${Math.round(matchedVehicle.speed)} km/h` : ""}
              </div>
            )}
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      ) : (
        // Aucun véhicule localisé : pas encore en service
        mins > 0 && mins <= 60 && (
          <div style={{ padding: "5px 16px 8px", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11 }}>⏳</span>
            <span style={{ fontSize: 10, color: t.textHint }}>Véhicule pas encore en service</span>
          </div>
        )
      )}
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
