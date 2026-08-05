import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { countStopsAway } from "../hooks/useNextStop";
import { BASE } from "../base.js";

// ─── Cache ────────────────────────────────────────────────────────────────────
// Clé par dataBase ("" pour Montpellier à la racine, "nimes/", "lio/", ...)
// pour éviter qu'un réseau ne réutilise par erreur les données d'un autre.

const metaCache = new Map();
async function loadMeta(dataBase) {
  if (metaCache.has(dataBase)) return metaCache.get(dataBase);
  const data = await fetch(`${BASE}${dataBase}stop-meta.json`).then(r => r.json());
  metaCache.set(dataBase, data);
  return data;
}

// service-dates.json : { "YYYYMMDD": [service_id, ...] }. Pas toujours présent
// (réseau sans calendar.txt/calendar_dates.txt exploitable) : dans ce cas on
// retombe sur un filtrage permissif (tout est considéré actif).
const serviceDatesCache = new Map();
async function loadServiceDates(dataBase) {
  if (serviceDatesCache.has(dataBase)) return serviceDatesCache.get(dataBase);
  let data = null;
  try {
    const r = await fetch(`${BASE}${dataBase}service-dates.json`);
    if (r.ok) data = await r.json();
  } catch { /* pas de fiche de calendrier pour ce réseau */ }
  serviceDatesCache.set(dataBase, data);
  return data;
}

