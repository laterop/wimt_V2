export default function Sidebar({ theme, vehicules, groupedVehicles, selectedVehicle, onVehicleClick }) {
  const { isDark, panelBg, cardBg, border, text, textSub, textHint, accent } = theme;

  const counts = {
    tram:    vehicules.filter(v => v.vehicleType === "tram").length,
    bustram: vehicules.filter(v => v.vehicleType === "bustram").length,
    bus:     vehicules.filter(v => v.vehicleType === "bus").length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Stats */}
      <div style={{ padding: "12px 14px 10px", borderBottom: `0.5px solid ${border}` }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: textHint, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>En service</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { label: "Trams",   value: counts.tram,    color: "#3b8eea" },
            { label: "BRT",     value: counts.bustram, color: "#e87fa3" },
            { label: "Bus",     value: counts.bus,     color: isDark ? "#fbbf24" : "#b45309" },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: cardBg, borderRadius: 10, padding: "7px 6px", textAlign: "center", border: `0.5px solid ${border}` }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 9, color: textHint, marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Liste véhicules */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {Object.entries(groupedVehicles).map(([line, { vehicles, color, type }]) => {
          const lc = `#${color}`;
          return (
            <div key={line}>
              {/* En-tête de ligne */}
              <div style={{ padding: "8px 14px 4px", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ minWidth: 26, height: 20, borderRadius: 6, background: lc, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", padding: "0 5px" }}>{line}</div>
                <span style={{ fontSize: 11, color: textSub, fontWeight: 500 }}>
                  {type === "tram" ? "Tramway" : type === "bustram" ? "BRT" : "Bus"}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: lc, fontWeight: 600, background: `${lc}18`, padding: "1px 6px", borderRadius: 8 }}>{vehicles.length}</span>
              </div>

              {/* Véhicules de la ligne */}
              {vehicles.map(v => (
                <button
                  key={v.id}
                  onClick={() => onVehicleClick(v)}
                  style={{
                    width: "100%", margin: "1px 0", padding: "8px 14px",
                    background: selectedVehicle === v.id ? `${lc}14` : "none",
                    border: "none", borderLeft: `2.5px solid ${selectedVehicle === v.id ? lc : "transparent"}`,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 9,
                    textAlign: "left", transition: "all 0.12s",
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: (v.speed || 0) > 0 ? "#22c55e" : "#f59e0b", flexShrink: 0, display: "block" }}></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.headsign}</div>
                    <div style={{ fontSize: 10, color: textHint, marginTop: 1 }}>ID {v.id}</div>
                  </div>
                  {(v.speed || 0) > 0 && (
                    <div style={{ fontSize: 10, color: textSub, flexShrink: 0 }}>{Math.round(v.speed)}<span style={{ fontSize: 8 }}> km/h</span></div>
                  )}
                </button>
              ))}
            </div>
          );
        })}

        {Object.keys(groupedVehicles).length === 0 && (
          <div style={{ padding: "40px 20px", textAlign: "center", color: textHint, fontSize: 12 }}>
            {vehicules.length === 0 ? "Chargement..." : "Aucun résultat"}
          </div>
        )}
      </div>
    </div>
  );
}
