import { useEffect } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet";
import VehicleMarker from "./VehicleMarker";
import RoutePanel from "./RoutePanel";

function FlyTo({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 16, { duration: 0.8 });
  }, [position, map]);
  return null;
}

export default function MapView({ theme, sortedVehicles, selectedVehicle, selectedVehicleObj, selectedLine, lineVehicles, selectedRouteData, nextStops, filters, mapRef, onVehicleClick, onDeselect, filtreLigne, setFiltreLigne, filterChips, toggleFilter, lastUpdate, error }) {
  const { isDark, panelBg, border, borderStrong, text, textSub, textHint, mapTile, cardBg } = theme;

  const glassPanel = {
    background: isDark ? "rgba(15,17,23,0.82)" : "rgba(255,255,255,0.88)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: `0.5px solid ${border}`,
    borderRadius: 14,
  };

  return (
    <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
      <MapContainer
        center={[43.6117, 3.8767]}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        ref={mapRef}
        zoomControl={false}
      >
        <TileLayer attribution="&copy; OpenStreetMap contributors &copy; CARTO" url={mapTile} />

        {filters.showTrace && selectedRouteData?.trace?.length > 1 && (
          <Polyline
            key={`${selectedRouteData.short_name}-${selectedRouteData.color}`}
            positions={selectedRouteData.trace}
            color={`#${selectedRouteData.color}`}
            weight={5} opacity={0.85}
          />
        )}

        {filters.showStops && selectedRouteData?.stops?.map((s, i) => (
          <CircleMarker key={i} center={[s.lat, s.lon]} radius={5} fillColor={`#${selectedRouteData.color}`} color="#fff" weight={2} fillOpacity={1}>
            <Popup>
              <div style={{ fontFamily: "'Inter',system-ui,sans-serif", fontSize: 12, padding: "2px 0" }}>
                <div style={{ fontWeight: 600, color: text }}>{s.name}</div>
                <div style={{ color: textSub, fontSize: 10, marginTop: 2 }}>Ligne {selectedRouteData.short_name}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {sortedVehicles.filter(v => v.lat != null && v.lon != null).map(v => (
          <VehicleMarker key={v.id} v={v} isSelected={selectedVehicle === v.id} onClick={() => onVehicleClick(v)} isDark={isDark} />
        ))}

        {selectedVehicleObj && <FlyTo position={[selectedVehicleObj.lat, selectedVehicleObj.lon]} />}
      </MapContainer>

      {/* Barre de recherche flottante */}
      <div style={{ position: "absolute", top: 14, left: 14, right: 14, zIndex: 1000, display: "flex", gap: 8 }}>
        <div style={{ ...glassPanel, flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={textHint} strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Ligne ou arrêt..."
            value={filtreLigne}
            onChange={e => setFiltreLigne(e.target.value)}
            style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, color: text, fontFamily: "'Inter',system-ui,sans-serif" }}
          />
          {filtreLigne && (
            <button onClick={() => setFiltreLigne("")} style={{ background: "none", border: "none", cursor: "pointer", color: textHint, fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          )}
        </div>
        <button
          onClick={() => { mapRef.current?.setView([43.6117, 3.8767], 13); onDeselect(); }}
          style={{ ...glassPanel, width: 38, height: 38, border: `0.5px solid ${border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          title="Recentrer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={textSub} strokeWidth="2">
            <circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
          </svg>
        </button>
      </div>

      {/* Chips filtres */}
      <div style={{ position: "absolute", top: 66, left: 14, right: 14, zIndex: 1000, display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {filterChips.map(({ key, label, activeColor, activeBg }) => (
          <button
            key={key}
            onClick={() => toggleFilter(key)}
            style={{
              padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500,
              cursor: "pointer", border: `0.5px solid`, whiteSpace: "nowrap",
              fontFamily: "'Inter',system-ui,sans-serif",
              transition: "all 0.15s",
              background: filters[key] ? activeBg : (isDark ? "rgba(15,17,23,0.75)" : "rgba(255,255,255,0.8)"),
              color: filters[key] ? activeColor : textSub,
              borderColor: filters[key] ? activeColor + "55" : border,
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          >{label}</button>
        ))}
        <button
          onClick={() => toggleFilter("showTrace")}
          style={{
            padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500,
            cursor: "pointer", border: `0.5px solid`, whiteSpace: "nowrap",
            fontFamily: "'Inter',system-ui,sans-serif",
            background: filters.showTrace ? (isDark ? "rgba(0,116,201,0.2)" : "rgba(0,116,201,0.12)") : (isDark ? "rgba(15,17,23,0.75)" : "rgba(255,255,255,0.8)"),
            color: filters.showTrace ? "#3b8eea" : textSub,
            borderColor: filters.showTrace ? "#3b8eea55" : border,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >Tracé</button>
        <button
          onClick={() => toggleFilter("showStops")}
          style={{
            padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500,
            cursor: "pointer", border: `0.5px solid`, whiteSpace: "nowrap",
            fontFamily: "'Inter',system-ui,sans-serif",
            background: filters.showStops ? (isDark ? "rgba(0,116,201,0.2)" : "rgba(0,116,201,0.12)") : (isDark ? "rgba(15,17,23,0.75)" : "rgba(255,255,255,0.8)"),
            color: filters.showStops ? "#3b8eea" : textSub,
            borderColor: filters.showStops ? "#3b8eea55" : border,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >Arrêts</button>
      </div>

      {/* Boutons zoom */}
      <div style={{ position: "absolute", right: 14, bottom: 80, zIndex: 1000, display: "flex", flexDirection: "column", gap: 2 }}>
        {["+", "−"].map((s, i) => (
          <button key={s} onClick={() => i === 0 ? mapRef.current?.zoomIn() : mapRef.current?.zoomOut()}
            style={{ width: 34, height: 34, ...glassPanel, border: `0.5px solid ${border}`, color: textSub, borderRadius: i === 0 ? "10px 10px 4px 4px" : "4px 4px 10px 10px", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >{s}</button>
        ))}
      </div>


      {/* Statut live */}
      <div style={{ position: "absolute", left: 14, bottom: selectedLine ? 170 : 14, zIndex: 1000, ...glassPanel, padding: "5px 10px", display: "flex", alignItems: "center", gap: 6, transition: "bottom 0.25s ease" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: error ? "#ef4444" : lastUpdate ? "#22c55e" : "#f59e0b", display: "block", flexShrink: 0 }}></span>
        <span style={{ fontSize: 10, color: textSub }}>
          {error ? "Hors ligne" : lastUpdate ? `${lastUpdate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Connexion..."}
        </span>
      </div>

      {/* Panneau de route horizontal (glisse depuis le bas quand une ligne est sélectionnée) */}
      {selectedLine && (
        <RoutePanel
          theme={theme}
          selectedLine={selectedLine}
          lineVehicles={lineVehicles || []}
          nextStops={nextStops}
          selectedVehicle={selectedVehicle}
          onVehicleClick={onVehicleClick}
          onClose={onDeselect}
        />
      )}
    </div>
  );
}
