// classifyVehicleType.js
// Utilitaire partagé entre le build (scripts/build-network.mjs, Node) et le
// client (useVehiclesGeneric.js, navigateur) : classe une ligne "bus" ou
// "bustram" (BHNS / lignes premium) selon un préfixe de nom de ligne
// configurable par réseau (ex: "T" pour les lignes T1-T5 de Tango à Nîmes).

export function classifyVehicleType(shortName, busTramPrefixes = []) {
  const name = String(shortName || "").toUpperCase();
  if (busTramPrefixes.some(p => name.startsWith(String(p).toUpperCase()))) return "bustram";
  return "bus";
}
