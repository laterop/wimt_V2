import { useEffect, useState, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Papa from "papaparse";
import protobuf from "protobufjs";

const GTFS_RT_URL = import.meta.env.VITE_GTFS_RT_URL || "https://tam-proxy.drivedemerde.workers.dev";

// Type de véhicule : 0 = tram, 11 = bustram (ligne A), 3 = bus
function getVehicleType(routeShortName, routeType) {
  const name = String(routeShortName).toUpperCase();
  if (["A"].includes(name)) return "bustram";
  if (routeType === 0 || ["1", "2", "3", "4", "5"].includes(name)) return "tram";
  return "bus";
}

// ─── Cache GTFS statique ──────────────────────────────────────────────────
let gtfsCache = null;
async function loadGTFS() {
  if (gtfsCache) return gtfsCache;
  const [routesText, tripsText, protoText, gtfsData] = await Promise.all([
    fetch("/routes.txt").then(r => r.text()),
    fetch("/trips.txt").then(r => r.text()),
    fetch("/gtfs-realtime.proto").then(r => r.text()),
    fetch("/gtfs-data.json").then(r => r.json()),
  ]);

  const routes = new Map();
  Papa.parse(routesText, { header: true, skipEmptyLines: true, step: ({ data }) => routes.set(data.route_id?.trim(), data) });

  const trips = new Map();
  Papa.parse(tripsText, { header: true, skipEmptyLines: true, step: ({ data }) => trips.set(data.trip_id?.trim(), data) });

  const root = protobuf.parse(protoText).root;
  const FeedMessage = root.lookupType("transit_realtime.FeedMessage");

  gtfsCache = { routes, trips, FeedMessage, gtfsData };
  return gtfsCache;
}

// ─── Composants carte ─────────────────────────────────────────────────────
function CenterMap({ position }) {
  const map = useMap();
  useEffect(() => { if (position) map.flyTo(position, 16, { duration: 0.8 }); }, [position, map]);
  return null;
}

function VehicleMarker({ v, isSelected, onClick }) {
  const color = `#${v.route_color}`;
  const size = isSelected ? 18 : 12;
  const icon = L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid rgba(255,255,255,0.95);box-shadow:0 0 0 ${isSelected ? "4px" : "2px"} ${color}66,0 2px 8px rgba(0,0,0,0.3);transition:all 0.2s;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  const typeLabel = v.vehicleType === "tram" ? "🚊 Tram" : v.vehicleType === "bustram" ? "🚌 BRT" : "🚌 Bus";
  return (
    <Marker position={[v.lat, v.lon]} icon={icon} eventHandlers={{ click: onClick }}>
      <Popup>
        <div style={{ fontFamily: "system-ui,sans-serif", minWidth: 170 }}>
          <div style={{ background: color, color: `#${v.route_text_color || "fff"}`, padding: "6px 10px", borderRadius: "6px 6px 0 0", margin: "-13px -19px 10px", fontWeight: 700, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Ligne {v.route_short_name}</span>
            <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 400 }}>{typeLabel}</span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, padding: "0 2px" }}>
            <div style={{ fontWeight: 600 }}>{v.headsign}</div>
            <div style={{ color: "#888", fontSize: 11, marginBottom: 4 }}>{v.route_long_name}</div>
            <div style={{ color: "#666", fontSize: 11 }}>ID {v.id}</div>
            {v.speed != null && (
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: v.speed > 0 ? "#22c55e" : "#f59e0b" }}></span>
                {v.speed > 0 ? `${Math.round(v.speed)} km/h` : "À l'arrêt"}
              </div>
            )}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────
