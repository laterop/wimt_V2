import { useState, useRef, useCallback, useEffect } from "react";
import "leaflet/dist/leaflet.css";

import { useVehicles } from "./hooks/useVehicles";
import Sidebar from "./components/Sidebar";
import MapView from "./components/MapView";

export default function CarteTAM() {
  const { vehicules, lastUpdate, error, gtfsRef } = useVehicles();

  const [filtreLigne, setFiltreLigne]       = useState("");
  const [theme, setTheme]                   = useState(() => localStorage.getItem("theme") || "dark");
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [selectedRouteData, setSelectedRouteData] = useState(null);
  const [sortBy, setSortBy]                 = useState("ligne");
  const [expandedLines, setExpandedLines]   = useState({});
  const [showPanel, setShowPanel]           = useState(false);
  const [filters, setFilters]               = useState({
    showVehicles: true,
    showTrams:    true,
    showBustrams: true,
    showBus:      true,
    showStops:    false,
    showTrace:    false,
  });

  const mapRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleFilter = (key) => setFilters(prev => ({ ...prev, [key]: !prev[key] }));

  const handleVehicleClick = useCallback((v) => {
    setSelectedVehicle(v.id);
    if (mapRef.current) mapRef.current.flyTo([v.lat, v.lon], 16, { duration: 0.8 });

    const gtfs = gtfsRef.current;
    if (!gtfs) return;

    const num = v.route_short_name;
    const isTram = v.vehicleType === "tram";
    const dir = v.direction_id === "1" || v.direction_id === 1 ? "retour" : "aller";

    let trace = [], stops = [];
    if (isTram) {
      const t = gtfs.tramTraces.get(num);
      trace = t ? (t[dir].length ? t[dir] : t.aller) : [];
      stops = gtfs.tramStops.get(num) || [];
    } else {
      const t = gtfs.busTraces.get(num);
      trace = t ? (t[dir].length ? t[dir] : t.aller) : [];
      stops = gtfs.busStops.get(num) || [];
    }

    setSelectedRouteData({ trace, stops, color: v.route_color, short_name: num });
  }, [gtfsRef]);

  const handleDeselect = () => {
    setSelectedVehicle(null);
    setSelectedRouteData(null);
  };

  const handleRecenter = () => {
    mapRef.current?.setView([43.6117, 3.8767], 13);
    handleDeselect();
  };

  // Filtrage
  const vehiculesFiltres = vehicules.filter(v => {
    if (!filters.showVehicles) return false;
    if (!filters.showTrams    && v.vehicleType === "tram")    return false;
    if (!filters.showBustrams && v.vehicleType === "bustram") return false;
    if (!filters.showBus      && v.vehicleType === "bus")     return false;
    return (
      v.route_short_name.toLowerCase().includes(filtreLigne.toLowerCase()) ||
      v.headsign.toLowerCase().includes(filtreLigne.toLowerCase())
    );
  });

  const sortedVehicles = [...vehiculesFiltres].sort((a, b) => {
    if (sortBy === "speed")     return (b.speed || 0) - (a.speed || 0);
    if (sortBy === "direction") return a.headsign.localeCompare(b.headsign);
    return a.route_short_name.localeCompare(b.route_short_name, undefined, { numeric: true });
  });

  const groupedVehicles = sortedVehicles.reduce((acc, v) => {
    if (!acc[v.route_short_name])
      acc[v.route_short_name] = { vehicles: [], color: v.route_color, type: v.vehicleType };
    acc[v.route_short_name].vehicles.push(v);
    return acc;
  }, {});

  const selectedVehicleObj = vehicules.find(v => v.id === selectedVehicle);

  // Thème
  const isDark       = theme === "dark";
  const bg           = isDark ? "#0f1117" : "#f8f9fa";
  const sidebarBg    = isDark ? "#16181f" : "#ffffff";
  const borderColor  = isDark ? "#2a2d3a" : "#e5e7eb";
  const textPrimary  = isDark ? "#f0f2f7" : "#111827";
  const textSecondary = isDark ? "#8b90a0" : "#6b7280";
  const cardBg       = isDark ? "#1e2130" : "#f9fafb";
  const inputBg      = isDark ? "#1e2130" : "#f3f4f6";

  const themeProps = { isDark, sidebarBg, borderColor, textPrimary, textSecondary, cardBg, inputBg };

  return (
    <div style={{ display: "flex", height: "100vh", background: bg, fontFamily: "'Inter',system-ui,sans-serif", overflow: "hidden" }}>

      <Sidebar
        {...themeProps}
        vehicules={vehicules}
        groupedVehicles={groupedVehicles}
        selectedVehicle={selectedVehicle}
        filtreLigne={filtreLigne}
        setFiltreLigne={setFiltreLigne}
        sortBy={sortBy}
        setSortBy={setSortBy}
        expandedLines={expandedLines}
        setExpandedLines={setExpandedLines}
        lastUpdate={lastUpdate}
        error={error}
        showPanel={showPanel}
        setShowPanel={setShowPanel}
        filters={filters}
        toggleFilter={toggleFilter}
        selectedRouteData={selectedRouteData}
        theme={theme}
        setTheme={setTheme}
        onVehicleClick={handleVehicleClick}
        onRecenter={handleRecenter}
      />

      <MapView
        {...themeProps}
        sortedVehicles={sortedVehicles}
        selectedVehicle={selectedVehicle}
        selectedVehicleObj={selectedVehicleObj}
        selectedRouteData={selectedRouteData}
        filters={filters}
        mapRef={mapRef}
        onVehicleClick={handleVehicleClick}
        onDeselect={handleDeselect}
      />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:3px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:${borderColor}; border-radius:2px; }
        .leaflet-popup-content-wrapper { border-radius:10px!important; box-shadow:0 8px 32px rgba(0,0,0,0.2)!important; padding:0!important; overflow:hidden; border:1px solid ${borderColor}!important; }
        .leaflet-popup-content { margin:0!important; }
        .leaflet-popup-tip { display:none; }
        .leaflet-control-attribution { font-size:9px!important; opacity:0.4; }
        .leaflet-control-zoom { display:none; }
      `}</style>
    </div>
  );
}
