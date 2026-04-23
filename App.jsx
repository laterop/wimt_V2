import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Papa from "papaparse";

function CenterMap({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 16, { duration: 0.8 });
  }, [position, map]);
  return null;
}

function VehicleMarker({ v, isSelected }) {
  const color = `#${v.route_color}`;
  const size = isSelected ? 18 : 13;
  const icon = L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};
      border:2px solid rgba(255,255,255,0.9);
      box-shadow:0 0 0 ${isSelected ? "4px" : "2px"} ${color}55, 0 2px 8px rgba(0,0,0,0.3);
      transition:all 0.2s;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

  return (
    <Marker position={[v.lat, v.lon]} icon={icon}>
      <Popup className="tam-popup">
        <div style={{ fontFamily: "system-ui, sans-serif", minWidth: 160 }}>
          <div style={{
            background: color,
            color: "#fff",
            padding: "6px 10px",
            borderRadius: "6px 6px 0 0",
            margin: "-13px -19px 10px",
            fontWeight: 700,
            fontSize: 13,
          }}>
            Ligne {v.route_short_name}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{v.headsign}</div>
            <div style={{ color: "#666", fontSize: 11 }}>ID {v.id}</div>
            {v.speed != null && (
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  display: "inline-block",
                  width: 6, height: 6, borderRadius: "50%",
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

export default function CarteTAM() {
  const [vehicules, setVehicules] = useState([]);
  const [filtreLigne, setFiltreLigne] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [sortBy, setSortBy] = useState("ligne");
  const [expandedLines, setExpandedLines] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/vehicles");
        const data = await res.json();
        setVehicules(data);
        setLastUpdate(new Date());
      } catch (err) {
        console.error("Erreur chargement véhicules :", err);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  const vehiculesFiltres = vehicules.filter(v =>
    v.route_short_name.toLowerCase().includes(filtreLigne.toLowerCase()) ||
    v.headsign.toLowerCase().includes(filtreLigne.toLowerCase())
  );

  const sortedVehicles = [...vehiculesFiltres].sort((a, b) => {
    if (sortBy === "speed") return (b.speed || 0) - (a.speed || 0);
    if (sortBy === "direction") return a.headsign.localeCompare(b.headsign);
    return a.route_short_name.localeCompare(b.route_short_name, undefined, { numeric: true });
  });

  const groupedVehicles = sortedVehicles.reduce((acc, v) => {
    if (!acc[v.route_short_name]) acc[v.route_short_name] = { vehicles: [], color: v.route_color };
    acc[v.route_short_name].vehicles.push(v);
    return acc;
  }, {});

  const toggleLine = (line) =>
    setExpandedLines(prev => ({ ...prev, [line]: !prev[line] }));

  const handleVehicleClick = (v) => {
    setSelectedVehicle(v.id);
    if (mapRef.current) mapRef.current.flyTo([v.lat, v.lon], 16, { duration: 0.8 });
  };

  const exportToCSV = () => {
    const csv = Papa.unparse(sortedVehicles);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "vehicules-tam.csv"; a.click();
  };

  const isDark = theme === "dark";

  const bg = isDark ? "#0f1117" : "#f8f9fa";
  const sidebarBg = isDark ? "#16181f" : "#ffffff";
  const borderColor = isDark ? "#2a2d3a" : "#e5e7eb";
  const textPrimary = isDark ? "#f0f2f7" : "#111827";
  const textSecondary = isDark ? "#8b90a0" : "#6b7280";
  const cardBg = isDark ? "#1e2130" : "#f9fafb";
  const cardHover = isDark ? "#252840" : "#f0f4ff";
  const inputBg = isDark ? "#1e2130" : "#f3f4f6";

  const selectedId = selectedVehicle;
  const selectedVehicleObj = vehicules.find(v => v.id === selectedId);

  return (
    <div style={{ display: "flex", height: "100vh", background: bg, fontFamily: "'Inter', system-ui, sans-serif", overflow: "hidden" }}>

      {/* Sidebar */}
      <aside style={{
        width: 340,
        minWidth: 340,
        height: "100vh",
        background: sidebarBg,
        borderRight: `1px solid ${borderColor}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 10,
      }}>

        {/* Header */}
        <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${borderColor}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: "linear-gradient(135deg, #0074c9, #00b4d8)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16,
              }}>🚍</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: textPrimary, letterSpacing: "-0.2px" }}>
                  TAM Live
                </div>
                <div style={{ fontSize: 11, color: textSecondary }}>Montpellier</div>
              </div>
            </div>
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              style={{
                background: inputBg, border: "none", cursor: "pointer",
                borderRadius: 8, padding: "6px 8px", fontSize: 14,
                color: textSecondary, transition: "background 0.2s",
              }}
              title="Changer le thème"
            >{isDark ? "☀️" : "🌙"}</button>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            {[
              { label: "Véhicules", value: vehicules.length, color: "#0074c9" },
              { label: "Lignes", value: Object.keys(groupedVehicles).length, color: "#8b5cf6" },
              { label: "En mvt", value: vehicules.filter(v => v.speed > 0).length, color: "#22c55e" },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1, background: cardBg, borderRadius: 8,
                padding: "8px 10px", textAlign: "center",
                border: `1px solid ${borderColor}`,
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: textSecondary, marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Search + controls */}
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${borderColor}`, display: "flex", gap: 8, flexDirection: "column" }}>
          <div style={{ position: "relative" }}>
            <span style={{
              position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
              color: textSecondary, fontSize: 13, pointerEvents: "none",
            }}>🔍</span>
            <input
              type="text"
              placeholder="Ligne ou direction..."
              value={filtreLigne}
              onChange={e => setFiltreLigne(e.target.value)}
              style={{
                width: "100%", padding: "8px 10px 8px 30px",
                background: inputBg, border: `1px solid ${borderColor}`,
                borderRadius: 8, color: textPrimary, fontSize: 13,
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{
                flex: 1, padding: "6px 8px", background: inputBg,
                border: `1px solid ${borderColor}`, borderRadius: 8,
                color: textSecondary, fontSize: 12, outline: "none", cursor: "pointer",
              }}
            >
              <option value="ligne">Par ligne</option>
              <option value="speed">Par vitesse</option>
              <option value="direction">Par direction</option>
            </select>
            <button
              onClick={exportToCSV}
              style={{
                padding: "6px 10px", background: inputBg,
                border: `1px solid ${borderColor}`, borderRadius: 8,
                color: textSecondary, fontSize: 11, cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >↓ CSV</button>
            <button
              onClick={() => mapRef.current?.setView([43.6117, 3.8767], 13)}
              style={{
                padding: "6px 10px", background: inputBg,
                border: `1px solid ${borderColor}`, borderRadius: 8,
                color: textSecondary, fontSize: 11, cursor: "pointer",
              }}
              title="Recentrer la carte"
            >⌖</button>
          </div>
        </div>

        {/* Last update */}
        {lastUpdate && (
          <div style={{ padding: "6px 16px", fontSize: 10, color: textSecondary, borderBottom: `1px solid ${borderColor}` }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#22c55e", marginRight: 5, verticalAlign: "middle" }}></span>
            Mis à jour à {lastUpdate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        )}

        {/* Vehicle list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {Object.entries(groupedVehicles).map(([line, { vehicles, color }]) => {
            const isExpanded = expandedLines[line] !== false;
            const lineColor = `#${color}`;
            return (
              <div key={line}>
                {/* Line header */}
                <button
                  onClick={() => toggleLine(line)}
                  style={{
                    width: "100%", padding: "8px 16px",
                    display: "flex", alignItems: "center", gap: 10,
                    background: "none", border: "none", cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{
                    minWidth: 32, height: 22, borderRadius: 5,
                    background: lineColor, color: "#fff",
                    fontSize: 11, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "0 6px",
                  }}>{line}</div>
                  <span style={{ flex: 1, fontSize: 12, color: textSecondary, fontWeight: 500 }}>
                    {vehicles[0]?.headsign !== "Direction inconnue" ? vehicles[0]?.headsign : ""}
                  </span>
                  <span style={{
                    fontSize: 10, color: lineColor, fontWeight: 600,
                    background: `${lineColor}18`, padding: "2px 6px", borderRadius: 10,
                  }}>{vehicles.length}</span>
                  <span style={{ fontSize: 10, color: textSecondary, marginLeft: 2 }}>
                    {isExpanded ? "▾" : "▸"}
                  </span>
                </button>

                {/* Vehicles */}
                {isExpanded && vehicles.map(v => (
                  <div
                    key={v.id}
                    onClick={() => handleVehicleClick(v)}
                    style={{
                      margin: "2px 10px 2px 16px",
                      padding: "8px 10px",
                      borderRadius: 8,
                      cursor: "pointer",
                      background: selectedVehicle === v.id ? `${lineColor}18` : cardBg,
                      border: `1px solid ${selectedVehicle === v.id ? `${lineColor}55` : borderColor}`,
                      display: "flex", alignItems: "center", gap: 10,
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: v.speed > 0 ? "#22c55e" : "#f59e0b",
                      flexShrink: 0,
                    }}></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: textPrimary, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {v.headsign}
                      </div>
                      <div style={{ fontSize: 10, color: textSecondary, marginTop: 1 }}>ID {v.id}</div>
                    </div>
                    {v.speed != null && v.speed > 0 && (
                      <div style={{ fontSize: 11, color: textSecondary, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                        {Math.round(v.speed)} <span style={{ fontSize: 9 }}>km/h</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          {Object.keys(groupedVehicles).length === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: textSecondary, fontSize: 13 }}>
              {vehicules.length === 0 ? "Chargement en cours..." : "Aucun résultat"}
            </div>
          )}
        </div>
      </aside>

      {/* Map */}
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
          {sortedVehicles.map(v => (
            <VehicleMarker key={v.id} v={v} isSelected={selectedVehicle === v.id} />
          ))}
          {selectedVehicleObj && (
            <CenterMap position={[selectedVehicleObj.lat, selectedVehicleObj.lon]} />
          )}
        </MapContainer>

        {/* Zoom controls */}
        <div style={{
          position: "absolute", right: 16, bottom: 80, zIndex: 1000,
          display: "flex", flexDirection: "column", gap: 2,
        }}>
          {["+", "−"].map((s, i) => (
            <button
              key={s}
              onClick={() => i === 0 ? mapRef.current?.zoomIn() : mapRef.current?.zoomOut()}
              style={{
                width: 32, height: 32, border: `1px solid ${borderColor}`,
                background: sidebarBg, color: textPrimary,
                borderRadius: i === 0 ? "8px 8px 2px 2px" : "2px 2px 8px 8px",
                fontSize: 18, cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              }}
            >{s}</button>
          ))}
        </div>

        {/* Selected vehicle info chip */}
        {selectedVehicleObj && (
          <div style={{
            position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
            zIndex: 1000, background: sidebarBg, borderRadius: 10,
            border: `1px solid ${borderColor}`,
            padding: "8px 14px", display: "flex", alignItems: "center", gap: 10,
            boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: 4,
              background: `#${selectedVehicleObj.route_color}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: "#fff",
            }}>{selectedVehicleObj.route_short_name}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: textPrimary }}>{selectedVehicleObj.headsign}</div>
              <div style={{ fontSize: 10, color: textSecondary }}>
                {selectedVehicleObj.speed > 0 ? `${Math.round(selectedVehicleObj.speed)} km/h` : "À l'arrêt"} · ID {selectedVehicleObj.id}
              </div>
            </div>
            <button
              onClick={() => setSelectedVehicle(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: textSecondary, fontSize: 14, padding: 2 }}
            >✕</button>
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${borderColor}; border-radius: 2px; }
        .leaflet-popup-content-wrapper {
          border-radius: 10px !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2) !important;
          padding: 0 !important;
          overflow: hidden;
          border: 1px solid ${borderColor} !important;
        }
        .leaflet-popup-content { margin: 0 !important; }
        .leaflet-popup-tip { display: none; }
        .leaflet-control-attribution { font-size: 9px !important; opacity: 0.5; }
        .leaflet-control-zoom { display: none; }
      `}</style>
    </div>
  );
}
