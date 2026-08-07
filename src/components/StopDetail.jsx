import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { BASE } from "../base.js";
import {
  loadServiceDates, fmtDate, addDaysStr, pickDefaultDate, ficheDateLabel,
  depToTimestamps, isServiceActiveFallback, activeServiceIdsNow, findVehicle,
  TYPE_CONFIG, TYPE_ORDER,
} from "../lib/stopSchedule.js";

// ─── StopDetail ──────────────────────────────────────────────────────────────
// Vue détaillée d'un arrêt (mini-carte, prochains passages en direct, fiche
// horaire). Composant autonome (charge ses propres données) réutilisé par
// ArretPanel (onglet Arrêt) et par LineDrawer (clic sur une ligne -> arrêt).
//
// Props:
//   t            : thème
//   dataBase     : "" (Montpellier) | "nimes/" | "lio/" ...
//   group        : { name, entries: [{id,lat,lon,types}] } — l'arrêt physique
//                   courant + ses éventuels arrêts voisins du même nom
//   entry        : entrée courante de group.entries
//   vehicules, nextStops, onTrackVehicle : contexte véhicules (comme ArretPanel)
//   onSwitchEntry(entry) : appelé quand on change de type ou d'arrêt voisin
//   onClose()    : ferme le panneau
//   showMiniMap  : affiche la mini-carte (true par défaut)

export default function StopDetail({
  t, dataBase = "", group, entry, vehicules = [], nextStops = new Map(),
  onTrackVehicle, onSwitchEntry, onClose, showMiniMap = true,
}) {
  const [passages, setPassages]         = useState([]);
  const [rawPassages, setRawPassages]   = useState([]);
  const [serviceDates, setServiceDates] = useState(null);
  const [loading, setLoading]           = useState(false);
  const [loadedAt, setLoadedAt]         = useState(null);
  const [showFiche, setShowFiche]       = useState(false);
  const [ficheDate, setFicheDate]       = useState(null);
  const [ficheLine, setFicheLine]       = useState(null);
  const mapRef = useRef(null);

  useEffect(() => { loadServiceDates(dataBase).then(sd => { setServiceDates(sd); setFicheDate(pickDefaultDate(sd)); }); }, [dataBase]);

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
    if (!entry) return;
    setShowFiche(false);
    setFicheLine(null);
    fetchPassages(entry.id);
    const timer = setInterval(() => fetchPassages(entry.id), 30000);
    return () => clearInterval(timer);
  }, [entry, fetchPassages]);

  // Vue "live" : prochains passages dans les 90 prochaines minutes.
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
          key: `${ts}|${p.n}|${p.h}`, ts, mins,
          dep: displayDep, name: p.n, headsign: p.h, color: p.c, dir: p.d,
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

  const availableTypes = useMemo(() => {
    if (!group) return [];
    const typesSet = new Set(group.entries.flatMap(e => e.types));
    return TYPE_ORDER.filter(ty => typesSet.has(ty));
  }, [group]);

  const activeType = useMemo(() => {
    if (!entry) return null;
    return TYPE_ORDER.find(ty => entry.types.includes(ty)) || entry.types[0] || null;
  }, [entry]);

  const allEntries = group?.entries || [];

  const stopLines = useMemo(() => {
    const map = new Map();
    for (const p of rawPassages) if (!map.has(p.n)) map.set(p.n, p.c);
    return [...map.entries()]
      .map(([name, color]) => ({ name, color }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [rawPassages]);

  const ficheDateBounds = useMemo(() => {
    if (!serviceDates) return null;
    const dates = Object.keys(serviceDates).sort();
    return { min: dates[0], max: dates[dates.length - 1] };
  }, [serviceDates]);

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

    const nowMinuteOfDay = (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })();
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
              m, isNext: isToday && (h % 24) * 60 + m >= nowMinuteOfDay,
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

  const switchType = (type) => {
    const e = group.entries.find(e => e.types.includes(type));
    if (e) onSwitchEntry?.(e);
  };

  if (!group || !entry) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: t.bg }}>

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
      {showMiniMap && (
        <div style={{ height: 160, flexShrink: 0 }}>
          <MapContainer center={[entry.lat, entry.lon]} zoom={15}
            style={{ height: "100%", width: "100%" }} ref={mapRef} zoomControl={false}>
            <TileLayer attribution="&copy; OpenStreetMap contributors &copy; CARTO" url={t.mapTile} />
            {allEntries.filter(e => e.id !== entry.id).map(e => (
              <CircleMarker key={e.id} center={[e.lat, e.lon]} radius={5}
                fillColor={e.types.includes("tram") ? "#3b8eea" : "#fbbf24"} color="#fff" weight={1.5} fillOpacity={0.8}
                eventHandlers={{ click: () => onSwitchEntry?.(e) }}>
                <Popup><span style={{ fontSize: 11, fontFamily: "'Inter',system-ui,sans-serif" }}>{group.name} ({e.types.join("/")})</span></Popup>
              </CircleMarker>
            ))}
            <Marker position={[entry.lat, entry.lon]} icon={stopIcon}>
              <Popup><strong style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>{group.name}</strong></Popup>
            </Marker>
          </MapContainer>
        </div>
      )}

      {/* Header arrêt */}
      <div style={{ padding: "10px 16px", background: t.panelBg, borderBottom: `0.5px solid ${t.border}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {activeType && TYPE_CONFIG[activeType] && (
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: TYPE_CONFIG[activeType].color, flexShrink: 0 }}></div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{group.name}</div>
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
        {onClose && (
          <button onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: t.textHint, fontSize: 20, padding: 0, lineHeight: 1 }}>×</button>
        )}
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
            const result = findVehicle(vehicules, nextStops, p, entry.id);
            return (
              <PassageRow
                key={p.key + i}
                p={p}
                t={t}
                isFirst={i === 0}
                matchResult={result}
                stopName={group.name}
                onTrack={result && onTrackVehicle ? () => onTrackVehicle(result.v) : null}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Fiche horaire ─────────────────────────────────────────────────────────────
// Grille façon horaire papier : une ligne par heure, les minutes de départ
// en colonnes, groupées par sens (aller / retour).

function FicheHoraire({ t, stopLines, ficheLine, setFicheLine, ficheDate, setFicheDate, ficheDateBounds, ficheData }) {
  const isoDate = (s) => s ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : "";
  const fromIso = (s) => s ? s.replaceAll("-", "") : "";

  return (
    <div style={{ padding: "12px 14px 24px" }}>

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
      const distM = Math.round(ns.distM);
      const distLabel = distM >= 1000 ? `${(distM / 1000).toFixed(1)} km` : `${distM} m`;
      statusIcon  = "🚃";
      statusTitle = `En approche · ${distLabel}`;
      statusSub   = speed > 1 ? `${Math.round(speed)} km/h` : "À l'arrêt précédent";
    } else {
      const prevStop = info.nextStopName;
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
