import L from "leaflet";
import { Marker, Popup } from "react-leaflet";

// Génère le SVG HTML du marqueur avec flèche de direction
function markerHtml({ bg, fg, label, size, isSelected, bearing, showDestLabel, headsign }) {
  const hasBearing = bearing !== null && bearing !== undefined && !isNaN(bearing);
  const arrowSize = Math.round(size * 0.55);

  // Flèche SVG orientée selon le bearing (0° = nord, tourne dans le sens horaire)
  const arrowSvg = hasBearing ? `
    <div style="
      position:absolute;
      top:${-(arrowSize * 0.55)}px;
      left:50%;
      transform:translateX(-50%) rotate(${bearing}deg);
      transform-origin:bottom center;
      width:${arrowSize}px;
      height:${arrowSize}px;
      pointer-events:none;
    ">
      <svg viewBox="0 0 12 12" width="${arrowSize}" height="${arrowSize}">
        <polygon points="6,0 10,10 6,7.5 2,10"
          fill="${bg}"
          stroke="white"
          stroke-width="1.2"
          stroke-linejoin="round"/>
      </svg>
    </div>` : "";

  // Label destination sous le marqueur (uniquement si sélectionné)
  const destLabel = showDestLabel && headsign ? `
    <div style="
      position:absolute;
      top:${size + 4}px;
      left:50%;
      transform:translateX(-50%);
      white-space:nowrap;
      background:${bg};
      color:${fg};
      font-size:9px;
      font-weight:700;
      font-family:'Inter',system-ui,sans-serif;
      padding:2px 6px;
      border-radius:6px;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
      pointer-events:none;
      max-width:100px;
      overflow:hidden;
      text-overflow:ellipsis;
    ">▶ ${headsign}</div>` : "";

  return `
    <div style="position:relative;width:${size}px;height:${size}px;">
      ${arrowSvg}
      <div style="
        width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.28)}px;
        background:${bg};color:${fg};
        border:${isSelected ? "2.5px" : "2px"} solid rgba(255,255,255,${isSelected ? 1 : 0.88});
        box-shadow:0 0 0 ${isSelected ? 3 : 0}px ${bg}55, 0 2px 8px rgba(0,0,0,0.38);
        display:flex;align-items:center;justify-content:center;
        font-family:'Inter',system-ui,sans-serif;
        font-size:${size <= 24 ? 9 : 11}px;font-weight:700;
        cursor:pointer;
        position:relative;z-index:1;
      ">${label}</div>
      ${destLabel}
    </div>`;
}

export default function VehicleMarker({ v, isSelected, onClick, isDark }) {
  const bg    = `#${v.route_color}`;
  const fg    = `#${v.route_text_color || "ffffff"}`;
  const size  = isSelected ? 32 : 24;
  const label = v.route_short_name.length > 2
    ? v.route_short_name.slice(0, 2)
    : v.route_short_name;

  const arrowOffset = v.bearing !== null ? Math.round(size * 0.55 * 0.55) + 2 : 0;
  const totalH = size + arrowOffset + (isSelected ? 22 : 0); // extra pour label dest
  const totalW = isSelected ? 110 : size + 10; // extra pour label dest

  const html = markerHtml({
    bg, fg, label, size, isSelected,
    bearing: v.bearing,
    showDestLabel: isSelected,
    headsign: v.headsign,
  });

  const icon = L.divIcon({
    className: "",
    html,
    iconSize:   [totalW, totalH],
    iconAnchor: [totalW / 2, size / 2 + arrowOffset],
  });

  const panelBg = isDark ? "#16181f" : "#ffffff";
  const border  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const text    = isDark ? "#f0f2f7" : "#0f172a";
  const sub     = isDark ? "#7a7f94" : "#64748b";

  // Direction lisible depuis direction_id
  const dirLabel = v.direction_id === 0 || v.direction_id === "0" ? "Aller" : "Retour";

  return (
    <Marker position={[v.lat, v.lon]} icon={icon} eventHandlers={{ click: onClick }}>
      <Popup>
        <div style={{ fontFamily: "'Inter',system-ui,sans-serif", minWidth: 190, background: panelBg, borderRadius: 12, overflow: "hidden" }}>
          {/* En-tête coloré */}
          <div style={{ background: bg, color: fg, padding: "10px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Ligne {v.route_short_name}</div>
                <div style={{ fontSize: 10, opacity: 0.82, marginTop: 1 }}>
                  {v.vehicleType === "tram" ? "Tramway" : v.vehicleType === "bustram" ? "BRT" : "Bus"}
                </div>
              </div>
              <div style={{ fontSize: 20 }}>{v.vehicleType === "tram" ? "🚊" : "🚌"}</div>
            </div>
          </div>

          <div style={{ padding: "10px 14px" }}>
            {/* Destination */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: sub }}>Direction</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: text, flex: 1 }}>{v.headsign}</span>
            </div>

            {/* Sens aller/retour */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: fg, background: bg, borderRadius: 6, padding: "2px 7px", fontWeight: 600 }}>
                {dirLabel}
              </span>
              {v.bearing !== null && (
                <span style={{ fontSize: 10, color: sub, display: "flex", alignItems: "center", gap: 3 }}>
                  <svg viewBox="0 0 12 12" width="9" height="9">
                    <polygon points="6,0 10,10 6,7.5 2,10" fill={sub}/>
                  </svg>
                  {Math.round(v.bearing)}°
                </span>
              )}
            </div>

            {/* Ligne longue */}
            {v.route_long_name && (
              <div style={{ fontSize: 10, color: sub, marginBottom: 8, lineHeight: 1.4 }}>{v.route_long_name}</div>
            )}

            {/* Statut vitesse */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: sub }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: (v.speed ?? 0) > 0 ? "#22c55e" : "#f59e0b", flexShrink: 0 }}></span>
              {(v.speed ?? 0) > 0 ? `${Math.round(v.speed)} km/h` : "À l'arrêt"}
              <span style={{ marginLeft: "auto", color: isDark ? "#4a4f62" : "#94a3b8" }}>ID {v.id}</span>
            </div>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
