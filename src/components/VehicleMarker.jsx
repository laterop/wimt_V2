import L from "leaflet";
import { Marker, Popup } from "react-leaflet";

// Génère un point sur un cercle à partir d'un angle (en degrés, 0=haut, sens horaire)
function polar(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function buildIcon({ bg, fg, label, dotSize, isSelected, bearing, showCone, showLabel }) {
  const hasBearing = showCone && bearing !== null && bearing !== undefined && !isNaN(bearing);

  // Dimensions du SVG global
  const r        = dotSize / 2;           // rayon du cercle du marqueur
  const arrowLen = dotSize * 0.62;        // longueur de la flèche, au-delà du cercle
  const pad      = hasBearing ? arrowLen + 3 : 3; // padding autour du dot
  const svgSize  = dotSize + pad * 2;     // taille totale du SVG
  const cx       = svgSize / 2;
  const cy       = svgSize / 2;
  const fontSize = dotSize <= 22 ? 8 : 10;
  const ringW    = isSelected ? 2.5 : 1.8;

  // Flèche de direction : petit triangle plein, collé au bord du cercle et
  // pointant dans le sens du véhicule (bearing). Remplace l'ancien cône en
  // dégradé radial, dont la taille fixe en pixels créait des halos flous
  // superposés dès que plusieurs véhicules étaient proches à l'écran.
  const coneHtml = hasBearing ? (() => {
    const baseHalf = 11; // demi-largeur angulaire de la base, en degrés
    const tipR   = r + arrowLen;
    const baseR  = r + 1;
    const [tx, ty]   = polar(cx, cy, tipR, bearing);
    const [lx, ly]   = polar(cx, cy, baseR, bearing - baseHalf);
    const [rx, ry]   = polar(cx, cy, baseR, bearing + baseHalf);
    return `<path d="M ${tx} ${ty} L ${lx} ${ly} L ${rx} ${ry} Z" fill="${bg}" stroke="white" stroke-width="1.2" stroke-linejoin="round"/>`;
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
      ${showLabel ? `<text x="${cx}" y="${cy}"
        text-anchor="middle" dominant-baseline="central"
        font-family="Inter,system-ui,sans-serif"
        font-size="${fontSize}" font-weight="700"
        fill="${fg}">${label}</text>` : ""}
    </svg>`;

  return L.divIcon({
    className: "",
    html: svg,
    iconSize:   [svgSize, svgSize],
    iconAnchor: [cx, cy],   // ancré sur le centre du cercle
  });
}

export default function VehicleMarker({ v, isSelected, onClick, isDark, zoom = 14 }) {
  const bg    = `#${v.route_color || "0074c9"}`;
  const fg    = `#${v.route_text_color || "ffffff"}`;
  const label = v.route_short_name.length > 3
    ? v.route_short_name.slice(0, 3)
    : v.route_short_name;

  // Allègement des marqueurs au zoom large : le cône de direction a une
  // taille fixe en pixels, donc à l'échelle métropole il finit par recouvrir
  // toute la carte de halos superposés. Le sélectionné garde toujours son
  // détail complet, pour rester repérable même après un dézoom.
  const showCone  = isSelected || zoom >= 14;
  const showLabel = isSelected || zoom >= 12;
  const dotSize   = isSelected ? 30 : zoom >= 14 ? 22 : zoom >= 12 ? 16 : 9;

  const icon = buildIcon({
    bg, fg, label, dotSize, isSelected, showCone, showLabel,
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
                  {v.vehicleType === "tram" ? "Tramway" : v.vehicleType === "bustram" ? "BusTram" : "Bus"}
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
