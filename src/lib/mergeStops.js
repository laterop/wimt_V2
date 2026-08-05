// mergeStops.js
// Regroupe les arrêts "aller" et "retour" d'un même point physique en un seul
// marqueur, pour ne pas doubler l'affichage sur la carte. Deux arrêts sont
// fusionnés s'ils ont le même nom (normalisé) et sont proches (< maxDistM).

function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeName(name) {
  return String(name || "").trim().toUpperCase();
}

export function mergeStopsByProximity(stops, maxDistM = 150) {
  const groups = [];

  for (const s of stops || []) {
    if (s.lat == null || s.lon == null || isNaN(s.lat) || isNaN(s.lon)) continue;
    const key = normalizeName(s.name);

    const group = groups.find(
      g => g.key === key && distKm(g.lat, g.lon, s.lat, s.lon) * 1000 < maxDistM
    );

    if (group) {
      group.members.push(s);
      group.lat = group.members.reduce((sum, m) => sum + m.lat, 0) / group.members.length;
      group.lon = group.members.reduce((sum, m) => sum + m.lon, 0) / group.members.length;
    } else {
      groups.push({ key, name: s.name, lat: s.lat, lon: s.lon, members: [s] });
    }
  }

  return groups.map(g => ({
    id: g.members.map(m => m.id).join("+"),
    name: g.name,
    lat: g.lat,
    lon: g.lon,
    count: g.members.length,
  }));
}
