// formatDelay.js
// Met en forme un retard (en secondes, tel que fourni par le flux GTFS-RT
// TripUpdate) en badge "+2" / "-1" / à l'heure, avec une couleur de statut.

export function formatDelay(delaySec) {
  if (delaySec == null || isNaN(delaySec)) return null;
  const min = Math.round(delaySec / 60);
  if (Math.abs(delaySec) < 60) return { label: "0", color: "#22c55e", title: "À l'heure" };
  const label = min > 0 ? `+${min}` : `${min}`;
  const color = min >= 5 ? "#ef4444" : min >= 1 ? "#f59e0b" : "#3b82f6";
  const title = min > 0 ? `${min} min de retard` : `${-min} min d'avance`;
  return { label, color, title };
}
