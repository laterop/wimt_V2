import L from "leaflet";
import { Marker, Popup } from "react-leaflet";

// Convertit une couleur hex en rgb pour rgba()
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

// Génère un point sur un cercle à partir d'un angle (en degrés, 0=haut, sens horaire)
function polar(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

// Chemin SVG d'un arc de cercle (secteur angulaire)
// cx, cy : centre ; r : rayon ; startDeg, endDeg : angles absolus
function arcPath(cx, cy, r, startDeg, endDeg) {
  const [x1, y1] = polar(cx, cy, r, startDeg);
  const [x2, y2] = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

function buildIcon({ bg, fg, label, dotSize, isSelected, bearing }) {
  const hasBearing = bearing !== null && bearing !== undefined && !isNaN(bearing);
  const rgb = hexToRgb(bg);

  // Dimensions du SVG global
  // Le cône s'étend vers l'avant : on fait un SVG assez grand pour contenir le tout
  const coneR    = dotSize * 2.2;         // rayon du cône
  const coneSpan = 70;                    // demi-angle du cône (140° total)
  const pad      = coneR + 2;             // padding autour du dot
  const svgSize  = dotSize + pad * 2;     // taille totale du SVG
  const cx       = svgSize / 2;
  const cy       = svgSize / 2;
  const r        = dotSize / 2;           // rayon du cercle du marqueur
  const fontSize = dotSize <= 22 ? 8 : 10;
  const ringW    = isSelected ? 2.5 : 1.8;

  // Cône de vision : arc orienté selon bearing, avec dégradé radial
  const coneHtml = hasBearing ? (() => {
    const startDeg = bearing - coneSpan;
    const endDeg   = bearing + coneSpan;
    const path     = arcPath(cx, cy, coneR, startDeg, endDeg);
    // Identifiant unique pour le gradient (plusieurs markers sur la page)
    const gid = `cg_${Math.round(bearing)}_${label}`.replace(/[^a-zA-Z0-9_]/g, "");
    return `
      <defs>
        <radialGradient id="${gid}" cx="50%" cy="50%" r="50%">
          <stop offset="30%" stop-color="rgb(${rgb})" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="rgb(${rgb})" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <path d="${path}" fill="url(#${gid})" stroke="none"/>`;
  })() : "";

  // Cercle du marqueur
  const ring = isSelected
    ? `<circle cx="${cx}" cy="${cy}" r="${r + 3.5}" fill="white" opacity="0.25"/>`
    : "";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${svgSize}" height="${svgSize}"
         viewBox="0 0 ${svgSize} ${svgSize}"
         style="overflow:visible;display:block;">
      ${coneHtml}
      ${ring}
      <circle cx="${cx}" cy="${cy}" r="${r}"
        fill="${bg}"
        stroke="white"
        stroke-width="${ringW}"/>
      <text x="${cx}" y="${cy}"
        text-anchor="middle" dominant-baseline="central"
        font-family="Inter,system-ui,sans-serif"
        font-size="${fontSize}" font-weight="700"
        fill="${fg}">${label}</text>
    </svg>`;

  return L.divIcon({
    className: "",
    html: svg,
    iconSize:   [svgSize, svgSize],
    iconAnchor: [cx, cy],   // ancré sur le centre du cercle
  });
}

export default function VehicleMarker({ v, isSelected, onClick, isDark }) {
  const bg    = `#${v.route_color || "0074c9"}`;
  const fg    = `#${v.route_text_color || "ffffff"}`;
  const label = v.route_short_name.length > 3
    ? v.route_short_name.slice(0, 3)
    : v.route_short_name;
  const dotSize = isSelected ? 30 : 22;

  const icon = buildIcon({
    bg, fg, label, dotSize, isSelected,
    bearing: v.bearing,
  });

  const panelBg = isDark ? "#16181f" : "#ffffff";
  const text    = isDark ? "#f0f2f7" : "#0f172a";
  const sub     = isDark ? "#7a7f94" : "#64748b";
  const dirLabel = (v.direction_id === 0 || v.direction_id === "0") ? "Aller" : "Retour";

  return (
    <Marker position={[v.lat, v.lon]} icon={icon} eventHandlers={{ click: onClick }}>
      <Popup>
        <div style={{ fontFamily: "'Inter',system-ui,sans-serif", minWidth: 190, background: panelBg, borderRadius: 12, overflow: "hidden" }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: sub }}>Direction</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: text, flex: 1 }}>{v.headsign}</span>
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: fg, background: bg, borderRadius: 6, padding: "2px 7px", fontWeight: 600 }}>
                {dirLabel}
              </span>
            </div>

            {v.route_long_name && (
              <div style={{ fontSize: 10, color: sub, marginBottom: 8, lineHeight: 1.4 }}>{v.route_long_name}</div>
            )}

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
