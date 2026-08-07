import { useState, useEffect, useMemo } from "react";
import { BASE } from "../base.js";
import { TYPE_ORDER, TYPE_CONFIG } from "../lib/stopSchedule.js";
import StopDetail from "./StopDetail.jsx";

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

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ArretPanel({ theme: t, vehicules = [], nextStops = new Map(), onTrackVehicle, dataBase = "" }) {
  const [query, setQuery]               = useState("");
  const [allMeta, setAllMeta]           = useState([]);     // [{name, entries:[{id,lat,lon,types}]}]
  const [suggestions, setSuggestions]   = useState([]);
  const [showDrop, setShowDrop]         = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [listTypeFilter, setListTypeFilter] = useState(null); // filtre type sur la liste

  useEffect(() => { loadMeta(dataBase).then(setAllMeta); }, [dataBase]);

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

  // Sélectionner un groupe depuis la recherche
  const selectGroup = (group) => {
    setSelectedGroup(group);
    setQuery(group.name);
    setSuggestions([]);
    setShowDrop(false);

    const typesSet = new Set(group.entries.flatMap(e => e.types));
    const firstType = TYPE_ORDER.find(ty => typesSet.has(ty)) || null;
    const entry = firstType
      ? group.entries.find(e => e.types.includes(firstType)) || group.entries[0]
      : group.entries[0];
    setSelectedEntry(entry);
  };

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
              onClick={() => { setQuery(""); setSelectedGroup(null); setSelectedEntry(null); setShowDrop(false); }}
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
              const types = TYPE_ORDER.filter(ty => typesSet.has(ty));
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
        <StopDetail
          t={t}
          dataBase={dataBase}
          group={selectedGroup}
          entry={selectedEntry}
          vehicules={vehicules}
          nextStops={nextStops}
          onTrackVehicle={onTrackVehicle}
          onSwitchEntry={setSelectedEntry}
          onClose={() => { setSelectedGroup(null); setSelectedEntry(null); setQuery(""); }}
        />
      )}
    </div>
  );
}

// ─── Liste de tous les arrêts ─────────────────────────────────────────────────

function StopList({ t, stops, onSelect }) {
  const TYPE_COLORS = { tram: "#3b8eea", brt: "#e87fa3", bus: "#fbbf24" };

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