function fmtDate(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
function dateFromStr(s) {
  return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
}
function addDaysStr(s, n) {
  const d = dateFromStr(s);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}
// Choisit une date par défaut pour la fiche horaire : aujourd'hui si connue,
// sinon la date connue la plus proche (avenir en priorité).
function pickDefaultDate(serviceDates) {
  const today = fmtDate(new Date());
  if (!serviceDates) return today;
  const dates = Object.keys(serviceDates).sort();
  if (dates.includes(today)) return today;
  const future = dates.find(d => d > today);
  return future || dates[dates.length - 1] || today;
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

// En GTFS, les services qui finissent après minuit utilisent des heures > 24
// (ex: 25:30 = 1h30 du matin le lendemain du jour de service).
// Si on est entre minuit et 4h du matin, on est potentiellement encore dans
// la journée de service de la veille : on calcule les timestamps sur deux bases
// (minuit d'aujourd'hui ET minuit d'hier) et on retourne les deux.
function depToTimestamps(dep) {
  const parts = dep.split(":");
  if (parts.length < 2) return [];
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parseInt(parts[2] || "0", 10);
  const secs = h * 3600 + m * 60 + s;

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
  const yesterdayMidnight = todayMidnight - 86400;

  const results = [todayMidnight + secs];
  // Si on est avant 4h du matin, inclure aussi la base de la veille
  if (now.getHours() < 4) {
    results.push(yesterdayMidnight + secs);
  }
  return results;
}

// Jour de service effectif : si on est entre minuit et 4h, le service actif
// peut être celui de la veille (services nocturnes > 24h en GTFS).
function getServiceDays() {
  const now = new Date();
  const dow = now.getDay(); // 0=dim, 1=lun, ..., 6=sam
  const days = [dow];
  // Entre minuit et 4h : on inclut aussi le jour de la veille
  if (now.getHours() < 4) {
    days.push((dow + 6) % 7); // jour précédent
  }
  return days;
}

// Fallback heuristique quand aucun service-dates.json n'est disponible pour
// ce réseau (pas de calendar.txt/calendar_dates.txt exploitable au build).
function isServiceActiveFallback(serviceId) {
  const days = getServiceDays();
  const id = (serviceId || "").toUpperCase();

  const isWeekday = (d) => d >= 1 && d <= 5;
  const isSat     = (d) => d === 6;
  const isSun     = (d) => d === 0;

  if (id.includes("LAV") || id.includes("SEMAINE") || id.includes("RED")) {
    return days.some(isWeekday);
  }
  if (id.includes("SAM") || id.includes("SAMEDI")) {
    return days.some(isSat);
  }
  if (id.includes("DIM") || id.includes("DIMANCHE")) {
    return days.some(isSun);
  }
  return true;
}

// Ensemble des service_id actifs "aujourd'hui" pour le live (inclut la veille
// si on est avant 4h du matin, cf. depToTimestamps).
function activeServiceIdsNow(serviceDates) {
  if (!serviceDates) return null;
  const today = fmtDate(new Date());
  const ids = new Set(serviceDates[today] || []);
  if (new Date().getHours() < 4) {
    for (const id of serviceDates[addDaysStr(today, -1)] || []) ids.add(id);
  }
  return ids;
}

// Trouve le meilleur candidat-véhicule pour un passage donné.
// On cherche parmi les véhicules de la même ligne+direction celui dont le prochain
// arrêt (ou un arrêt à venir dans la séquence) correspond à l'arrêt cible.
// On préfère le véhicule le plus avancé (le plus proche dans la séquence).
function findVehicle(vehicules, nextStops, passage, stopId) {
  const candidates = vehicules.filter(v =>
    v.route_short_name === passage.name &&
    String(v.direction_id) === String(passage.dir)
  );
  if (candidates.length === 0) return null;

  // Pour chaque candidat, calculer combien d'arrêts le séparent de notre stop
  const scored = [];
  for (const v of candidates) {
    const ns = nextStops.get(v.id);
    if (!ns) continue;
    const info = countStopsAway(ns, stopId);
    if (info === null) continue; // véhicule a déjà dépassé ou ne dessert pas cet arrêt
    scored.push({ v, ns, info, stopsAway: info.stopsAway });
  }

  if (scored.length === 0) return null;

  // Le plus avancé = le moins d'arrêts restants avant notre stop
  scored.sort((a, b) => a.stopsAway - b.stopsAway);
  return scored[0];
}

const TYPE_CONFIG = {
  tram: { label: "Tram", icon: "🚊", color: "#3b8eea", bg: "rgba(59,142,234,0.12)" },
  brt:  { label: "BusTram",  icon: "🚌", color: "#e87fa3", bg: "rgba(232,127,163,0.12)" },
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

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ArretPanel({ theme: t, vehicules = [], nextStops = new Map(), onTrackVehicle, dataBase = "" }) {
  const [query, setQuery]               = useState("");
  const [allMeta, setAllMeta]           = useState([]);     // [{name, entries:[{id,lat,lon,types}]}]
  const [suggestions, setSuggestions]   = useState([]);
  const [showDrop, setShowDrop]         = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [activeType, setActiveType]     = useState(null);
  const [passages, setPassages]         = useState([]);
  const [rawPassages, setRawPassages]   = useState([]); // tous les passages du jour, non filtrés (pour la fiche horaire)
  const [serviceDates, setServiceDates] = useState(null);
  const [loading, setLoading]           = useState(false);
  const [loadedAt, setLoadedAt]         = useState(null);
  const [listTypeFilter, setListTypeFilter] = useState(null); // filtre type sur la liste
  const [showFiche, setShowFiche]       = useState(false);
  const [ficheDate, setFicheDate]       = useState(null);
  const [ficheLine, setFicheLine]       = useState(null);
  const mapRef = useRef(null);

  useEffect(() => { loadMeta(dataBase).then(setAllMeta); }, [dataBase]);
  useEffect(() => { loadServiceDates(dataBase).then(sd => { setServiceDates(sd); setFicheDate(pickDefaultDate(sd)); }); }, [dataBase]);

  // Suggestions dropdown (seulement quand un arrêt est déjà sélectionné, sinon on utilise la liste)
  useEffect(() => {
    if (selectedGroup) {
      const q = query.trim().toLowerCase();
      if (q.length < 2) { setSuggestions([]); return; }
      const res = allMeta.filter(m => m.name.toLowerCase().includes(q)).slice(0, 8);
      setSuggestions(res);
    } else {
      setSuggestions([]);
    }
  }, [query, allMeta, selectedGroup]);

  // Liste filtrée (utilisée quand aucun arrêt sélectionné)
  const filteredList = useMemo(() => {
    let list = allMeta;
    if (listTypeFilter) {
      list = list.filter(m => m.entries.some(e => e.types.includes(listTypeFilter)));
    }
    const q = query.trim().toLowerCase();
    if (q.length >= 1) {
      list = list.filter(m => m.name.toLowerCase().includes(q));
    }
    return list;
  }, [allMeta, query, listTypeFilter]);

  // Charger les passages bruts (non filtrés) pour un stop_id
  const fetchPassages = useCallback(async (stopId) => {
    if (!stopId) return;
    setLoading(true);
    try {
      const data = await fetch(`${BASE}${dataBase}stops/${stopId}.json`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
      setRawPassages(data);
      setLoadedAt(new Date());
    } catch (err) {
      console.error("Passages fetch error:", err);
      setRawPassages([]);
    }
    setLoading(false);
  }, [dataBase]);

  useEffect(() => {
    if (!selectedEntry) return;
    fetchPassages(selectedEntry.id);
    const timer = setInterval(() => fetchPassages(selectedEntry.id), 30000);
    return () => clearInterval(timer);
  }, [selectedEntry, fetchPassages]);

  // Vue "live" : prochains passages dans les 90 prochaines minutes, filtrés
  // par le calendrier réel du réseau quand il est disponible.
  useEffect(() => {
    const activeIds = activeServiceIdsNow(serviceDates);
    const now = Math.floor(Date.now() / 1000);
    const results = [];
    for (const p of rawPassages) {
      const active = activeIds ? activeIds.has(p.s) : isServiceActiveFallback(p.s);
      if (!active) continue;
      const timestamps = depToTimestamps(p.dep);
      for (const ts of timestamps) {
        const mins = Math.round((ts - now) / 60);
        if (mins < -1 || mins > 90) continue;
        const parts = p.dep.split(":");
        const h = parseInt(parts[0], 10);
        const displayDep = h >= 24
          ? `${String(h - 24).padStart(2, "0")}:${parts[1]}`
          : p.dep.slice(0, 5);
        results.push({
          key:      `${ts}|${p.n}|${p.h}`,
          ts, mins,
          dep:      displayDep,
          name:     p.n,
          headsign: p.h,
          color:    p.c,
          dir:      p.d,
        });
        break;
      }
    }
    const seen = new Set();
    const deduped = results
      .filter(r => { if (seen.has(r.key)) return false; seen.add(r.key); return true; })
      .sort((a, b) => a.ts - b.ts)
      .slice(0, 15);
    setPassages(deduped);
  }, [rawPassages, serviceDates]);

  // Sélectionner un groupe depuis la recherche
  const selectGroup = (group) => {
    setSelectedGroup(group);
    setQuery(group.name);
    setSuggestions([]);
    setShowDrop(false);
    setPassages([]);
    setRawPassages([]);
    setLoadedAt(null);
    setShowFiche(false);
    setFicheLine(null);

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
    setRawPassages([]);
    setLoadedAt(null);
    setFicheLine(null);
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

  // Lignes desservant le stop physique actuellement sélectionné (pour la fiche horaire)
  const stopLines = useMemo(() => {
    const map = new Map();
    for (const p of rawPassages) if (!map.has(p.n)) map.set(p.n, p.c);
    return [...map.entries()]
      .map(([name, color]) => ({ name, color }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [rawPassages]);

  // Dates disponibles dans le calendrier du réseau (pour le sélecteur de la fiche horaire)
  const ficheDateBounds = useMemo(() => {
    if (!serviceDates) return null;
    const dates = Object.keys(serviceDates).sort();
    return { min: dates[0], max: dates[dates.length - 1] };
  }, [serviceDates]);

  // Passages du jour choisi pour la fiche horaire, filtrés par ligne + calendrier
  const ficheData = useMemo(() => {
    if (!showFiche || !ficheDate) return null;
    const activeIds = serviceDates ? new Set(serviceDates[ficheDate] || []) : null;
    const line = ficheLine || stopLines[0]?.name;
    if (!line) return { line: null, dirs: [] };

    const filtered = rawPassages.filter(p =>
      p.n === line && (activeIds ? activeIds.has(p.s) : true)
    );

    const byDir = new Map();
    for (const p of filtered) {
      const key = String(p.d);
      if (!byDir.has(key)) byDir.set(key, { headsign: p.h, color: p.c, rows: new Map() });
      const parts = p.dep.split(":");
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const bucket = byDir.get(key);
      if (!bucket.rows.has(h)) bucket.rows.set(h, []);
      bucket.rows.get(h).push(m);
    }

    const nowMinuteOfDay = (() => {
      const n = new Date();
      return n.getHours() * 60 + n.getMinutes();
    })();
    const isToday = ficheDate === fmtDate(new Date());

    const dirs = [...byDir.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dir, { headsign, color, rows }]) => ({
        dir, headsign, color,
        rows: [...rows.entries()]
          .sort(([h1], [h2]) => h1 - h2)
          .map(([h, mins]) => ({
            h,
            mins: [...mins].sort((a, b) => a - b).map(m => ({
              m,
              isNext: isToday && (h % 24) * 60 + m >= nowMinuteOfDay,
            })),
          })),
      }));

    return { line, dirs };
  }, [showFiche, ficheDate, ficheLine, serviceDates, rawPassages, stopLines]);

  const stopIcon = L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:#0074c9;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,116,201,0.5);"></div>`,
    iconSize: [16, 16], iconAnchor: [8, 8],
  });

  const showSugg = showDrop && suggestions.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: t.bg }}>

      {/* ── Recherche + filtres ── */}
      <div style={{ padding: "12px 14px 10px", background: t.panelBg, borderBottom: `0.5px solid ${t.border}`, position: "relative", zIndex: 50 }}>
        {/* Barre de recherche */}
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

        {/* Chips de filtre par type */}
        {!selectedGroup && (
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {[null, "tram", "brt", "bus"].map(type => {
              const labels = { null: "Tous", tram: "🚊 Tram", brt: "🚌 BusTram", bus: "🚌 Bus" };
              const colors = { tram: "#3b8eea", brt: "#e87fa3", bus: "#fbbf24" };
              const isActive = listTypeFilter === type;
              const color = type ? colors[type] : t.accent;
              return (
                <button key={String(type)} onClick={() => setListTypeFilter(type)}
                  style={{ padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${isActive ? color : t.border}`, background: isActive ? `${color}22` : "transparent", cursor: "pointer", fontSize: 11, fontWeight: isActive ? 700 : 400, color: isActive ? color : t.textSub, fontFamily: "'Inter',system-ui,sans-serif", transition: "all 0.15s" }}>
                  {labels[type]}
                </button>
              );
            })}
          </div>
        )}

        {/* Dropdown suggestions (uniquement quand un arrêt est déjà sélectionné) */}
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
        <StopList t={t} stops={filteredList} onSelect={selectGroup} />
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
                    eventHandlers={{ click: () => { setSelectedEntry(e); setActiveType(e.types[0]); setPassages([]); setRawPassages([]); setFicheLine(null); fetchPassages(e.id); } }}>
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
            <button
              onClick={() => { setShowFiche(v => !v); if (!ficheDate) setFicheDate(pickDefaultDate(serviceDates)); }}
              title="Fiche horaire"
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 10,
                border: `1.5px solid ${showFiche ? t.accent : t.border}`,
                background: showFiche ? `${t.accent}18` : "transparent",
                color: showFiche ? t.accent : t.textSub,
                cursor: "pointer", fontSize: 11, fontWeight: 600, flexShrink: 0,
                fontFamily: "'Inter',system-ui,sans-serif",
              }}
            >
              📅 Fiche
            </button>
            <button onClick={() => { setSelectedGroup(null); setSelectedEntry(null); setQuery(""); setPassages([]); setRawPassages([]); setShowFiche(false); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: t.textHint, fontSize: 20, padding: 0, lineHeight: 1 }}>×</button>
          </div>

          {/* Liste passages / fiche horaire */}
          <div style={{ flex: 1, overflowY: "auto", background: t.bg }}>
            {showFiche ? (
              <FicheHoraire
                t={t}
                stopLines={stopLines}
                ficheLine={ficheLine}
                setFicheLine={setFicheLine}
                ficheDate={ficheDate}
                setFicheDate={setFicheDate}
                ficheDateBounds={ficheDateBounds}
                ficheData={ficheData}
              />
            ) : loading && passages.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: t.textHint, fontSize: 13 }}>Chargement des prochains passages...</div>
            ) : passages.length === 0 ? (
              <div style={{ padding: "36px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🚏</div>
                <div style={{ fontSize: 13, color: t.textSub, lineHeight: 1.7 }}>Aucun passage prévu dans la prochaine heure pour cet arrêt.</div>
              </div>
            ) : (
              passages.map((p, i) => {
                const result = selectedEntry
                  ? findVehicle(vehicules, nextStops, p, selectedEntry.id)
                  : null;
                return (
                  <PassageRow
                    key={p.key + i}
                    p={p}
                    t={t}
                    isFirst={i === 0}
                    matchResult={result}
                    stopName={selectedGroup?.name}
                    onTrack={result && onTrackVehicle ? () => onTrackVehicle(result.v) : null}
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

// ─── Fiche horaire ─────────────────────────────────────────────────────────────
// Grille façon horaire papier : une ligne par heure, les minutes de départ
// en colonnes, groupées par sens (aller / retour).

const DOW_LABELS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function ficheDateLabel(dateStr) {
  if (!dateStr) return "";
  const d = dateFromStr(dateStr);
  return `${DOW_LABELS[d.getDay()]} ${d.getDate()} ${d.toLocaleDateString("fr-FR", { month: "long" })}`;
}

function FicheHoraire({ t, stopLines, ficheLine, setFicheLine, ficheDate, setFicheDate, ficheDateBounds, ficheData }) {
  const isoDate = (s) => s ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : "";
  const fromIso = (s) => s ? s.replaceAll("-", "") : "";

  return (
    <div style={{ padding: "12px 14px 24px" }}>

      {/* Sélecteur de ligne (si l'arrêt en dessert plusieurs) */}
      {stopLines.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {stopLines.map(l => {
            const isActive = (ficheLine || stopLines[0].name) === l.name;
            const color = `#${l.color || "0074c9"}`;
            return (
              <button key={l.name} onClick={() => setFicheLine(l.name)}
                style={{ minWidth: 34, height: 26, borderRadius: 8, padding: "0 8px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',system-ui,sans-serif",
                  background: isActive ? color : "transparent", color: isActive ? "#fff" : t.textSub,
                  border: `1.5px solid ${isActive ? color : t.border}` }}>
                {l.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Sélecteur de date */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button
          onClick={() => setFicheDate(addDaysStr(ficheDate, -1))}
          disabled={!ficheDateBounds || ficheDate <= ficheDateBounds.min}
          style={{ width: 26, height: 26, borderRadius: 8, border: `0.5px solid ${t.border}`, background: t.cardBg, color: t.textSub, cursor: "pointer", fontSize: 13 }}
        >‹</button>

        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.text, textTransform: "capitalize" }}>{ficheDateLabel(ficheDate)}</div>
          {ficheDateBounds && (
            <input
              type="date"
              value={isoDate(ficheDate)}
              min={isoDate(ficheDateBounds.min)}
              max={isoDate(ficheDateBounds.max)}
              onChange={e => e.target.value && setFicheDate(fromIso(e.target.value))}
              style={{ marginTop: 3, fontSize: 10, color: t.textHint, background: "none", border: "none", fontFamily: "'Inter',system-ui,sans-serif" }}
            />
          )}
        </div>

        <button
          onClick={() => setFicheDate(addDaysStr(ficheDate, 1))}
          disabled={!ficheDateBounds || ficheDate >= ficheDateBounds.max}
          style={{ width: 26, height: 26, borderRadius: 8, border: `0.5px solid ${t.border}`, background: t.cardBg, color: t.textSub, cursor: "pointer", fontSize: 13 }}
        >›</button>
      </div>

      {!ficheData || ficheData.dirs.length === 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: t.textHint, fontSize: 13 }}>
          Aucun passage prévu ce jour-là pour cette ligne à cet arrêt.
        </div>
      ) : (
        ficheData.dirs.map(({ dir, headsign, color, rows }) => (
          <div key={dir} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: `#${color || "0074c9"}`, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <span>▶</span><span>{headsign}</span>
            </div>
            <div style={{ border: `0.5px solid ${t.border}`, borderRadius: 12, overflow: "hidden" }}>
              {rows.map(({ h, mins }, ri) => (
                <div key={h} style={{ display: "flex", alignItems: "center", padding: "6px 10px", background: ri % 2 ? "transparent" : t.panelBg, borderTop: ri > 0 ? `0.5px solid ${t.border}` : "none" }}>
                  <div style={{ width: 34, flexShrink: 0, fontSize: 12, fontWeight: 700, color: t.text }}>
                    {String(h % 24).padStart(2, "0")}h{h >= 24 ? "⁺¹" : ""}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 8px" }}>
                    {mins.map(({ m, isNext }, mi) => (
                      <span key={mi} style={{
                        fontSize: 12,
                        fontWeight: isNext ? 700 : 400,
                        color: isNext ? `#${color || "0074c9"}` : t.textSub,
                      }}>
                        {String(m).padStart(2, "0")}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Ligne de passage ─────────────────────────────────────────────────────────

function PassageRow({ p, t, isFirst, matchResult, stopName, onTrack }) {
  const color = p.color ? `#${p.color}` : "#0074c9";
  const mins  = p.mins;
  const minLabel = mins <= 0 ? "Imm." : `${mins} min`;
  const minColor = mins <= 1 ? "#22c55e" : mins <= 4 ? "#f59e0b" : t.accent;

  // Construire le texte de statut du véhicule
  let statusIcon  = "🚃";
  let statusTitle = null;
  let statusSub   = null;

  if (matchResult) {
    const { ns, info } = matchResult;
    const stopsAway = info.stopsAway;
    const speed     = matchResult.v.speed ?? 0;

    if (ns.isAtStop) {
      statusIcon  = "🚏";
      statusTitle = `À l'arrêt « ${ns.currentStop} »`;
      statusSub   = stopsAway === 0
        ? `Prochain départ ici`
        : `Encore ${stopsAway} arrêt${stopsAway > 1 ? "s" : ""} avant ${stopName}`;
    } else if (stopsAway === 0) {
      // Le prochain arrêt du véhicule EST notre arrêt
      const distM = Math.round(ns.distM);
      const distLabel = distM >= 1000 ? `${(distM / 1000).toFixed(1)} km` : `${distM} m`;
      statusIcon  = "🚃";
      statusTitle = `En approche · ${distLabel}`;
      statusSub   = speed > 1 ? `${Math.round(speed)} km/h` : "À l'arrêt précédent";
    } else {
      // Plusieurs arrêts de distance
      const prevStop = info.nextStopName; // prochain arrêt du véhicule = stop intermédiaire
      statusIcon  = "🚃";
      statusTitle = `Encore ${stopsAway} arrêt${stopsAway > 1 ? "s" : ""} avant ${stopName}`;
      statusSub   = prevStop ? `Prochain arrêt : ${prevStop}` : (speed > 1 ? `${Math.round(speed)} km/h` : null);
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

      {/* Bandeau statut véhicule */}
      {onTrack ? (
        <button onClick={onTrack} style={{ width: "100%", padding: "7px 16px 9px", background: `${color}0a`, border: "none", borderTop: `0.5px solid ${color}22`, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: "'Inter',system-ui,sans-serif", textAlign: "left" }}>
          <span style={{ fontSize: 13, flexShrink: 0 }}>{statusIcon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {statusTitle && <div style={{ fontSize: 11, fontWeight: 600, color }}>{statusTitle}</div>}
            {statusSub   && <div style={{ fontSize: 10, color: t.textHint, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{statusSub}</div>}
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      ) : (
        mins > 0 && mins <= 90 && (
          <div style={{ padding: "5px 16px 8px", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11 }}>⏳</span>
            <span style={{ fontSize: 10, color: t.textHint }}>Véhicule non encore localisé sur le réseau</span>
          </div>
        )
      )}
    </div>
  );
}

// ─── Liste de tous les arrêts ─────────────────────────────────────────────────

function StopList({ t, stops, onSelect }) {
  const TYPE_COLORS = { tram: "#3b8eea", brt: "#e87fa3", bus: "#fbbf24" };
  const TYPE_LABELS = { tram: "T", brt: "B", bus: "🚌" };

  if (stops.length === 0) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: t.textHint, fontSize: 13 }}>
        Aucun arrêt trouvé
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {stops.map((stop, i) => {
        const typesSet = new Set(stop.entries.flatMap(e => e.types));
        const types = ["tram", "brt", "bus"].filter(t => typesSet.has(t));
        return (
          <button key={stop.name + i} onClick={() => onSelect(stop)}
            style={{ width: "100%", padding: "11px 16px", background: "none", border: "none", borderBottom: `0.5px solid ${t.border}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left", fontFamily: "'Inter',system-ui,sans-serif" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill={t.textHint} stroke="none" style={{ flexShrink: 0 }}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            <span style={{ fontSize: 13, color: t.text, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {stop.name}
            </span>
            <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              {types.map(type => (
                <span key={type} style={{ fontSize: 10, fontWeight: 700, color: TYPE_COLORS[type], background: `${TYPE_COLORS[type]}18`, borderRadius: 5, padding: "2px 5px" }}>
                  {type === "tram" ? "Tram" : type === "brt" ? "BusTram" : "Bus"}
                </span>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
