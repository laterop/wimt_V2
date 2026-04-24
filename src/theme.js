export function getTheme(isDark) {
  return {
    isDark,
    bg:            isDark ? "#0f1117"  : "#eef1f7",
    panelBg:       isDark ? "#16181f"  : "#ffffff",
    cardBg:        isDark ? "#1e2130"  : "#f4f6fb",
    inputBg:       isDark ? "#1e2130"  : "#f0f2f8",
    border:        isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
    borderStrong:  isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
    text:          isDark ? "#f0f2f7"  : "#0f172a",
    textSub:       isDark ? "#7a7f94"  : "#64748b",
    textHint:      isDark ? "#4a4f62"  : "#94a3b8",
    mapTile:       isDark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    accent: "#0074c9",
  };
}
