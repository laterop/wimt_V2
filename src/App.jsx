import { useState, useRef, useCallback, useEffect } from "react";
import "leaflet/dist/leaflet.css";

import { useVehicles } from "./hooks/useVehicles";
import { useNextStop } from "./hooks/useNextStop";
import { getTheme } from "./theme";
import Sidebar from "./components/Sidebar";
import MapView from "./components/MapView";
import ArretPanel from "./components/ArretPanel";
import AboutPanel from "./components/AboutPanel";

const FILTER_CHIPS = [
  { key: "showTrams",    label: "🚊 Trams",   activeColor: "#60a5fa", activeBg: "rgba(0,116,201,0.18)" },
  { key: "showBustrams", label: "🚌 BRT",      activeColor: "#f9a8b8", activeBg: "rgba(132,25,49,0.2)"  },
  { key: "showBus",      label: "🚌 Bus",      activeColor: "#fbbf24", activeBg: "rgba(180,83,9,0.18)"  },
];

function TabIcon({ d, active, color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke={active ? color : "currentColor"} strokeWidth={active ? 2.2 : 1.8}
      style={{ display: "block" }}>
      <path d={d}/>
    </svg>
  );
}

const TABS = [
  { id: "live",    label: "Live",    icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
  { id: "arret",   label: "Arrêt",   icon: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" },
  { id: "lignes",  label: "Lignes",  icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
  { id: "about",   label: "Infos",   icon: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 16v-4M12 8h.01" },
];

export default function WimT() {
  const { vehicules, lastUpdate, error, gtfsRef } = useVehicles();
  const nextStops = useNextStop(vehicules);

  const [theme, setTheme]     = useState(() => localStorage.getItem("wimt-theme") || "dark");
  const [activeTab, setActiveTab] = useState("live");
  const [filtreLigne, setFiltreLigne] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [selectedLine, setSelectedLine] = useState(null);  // { short_name, color, text_color, type }
  const [selectedRouteData, setSelectedRouteData] = useState(null);
  const [sortBy] = useState("ligne");
  const [filters, setFilters] = useState({
    showTrams: true, showBustrams: true, showBus: true,
    showTrace: false, showStops: false,
  });

  const mapRef = useRef(null);
  const t = getTheme(theme === "dark");

  useEffect(() => {
    localStorage.setItem("wimt-theme", theme);
  }, [theme]);

  const toggleFilter = useCallback((key) => setFilters(prev => ({ ...prev, [key]: !prev[key] })), []);

  const handleVehicleClick = useCallback((v) => {
    setSelectedVehicle(v.id);
    setActiveTab("live");
    if (mapRef.current) mapRef.current.flyTo([v.lat, v.lon], 16, { duration: 0.8 });
    // Sélectionner aussi la ligne entière
    setSelectedLine({
      short_name: v.route_short_name,
      color: v.route_color,
      text_color: v.route_text_color,
      type: v.vehicleType,
    });
    const gtfs = gtfsRef.current;
    if (!gtfs) return;
    const num = v.route_short_name;
    const dir = v.direction_id === "1" || v.direction_id === 1 ? "retour" : "aller";
    let trace = [], stops = [];
    if (v.vehicleType === "tram") {
      const tr = gtfs.tramTraces.get(num);
      trace = tr ? (tr[dir].length ? tr[dir] : tr.aller) : [];
      stops = gtfs.tramStops.get(num) || [];
    } else {
      const tr = gtfs.busTraces.get(num);
      trace = tr ? (tr[dir].length ? tr[dir] : tr.aller) : [];
      stops = gtfs.busStops.get(num) || [];
    }
    setSelectedRouteData({ trace, stops, color: v.route_color, short_name: num });
  }, [gtfsRef]);

  const handleDeselect = useCallback(() => {
    setSelectedVehicle(null);
    setSelectedLine(null);
    setSelectedRouteData(null);
  }, []);

  const vehiculesFiltres = vehicules.filter(v => {
    if (!filters.showTrams    && v.vehicleType === "tram")    return false;
    if (!filters.showBustrams && v.vehicleType === "bustram") return false;
    if (!filters.showBus      && v.vehicleType === "bus")     return false;
    const q = filtreLigne.toLowerCase();
    return !q || v.route_short_name.toLowerCase().includes(q) || v.headsign.toLowerCase().includes(q);
  });

  const sortedVehicles = [...vehiculesFiltres].sort((a, b) =>
    a.route_short_name.localeCompare(b.route_short_name, undefined, { numeric: true })
  );

  const groupedVehicles = sortedVehicles.reduce((acc, v) => {
    if (!acc[v.route_short_name])
      acc[v.route_short_name] = { vehicles: [], color: v.route_color, type: v.vehicleType };
    acc[v.route_short_name].vehicles.push(v);
    return acc;
  }, {});

  const selectedVehicleObj = vehicules.find(v => v.id === selectedVehicle);

  // Tous les véhicules de la ligne sélectionnée (les deux sens)
  const lineVehicles = selectedLine
    ? vehicules.filter(v => v.route_short_name === selectedLine.short_name)
    : [];

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: t.bg, fontFamily: "'Inter',system-ui,sans-serif", overflow: "hidden" }}>

      {/* ── Header ── */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", height: 52, background: t.panelBg, borderBottom: `0.5px solid ${t.border}`, flexShrink: 0, zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#0074c9,#00b4d8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🚍</div>
          <div>
            <span style={{ fontWeight: 700, fontSize: 14, color: t.text, letterSpacing: "-0.2px" }}>WimT</span>
            <span style={{ fontSize: 11, color: t.textHint, marginLeft: 6 }}>Where is my TaM</span>
          </div>
        </div>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          style={{ width: 32, height: 32, borderRadius: 8, background: t.cardBg, border: `0.5px solid ${t.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}
        >{theme === "dark" ? "☀️" : "🌙"}</button>
      </header>

      {/* ── Corps ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* Panneau liste (desktop gauche / mobile bas sheet) */}
        <div style={{
          width: activeTab === "live" ? 300 : "100%",
          minWidth: activeTab !== "live" ? "100%" : undefined,
          background: t.panelBg,
          borderRight: activeTab === "live" ? `0.5px solid ${t.border}` : "none",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          flexShrink: 0,
          transition: "width 0.2s",
          // Sur mobile on masque la liste quand on est sur "live"
          ...(activeTab === "live" ? { display: "none" } : {}),
        }}>
          {activeTab === "arret" && (
            <ArretPanel
              theme={t}
              vehicules={vehicules}
              nextStops={nextStops}
              onTrackVehicle={(v) => {
                setActiveTab("live");
                handleVehicleClick(v);
              }}
            />
          )}
          {activeTab === "lignes" && (
            <LignesPanel theme={t} groupedVehicles={groupedVehicles} onVehicleClick={handleVehicleClick} selectedVehicle={selectedVehicle} />
          )}
          {activeTab === "about" && (
            <AboutPanel theme={t} />
          )}
        </div>

        {/* Carte (toujours visible sur live, cachée sur les autres onglets mobile) */}
        <div style={{ flex: 1, display: activeTab === "live" ? "flex" : "none", flexDirection: "column", minWidth: 0 }}>
          <MapView
            theme={t}
            sortedVehicles={sortedVehicles}
            selectedVehicle={selectedVehicle}
            selectedVehicleObj={selectedVehicleObj}
            selectedLine={selectedLine}
            lineVehicles={lineVehicles}
            selectedRouteData={selectedRouteData}
            filters={filters}
            mapRef={mapRef}
            onVehicleClick={handleVehicleClick}
            onDeselect={handleDeselect}
            filtreLigne={filtreLigne}
            setFiltreLigne={setFiltreLigne}
            filterChips={FILTER_CHIPS}
            toggleFilter={toggleFilter}
            lastUpdate={lastUpdate}
            error={error}
            nextStops={nextStops}
          />
        </div>
      </div>

      {/* ── Tab bar ── */}
      <nav style={{ display: "flex", background: t.panelBg, borderTop: `0.5px solid ${t.border}`, flexShrink: 0, zIndex: 20 }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                gap: 3, padding: "8px 0 10px", background: "none", border: "none",
                cursor: "pointer", color: isActive ? t.accent : t.textHint,
                fontSize: 10, fontFamily: "'Inter',system-ui,sans-serif", fontWeight: isActive ? 600 : 400,
                transition: "color 0.15s",
              }}
            >
              <TabIcon d={tab.icon} active={isActive} color={t.accent} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Stats flottantes sur la carte (Live uniquement) */}
      {activeTab === "live" && (
        <div style={{ position: "fixed", bottom: selectedLine ? 176 : 64, right: 14, zIndex: 1000, display: "flex", flexDirection: "column", gap: 4, transition: "bottom 0.25s ease" }}>
          {[
            { label: "Trams", value: vehicules.filter(v => v.vehicleType === "tram").length,    color: "#3b8eea" },
            { label: "BRT",   value: vehicules.filter(v => v.vehicleType === "bustram").length, color: "#e87fa3" },
            { label: "Bus",   value: vehicules.filter(v => v.vehicleType === "bus").length,     color: theme === "dark" ? "#fbbf24" : "#b45309" },
          ].map(s => (
            <div key={s.label} style={{ background: t.panelBg === "#ffffff" ? "rgba(255,255,255,0.88)" : "rgba(15,17,23,0.82)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: `0.5px solid ${t.border}`, borderRadius: 10, padding: "4px 9px", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.value}</span>
              <span style={{ fontSize: 10, color: t.textSub }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 2px; }
        input::placeholder { color: ${t.textHint}; }
        .leaflet-popup-content-wrapper {
          border-radius: 14px !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.18) !important;
          padding: 0 !important; overflow: hidden;
          border: 0.5px solid ${t.border} !important;
          background: ${t.panelBg} !important;
        }
        .leaflet-popup-content { margin: 0 !important; }
        .leaflet-popup-tip-container { display: none; }
        .leaflet-control-attribution { font-size: 9px !important; opacity: 0.35; }
        .leaflet-control-zoom { display: none; }
      `}</style>
    </div>
  );
}

function LignesPanel({ theme: t, groupedVehicles, onVehicleClick, selectedVehicle }) {
  return (
    <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: `0.5px solid ${t.border}` }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: t.text }}>Lignes en service</div>
        <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>{Object.keys(groupedVehicles).length} lignes actives</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {Object.entries(groupedVehicles).map(([line, { vehicles, color, type }]) => {
          const lc = `#${color}`;
          return (
            <div key={line} style={{ marginBottom: 2 }}>
              <div style={{ padding: "6px 16px 4px", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ minWidth: 28, height: 22, borderRadius: 7, background: lc, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", padding: "0 6px" }}>{line}</div>
                <span style={{ fontSize: 12, color: t.textSub }}>{type === "tram" ? "Tramway" : type === "bustram" ? "BRT" : "Bus"}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: lc, fontWeight: 600 }}>{vehicles.length} véhicules</span>
              </div>
              {vehicles.map(v => (
                <button key={v.id} onClick={() => onVehicleClick(v)} style={{ width: "100%", padding: "7px 16px 7px 52px", background: selectedVehicle === v.id ? `${lc}12` : "none", border: "none", borderLeft: `2.5px solid ${selectedVehicle === v.id ? lc : "transparent"}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, textAlign: "left" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: (v.speed || 0) > 0 ? "#22c55e" : "#f59e0b", flexShrink: 0, display: "block" }}></span>
                  <span style={{ fontSize: 12, color: t.text, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.headsign}</span>
                  {(v.speed || 0) > 0 && <span style={{ fontSize: 10, color: t.textSub, flexShrink: 0 }}>{Math.round(v.speed)} km/h</span>}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

