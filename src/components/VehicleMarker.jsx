import L from "leaflet";
import { Marker, Popup } from "react-leaflet";

export default function VehicleMarker({ v, isSelected, onClick, isDark }) {
  const bg = `#${v.route_color}`;
  const fg = `#${v.route_text_color || "ffffff"}`;
  const size = isSelected ? 32 : 24;
  const label = v.route_short_name.length > 2 ? v.route_short_name.slice(0, 2) : v.route_short_name;

  const icon = L.divIcon({
    className: "",
    html: `
      <div style="
        width:${size}px;height:${size}px;border-radius:${size * 0.3}px;
        background:${bg};color:${fg};
        border:2.5px solid rgba(255,255,255,${isSelected ? 1 : 0.9});
        box-shadow:0 0 0 ${isSelected ? 3 : 0}px ${bg}55, 0 2px 8px rgba(0,0,0,0.35);
        display:flex;align-items:center;justify-content:center;
        font-family:'Inter',system-ui,sans-serif;
        font-size:${size <= 24 ? 9 : 11}px;font-weight:700;
        transition:all 0.15s;
        cursor:pointer;
      ">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

  const panelBg = isDark ? "#16181f" : "#ffffff";
  const border  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const text    = isDark ? "#f0f2f7" : "#0f172a";
  const sub     = isDark ? "#7a7f94" : "#64748b";

  return (
    <Marker position={[v.lat, v.lon]} icon={icon} eventHandlers={{ click: onClick }}>
      <Popup>
        <div style={{ fontFamily: "'Inter',system-ui,sans-serif", minWidth: 180, background: panelBg, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ background: bg, color: fg, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Ligne {v.route_short_name}</div>
              <div style={{ fontSize: 10, opacity: 0.8, marginTop: 1 }}>
                {v.vehicleType === "tram" ? "Tramway" : v.vehicleType === "bustram" ? "BRT" : "Bus"}
              </div>
            </div>
            <div style={{ fontSize: 20 }}>{v.vehicleType === "tram" ? "🚊" : "🚌"}</div>
          </div>
          <div style={{ padding: "10px 14px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 2 }}>{v.headsign}</div>
            {v.route_long_name && (
              <div style={{ fontSize: 10, color: sub, marginBottom: 8 }}>{v.route_long_name}</div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: sub }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: v.speed > 0 ? "#22c55e" : "#f59e0b" }}></span>
              {v.speed > 0 ? `${Math.round(v.speed)} km/h` : "À l'arrêt"}
              <span style={{ marginLeft: "auto", color: isDark ? "#4a4f62" : "#94a3b8" }}>ID {v.id}</span>
            </div>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
