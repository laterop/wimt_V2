import { useState, useEffect, useMemo } from "react";
import { loadGtfsData } from "../hooks/useNextStop.js";

// ─── LineDrawer ─────────────────────────────────────────────────────────────
// Panneau ouvert par un clic sur le tracé d'une ligne sur la carte : thermomètre
// vertical (tous les arrêts de la ligne, empilés) avec les véhicules en
// service positionnés dessus. Cliquer un arrêt ouvre StopDetail à sa droite
// (géré par le parent via onOpenStop).
//
// Props:
//   t            : thème
//   dataBase     : "" | "nimes/" | "lio/" ...
//   line         : { short_name, color, type } — la ligne cliquée
//   vehicules    : véhicules du réseau (filtrés ici sur la ligne)
//   nextStops    : Map<vehicleId, nextStopInfo> (cf. useNextStop)
//   onOpenStop(stopId, name, lat, lon, type) : ouvre l'arrêt dans le panneau suivant
//   onClose()

function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Fraction de position [0..1] d'un véhicule dans la séquence d'arrêts (même
// logique que ThermometresPanel, réutilisée ici à la verticale).
function vehicleProgress(ns, seqLen) {
  if (!ns || seqLen < 2) return -1;
  const { seqIndex, fullSequence, isAtStop, distM } = ns;
  const total = seqLen - 1;
  if (isAtStop) return seqIndex / total;
  if (seqIndex > 0 && seqIndex < fullSequence.length) {
    const prev = fullSequence[seqIndex - 1];
    const next = fullSequence[seqIndex];
    const d = distKm(prev.lat, prev.lon, next.lat, next.lon);
    const frac = d > 0 ? Math.min(1, Math.max(0, 1 - (distM / 1000) / d)) : 0.5;
    return (seqIndex - 1 + frac) / total;
  }
  return seqIndex / total;
}

export default function LineDrawer({ t, dataBase = "", line, vehicules = [], nextStops = new Map(), onOpenStop, onClose }) {
  const [gtfsData, setGtfsData] = useState(null);
  const [dir, setDir] = useState("0");

  useEffect(() => { loadGtfsData(dataBase).then(setGtfsData); }, [dataBase]);

  // Revenir à la direction "0" à chaque nouvelle ligne cliquée
  useEffect(() => { setDir("0"); }, [line?.short_name]);

  const lineVehicles = useMemo(
    () => vehicules.filter(v => v.route_short_name === line?.short_name),
    [vehicules, line]
  );

  const routeData = gtfsData && line ? gtfsData[line.short_name] : null;
  const dirsAvailable = useMemo(() => {
    if (!routeData) return [];
    return ["0", "1"].filter(d => (routeData.traces?.[d]?.length || 0) > 1);
  }, [routeData]);

  const sequence = routeData?.traces?.[dir] || [];

  const headsign = useMemo(() => {
    const v = lineVehicles.find(v => String(v.direction_id) === dir);
    if (v) return v.headsign;
    return sequence.length ? sequence[sequence.length - 1].name : "";
  }, [lineVehicles, dir, sequence]);

  const positioned = useMemo(() => {
    const dirVehicles = lineVehicles.filter(v => String(v.direction_id) === dir);
    return dirVehicles
      .map(v => ({ v, ns: nextStops.get(v.id), progress: vehicleProgress(nextStops.get(v.id), sequence.length) }))
      .filter(x => x.progress >= 0)
      .sort((a, b) => a.progress - b.progress);
  }, [lineVehicles, dir, nextStops, sequence.length]);

  if (!line) return null;

  const color = `#${line.color || "0074c9"}`;
  const emoji = line.type === "tram" ? "🚃" : "🚌";
  const ROW_H = 46; // hauteur par arrêt, px

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: t.bg }}>

      {/* Header */}
      <div style={{ padding: "10px 14px", background: t.panelBg, borderBottom: `0.5px solid ${t.border}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ minWidth: 32, height: 26, borderRadius: 8, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, padding: "0 7px", flexShrink: 0 }}>
          {line.short_name}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {line.type === "tram" ? "Tramway" : line.type === "bustram" ? "BusTram" : "Bus"}
          </div>
          <div style={{ fontSize: 10, color: t.textSub }}>{lineVehicles.length} véhicule{lineVehicles.length > 1 ? "s" : ""}</div>
        </div>
        <button onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: t.textHint, fontSize: 20, padding: 0, lineHeight: 1 }}>×</button>
      </div>

      {/* Sélecteur de sens */}
      {dirsAvailable.length > 1 && (
        <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `0.5px solid ${t.border}`, flexShrink: 0 }}>
          {dirsAvailable.map(d => {
            const seq = routeData.traces[d];
            const label = seq[seq.length - 1]?.name || (d === "0" ? "Aller" : "Retour");
            const isActive = dir === d;
            return (
              <button key={d} onClick={() => setDir(d)}
                style={{ flex: 1, padding: "6px 4px", borderRadius: 9, border: `1.5px solid ${isActive ? color : t.border}`, background: isActive ? `${color}18` : "transparent", cursor: "pointer", fontSize: 11, fontWeight: isActive ? 700 : 400, color: isActive ? color : t.textSub, fontFamily: "'Inter',system-ui,sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                ▶ {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Thermomètre vertical */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 20px" }}>
        {!gtfsData ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: t.textHint, fontSize: 12 }}>Chargement...</div>
        ) : sequence.length < 2 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: t.textHint, fontSize: 12 }}>Séquence d'arrêts non disponible.</div>
        ) : (
          <div style={{ position: "relative", minHeight: sequence.length * ROW_H, paddingLeft: 26 }}>

            {/* Rail vertical */}
            <div style={{ position: "absolute", top: ROW_H / 2, bottom: ROW_H / 2, left: 5, width: 3, background: `${color}30`, borderRadius: 2 }} />

            {/* Véhicules positionnés sur le rail */}
            {positioned.map(({ v, progress }) => {
              const top = ROW_H / 2 + progress * (sequence.length - 1) * ROW_H;
              const isMoving = (v.speed ?? 0) > 0;
              return (
                <div key={v.id} style={{ position: "absolute", top: top - 10, left: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    background: color, color: "#fff", borderRadius: 8, padding: "3px 7px", fontSize: 10, fontWeight: 700,
                    boxShadow: `0 2px 8px ${color}55`, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 3,
                  }}>
                    <span>{emoji}</span>
                    {isMoving ? <span>{Math.round(v.speed)} km/h</span> : <span style={{ opacity: 0.75 }}>⏹</span>}
                  </div>
                </div>
              );
            })}

            {/* Arrêts */}
            {sequence.map((stop, si) => {
              const isFirst = si === 0;
              const isLast  = si === sequence.length - 1;
              const isNextForSome = positioned.some(({ ns }) => ns?.seqIndex === si);
              const dotSize = isFirst || isLast ? 12 : isNextForSome ? 10 : 7;
              return (
                <button
                  key={stop.id ?? si}
                  onClick={() => onOpenStop?.({ id: stop.id, name: stop.name, lat: stop.lat, lon: stop.lon, type: line.type === "tram" ? "tram" : line.type === "bustram" ? "brt" : "bus" })}
                  style={{
                    position: "absolute", top: si * ROW_H, left: -26, right: 0, height: ROW_H,
                    background: "none", border: "none", cursor: "pointer", padding: 0,
                    display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                    fontFamily: "'Inter',system-ui,sans-serif",
                  }}
                >
                  <div style={{ width: 26, display: "flex", justifyContent: "center", flexShrink: 0 }}>
                    <div style={{
                      width: dotSize, height: dotSize, borderRadius: "50%",
                      background: isFirst || isLast || isNextForSome ? color : t.bg,
                      border: `2px solid ${isFirst || isLast || isNextForSome ? color : color + "55"}`,
                      boxShadow: isNextForSome ? `0 0 0 3px ${color}25` : "none",
                    }} />
                  </div>
                  <div style={{
                    fontSize: isFirst || isLast ? 13 : 12,
                    fontWeight: isFirst || isLast ? 700 : isNextForSome ? 600 : 400,
                    color: isNextForSome ? color : isFirst || isLast ? t.text : t.textSub,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1,
                  }}>
                    {stop.name}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