export default function CarteTAM() {
  const [vehicules, setVehicules] = useState([]);
  const [filtreLigne, setFiltreLigne] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [selectedRouteData, setSelectedRouteData] = useState(null);
  const [sortBy, setSortBy] = useState("ligne");
  const [expandedLines, setExpandedLines] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);
  const [showPanel, setShowPanel] = useState(false);
  const [filters, setFilters] = useState({
    showVehicles: true,
    showTrams: true,
    showBustrams: true,
    showBus: true,
    showStops: false,
    showTrace: false,
  });

  const mapRef = useRef(null);
  const gtfsRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const gtfs = await loadGTFS();
        gtfsRef.current = gtfs;
        const { routes, trips, FeedMessage } = gtfs;

        const response = await fetch(GTFS_RT_URL);
        const buffer = await response.arrayBuffer();
        const message = FeedMessage.decode(new Uint8Array(buffer));

        const positions = message.entity
          .filter(e => e.vehicle && e.vehicle.position &&
            e.vehicle.position.latitude != null &&
            e.vehicle.position.longitude != null &&
            e.vehicle.position.latitude !== 0 &&
            e.vehicle.position.longitude !== 0)
          .map(e => {
            const veh = e.vehicle;
            const trip = veh.trip || {};
            const pos = veh.position || {};
            const route_id_raw = trip.routeId?.trim() || "?";
            const route_id = route_id_raw.replace(/^.*:/, "");
            const route = routes.get(route_id) || {};
            const tripData = trips.get(trip.tripId?.trim()) || {};
            const short = route.route_short_name || "?";
            const rtype = parseInt(route.route_type) || 3;
            return {
              id: veh.vehicle?.id || veh.id || "???",
              lat: pos.latitude, lon: pos.longitude,
              bearing: pos.bearing || null, speed: pos.speed || null,
              route_id,
              route_short_name: short,
              route_long_name: route.route_long_name || "",
              route_color: route.route_color || "000000",
              route_text_color: route.route_text_color || "FFFFFF",
              route_type: rtype,
              vehicleType: getVehicleType(short, rtype),
              headsign: tripData.trip_headsign || "Direction inconnue",
              direction_id: tripData.direction_id ?? null,
              timestamp: veh.timestamp?.low ?? null,
            };
          });

        setVehicules(positions);
        setLastUpdate(new Date());
        setError(null);
      } catch (err) {
        console.error("Erreur :", err);
        setError(err.message);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleVehicleClick = useCallback((v) => {
    setSelectedVehicle(v.id);
    if (mapRef.current) mapRef.current.flyTo([v.lat, v.lon], 16, { duration: 0.8 });
    const gtfs = gtfsRef.current;
    if (gtfs?.gtfsData && gtfs.gtfsData[v.route_id]) {
      const data = gtfs.gtfsData[v.route_id];
      const dir = v.direction_id === "1" || v.direction_id === 1 ? 1 : 0;
      setSelectedRouteData({
        trace: data.traces[dir] || data.traces[0] || [],
        stops: data.stops || [],
        color: data.color,
        short_name: data.short_name,
      });
    }
  }, []);

  const toggleFilter = (key) => setFilters(prev => ({ ...prev, [key]: !prev[key] }));

  const vehiculesFiltres = vehicules.filter(v => {
    if (!filters.showVehicles) return false;
    if (!filters.showTrams && v.vehicleType === "tram") return false;
    if (!filters.showBustrams && v.vehicleType === "bustram") return false;
    if (!filters.showBus && v.vehicleType === "bus") return false;
    return v.route_short_name.toLowerCase().includes(filtreLigne.toLowerCase()) ||
      v.headsign.toLowerCase().includes(filtreLigne.toLowerCase());
  });

  const sortedVehicles = [...vehiculesFiltres].sort((a, b) => {
    if (sortBy === "speed") return (b.speed || 0) - (a.speed || 0);
    if (sortBy === "direction") return a.headsign.localeCompare(b.headsign);
    return a.route_short_name.localeCompare(b.route_short_name, undefined, { numeric: true });
  });

  const groupedVehicles = sortedVehicles.reduce((acc, v) => {
    if (!acc[v.route_short_name]) acc[v.route_short_name] = { vehicles: [], color: v.route_color, type: v.vehicleType };
    acc[v.route_short_name].vehicles.push(v);
    return acc;
  }, {});

  const selectedVehicleObj = vehicules.find(v => v.id === selectedVehicle);

  const isDark = theme === "dark";
  const bg = isDark ? "#0f1117" : "#f8f9fa";
  const sidebarBg = isDark ? "#16181f" : "#ffffff";
  const borderColor = isDark ? "#2a2d3a" : "#e5e7eb";
  const textPrimary = isDark ? "#f0f2f7" : "#111827";
  const textSecondary = isDark ? "#8b90a0" : "#6b7280";
  const cardBg = isDark ? "#1e2130" : "#f9fafb";
  const inputBg = isDark ? "#1e2130" : "#f3f4f6";

  const typeIcon = { tram: "🚊", bustram: "🚌", bus: "🚌" };
  const typeLabel = { tram: "Tram", bustram: "BRT", bus: "Bus" };

  return (
    <div style={{ display: "flex", height: "100vh", background: bg, fontFamily: "'Inter',system-ui,sans-serif", overflow: "hidden" }}>

      {/* ── Sidebar ── */}
      <aside style={{ width: 320, minWidth: 320, height: "100vh", background: sidebarBg, borderRight: `1px solid ${borderColor}`, display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 10 }}>

        {/* Header */}
        <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${borderColor}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#0074c9,#00b4d8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🚍</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: textPrimary }}>TAM Live</div>
                <div style={{ fontSize: 10, color: textSecondary }}>Montpellier</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <button onClick={() => setShowPanel(p => !p)} style={{ background: showPanel ? "#0074c9" : inputBg, border: "none", cursor: "pointer", borderRadius: 7, padding: "5px 8px", fontSize: 11, color: showPanel ? "#fff" : textSecondary }}>⚙️ Filtres</button>
              <button onClick={() => setTheme(isDark ? "light" : "dark")} style={{ background: inputBg, border: "none", cursor: "pointer", borderRadius: 7, padding: "5px 7px", fontSize: 13, color: textSecondary }}>{isDark ? "☀️" : "🌙"}</button>
            </div>
          </div>

          {/* Panneau filtres */}
          {showPanel && (
            <div style={{ background: cardBg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${borderColor}`, marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: textSecondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Véhicules affichés</div>
              {[
                { key: "showTrams", label: "Trams (L1-5)", icon: "🚊", color: "#005CA9" },
                { key: "showBustrams", label: "BRT (Ligne A)", icon: "🚌", color: "#841931" },
                { key: "showBus", label: "Bus", icon: "🚌", color: "#FFB900" },
              ].map(({ key, label, icon, color }) => (
                <label key={key} onClick={() => toggleFilter(key)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer" }}>
                  <div style={{ width: 32, height: 18, borderRadius: 9, background: filters[key] ? color : (isDark ? "#333" : "#d1d5db"), position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                    <div style={{ position: "absolute", top: 2, left: filters[key] ? 16 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}></div>
                  </div>
                  <span style={{ fontSize: 12, color: textPrimary }}>{icon} {label}</span>
                </label>
              ))}

              <div style={{ fontSize: 10, fontWeight: 600, color: textSecondary, margin: "10px 0 8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Carte (ligne sélectionnée)</div>
              {[
                { key: "showTrace", label: "Tracé de la ligne", icon: "〰️" },
                { key: "showStops", label: "Arrêts", icon: "🔵" },
              ].map(({ key, label, icon }) => (
                <label key={key} onClick={() => toggleFilter(key)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer" }}>
                  <div style={{ width: 32, height: 18, borderRadius: 9, background: filters[key] ? "#0074c9" : (isDark ? "#333" : "#d1d5db"), position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                    <div style={{ position: "absolute", top: 2, left: filters[key] ? 16 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}></div>
                  </div>
                  <span style={{ fontSize: 12, color: textPrimary }}>{icon} {label}</span>
                </label>
              ))}
              {(filters.showStops || filters.showTrace) && !selectedRouteData && (
                <div style={{ marginTop: 6, fontSize: 10, color: textSecondary, fontStyle: "italic" }}>↑ Clique sur un véhicule pour l'activer</div>
              )}
            </div>
          )}

          {/* Stats */}
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { label: "Trams", value: vehicules.filter(v => v.vehicleType === "tram").length, color: "#005CA9" },
              { label: "BRT", value: vehicules.filter(v => v.vehicleType === "bustram").length, color: "#841931" },
              { label: "Bus", value: vehicules.filter(v => v.vehicleType === "bus").length, color: "#f59e0b" },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, background: cardBg, borderRadius: 8, padding: "7px 8px", textAlign: "center", border: `1px solid ${borderColor}` }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 9, color: textSecondary, marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Search + tri */}
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${borderColor}`, display: "flex", gap: 6, flexDirection: "column" }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: textSecondary, fontSize: 12, pointerEvents: "none" }}>🔍</span>
            <input type="text" placeholder="Ligne ou direction..." value={filtreLigne} onChange={e => setFiltreLigne(e.target.value)} style={{ width: "100%", padding: "7px 9px 7px 28px", background: inputBg, border: `1px solid ${borderColor}`, borderRadius: 8, color: textPrimary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ flex: 1, padding: "5px 7px", background: inputBg, border: `1px solid ${borderColor}`, borderRadius: 7, color: textSecondary, fontSize: 11, outline: "none", cursor: "pointer" }}>
              <option value="ligne">Par ligne</option>
              <option value="speed">Par vitesse</option>
              <option value="direction">Par direction</option>
            </select>
            <button onClick={() => { mapRef.current?.setView([43.6117, 3.8767], 13); setSelectedVehicle(null); setSelectedRouteData(null); }} style={{ padding: "5px 9px", background: inputBg, border: `1px solid ${borderColor}`, borderRadius: 7, color: textSecondary, fontSize: 11, cursor: "pointer" }} title="Recentrer">⌖</button>
          </div>
        </div>

        {/* Status */}
        <div style={{ padding: "5px 14px", fontSize: 10, color: textSecondary, borderBottom: `1px solid ${borderColor}`, display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: error ? "#ef4444" : lastUpdate ? "#22c55e" : "#f59e0b" }}></span>
          {error ? "Erreur de connexion" : lastUpdate ? `Mis à jour à ${lastUpdate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Chargement..."}
        </div>

        {/* Liste véhicules */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {Object.entries(groupedVehicles).map(([line, { vehicles, color, type }]) => {
            const isExpanded = expandedLines[line] !== false;
            const lineColor = `#${color}`;
            return (
              <div key={line}>
                <button onClick={() => setExpandedLines(prev => ({ ...prev, [line]: !prev[line] }))} style={{ width: "100%", padding: "7px 14px", display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ minWidth: 30, height: 20, borderRadius: 5, background: lineColor, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{line}</div>
                  <span style={{ fontSize: 10, color: textSecondary, flexShrink: 0 }}>{typeIcon[type]}</span>
                  <span style={{ flex: 1, fontSize: 11, color: textSecondary, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {vehicles[0]?.headsign !== "Direction inconnue" ? vehicles[0]?.headsign : ""}
                  </span>
                  <span style={{ fontSize: 10, color: lineColor, fontWeight: 600, background: `${lineColor}18`, padding: "2px 5px", borderRadius: 8 }}>{vehicles.length}</span>
                  <span style={{ fontSize: 10, color: textSecondary }}>{isExpanded ? "▾" : "▸"}</span>
                </button>

                {isExpanded && vehicles.map(v => (
                  <div key={v.id} onClick={() => handleVehicleClick(v)} style={{ margin: "2px 8px 2px 14px", padding: "7px 9px", borderRadius: 7, cursor: "pointer", background: selectedVehicle === v.id ? `${lineColor}18` : cardBg, border: `1px solid ${selectedVehicle === v.id ? `${lineColor}55` : borderColor}`, display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: v.speed > 0 ? "#22c55e" : "#f59e0b", flexShrink: 0 }}></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: textPrimary, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.headsign}</div>
                      <div style={{ fontSize: 9, color: textSecondary, marginTop: 1 }}>ID {v.id}</div>
                    </div>
                    {v.speed != null && v.speed > 0 && (
                      <div style={{ fontSize: 10, color: textSecondary, flexShrink: 0 }}>{Math.round(v.speed)}<span style={{ fontSize: 8 }}> km/h</span></div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
          {Object.keys(groupedVehicles).length === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: textSecondary, fontSize: 12 }}>
              {error ? "Impossible de charger les données" : vehicules.length === 0 ? "Chargement..." : "Aucun résultat"}
            </div>
          )}
        </div>
      </aside>

      {/* ── Carte ── */}
      <div style={{ flex: 1, position: "relative" }}>
        <MapContainer center={[43.6117, 3.8767]} zoom={13} style={{ height: "100%", width: "100%" }} ref={mapRef} zoomControl={false}>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors &copy; CARTO"
            url={isDark ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"}
          />

          {/* Tracé */}
          {filters.showTrace && selectedRouteData?.trace?.length > 1 && (
            <Polyline
              positions={selectedRouteData.trace.map(s => [s.lat, s.lon])}
              color={`#${selectedRouteData.color}`}
              weight={5}
              opacity={0.8}
            />
          )}

          {/* Arrêts */}
          {filters.showStops && selectedRouteData?.stops?.map(s => (
            <CircleMarker
              key={s.id}
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
                  <div style={{ color: "#888", fontSize: 10 }}>Arrêt {s.id}</div>
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {/* Véhicules */}
          {sortedVehicles.filter(v => v.lat != null && v.lon != null).map(v => (
            <VehicleMarker key={v.id} v={v} isSelected={selectedVehicle === v.id} onClick={() => handleVehicleClick(v)} />
          ))}

          {selectedVehicleObj && <CenterMap position={[selectedVehicleObj.lat, selectedVehicleObj.lon]} />}
        </MapContainer>

        {/* Zoom */}
        <div style={{ position: "absolute", right: 14, bottom: 70, zIndex: 1000, display: "flex", flexDirection: "column", gap: 2 }}>
          {["+", "−"].map((s, i) => (
            <button key={s} onClick={() => i === 0 ? mapRef.current?.zoomIn() : mapRef.current?.zoomOut()} style={{ width: 30, height: 30, border: `1px solid ${borderColor}`, background: sidebarBg, color: textPrimary, borderRadius: i === 0 ? "7px 7px 2px 2px" : "2px 2px 7px 7px", fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>{s}</button>
          ))}
        </div>

        {/* Chip véhicule sélectionné */}
        {selectedVehicleObj && (
          <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 1000, background: sidebarBg, borderRadius: 10, border: `1px solid ${borderColor}`, padding: "7px 12px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.2)", whiteSpace: "nowrap" }}>
            <div style={{ width: 22, height: 22, borderRadius: 5, background: `#${selectedVehicleObj.route_color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: `#${selectedVehicleObj.route_text_color || "fff"}` }}>{selectedVehicleObj.route_short_name}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: textPrimary }}>{selectedVehicleObj.headsign}</div>
              <div style={{ fontSize: 10, color: textSecondary }}>
                {typeLabel[selectedVehicleObj.vehicleType]} · {selectedVehicleObj.route_long_name} · {selectedVehicleObj.speed > 0 ? `${Math.round(selectedVehicleObj.speed)} km/h` : "À l'arrêt"}
              </div>
            </div>
            <button onClick={() => { setSelectedVehicle(null); setSelectedRouteData(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: textSecondary, fontSize: 14, padding: 2 }}>✕</button>
          </div>
        )}
      </div>

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
