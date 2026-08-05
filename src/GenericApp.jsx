import { useState, useRef, useCallback, useEffect, lazy, Suspense } from "react";
import "leaflet/dist/leaflet.css";

import { useVehiclesGeneric } from "./hooks/useVehiclesGeneric";
import { useTracesGeneric } from "./hooks/useTracesGeneric";
import { useNextStop } from "./hooks/useNextStop";
import { getTheme } from "./theme";
import SplashScreenGeneric from "./components/SplashScreenGeneric";

// App générique pour tout réseau "GTFS standard" (Nîmes, liO Occitanie...),
// piloté entièrement par l'objet `network` (voir src/networks.js).

const MapView            = lazy(() => import("./components/MapView"));
const ArretPanel         = lazy(() => import("./components/ArretPanel"));
const ThermometresPanel  = lazy(() => import("./components/ThermometresPanel"));
const AboutPanelGeneric  = lazy(() => import("./components/AboutPanelGeneric"));

const BASE_FILTER_CHIPS = [
  { key: "showBus", label: "🚌 Bus", activeColor: "#fbbf24", activeBg: "rgba(180,83,9,0.18)" },
];
const BUSTRAM_CHIP =
  { key: "showBustrams", label: "🚌 BusTram", activeColor: "#f9a8b8", activeBg: "rgba(132,25,49,0.2)" };

function TabIcon({ d, active, color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke={active ? color : "currentColor"} strokeWidth={active ? 2.2 : 1.8}
      style={{ display: "block" }}>
      <path d={d}/>
    </svg>
  );
}

function ThermomIcon({ active, color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke={active ? color : "currentColor"} strokeWidth={active ? 2.2 : 1.8}
      style={{ display: "block" }}>
      <path d="M12 2v10.5"/>
      <circle cx="12" cy="17" r="3"/>
      <path d="M9 12.5a3 3 0 0 0 0 4.5"/>
      <path d="M9 5h6M9 8h6"/>
    </svg>
  );
}

const TABS = [
  { id: "live",   label: "Live",   icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
  { id: "thermo", label: "Lignes", icon: null },
  { id: "arret",  label: "Arrêt",  icon: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" },
  { id: "about",  label: "Infos",  icon: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 16v-4M12 8h.01" },
];

function TabLoader({ theme: t }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: t.textHint, fontSize: 12 }}>
      Chargement…
    </div>
  );
}

