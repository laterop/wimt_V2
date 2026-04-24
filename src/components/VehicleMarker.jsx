import L from "leaflet";
import { Marker, Popup } from "react-leaflet";

export default function VehicleMarker({ v, isSelected, onClick }) {
  const color = `#${v.route_color}`;
  const size = isSelected ? 18 : 12;

  const icon = L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid rgba(255,255,255,0.95);box-shadow:0 0 0 ${isSelected ? "4px" : "2px"} ${color}66,0 2px 8px rgba(0,0,0,0.3);transition:all 0.2s;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

  const typeLabel =
    v.vehicleType === "tram" ? "🚊 Tram" :
    v.vehicleType === "bustram" ? "🚌 BRT" :
    "🚌 Bus";

  return (
    <Marker position={[v.lat, v.lon]} icon={icon} eventHandlers={{ click: onClick }}>
      <Popup>
        <div style={{ fontFamily: "system-ui,sans-serif", minWidth: 170 }}>
          <div style={{
            background: color,
            color: `#${v.route_text_color || "fff"}`,
            padding: "6px 10px",
            borderRadius: "6px 6px 0 0",
            margin: "-13px -19px 10px",
            fontWeight: 700,
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span>Ligne {v.route_short_name}</span>
            <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 400 }}>{typeLabel}</span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, padding: "0 2px" }}>
            <div style={{ fontWeight: 600 }}>{v.headsign}</div>
            <div style={{ color: "#888", fontSize: 11, marginBottom: 4 }}>{v.route_long_name}</div>
            <div style={{ color: "#666", fontSize: 11 }}>ID {v.id}</div>
            {v.speed != null && (
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  display: "inline-block",
                  width: 6, height: 6,
                  borderRadius: "50%",
                  background: v.speed > 0 ? "#22c55e" : "#f59e0b",
                }}></span>
                {v.speed > 0 ? `${Math.round(v.speed)} km/h` : "À l'arrêt"}
              </div>
            )}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
