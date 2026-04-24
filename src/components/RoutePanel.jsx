import { useRef, useEffect, useCallback } from "react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dist(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── RoutePanel ───────────────────────────────────────────────────────────────
// Panneau horizontal en bas de la carte (style diagramme intérieur tram)
// Affiche tous les arrêts de la ligne + tous les véhicules positionnés dessus.
//
// Props:
//   theme         : objet thème
//   selectedLine  : { short_name, color, text_color, type } | null
//   lineVehicles  : array de véhicules sur la ligne (tous sens confondus)
//   nextStops     : Map<vehicleId, nextStopInfo>
//   selectedVehicle : id du véhicule sélectionné (pour surbrillance)
//   onVehicleClick  : (vehicle) => void
//   onClose         : () => void
//   gtfsData        : objet gtfs-data.json (passé depuis useNextStop)

export default function RoutePanel({
  theme: t,
  selectedLine,
  lineVehicles,
  nextStops,
  selectedVehicle,
  onVehicleClick,
  onClose,
}) {
  const scrollRef = useRef(null);
  const selectedRef = useRef(null);

  if (!selectedLine) return null;

  const color = `#${selectedLine.color || "0074c9"}`;
  const fg    = `#${selectedLine.text_color || "ffffff"}`;

  // Séparer les véhicules par direction
  const dir0 = lineVehicles.filter(v => String(v.direction_id) === "0");
  const dir1 = lineVehicles.filter(v => String(v.direction_id) === "1");

  // Choisir la direction à afficher : celle du véhicule sélectionné, sinon aller (0)
  const selV = lineVehicles.find(v => v.id === selectedVehicle);
  const activeDir = selV ? String(selV.direction_id) : "0";
  const activeVehicles = activeDir === "0" ? dir0 : dir1;

  // Récupérer la séquence d'arrêts depuis le premier véhicule qui en a une
  let fullSequence = [];
  for (const v of activeVehicles) {
    const ns = nextStops?.get(v.id);
    if (ns?.fullSequence?.length > 0) {
      fullSequence = ns.fullSequence;
      break;
    }
  }
  // Fallback sur l'autre direction
  if (fullSequence.length === 0) {
    for (const v of lineVehicles) {
      const ns = nextStops?.get(v.id);
      if (ns?.fullSequence?.length > 0) {
        fullSequence = ns.fullSequence;
        break;
      }
    }
  }

  // Pour chaque véhicule actif, calculer sa position en "fraction" dans la séquence
  // position = seqIndex + fraction de progression entre les 2 stops
  const vehiclePositions = activeVehicles.map(v => {
    const ns = nextStops?.get(v.id);
    if (!ns || fullSequence.length === 0) return { v, pos: -1, ns: null };

    const tramIdx = ns.seqIndex ?? -1;
    let pos = tramIdx;

    if (!ns.isAtStop && tramIdx > 0 && tramIdx < fullSequence.length) {
      const prev = fullSequence[tramIdx - 1];
      const next = fullSequence[tramIdx];
      const distTotal = dist(prev.lat, prev.lon, next.lat, next.lon);
      const distLeft  = ns.distM ? ns.distM / 1000 : distTotal / 2;
      const fraction  = distTotal > 0
        ? Math.min(1, Math.max(0, 1 - distLeft / distTotal))
        : 0.5;
      pos = tramIdx - 1 + fraction;
    }
    return { v, pos, ns };
  }).filter(x => x.pos >= 0).sort((a, b) => a.pos - b.pos);

  // Scroll auto vers le véhicule sélectionné
  useEffect(() => {
    if (selectedRef.current && scrollRef.current) {
      selectedRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selectedVehicle, activeDir]);

  const hasDir0 = dir0.length > 0;
  const hasDir1 = dir1.length > 0;

  // Label terminus (dernier arrêt de la séquence)
  const terminus = fullSequence.length > 0 ? fullSequence[fullSequence.length - 1].name : "";
  const origin   = fullSequence.length > 0 ? fullSequence[0].name : "";

  const panelHeight = 160;
  const STOP_W = 88; // px par arrêt (largeur minimale)

  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 1100,
      background: t.panelBg,
      borderRadius: "18px 18px 0 0",
      boxShadow: "0 -8px 40px rgba(0,0,0,0.22)",
      border: `0.5px solid ${t.border}`,
      display: "flex", flexDirection: "column",
      height: panelHeight,
      animation: "slideUp 0.25s ease",
    }}>
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity:0 } to { transform: translateY(0); opacity:1 } }
        .wimt-route-scroll::-webkit-scrollbar { height: 0; }
        .wimt-route-scroll { scrollbar-width: none; }
      `}</style>

      {/* ── Header compact ── */}
      <div style={{ padding: "8px 14px 6px", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
        {/* Handle */}
        <div style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)", width: 36, height: 4, borderRadius: 2, background: t.border }} />

        {/* Badge ligne */}
        <div style={{ minWidth: 34, height: 24, borderRadius: 8, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: fg, padding: "0 7px", flexShrink: 0 }}>
          {selectedLine.short_name}
        </div>

        {/* Type */}
        <span style={{ fontSize: 11, color: t.textSub }}>
          {selectedLine.type === "tram" ? "Tramway" : selectedLine.type === "bustram" ? "BRT" : "Bus"}
        </span>

        {/* Compteur véhicules */}
        <span style={{ fontSize: 11, color, fontWeight: 600 }}>
          {activeVehicles.length} véhicule{activeVehicles.length > 1 ? "s" : ""}
        </span>

        {/* Sélecteur direction */}
        {(hasDir0 || hasDir1) && (
          <div style={{ display: "flex", gap: 4, marginLeft: "auto", marginRight: 8 }}>
            {[
              { dir: "0", vlist: dir0 },
              { dir: "1", vlist: dir1 },
            ].filter(x => x.vlist.length > 0).map(({ dir: d, vlist }) => {
              // Label du premier véhicule de cette direction
              const label = vlist[0]?.headsign ?? (d === "0" ? "Aller" : "Retour");
              const isActive = activeDir === d;
              return (
                <button
                  key={d}
                  onClick={() => onVehicleClick(vlist[0])}
                  style={{
                    padding: "3px 9px", borderRadius: 12, fontSize: 10, fontWeight: 600,
                    cursor: "pointer", border: `0.5px solid`,
                    fontFamily: "'Inter',system-ui,sans-serif",
                    background: isActive ? `${color}22` : "none",
                    color: isActive ? color : t.textHint,
                    borderColor: isActive ? `${color}66` : t.border,
                    whiteSpace: "nowrap", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis",
                  }}
                  title={label}
                >
                  {label.length > 14 ? label.slice(0, 13) + "…" : label}
                </button>
              );
            })}
          </div>
        )}

        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: t.textHint, fontSize: 20, padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>

      {/* ── Diagramme horizontal ── */}
      <div
        ref={scrollRef}
        className="wimt-route-scroll"
        style={{ flex: 1, overflowX: "auto", overflowY: "hidden", padding: "0 20px 14px", position: "relative" }}
      >
        {fullSequence.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: t.textHint, fontSize: 12 }}>
            Séquence non disponible
          </div>
        ) : (
          <div style={{ position: "relative", height: "100%", minWidth: fullSequence.length * STOP_W }}>

            {/* ── Ligne horizontale ── */}
            <div style={{
              position: "absolute",
              top: "50%", left: 0, right: 0,
              height: 4, borderRadius: 2,
              background: `${color}44`,
              transform: "translateY(-50%)",
              zIndex: 0,
            }} />

            {/* ── Segments colorés (passés) ── */}
            {vehiclePositions.map(({ v, pos }) => {
              // Segment du début jusqu'à la position du tram
              const frac = pos / (fullSequence.length - 1);
              const isSel = v.id === selectedVehicle;
              return (
                <div key={`seg-${v.id}`} style={{
                  position: "absolute",
                  top: "50%", left: 0,
                  width: `${frac * 100}%`,
                  height: 4, borderRadius: 2,
                  background: isSel ? color : `${color}88`,
                  transform: "translateY(-50%)",
                  zIndex: 1,
                  transition: "width 0.4s ease",
                }} />
              );
            })}

            {/* ── Arrêts ── */}
            {fullSequence.map((stop, i) => {
              const frac = i / (fullSequence.length - 1);
              const isFirst = i === 0;
              const isLast  = i === fullSequence.length - 1;
              const isEdge  = isFirst || isLast;

              // Ce stop est-il le prochain d'un des véhicules actifs ?
              const isNextForSome = vehiclePositions.some(({ ns }) => ns?.seqIndex === i);

              return (
                <div
                  key={stop.id}
                  style={{
                    position: "absolute",
                    left: `calc(${frac * 100}%)`,
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    display: "flex", flexDirection: "column", alignItems: "center",
                    zIndex: 2,
                    width: STOP_W,
                  }}
                >
                  {/* Point de l'arrêt */}
                  <div style={{
                    width:  isEdge ? 14 : isNextForSome ? 12 : 8,
                    height: isEdge ? 14 : isNextForSome ? 12 : 8,
                    borderRadius: "50%",
                    background: isEdge || isNextForSome ? color : t.bg,
                    border: `2.5px solid ${color}`,
                    boxShadow: isNextForSome ? `0 0 0 3px ${color}33` : "none",
                    flexShrink: 0,
                    transition: "all 0.2s",
                  }} />

                  {/* Nom de l'arrêt (en bas) */}
                  <div style={{
                    marginTop: 6,
                    fontSize: isEdge ? 10 : 9,
                    fontWeight: isEdge ? 700 : isNextForSome ? 600 : 400,
                    color: isNextForSome ? color : t.textSub,
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    maxWidth: STOP_W - 4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    lineHeight: 1.2,
                  }}>
                    {stop.name}
                  </div>
                </div>
              );
            })}

            {/* ── Véhicules positionnés sur la ligne ── */}
            {vehiclePositions.map(({ v, pos, ns }) => {
              const frac = pos / (fullSequence.length - 1);
              const isSel = v.id === selectedVehicle;
              const isMoving = (v.speed ?? 0) > 0;

              return (
                <div
                  key={`v-${v.id}`}
                  ref={isSel ? selectedRef : null}
                  onClick={() => onVehicleClick(v)}
                  style={{
                    position: "absolute",
                    left: `calc(${frac * 100}%)`,
                    top: "50%",
                    transform: "translate(-50%, -130%)",
                    zIndex: 10,
                    cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  }}
                >
                  {/* Ligne verticale vers la rail */}
                  <div style={{ width: 1.5, height: 10, background: color, opacity: 0.6 }} />

                  {/* Badge véhicule */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 4,
                    background: isSel ? color : `${color}dd`,
                    color: fg,
                    borderRadius: 10,
                    padding: isSel ? "4px 10px" : "3px 8px",
                    fontSize: isSel ? 11 : 10,
                    fontWeight: 700,
                    boxShadow: isSel
                      ? `0 2px 12px ${color}66, 0 0 0 2px ${color}44`
                      : `0 1px 4px ${color}44`,
                    border: isSel ? `1.5px solid white` : "none",
                    transition: "all 0.2s",
                    whiteSpace: "nowrap",
                  }}>
                    {selectedLine.type === "tram" ? "🚃" : "🚌"}
                    {isSel && ` ${selectedLine.short_name}`}
                    {isSel && isMoving && <span style={{ opacity: 0.85, fontWeight: 400 }}> · {Math.round(v.speed)} km/h</span>}
                  </div>

                  {/* Prochain arrêt (visible seulement si sélectionné) */}
                  {isSel && ns?.stopName && (
                    <div style={{ fontSize: 9, color: t.textHint, whiteSpace: "nowrap", marginTop: 1 }}>
                      ▶ {ns.stopName}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