export default function GenericApp({ network }) {
  const [showSplash, setShowSplash] = useState(true);

  const hasBustram = (network.busTramPrefixes || []).length > 0;
  const FILTER_CHIPS = hasBustram ? [...BASE_FILTER_CHIPS, BUSTRAM_CHIP] : BASE_FILTER_CHIPS;

  const { vehicules, lastUpdate, error, gtfsRef } = useVehiclesGeneric({
    dataBase: network.dataBase,
    vehiclePositionsUrl: network.vehiclePositionsUrl,
    format: network.vehicleFormat || "json",
    busTramPrefixes: network.busTramPrefixes || [],
  });
  const nextStops = useNextStop(vehicules, network.dataBase);
  const allTraces = useTracesGeneric(network.dataBase);

  const [theme, setTheme]     = useState(() => localStorage.getItem("wimt-theme") || "dark");
  const [activeTab, setActiveTab] = useState("live");
  const [filtreLigne, setFiltreLigne] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [selectedLine, setSelectedLine] = useState(null);
  const [selectedRouteData, setSelectedRouteData] = useState(null);
  const [filters, setFilters] = useState({ showBus: true, showBustrams: true, showStops: false });

  const mapRef = useRef(null);
  const t = getTheme(theme === "dark");

  useEffect(() => { localStorage.setItem("wimt-theme", theme); }, [theme]);

  const toggleFilter = useCallback((key) => setFilters(prev => ({ ...prev, [key]: !prev[key] })), []);

  const handleVehicleClick = useCallback((v) => {
    setSelectedVehicle(v.id);
    setActiveTab("live");
    if (mapRef.current) mapRef.current.flyTo([v.lat, v.lon], 16, { duration: 0.8 });
    setSelectedLine({
      short_name: v.route_short_name,
      color: v.route_color,
      text_color: v.route_text_color,
      type: v.vehicleType,
    });
    const gtfsData = gtfsRef.current;
    const route = gtfsData?.[v.route_id];
    setSelectedRouteData({
      trace: [],
      stops: route?.stops || [],
      color: v.route_color,
      short_name: v.route_short_name,
    });
  }, [gtfsRef]);

  const handleDeselect = useCallback(() => {
    setSelectedVehicle(null);
    setSelectedLine(null);
    setSelectedRouteData(null);
  }, []);

  const vehiculesFiltres = vehicules.filter(v => {
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
  const lineVehicles = selectedLine
    ? vehicules.filter(v => v.route_short_name === selectedLine.short_name)
    : [];

  const isLiveTab = activeTab === "live";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: t.bg, fontFamily: "'Inter',system-ui,sans-serif", overflow: "hidden" }}>

      {showSplash && <SplashScreenGeneric network={network} onEnter={() => setShowSplash(false)} />}

      {/* ── Header ── */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", height: 52, background: t.panelBg, borderBottom: `0.5px solid ${t.border}`, flexShrink: 0, zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#0074c9,#00b4d8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🚍</div>
          <div>
            <span style={{ fontWeight: 700, fontSize: 14, color: t.text, letterSpacing: "-0.2px" }}>WimT</span>
            <span style={{ fontSize: 11, color: t.textHint, marginLeft: 6 }}>{network.tagline}</span>
          </div>
        </div>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          style={{ width: 32, height: 32, borderRadius: 8, background: t.cardBg, border: `0.5px solid ${t.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}
        >{theme === "dark" ? "☀️" : "🌙"}</button>
      </header>

      {/* ── Corps ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        <div style={{
          width: isLiveTab ? 0 : "100%",
          background: t.panelBg,
          display: isLiveTab ? "none" : "flex",
          flexDirection: "column",
          overflow: "hidden",
          flexShrink: 0,
        }}>
          <Suspense fallback={<TabLoader theme={t} />}>
            {activeTab === "thermo" && (
              <ThermometresPanel
                theme={t}
                vehicules={vehicules}
                nextStops={nextStops}
                onVehicleClick={handleVehicleClick}
              />
            )}
            {activeTab === "arret" && (
              <ArretPanel
                theme={t}
                vehicules={vehicules}
                nextStops={nextStops}
                dataBase={network.dataBase}
                onTrackVehicle={(v) => { setActiveTab("live"); handleVehicleClick(v); }}
              />
            )}
            {activeTab === "about" && <AboutPanelGeneric theme={t} network={network} />}
          </Suspense>
        </div>

        <div style={{ flex: 1, display: isLiveTab ? "flex" : "none", flexDirection: "column", minWidth: 0 }}>
          <Suspense fallback={<TabLoader theme={t} />}>
            <MapView
              theme={t}
              allTraces={allTraces}
              center={network.center}
              zoom={network.zoom}
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
          </Suspense>
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
              {tab.id === "thermo"
                ? <ThermomIcon active={isActive} color={t.accent} />
                : <TabIcon d={tab.icon} active={isActive} color={t.accent} />
              }
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Stats flottantes (Live uniquement) */}
      {isLiveTab && (
        <div style={{ position: "fixed", bottom: selectedLine ? 176 : 64, right: 14, zIndex: 1000, display: "flex", flexDirection: "column", gap: 4, transition: "bottom 0.25s ease" }}>
          {(hasBustram
            ? [
                { label: "BusTram", value: vehicules.filter(v => v.vehicleType === "bustram").length, color: "#e87fa3" },
                { label: "Bus",     value: vehicules.filter(v => v.vehicleType === "bus").length,      color: theme === "dark" ? "#fbbf24" : "#b45309" },
              ]
            : [{ label: "Bus", value: vehicules.length, color: theme === "dark" ? "#fbbf24" : "#b45309" }]
          ).map(s => (
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
