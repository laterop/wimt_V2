import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet";
import VehicleMarker from "./VehicleMarker";

function CenterMap({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 16, { duration: 0.8 });
  }, [position, map]);
  return null;
}

export default function MapView({
  isDark,
  sidebarBg,
  borderColor,
  textPrimary,
  textSecondary,
  sortedVehicles,
  selectedVehicle,
  selectedVehicleObj,
  selectedRouteData,
  filters,
  mapRef,
  onVehicleClick,
  onDeselect,
}) {
  const typeIcon = { tram: "🚊", bustram: "🚌", bus: "🚌" };

  return (
    <div style={{ flex: 1, position: "relative" }}>
      <MapContainer
        center={[43.6117, 3.8767]}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        ref={mapRef}
        zoomControl={false}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
          url={
            isDark
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          }
        />

        {/* Tracé de la ligne sélectionnée */}
        {filters.showTrace && selectedRouteData?.trace?.length > 1 && (
          <Polyline
            positions={selectedRouteData.trace}
            color={`#${selectedRouteData.color}`}
            weight={5}
            opacity={0.8}
          />
        )}

        {/* Arrêts de la ligne sélectionnée */}
        {filters.showStops && selectedRouteData?.stops?.map((s, i) => (
          <CircleMarker
            key={i}
            center={[s.lat, s.lon]}
            radius={4}
            fillColor={`#${selectedRouteData.color}`}
            color="#fff"
            weight={1.5}
            fillOpacity={0.95}
          >
            <Popup>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 12 }}>
                <div style={{ fontWeight: 600 }}>{s.name}</div>
                <div style={{ color: "#888", fontSize: 10 }}>Ligne {selectedRouteData.short_name}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Véhicules */}
        {sortedVehicles
          .filter(v => v.lat != null && v.lon != null)
          .map(v => (
            <VehicleMarker
              key={v.id}
              v={v}
              isSelected={selectedVehicle === v.id}
              onClick={() => onVehicleClick(v)}
            />
          ))}

        {selectedVehicleObj && (
          <CenterMap position={[selectedVehicleObj.lat, selectedVehicleObj.lon]} />
        )}
      </MapContainer>

      {/* Boutons zoom */}
      <div style={{ position: "absolute", right: 14, bottom: 70, zIndex: 1000, display: "flex", flexDirection: "column", gap: 2 }}>
        {["+", "−"].map((s, i) => (
          <button
            key={s}
            onClick={() => i === 0 ? mapRef.current?.zoomIn() : mapRef.current?.zoomOut()}
            style={{
              width: 30, height: 30,
              border: `1px solid ${borderColor}`,
              background: sidebarBg,
              color: textPrimary,
              borderRadius: i === 0 ? "7px 7px 2px 2px" : "2px 2px 7px 7px",
              fontSize: 17, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >{s}</button>
        ))}
      </div>

      {/* Chip véhicule sélectionné */}
      {selectedVehicleObj && (
        <div style={{
          position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
          zIndex: 1000, background: sidebarBg, borderRadius: 10,
          border: `1px solid ${borderColor}`, padding: "7px 12px",
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)", whiteSpace: "nowrap",
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: 5,
            background: `#${selectedVehicleObj.route_color}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700,
            color: `#${selectedVehicleObj.route_text_color || "fff"}`,
          }}>
            {selectedVehicleObj.route_short_name}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: textPrimary }}>
              {selectedVehicleObj.headsign}
            </div>
            <div style={{ fontSize: 10, color: textSecondary }}>
              {typeIcon[selectedVehicleObj.vehicleType]} {selectedVehicleObj.route_long_name}
              {" · "}
              {selectedVehicleObj.speed > 0 ? `${Math.round(selectedVehicleObj.speed)} km/h` : "À l'arrêt"}
            </div>
          </div>
          <button
            onClick={onDeselect}
            style={{ background: "none", border: "none", cursor: "pointer", color: textSecondary, fontSize: 14, padding: 2 }}
          >✕</button>
        </div>
      )}
    </div>
  );
}
