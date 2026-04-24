export default function Sidebar({
  isDark,
  sidebarBg,
  borderColor,
  textPrimary,
  textSecondary,
  cardBg,
  inputBg,
  vehicules,
  groupedVehicles,
  selectedVehicle,
  filtreLigne,
  setFiltreLigne,
  sortBy,
  setSortBy,
  expandedLines,
  setExpandedLines,
  lastUpdate,
  error,
  showPanel,
  setShowPanel,
  filters,
  toggleFilter,
  selectedRouteData,
  theme,
  setTheme,
  onVehicleClick,
  onRecenter,
}) {
  const typeIcon = { tram: "🚊", bustram: "🚌", bus: "🚌" };

  return (
    <aside style={{
      width: 320, minWidth: 320, height: "100vh",
      background: sidebarBg,
      borderRight: `1px solid ${borderColor}`,
      display: "flex", flexDirection: "column",
      overflow: "hidden", zIndex: 10,
    }}>

      {/* En-tête */}
      <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${borderColor}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: "linear-gradient(135deg,#0074c9,#00b4d8)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
            }}>🚍</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: textPrimary }}>TAM Live</div>
              <div style={{ fontSize: 10, color: textSecondary }}>Montpellier</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <button
              onClick={() => setShowPanel(p => !p)}
              style={{
                background: showPanel ? "#0074c9" : inputBg,
                border: "none", cursor: "pointer", borderRadius: 7,
                padding: "5px 8px", fontSize: 11,
                color: showPanel ? "#fff" : textSecondary,
              }}
            >⚙️ Filtres</button>
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              style={{
                background: inputBg, border: "none", cursor: "pointer",
                borderRadius: 7, padding: "5px 7px", fontSize: 13, color: textSecondary,
              }}
            >{isDark ? "☀️" : "🌙"}</button>
          </div>
        </div>

        {/* Panneau filtres */}
        {showPanel && (
          <div style={{
            background: cardBg, borderRadius: 10, padding: "10px 12px",
            border: `1px solid ${borderColor}`, marginBottom: 10,
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: textSecondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Véhicules
            </div>
            {[
              { key: "showTrams",    label: "Trams (L1-5)",  icon: "🚊", color: "#005CA9" },
              { key: "showBustrams", label: "BRT (Ligne A)", icon: "🚌", color: "#841931" },
              { key: "showBus",      label: "Bus",           icon: "🚌", color: "#FFB900" },
            ].map(({ key, label, icon, color }) => (
              <label key={key} onClick={() => toggleFilter(key)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer" }}>
                <div style={{
                  width: 32, height: 18, borderRadius: 9,
                  background: filters[key] ? color : (isDark ? "#333" : "#d1d5db"),
                  position: "relative", transition: "background 0.2s", flexShrink: 0,
                }}>
                  <div style={{
                    position: "absolute", top: 2,
                    left: filters[key] ? 16 : 2,
                    width: 14, height: 14, borderRadius: "50%",
                    background: "#fff", transition: "left 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }}></div>
                </div>
                <span style={{ fontSize: 12, color: textPrimary }}>{icon} {label}</span>
              </label>
            ))}

            <div style={{ fontSize: 10, fontWeight: 600, color: textSecondary, margin: "10px 0 8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Carte (ligne sélectionnée)
            </div>
            {[
              { key: "showTrace", label: "Tracé de la ligne", icon: "〰️" },
              { key: "showStops", label: "Arrêts",            icon: "🔵" },
            ].map(({ key, label, icon }) => (
              <label key={key} onClick={() => toggleFilter(key)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer" }}>
                <div style={{
                  width: 32, height: 18, borderRadius: 9,
                  background: filters[key] ? "#0074c9" : (isDark ? "#333" : "#d1d5db"),
                  position: "relative", transition: "background 0.2s", flexShrink: 0,
                }}>
                  <div style={{
                    position: "absolute", top: 2,
                    left: filters[key] ? 16 : 2,
                    width: 14, height: 14, borderRadius: "50%",
                    background: "#fff", transition: "left 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }}></div>
                </div>
                <span style={{ fontSize: 12, color: textPrimary }}>{icon} {label}</span>
              </label>
            ))}
            {(filters.showStops || filters.showTrace) && !selectedRouteData && (
              <div style={{ marginTop: 6, fontSize: 10, color: textSecondary, fontStyle: "italic" }}>
                ↑ Clique sur un véhicule pour activer
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { label: "Trams", value: vehicules.filter(v => v.vehicleType === "tram").length,    color: "#005CA9" },
            { label: "BRT",   value: vehicules.filter(v => v.vehicleType === "bustram").length, color: "#841931" },
            { label: "Bus",   value: vehicules.filter(v => v.vehicleType === "bus").length,     color: "#f59e0b" },
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, background: cardBg, borderRadius: 8, padding: "7px 8px",
              textAlign: "center", border: `1px solid ${borderColor}`,
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: textSecondary, marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recherche + tri */}
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${borderColor}`, display: "flex", gap: 6, flexDirection: "column" }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: textSecondary, fontSize: 12, pointerEvents: "none" }}>🔍</span>
          <input
            type="text"
            placeholder="Ligne ou direction..."
            value={filtreLigne}
            onChange={e => setFiltreLigne(e.target.value)}
            style={{
              width: "100%", padding: "7px 9px 7px 28px",
              background: inputBg, border: `1px solid ${borderColor}`,
              borderRadius: 8, color: textPrimary, fontSize: 12,
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{
              flex: 1, padding: "5px 7px",
              background: inputBg, border: `1px solid ${borderColor}`,
              borderRadius: 7, color: textSecondary, fontSize: 11,
              outline: "none", cursor: "pointer",
            }}
          >
            <option value="ligne">Par ligne</option>
            <option value="speed">Par vitesse</option>
            <option value="direction">Par direction</option>
          </select>
          <button
            onClick={onRecenter}
            style={{
              padding: "5px 9px", background: inputBg,
              border: `1px solid ${borderColor}`, borderRadius: 7,
              color: textSecondary, fontSize: 11, cursor: "pointer",
            }}
            title="Recentrer"
          >⌖</button>
        </div>
      </div>

      {/* Statut */}
      <div style={{
        padding: "5px 14px", fontSize: 10, color: textSecondary,
        borderBottom: `1px solid ${borderColor}`,
        display: "flex", alignItems: "center", gap: 5,
      }}>
        <span style={{
          display: "inline-block", width: 6, height: 6, borderRadius: "50%",
          background: error ? "#ef4444" : lastUpdate ? "#22c55e" : "#f59e0b",
        }}></span>
        {error
          ? "Erreur de connexion"
          : lastUpdate
            ? `Mis à jour à ${lastUpdate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
            : "Chargement..."}
      </div>

      {/* Liste des véhicules groupés par ligne */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {Object.entries(groupedVehicles).map(([line, { vehicles, color, type }]) => {
          const isExpanded = expandedLines[line] !== false;
          const lineColor = `#${color}`;
          return (
            <div key={line}>
              <button
                onClick={() => setExpandedLines(prev => ({ ...prev, [line]: !prev[line] }))}
                style={{
                  width: "100%", padding: "7px 14px",
                  display: "flex", alignItems: "center", gap: 8,
                  background: "none", border: "none", cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{
                  minWidth: 30, height: 20, borderRadius: 5,
                  background: lineColor, color: "#fff",
                  fontSize: 10, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "0 5px",
                }}>{line}</div>
                <span style={{ fontSize: 10, color: textSecondary, flexShrink: 0 }}>{typeIcon[type]}</span>
                <span style={{
                  flex: 1, fontSize: 11, color: textSecondary, fontWeight: 500,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {vehicles[0]?.headsign !== "Direction inconnue" ? vehicles[0]?.headsign : ""}
                </span>
                <span style={{
                  fontSize: 10, color: lineColor, fontWeight: 600,
                  background: `${lineColor}18`, padding: "2px 5px", borderRadius: 8,
                }}>{vehicles.length}</span>
                <span style={{ fontSize: 10, color: textSecondary }}>{isExpanded ? "▾" : "▸"}</span>
              </button>

              {isExpanded && vehicles.map(v => (
                <div
                  key={v.id}
                  onClick={() => onVehicleClick(v)}
                  style={{
                    margin: "2px 8px 2px 14px", padding: "7px 9px", borderRadius: 7,
                    cursor: "pointer",
                    background: selectedVehicle === v.id ? `${lineColor}18` : cardBg,
                    border: `1px solid ${selectedVehicle === v.id ? `${lineColor}55` : borderColor}`,
                    display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s",
                  }}
                >
                  <div style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: v.speed > 0 ? "#22c55e" : "#f59e0b", flexShrink: 0,
                  }}></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: textPrimary, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {v.headsign}
                    </div>
                    <div style={{ fontSize: 9, color: textSecondary, marginTop: 1 }}>ID {v.id}</div>
                  </div>
                  {v.speed != null && v.speed > 0 && (
                    <div style={{ fontSize: 10, color: textSecondary, flexShrink: 0 }}>
                      {Math.round(v.speed)}<span style={{ fontSize: 8 }}> km/h</span>
                    </div>
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
  );
}
