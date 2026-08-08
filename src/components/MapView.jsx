import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap, useMapEvents } from "react-leaflet";
import VehicleMarker from "./VehicleMarker";
import LineDrawer from "./LineDrawer";
import StopDetail from "./StopDetail";

const MTP_CENTER = [43.6117, 3.8767];

function FlyTo({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 16, { duration: 0.8 });
  }, [position, map]);
  return null;
}

// Remonte le niveau de zoom courant au parent : au zoom large, on allège les
// marqueurs (cône de direction, taille) pour éviter la bouillie visuelle
// quand beaucoup de véhicules sont proches en pixels malgré une grande
// distance réelle.
function ZoomWatcher({ onZoom }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  useEffect(() => { onZoom(map.getZoom()); }, [map, onZoom]);
  return null;
}

export default function MapView({
  theme, dataBase = "", vehicules = [], delays, sortedVehicles, selectedVehicle, selectedVehicleObj,
  selectedLine, selectedRouteData, nextStops, filters, mapRef, onVehicleClick, onDeselect,
  filtreLigne, setFiltreLigne, filterChips, toggleFilter, lastUpdate, error, allTraces,
  center = MTP_CENTER, zoom = 13,
  // Réglages de personnalisation (cf. useSettings) : flèche de direction sur
  // les marqueurs, allègement automatique au dézoom.
  showDirectionArrow = true, autoDeclutter = true,
  // Panneaux latéraux (vision desktop) : ligne (thermomètre vertical) puis,
  // à sa droite, arrêt. Pilotés par le parent (App.jsx / GenericApp.jsx) pour
  // que tout déclencheur (clic véhicule, thermomètre, arrêt) les ouvre pareil.
  lineDrawer, stopDrawer, onOpenLine, onCloseLine, onOpenStop, onCloseStop,
}) {
  const { isDark, panelBg, border, borderStrong, text, textSub, textHint, mapTile, cardBg } = theme;
  const [currentZoom, setCurrentZoom] = useState(zoom);

  const glassPanel = {
    background: isDark ? "rgba(15,17,23,0.82)" : "rgba(255,255,255,0.88)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: `0.5px solid ${border}`,
    borderRadius: 14,
  };

  // Paramètres visuels des tracés selon l'état de sélection
  const hasSelection = !!selectedLine;

  return (
    <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "100%", width: "100%" }}
        ref={mapRef}
        zoomControl={false}
      >
        <TileLayer attribution="&copy; OpenStreetMap contributors &copy; CARTO" url={mapTile} />
        <ZoomWatcher onZoom={setCurrentZoom} />

        {/* ── Tracés permanents de toutes les lignes ── */}
        {allTraces && [...allTraces.entries()].map(([num, { color, type, segments }]) => {
          // Respecter les filtres de type
          if (type === "tram"    && !filters.showTrams)    return null;
          if (type === "bustram" && !filters.showBustrams) return null;
          if (type === "bus"     && !filters.showBus)      return null;

          const isSelected = hasSelection && selectedLine?.short_name === num;
          const isDimmed   = hasSelection && !isSelected;

          // Épaisseur : tram plus épais que bus, encore plus si sélectionné
          const weight = isSelected
            ? (type === "tram" || type === "bustram" ? 7 : 5)
            : (type === "tram" || type === "bustram" ? 3.5 : 2);

          // Opacité : mise en valeur de la ligne sélectionnée, atténuation des autres
          const opacity = isSelected ? 0.95 : isDimmed ? 0.12 : (type === "bus" ? 0.45 : 0.6);

          return segments.map((seg, si) =>
            seg.length > 1 ? (
              <Polyline
                key={`${num}-${si}`}
                positions={seg}
                color={color}
                weight={weight}
                opacity={opacity}
                lineCap="round"
                lineJoin="round"
                eventHandlers={{
                  click: () => onOpenLine?.({ short_name: num, color: color.replace("#", ""), type }),
                }}
              />
            ) : null
          );
        })}

        {/* Arrêts de la ligne sélectionnée (si filtre activé) */}
        {filters.showStops && selectedRouteData?.stops?.map((s, i) => (
          <CircleMarker key={i} center={[s.lat, s.lon]} radius={5} fillColor={`#${selectedRouteData.color}`} color="#fff" weight={2} fillOpacity={1}>
            <Popup>
              <div style={{ fontFamily: "'Inter',system-ui,sans-serif", fontSize: 12, padding: "2px 0" }}>
                <div style={{ fontWeight: 600, color: text }}>{s.name}</div>
                <div style={{ color: textSub, fontSize: 10, marginTop: 2 }}>
                  Ligne {selectedRouteData.short_name}{s.count > 1 ? " · aller + retour" : ""}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Marqueurs véhicules */}
        {sortedVehicles.filter(v => v.lat != null && v.lon != null).map(v => (
          <VehicleMarker key={v.id} v={v} isSelected={selectedVehicle === v.id} onClick={() => onVehicleClick(v)} isDark={isDark} zoom={currentZoom} delaySec={delays?.get(v.trip_id)} showArrow={showDirectionArrow} autoDeclutter={autoDeclutter} />
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
          onClick={() => { mapRef.current?.setView(center, zoom); onDeselect(); }}
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
      <div style={{ position: "absolute", left: 14, bottom: 14, zIndex: 1000, ...glassPanel, padding: "5px 10px", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: error ? "#ef4444" : lastUpdate ? "#22c55e" : "#f59e0b", display: "block", flexShrink: 0 }}></span>
        <span style={{ fontSize: 10, color: textSub }}>
          {error ? "Hors ligne" : lastUpdate ? `${lastUpdate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Connexion..."}
        </span>
      </div>

      {/* Panneaux ligne (thermomètre vertical) + arrêt, ouverts par clic sur
          une ligne ou un véhicule. Toujours côte à côte (vision desktop), on
          scrolle horizontalement si l'écran est trop étroit pour les deux. */}
      {lineDrawer && (
        <div style={{
          position: "absolute", top: 108, bottom: 14, left: 14, right: 14,
          zIndex: 1050, display: "flex", gap: 10, overflowX: "auto", overflowY: "hidden",
          pointerEvents: "none",
        }}>
          <div style={{ ...glassPanel, width: 300, flexShrink: 0, pointerEvents: "auto", overflow: "hidden", boxShadow: "0 16px 40px rgba(0,0,0,0.3)" }}>
            <LineDrawer
              t={theme}
              dataBase={dataBase}
              line={lineDrawer}
              vehicules={vehicules}
              nextStops={nextStops}
              delays={delays}
              onOpenStop={onOpenStop}
              onClose={onCloseLine}
            />
          </div>

          {stopDrawer && (
            <div style={{ ...glassPanel, width: 300, flexShrink: 0, pointerEvents: "auto", overflow: "hidden", boxShadow: "0 16px 40px rgba(0,0,0,0.3)" }}>
              <StopDetail
                t={theme}
                dataBase={dataBase}
                group={{ name: stopDrawer.name, entries: [{ id: stopDrawer.id, lat: stopDrawer.lat, lon: stopDrawer.lon, types: [stopDrawer.type] }] }}
                entry={{ id: stopDrawer.id, lat: stopDrawer.lat, lon: stopDrawer.lon, types: [stopDrawer.type] }}
                vehicules={vehicules}
                nextStops={nextStops}
                onTrackVehicle={(v) => { onVehicleClick(v); }}
                onSwitchEntry={() => {}}
                onClose={onCloseStop}
                showMiniMap={false}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
