// ThermometresPanel.jsx
// Tableau de bord : toutes les lignes actives avec leurs véhicules
// positionnés sur un diagramme horizontal (style intérieur tram).

import { useMemo } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Calcule la fraction de position [0..1] d'un véhicule dans sa séquence d'arrêts
function vehicleProgress(ns) {
  if (!ns) return -1;
  const { seqIndex, fullSequence, isAtStop, distM } = ns;
  if (!fullSequence || fullSequence.length < 2) return -1;
  const total = fullSequence.length - 1;
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

// ─── Ligne individuelle ────────────────────────────────────────────────────────

function LineThermometre({ lineKey, vehicles, nextStops, theme: t, onVehicleClick }) {
  const color = `#${vehicles[0].route_color || "0074c9"}`;
  const fg    = `#${vehicles[0].route_text_color || "ffffff"}`;
  const type  = vehicles[0].vehicleType;
  const emoji = type === "tram" ? "🚃" : "🚌";

  // Séparer les deux sens
  const dir0 = vehicles.filter(v => String(v.direction_id) === "0");
  const dir1 = vehicles.filter(v => String(v.direction_id) === "1");
  const dirs  = [dir0, dir1].filter(d => d.length > 0);

  return (
    <div style={{
      background: t.cardBg,
      border: `0.5px solid ${t.border}`,
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 10,
    }}>
      {/* Header ligne */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px 8px",
        borderBottom: `0.5px solid ${t.border}`,
      }}>
        <div style={{
          minWidth: 32, height: 26, borderRadius: 8,
          background: color, color: fg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, padding: "0 7px", flexShrink: 0,
        }}>{lineKey}</div>
        <span style={{ fontSize: 11, color: t.textSub }}>
          {type === "tram" ? "Tramway" : type === "bustram" ? "BRT" : "Bus"}
        </span>
        <span style={{ fontSize: 11, color, fontWeight: 600, marginLeft: "auto" }}>
          {vehicles.length} véhicule{vehicles.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Un diagramme par direction */}
      {dirs.map((dirVehicles, di) => {
        // Récupérer la séquence du premier véhicule qui en a une
        let fullSequence = [];
        for (const v of dirVehicles) {
          const ns = nextStops?.get(v.id);
          if (ns?.fullSequence?.length > 1) { fullSequence = ns.fullSequence; break; }
        }
        if (fullSequence.length < 2) return null;

        const terminus = fullSequence[fullSequence.length - 1].name;
        const origin   = fullSequence[0].name;

        // Véhicules avec leur position calculée
        const positioned = dirVehicles
          .map(v => ({ v, ns: nextStops?.get(v.id), progress: vehicleProgress(nextStops?.get(v.id)) }))
          .filter(x => x.progress >= 0)
          .sort((a, b) => a.progress - b.progress);

        // Largeur par arrêt réduite — les labels sont inclinés, ils ne prennent plus de largeur
        const STOP_W  = 52;
        const RAIL_Y  = 36;   // position verticale de la rail (px depuis le haut)
        const DIAGRAM_H = 155; // hauteur totale : rail + espace pour labels à 45°
        const totalW  = fullSequence.length * STOP_W;

        return (
          <div key={di} style={{ padding: "6px 14px 10px" }}>
            {/* Label direction */}
            <div style={{ fontSize: 10, color: t.textHint, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <span>▶</span>
              <span style={{ fontWeight: 600, color: t.textSub }}>{terminus}</span>
              <span style={{ marginLeft: "auto", color: t.textHint }}>{dirVehicles.length} {emoji}</span>
            </div>

            {/* Diagramme scrollable */}
            <div style={{ overflowX: "auto", overflowY: "hidden" }} className="wimt-thermo-scroll">
              <div style={{ position: "relative", height: DIAGRAM_H, minWidth: totalW }}>

                {/* Rail */}
                <div style={{
                  position: "absolute",
                  top: RAIL_Y, left: STOP_W / 2, right: STOP_W / 2,
                  height: 3, background: `${color}30`, borderRadius: 2,
                }} />

                {/* Arrêts */}
                {fullSequence.map((stop, si) => {
                  const isFirst = si === 0;
                  const isLast  = si === fullSequence.length - 1;
                  const isNextForSome = positioned.some(({ ns }) => ns?.seqIndex === si);
                  const dotSize = isFirst || isLast ? 12 : isNextForSome ? 10 : 6;
                  const dotLeft = si * STOP_W + STOP_W / 2;

                  return (
                    <div key={stop.id ?? si}>
                      {/* Point d'arrêt */}
                      <div style={{
                        position: "absolute",
                        left: dotLeft - dotSize / 2,
                        top: RAIL_Y - dotSize / 2 + 1.5,
                        width: dotSize, height: dotSize,
                        borderRadius: "50%",
                        background: isFirst || isLast || isNextForSome ? color : t.bg,
                        border: `2px solid ${isFirst || isLast || isNextForSome ? color : color + "55"}`,
                        boxShadow: isNextForSome ? `0 0 0 3px ${color}25` : "none",
                        zIndex: 2,
                        transition: "all 0.2s",
                      }} />

                      {/* Label à 45° sous le point */}
                      <div style={{
                        position: "absolute",
                        left: dotLeft + 2,
                        top: RAIL_Y + 10,
                        transformOrigin: "top left",
                        transform: "rotate(45deg)",
                        fontSize: isFirst || isLast || isNextForSome ? 12 : 11,
                        fontWeight: isFirst || isLast ? 700 : isNextForSome ? 600 : 400,
                        color: isNextForSome ? color : isFirst || isLast ? t.textSub : t.textHint,
                        whiteSpace: "nowrap",
                        lineHeight: 1.2,
                        pointerEvents: "none",
                      }}>
                        {stop.name}
                      </div>
                    </div>
                  );
                })}

                {/* Véhicules positionnés (au-dessus de la rail) */}
                {positioned.map(({ v, ns, progress }) => {
                  const left = STOP_W / 2 + progress * (totalW - STOP_W);
                  const isMoving = (v.speed ?? 0) > 0;
                  return (
                    <button
                      key={v.id}
                      onClick={() => onVehicleClick(v)}
                      title={`${v.headsign}${isMoving ? ` · ${Math.round(v.speed)} km/h` : " · arrêté"}`}
                      style={{
                        position: "absolute",
                        left: left - 18,
                        top: 0,
                        background: "none", border: "none", padding: 0,
                        cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center",
                        zIndex: 10,
                        transition: "left 0.4s ease",
                      }}
                    >
                      {/* Badge véhicule */}
                      <div style={{
                        background: color, color: fg,
                        borderRadius: 8, padding: "3px 7px",
                        fontSize: 10, fontWeight: 700,
                        boxShadow: `0 2px 8px ${color}55`,
                        whiteSpace: "nowrap",
                        display: "flex", alignItems: "center", gap: 3,
                      }}>
                        <span>{emoji}</span>
                        {isMoving
                          ? <span>{Math.round(v.speed)} km/h</span>
                          : <span style={{ opacity: 0.75 }}>⏹</span>
                        }
                      </div>
                      {/* Trait vers la rail */}
                      <div style={{ width: 1.5, height: RAIL_Y - 22, background: color, opacity: 0.4 }} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Panneau principal ─────────────────────────────────────────────────────────

export default function ThermometresPanel({ theme: t, vehicules, nextStops, onVehicleClick }) {
  // Grouper les véhicules par ligne, triés trams d'abord puis bus
  const groupedLines = useMemo(() => {
    const map = {};
    for (const v of vehicules) {
      if (!map[v.route_short_name]) map[v.route_short_name] = [];
      map[v.route_short_name].push(v);
    }
    // Trier : trams (1-5) d'abord, BRT (A), puis bus numériques
    return Object.entries(map).sort(([a, va], [b, vb]) => {
      const typeOrder = { tram: 0, bustram: 1, bus: 2 };
      const ta = typeOrder[va[0].vehicleType] ?? 2;
      const tb = typeOrder[vb[0].vehicleType] ?? 2;
      if (ta !== tb) return ta - tb;
      return a.localeCompare(b, undefined, { numeric: true });
    });
  }, [vehicules]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 16px 10px", borderBottom: `0.5px solid ${t.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Thermomètres</div>
        <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>
          {groupedLines.length} lignes · {vehicules.length} véhicules en service
        </div>
      </div>

      {/* Liste scrollable */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px 20px" }}>
        <style>{`.wimt-thermo-scroll::-webkit-scrollbar { height: 0; } .wimt-thermo-scroll { scrollbar-width: none; }`}</style>

        {groupedLines.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: t.textHint, fontSize: 13 }}>
            Aucun véhicule en service
          </div>
        ) : groupedLines.map(([lineKey, lineVehicles]) => (
          <LineThermometre
            key={lineKey}
            lineKey={lineKey}
            vehicles={lineVehicles}
            nextStops={nextStops}
            theme={t}
            onVehicleClick={onVehicleClick}
          />
        ))}
      </div>
    </div>
  );
}
