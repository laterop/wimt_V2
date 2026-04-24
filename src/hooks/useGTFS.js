import Papa from "papaparse";
import protobuf from "protobufjs";

let gtfsCache = null;

export function getVehicleType(routeShortName, routeType) {
  const name = String(routeShortName).toUpperCase();
  if (["A"].includes(name)) return "bustram";
  if (routeType === 0 || ["1", "2", "3", "4", "5"].includes(name)) return "tram";
  return "bus";
}

export async function loadGTFS() {
  if (gtfsCache) return gtfsCache;

  const [routesText, tripsText, protoText, ligneTram, lignesBus, arretsTram, arretsBus] = await Promise.all([
    fetch("/routes.txt").then(r => r.text()),
    fetch("/trips.txt").then(r => r.text()),
    fetch("/gtfs-realtime.proto").then(r => r.text()),
    fetch("/LigneTram.json").then(r => r.json()),
    fetch("/BusLigne.json").then(r => r.json()),
    fetch("/ArretsTram.json").then(r => r.json()),
    fetch("/ArretsBus.json").then(r => r.json()),
  ]);

  const routes = new Map();
  Papa.parse(routesText, {
    header: true,
    skipEmptyLines: true,
    step: ({ data }) => routes.set(data.route_id?.trim(), data),
  });

  const trips = new Map();
  Papa.parse(tripsText, {
    header: true,
    skipEmptyLines: true,
    step: ({ data }) => trips.set(data.trip_id?.trim(), data),
  });

  const root = protobuf.parse(protoText).root;
  const FeedMessage = root.lookupType("transit_realtime.FeedMessage");

  // Index tracés tram par num_exploitation (aller/retour)
  const tramTraces = new Map();
  ligneTram.features.forEach(f => {
    const num = String(f.properties.num_exploitation);
    const coords = f.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    if (!tramTraces.has(num)) tramTraces.set(num, { aller: [], retour: [] });
    // Ne se fier qu'au mot "Retour"/"Aller" — ignorer V1/V2 (la ligne 3 a "Aller - V2" et "Retour - V1")
    if (f.properties.sens?.toLowerCase().includes("retour")) {
      tramTraces.get(num).retour = coords;
    } else {
      tramTraces.get(num).aller = coords;
    }
  });

  // Index tracés bus par num_commercial (aller/retour)
  const busTraces = new Map();
  lignesBus.features.forEach(f => {
    const num = String(f.properties.num_commercial);
    const coords = f.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    if (!busTraces.has(num)) busTraces.set(num, { aller: [], retour: [] });
    if (f.properties.sens?.toLowerCase().includes("retour")) {
      busTraces.get(num).retour = coords;
    } else {
      busTraces.get(num).aller = coords;
    }
  });

  // Arrêts tram indexés par numéro de ligne
  const tramStops = new Map();
  arretsTram.features.forEach(f => {
    const lignes = String(f.properties.lignes_passantes || "").split(",").map(l => l.trim());
    const [lon, lat] = f.geometry.coordinates;
    lignes.forEach(l => {
      if (!tramStops.has(l)) tramStops.set(l, []);
      tramStops.get(l).push({ name: f.properties.description, lat, lon });
    });
  });

  // Arrêts bus indexés par numéro de ligne
  const busStops = new Map();
  arretsBus.features.forEach(f => {
    const lignes = String(f.properties.lignes_passantes || "").split(",").map(l => l.trim());
    const [lon, lat] = f.geometry.coordinates;
    lignes.forEach(l => {
      if (!busStops.has(l)) busStops.set(l, []);
      busStops.get(l).push({ name: f.properties.description, lat, lon });
    });
  });

  gtfsCache = { routes, trips, FeedMessage, tramTraces, busTraces, tramStops, busStops };
  return gtfsCache;
}
