/**
 * Script de pré-génération des données GTFS
 * Génère public/gtfs-data.json avec les tracés et arrêts par ligne
 * Usage : node scripts/generate-gtfs-data.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');

function parseCSV(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cols[i] || '').trim(); });
    return obj;
  });
}

console.log('Chargement des fichiers GTFS...');
const routes = parseCSV(path.join(PUBLIC, 'routes.txt'));
const trips = parseCSV(path.join(PUBLIC, 'trips.txt'));
const stops = parseCSV(path.join(PUBLIC, 'stops.txt'));
const stopTimes = parseCSV(path.join(PUBLIC, 'stop_times.txt'));

console.log(`Routes: ${routes.length}, Trips: ${trips.length}, Stops: ${stops.length}, StopTimes: ${stopTimes.length}`);

// Index stops par stop_id
const stopsMap = new Map();
stops.forEach(s => stopsMap.set(s.stop_id, s));

// Index trips par route_id
const tripsByRoute = new Map();
trips.forEach(t => {
  if (!tripsByRoute.has(t.route_id)) tripsByRoute.set(t.route_id, []);
  tripsByRoute.get(t.route_id).push(t);
});

// Index stop_times par trip_id
const stopTimesByTrip = new Map();
stopTimes.forEach(st => {
  if (!stopTimesByTrip.has(st.trip_id)) stopTimesByTrip.set(st.trip_id, []);
  stopTimesByTrip.get(st.trip_id).push(st);
});

const result = {};

routes.forEach(route => {
  const routeId = route.route_id;
  const routeTrips = tripsByRoute.get(routeId) || [];

  // Séparer par direction (0 et 1)
  const byDirection = { 0: [], 1: [] };
  routeTrips.forEach(t => {
    const dir = t.direction_id === '1' ? 1 : 0;
    byDirection[dir].push(t);
  });

  // Pour chaque direction, trouver le trip avec le plus d'arrêts comme tracé représentatif
  const getTrace = (tripList) => {
    let best = null;
    let bestLen = 0;
    tripList.forEach(t => {
      const sts = stopTimesByTrip.get(t.trip_id) || [];
      if (sts.length > bestLen) { best = t; bestLen = sts.length; }
    });
    if (!best) return [];
    const sts = (stopTimesByTrip.get(best.trip_id) || [])
      .sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));
    return sts.map(st => {
      const stop = stopsMap.get(st.stop_id);
      if (!stop || !stop.stop_lat) return null;
      return {
        id: st.stop_id,
        name: stop.stop_name,
        lat: parseFloat(stop.stop_lat),
        lon: parseFloat(stop.stop_lon),
        seq: parseInt(st.stop_sequence),
      };
    }).filter(Boolean);
  };

  const trace0 = getTrace(byDirection[0]);
  const trace1 = getTrace(byDirection[1]);

  // Tous les arrêts uniques de la ligne
  const allStopIds = new Set();
  routeTrips.forEach(t => {
    (stopTimesByTrip.get(t.trip_id) || []).forEach(st => allStopIds.add(st.stop_id));
  });
  const allStops = Array.from(allStopIds).map(id => {
    const s = stopsMap.get(id);
    if (!s || !s.stop_lat) return null;
    return { id, name: s.stop_name, lat: parseFloat(s.stop_lat), lon: parseFloat(s.stop_lon) };
  }).filter(Boolean);

  result[routeId] = {
    short_name: route.route_short_name,
    long_name: route.route_long_name,
    color: route.route_color,
    text_color: route.route_text_color,
    type: parseInt(route.route_type),
    traces: { 0: trace0, 1: trace1 },
    stops: allStops,
  };
});

const outPath = path.join(PUBLIC, 'gtfs-data.json');
fs.writeFileSync(outPath, JSON.stringify(result));
const size = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(`✅ Généré : public/gtfs-data.json (${size} KB) avec ${Object.keys(result).length} lignes`);
