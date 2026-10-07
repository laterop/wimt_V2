// Recherche de ligne dans la barre "Ligne ou arrêt...".
//
// Avant : un simple `includes` sur le numéro de ligne. Taper "4" gardait
// aussi 14, 41, 42, 43, T4, 74... et les tracés n'étaient jamais mis en
// valeur, donc visuellement rien ne se passait.
//
// Maintenant : si la saisie correspond exactement à une ligne ("4", "t4",
// "ligne 4"), on ne garde que celle-là ; sinon on garde les lignes dont le
// numéro commence par la saisie. Renvoie null si la saisie est vide, un Set
// (éventuellement vide) sinon.
export function matchLines(query, lineNames) {
  const q = (query || "").trim().toLowerCase().replace(/^ligne\s*/, "");
  if (!q) return null;
  const names = [...new Set(lineNames)].filter(Boolean);
  const exact = names.filter(n => n.toLowerCase() === q);
  if (exact.length) return new Set(exact);
  return new Set(names.filter(n => n.toLowerCase().startsWith(q)));
}

// Filtre véhicule commun à App.jsx et GenericApp.jsx.
export function vehicleMatchesSearch(v, query, searchedLines) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return true;
  if (searchedLines && searchedLines.size) return searchedLines.has(v.route_short_name);
  // Aucune ligne ne correspond : on cherche dans la destination.
  return (v.headsign || "").toLowerCase().includes(q);
}
