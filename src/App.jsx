import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import jsPDF from "jspdf";
import Papa from "papaparse";

const PulseIcon = (color) => L.divIcon({
  className: "custom-marker",
  html: `<div class="pulse-marker" style="background-color:#${color}; box-shadow: 0 0 1px 1px #${color};"></div>`,
  iconSize: [5, 10],
  iconAnchor: [5, 5],
});

function CenterMap({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 15);
    }
  }, [position, map]);
  return null;
}

export default function CarteTAM() {
  const [vehicules, setVehicules] = useState([]);
  const [filtreLigne, setFiltreLigne] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [sortBy, setSortBy] = useState("id");
  const mapRef = useRef(null);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("http://localhost:3001/api/vehicles");
        const data = await res.json();
        setVehicules(data);
      } catch (err) {
        console.error("Erreur chargement véhicules :", err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, []);

  const vehiculesFiltres = vehicules.filter(v =>
    v.route_short_name.toLowerCase().includes(filtreLigne.toLowerCase())
  );

  const sortedVehicles = [...vehiculesFiltres].sort((a, b) => {
    if (sortBy === "speed") return (b.speed || 0) - (a.speed || 0);
    if (sortBy === "direction") return a.headsign.localeCompare(b.headsign);
    return a.id.localeCompare(b.id);
  });

  // Regrouper les véhicules par ligne (utilise sortedVehicles)
  const groupedVehicles = sortedVehicles.reduce((acc, v) => {
    if (!acc[v.route_short_name]) acc[v.route_short_name] = [];
    acc[v.route_short_name].push(v);
    return acc;
  }, {});

  // Extraire les lignes uniques pour la légende (utilise sortedVehicles)
  const uniqueLines = Object.entries(groupedVehicles).map(([line, vehicles]) => ({
    line,
    color: vehicles[0]?.route_color || "000000",
  }));

  const centerMontpellier = () => {
    if (mapRef.current) {
      mapRef.current.setView([43.6117, 3.8767], 13);
      setSelectedVehicle(null);
    }
  };

  const handleVehicleClick = (v) => {
    if (mapRef.current) {
      mapRef.current.setView([v.lat, v.lon], 15);
      setSelectedVehicle(v.id);
    }
  };

  const exportToCSV = () => {
    const csv = Papa.unparse(sortedVehicles);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "vehicules.csv");
    link.click();
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(12);
    sortedVehicles.forEach((v, i) => {
      doc.text(`ID: ${v.id}, Ligne: ${v.route_short_name}, Dir: ${v.headsign}, Vit: ${Math.round(v.speed || 0)} km/h`, 10, 10 + i * 8);
    });
    doc.save("vehicules.pdf");
  };

  return (
    <div className={`${theme === "dark" ? "dark" : ""} flex bg-white dark:bg-gray-900 text-gray-900 dark:text-white h-screen`}>
      {/* Carte */}
      <div className="w-2/3 h-full">
        <MapContainer
          center={[43.6117, 3.8767]}
          zoom={13}
          className="h-full w-full z-0"
          whenCreated={mapInstance => { mapRef.current = mapInstance; }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap"
            url={
              theme === "dark"
                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            }
          />
          {sortedVehicles.map((v) => (
            <Marker
              key={v.id}
              position={[v.lat, v.lon]}
              icon={L.divIcon({
                html: `<div class="pulse-marker" style="background-color:#${v.route_color};"></div>`,
                className: "custom-icon",
                iconSize: [12, 12],
                iconAnchor: [6, 6]
              })}
            >
              <Popup>
                <strong>Ligne {v.route_short_name}</strong><br />
                Direction : {v.headsign}<br />
                ID : {v.id}<br />
                Vitesse : {Math.round(v.speed || null)} km/h<br />
                {v.speed === null ? "⛔ À l'arrêt" : "✅ En mouvement"}
              </Popup>
            </Marker>
          ))}
          {selectedVehicle && (() => {
            const v = vehicules.find(veh => veh.id === selectedVehicle);
            if (v) return <CenterMap position={[v.lat, v.lon]} />;
            return null;
          })()}
        </MapContainer>
      </div>

      {/* Sidebar */}
      <aside className="sidebar w-1/3 h-full overflow-y-auto bg-gray-50 dark:bg-gray-800 border-l border-gray-300 dark:border-gray-700 p-4">
        <h2 className="text-2xl font-bold mb-4">🚍 Véhicules détectés</h2>

        <button
          onClick={toggleTheme}
          className="mb-4 px-3 py-1 rounded text-sm bg-blue-500 hover:bg-blue-600 text-white"
        >
          Passer en mode {theme === "light" ? "sombre" : "clair"}
        </button>

        <button
          onClick={centerMontpellier}
          className="mb-4 px-3 py-1 rounded text-sm bg-green-500 hover:bg-green-600 text-white"
        >
          Centrer sur Montpellier
        </button>

        <input
          type="text"
          placeholder="Filtrer par ligne..."
          value={filtreLigne}
          onChange={(e) => setFiltreLigne(e.target.value)}
          className="w-full p-2 mb-4 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600"
        />

        <div className="mb-4 flex flex-wrap gap-2">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="p-1 rounded bg-white dark:bg-gray-700 border dark:border-gray-600">
            <option value="id">Trier par ID</option>
            <option value="speed">Trier par vitesse</option>
            <option value="direction">Trier par direction</option>
          </select>
          <button onClick={exportToCSV} className="px-2 py-1 bg-yellow-400 rounded text-xs">CSV</button>
          <button onClick={exportToPDF} className="px-2 py-1 bg-red-500 text-white rounded text-xs">PDF</button>
        </div>

        {/* Légende */}
        <div className="mb-4">
          <h3 className="font-semibold mb-2">Légende des lignes</h3>
          <div className="flex flex-wrap gap-2">
            {uniqueLines.map(({ line, color }) => (
              <span
                key={line}
                className="text-xs font-semibold px-2 py-1 rounded cursor-default"
                style={{ backgroundColor: `#${color}22`, color: `#${color}` }}
              >
                Ligne {line}
              </span>
            ))}
          </div>
        </div>

        {/* Liste regroupée des véhicules */}
        {Object.entries(groupedVehicles).map(([line, vehicles]) => (
          <div key={line} className="mb-5">
            <h4
              className="cursor-pointer text-lg font-bold mb-2 flex items-center"
              onClick={() => {
                if (vehicles.length > 0) {
                  const v = vehicles[0];
                  handleVehicleClick(v);
                }
              }}
              style={{ color: `#${vehicles[0]?.route_color}` }}
              title="Cliquer pour centrer sur cette ligne"
            >
              <span className="inline-block w-4 h-4 rounded-full mr-2" style={{ backgroundColor: `#${vehicles[0]?.route_color}` }}></span>
              Ligne {line} ({vehicles.length})
            </h4>
            <div className="space-y-2">
              {vehicles.map((v) => (
                <div
                  key={v.id}
                  onClick={() => handleVehicleClick(v)}
                  className={`p-3 rounded shadow cursor-pointer border-l-4 ${
                    selectedVehicle === v.id
                      ? "bg-blue-100 dark:bg-blue-900 border-blue-500"
                      : "bg-white dark:bg-gray-700 border-transparent hover:border-gray-400 dark:hover:border-gray-500"
                  }`}
                  style={{ borderColor: selectedVehicle === v.id ? `#${v.route_color}` : undefined }}
                  title={`Direction : ${v.headsign}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold" style={{ color: `#${v.route_color}` }}>
                      ID {v.id}
                    </span>
                    {v.speed && (
                      <span className="text-xs text-gray-600 dark:text-gray-300">
                        {Math.round(v.speed)} km/h
                      </span>
                    )}
                  </div>
                  <div className="text-sm truncate">Direction : {v.headsign}</div>
                  <div className="text-xs text-gray-500">
                    {v.speed === null ? "⛔ À l'arrêt" : "✅ En mouvement"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </aside>

      <style>{`
        .pulse-marker {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          animation: pulse 2s infinite;
          position: relative;
        }
        @keyframes pulse {
          0% {
            transform: scale(0.95);
            opacity: 0.7;
            box-shadow: 0 0 4px 1px currentColor;
          }
          50% {
            transform: scale(1.15);
            opacity: 0.3;
            box-shadow: 0 0 6px 3px currentColor;
          }
          100% {
            transform: scale(0.95);
            opacity: 0.7;
            box-shadow: 0 0 4px 1px currentColor;
          }
        }
        @media (max-width: 768px) {
          .sidebar {
            width: 100% !important;
            height: 40vh;
            position: absolute;
            bottom: 0;
            left: 0;
            overflow-y: scroll;
            background: rgba(255, 255, 255, 0.95);
          }
        }
      `}</style>
    </div>
  );
}
