import { useRef, useEffect } from "react";

// Panneau latéral : liste des arrêts de la ligne avec le tram positionné dedans
export default function RoutePanel({ theme: t, vehicle, nextStopInfo, onClose }) {
  const listRef  = useRef(null);
  const tramRef  = useRef(null);

  if (!vehicle) return null;

  const color  = `#${vehicle.route_color  || "0074c9"}`;
  const fg     = `#${vehicle.route_text_color || "ffffff"}`;
  const seq    = nextStopInfo?.fullSequence || [];
  const tramIdx = nextStopInfo?.seqIndex ?? -1;   // index du PROCHAIN stop dans fullSequence
  const isAtStop = nextStopInfo?.isAtStop ?? false;

  // Scroll automatique sur le tram quand la liste s'ouvre ou quand le tram avance
  useEffect(() => {
    if (tramRef.current && listRef.current) {
      tramRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [tramIdx, vehicle.id]);

  // Fraction de progression entre le stop précédent et le prochain (0→1)
  // basée sur la distance restante vs distance totale entre les deux stops
  let progress = 0.5;
  if (!isAtStop && tramIdx > 0 && tramIdx < seq.length) {
    const prev = seq[tramIdx - 1];
    const next = seq[tramIdx];
    const distTotal = dist(prev.lat, prev.lon, next.lat, next.lon);
    const distLeft  = nextStopInfo?.distM ? nextStopInfo.distM / 1000 : distTotal / 2;
    progress = distTotal > 0 ? Math.min(1, Math.max(0, 1 - distLeft / distTotal)) : 0.5;
  }

  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 1100,
      background: t.panelBg, borderRadius: "18px 18px 0 0",
      boxShadow: "0 -8px 40px rgba(0,0,0,0.22)",
      border: `0.5px solid ${t.border}`,
      display: "flex", flexDirection: "column",
      maxHeight: "55vh",
      animation: "slideUp 0.25s ease",
    }}>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity:0 } to { transform: translateY(0); opacity:1 } }`}</style>

      {/* Handle + header */}
      <div style={{ padding: "10px 16px 8px", flexShrink: 0 }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: t.border, margin: "0 auto 10px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ minWidth: 32, height: 26, borderRadius: 8, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: fg, padding: "0 6px" }}>
            {vehicle.route_short_name}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Direction {vehicle.headsign}
            </div>
            <div style={{ fontSize: 10, color: t.textSub, marginTop: 1 }}>
              {isAtStop
                ? `À l'arrêt · ${nextStopInfo.currentStop}`
                : vehicle.speed > 0
                  ? `${Math.round(vehicle.speed)} km/h`
                  : "À l'arrêt"
              }
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: t.textHint, fontSize: 20, padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
      </div>

      <div style={{ width: "100%", height: "0.5px", background: t.border, flexShrink: 0 }} />

      {/* Liste des arrêts */}
      <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "8px 0 24px" }}>
        {seq.length === 0 ? (
          <div style={{ padding: "24px 20px", textAlign: "center", color: t.textHint, fontSize: 12 }}>
            Séquence d'arrêts non disponible
          </div>
        ) : seq.map((stop, i) => {
          const isPassed  = i < tramIdx - 1;
          const isCurrent = i === tramIdx - 1 && !isAtStop; // stop qu'il vient de quitter
          const isNext    = i === tramIdx;                  // prochain stop
          const isFuture  = i > tramIdx;

          // Le tram flottant s'insère AVANT l'arrêt tramIdx
          const showTram = i === tramIdx;

          return (
            <div key={stop.id}>
              {/* Tram flottant entre le stop précédent et ce stop */}
              {showTram && (
                <div ref={tramRef} style={{ display: "flex", alignItems: "center", gap: 0, padding: "0 20px", margin: "2px 0" }}>
                  {/* Ligne verticale + curseur tram */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 32, flexShrink: 0 }}>
                    {/* Segment de ligne avec tram positionné selon progress */}
                    <div style={{ width: 3, height: 24, background: `${color}44`, borderRadius: 2 }} />
                  </div>
                  {/* Badge tram */}
                  <div style={{ marginLeft: 12, display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 13 }}>🚃</div>
                    <div style={{
                      background: color, color: fg,
                      fontSize: 10, fontWeight: 700,
                      borderRadius: 8, padding: "3px 9px",
                      boxShadow: `0 2px 8px ${color}55`,
                    }}>
                      {vehicle.route_short_name}
                      {vehicle.speed > 0 ? ` · ${Math.round(vehicle.speed)} km/h` : " · arrêté"}
                    </div>
                    {!isAtStop && nextStopInfo?.distM != null && (
                      <div style={{ fontSize: 10, color: t.textHint }}>
                        {nextStopInfo.distM >= 1000
                          ? `${(nextStopInfo.distM / 1000).toFixed(1)} km`
                          : `${Math.round(nextStopInfo.distM)} m`}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Ligne d'arrêt */}
              <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "0 20px" }}>
                {/* Colonne de la ligne verticale + point */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 32, flexShrink: 0 }}>
                  {/* Trait du haut */}
                  {i > 0 && (
                    <div style={{ width: 3, flex: 1, minHeight: 8, background: isPassed || isCurrent ? color : `${color}30`, borderRadius: 2 }} />
                  )}
                  {/* Point d'arrêt */}
                  <div style={{
                    width:  isNext ? 14 : 10,
                    height: isNext ? 14 : 10,
                    borderRadius: "50%",
                    background:  isNext ? color : (isPassed || isCurrent ? color : t.bg),
                    border: `2.5px solid ${isPassed || isCurrent || isNext ? color : `${color}55`}`,
                    boxShadow: isNext ? `0 0 0 3px ${color}33` : "none",
                    flexShrink: 0,
                    zIndex: 1,
                  }} />
                  {/* Trait du bas */}
                  {i < seq.length - 1 && (
                    <div style={{ width: 3, flex: 1, minHeight: 8, background: isPassed || isCurrent ? color : `${color}30`, borderRadius: 2 }} />
                  )}
                </div>

                {/* Nom de l'arrêt */}
                <div style={{ marginLeft: 12, padding: "10px 0", flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize:   isNext ? 13 : 12,
                    fontWeight: isNext ? 700 : (isCurrent ? 500 : 400),
                    color:      isNext ? color : (isPassed ? t.textHint : t.text),
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {stop.name}
                  </div>
                  {isNext && (
                    <div style={{ fontSize: 10, color, marginTop: 2, fontWeight: 600 }}>
                      Prochain arrêt
                    </div>
                  )}
                  {isCurrent && isAtStop && (
                    <div style={{ fontSize: 10, color: t.textHint, marginTop: 2 }}>
                      En cours de chargement
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function dist(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
