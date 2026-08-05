#!/usr/bin/env node
/**
 * Génère les données statiques pour un réseau GTFS "standard" (hors Montpellier,
 * qui a son propre pipeline avec des fichiers custom LigneTram/BusLigne).
 *
 * Produit, dans le dossier de sortie :
 *   - gtfs-data.json  : par ligne, tracé (séquence d'arrêts) + liste d'arrêts.
 *                        Consommé par useNextStop (calcul du prochain arrêt).
 *   - lines.json      : par ligne, polyligne(s) géographique(s) issues de shapes.txt.
 *                        Consommé par useTracesGeneric (tracés permanents sur la carte).
 *   - stop-meta.json + stops/{stop_id}.json : index de recherche d'arrêts + prochains
 *                        passages. Consommé par ArretPanel.
 *
 * Usage : node scripts/build-network.mjs <source_gtfs_dir> <output_public_dir> [busTramPrefixes]
 * Exemple : node scripts/build-network.mjs /tmp/tango-gtfs public/nimes T
 *           (préfixes séparés par des virgules, ex: "T,BHNS" -> lignes T1, T2, BHNS1... classées "bustram")
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { classifyVehicleType } from "../src/lib/classifyVehicleType.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const [, , srcArg, outArg, prefixesArg] = process.argv;
if (!srcArg || !outArg) {
  console.error("Usage: node scripts/build-network.mjs <source_gtfs_dir> <output_public_dir> [busTramPrefixes]");
  process.exit(1);
}
const SRC = path.resolve(__dirname, "..", srcArg);
const OUT = path.resolve(__dirname, "..", outArg);
const STOPS_OUT = path.join(OUT, "stops");
const BUSTRAM_PREFIXES = (prefixesArg || "").split(",").map(s => s.trim()).filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(STOPS_OUT, { recursive: true });

// Retire les guillemets englobants d'un champ CSV (ex: '"ROUTE D\'ALES"' -> "ROUTE D'ALES")
function unquote(s) {
  const t = s.trim();
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') return t.slice(1, -1);
  return t;
}

function parseCsv(raw) {
  const text = raw.replace(/^﻿/, "").replace(/\r/g, "");
  const lines = text.split("\n").filter(l => l.trim());
  const headers = lines[0].split(",").map(h => unquote(h));
  const out = new Array(lines.length - 1);
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const obj = {};
    headers.forEach((h, j) => { obj[h] = unquote(cols[j] || ""); });
    out[i - 1] = obj;
  }
  return out;
}

function readCsv(file) {
  return parseCsv(fs.readFileSync(path.join(SRC, file), "utf8"));
}

console.log(`Lecture du GTFS source : ${SRC}`);
const routes = readCsv("routes.txt");
const trips = readCsv("trips.txt");
const stops = readCsv("stops.txt");
console.log(`Routes: ${routes.length}, Trips: ${trips.length}, Stops: ${stops.length}`);

// ── Calendrier (service_id actif par date, pour la fiche horaire) ─────────────
// Supporte les deux formats GTFS : calendar.txt (motif hebdomadaire récurrent,
// avec calendar_dates.txt en complément pour les exceptions) et/ou
// calendar_dates.txt seul (dates explicites, cas de Montpellier).
// On calcule ici, pour chaque date des ~90 prochains jours, l'ensemble des
// service_id actifs, et on l'écrit dans service-dates.json.
function buildServiceDates() {
  const calendarPath = path.join(SRC, "calendar.txt");
  const calendarDatesPath = path.join(SRC, "calendar_dates.txt");
  const hasCalendar = fs.existsSync(calendarPath);
  const hasCalendarDates = fs.existsSync(calendarDatesPath);
  if (!hasCalendar && !hasCalendarDates) return null;

  const DOW = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const toDate = (yyyymmdd) => {
    const y = +yyyymmdd.slice(0, 4), m = +yyyymmdd.slice(4, 6) - 1, d = +yyyymmdd.slice(6, 8);
    return new Date(y, m, d);
  };
  const fmt = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

  const byDate = {};
  const addDate = (date) => { if (!byDate[date]) byDate[date] = new Set(); return byDate[date]; };

  if (hasCalendar) {
    const cal = parseCsv(fs.readFileSync(calendarPath, "utf8"));
    const today = new Date();
    for (let i = 0; i < 90; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const date = fmt(d);
      for (const row of cal) {
        const start = row.start_date, end = row.end_date;
        if (start && date < start) continue;
        if (end && date > end) continue;
        if (row[DOW[d.getDay()]] === "1") addDate(date).add(row.service_id);
      }
    }
  }

  if (hasCalendarDates) {
    const cd = parseCsv(fs.readFileSync(calendarDatesPath, "utf8"));
    for (const row of cd) {
      const date = row.date?.trim();
      const sid = row.service_id?.trim();
      if (!date || !sid) continue;
      if (row.exception_type === "1") addDate(date).add(sid);
      else if (row.exception_type === "2" && byDate[date]) byDate[date].delete(sid);
    }
  }

  const out = {};
  for (const [date, sids] of Object.entries(byDate)) out[date] = [...sids];
  return out;
}

const serviceDates = buildServiceDates();
if (serviceDates) {
  fs.writeFileSync(path.join(OUT, "service-dates.json"), JSON.stringify(serviceDates));
  console.log(`✅ service-dates.json (${Object.keys(serviceDates).length} dates)`);
} else {
  console.log("⚠️  Pas de calendar.txt / calendar_dates.txt, service-dates.json non généré (fiche horaire limitée).");
}

const stopsMap = new Map();
stops.forEach(s => stopsMap.set(s.stop_id, s));

const tripsByRoute = new Map();
trips.forEach(t => {
  if (!tripsByRoute.has(t.route_id)) tripsByRoute.set(t.route_id, []);
  tripsByRoute.get(t.route_id).push(t);
});

// ── 1. gtfs-data.json (traces + stops par ligne, à partir de stop_times.txt) ──────
console.log("Lecture de stop_times.txt (peut être volumineux)...");
const stopTimesRaw = fs.readFileSync(path.join(SRC, "stop_times.txt"), "utf8")
  .replace(/^﻿/, "").replace(/\r/g, "");
const stLines = stopTimesRaw.split("\n");
const stHeaders = stLines[0].split(",").map(h => h.trim());
const idxTripId = stHeaders.indexOf("trip_id");
const idxStopId = stHeaders.indexOf("stop_id");
const idxSeq    = stHeaders.indexOf("stop_sequence");

const stopTimesByTrip = new Map();
for (let i = 1; i < stLines.length; i++) {
  const line = stLines[i];
  if (!line.trim()) continue;
  const cols = line.split(",");
  const trip_id = cols[idxTripId]?.trim();
  if (!trip_id) continue;
  if (!stopTimesByTrip.has(trip_id)) stopTimesByTrip.set(trip_id, []);
  stopTimesByTrip.get(trip_id).push({ stop_id: cols[idxStopId]?.trim(), stop_sequence: cols[idxSeq]?.trim() });
}

const gtfsData = {};

routes.forEach(route => {
  const routeId = route.route_id;
  const routeTrips = tripsByRoute.get(routeId) || [];

  const byDirection = { 0: [], 1: [] };
  routeTrips.forEach(t => {
    const dir = t.direction_id === "1" ? 1 : 0;
    byDirection[dir].push(t);
  });

  const getTrace = (tripList) => {
    let best = null, bestLen = 0;
    tripList.forEach(t => {
      const sts = stopTimesByTrip.get(t.trip_id) || [];
      if (sts.length > bestLen) { best = t; bestLen = sts.length; }
    });
    if (!best) return [];
    const sts = (stopTimesByTrip.get(best.trip_id) || [])
      .slice()
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

  const allStopIds = new Set();
  routeTrips.forEach(t => {
    (stopTimesByTrip.get(t.trip_id) || []).forEach(st => allStopIds.add(st.stop_id));
  });
  const allStops = Array.from(allStopIds).map(id => {
    const s = stopsMap.get(id);
    if (!s || !s.stop_lat) return null;
    return { id, name: s.stop_name, lat: parseFloat(s.stop_lat), lon: parseFloat(s.stop_lon) };
  }).filter(Boolean);

  gtfsData[routeId] = {
    short_name: route.route_short_name,
    long_name: route.route_long_name,
    color: route.route_color,
    text_color: route.route_text_color,
    type: parseInt(route.route_type) || 3,
    traces: { 0: trace0, 1: trace1 },
    stops: allStops,
  };
});

fs.writeFileSync(path.join(OUT, "gtfs-data.json"), JSON.stringify(gtfsData));
console.log(`✅ gtfs-data.json (${Object.keys(gtfsData).length} lignes)`);

// ── 2. lines.json (tracés géographiques depuis shapes.txt) ────────────────────────
const shapesPath = path.join(SRC, "shapes.txt");
const linesOut = {};

if (fs.existsSync(shapesPath)) {
  console.log("Lecture de shapes.txt...");
  const shapesRaw = fs.readFileSync(shapesPath, "utf8").replace(/^﻿/, "").replace(/\r/g, "");
  const shLines = shapesRaw.split("\n");
  const shHeaders = shLines[0].split(",").map(h => h.trim());
  const idxShapeId = shHeaders.indexOf("shape_id");
  const idxLat = shHeaders.indexOf("shape_pt_lat");
  const idxLon = shHeaders.indexOf("shape_pt_lon");
  const idxPtSeq = shHeaders.indexOf("shape_pt_sequence");

  const shapePoints = new Map(); // shape_id -> [{lat,lon,seq}]
  for (let i = 1; i < shLines.length; i++) {
    const line = shLines[i];
    if (!line.trim()) continue;
    const cols = line.split(",");
    const shapeId = cols[idxShapeId]?.trim();
    if (!shapeId) continue;
    if (!shapePoints.has(shapeId)) shapePoints.set(shapeId, []);
    shapePoints.get(shapeId).push({
      lat: parseFloat(cols[idxLat]),
      lon: parseFloat(cols[idxLon]),
      seq: parseInt(cols[idxPtSeq]),
    });
  }
  shapePoints.forEach(pts => pts.sort((a, b) => a.seq - b.seq));

  // Nombre de trips par shape_id (pour choisir le tracé le plus représentatif)
  const tripCountByShape = new Map();
  trips.forEach(t => {
    if (!t.shape_id) return;
    tripCountByShape.set(t.shape_id, (tripCountByShape.get(t.shape_id) || 0) + 1);
  });

  routes.forEach(route => {
    const routeId = route.route_id;
    const routeTrips = tripsByRoute.get(routeId) || [];
    const byDirection = { 0: [], 1: [] };
    routeTrips.forEach(t => {
      const dir = t.direction_id === "1" ? 1 : 0;
      if (t.shape_id) byDirection[dir].push(t.shape_id);
    });

    const segments = [];
    [0, 1].forEach(dir => {
      const shapeIds = byDirection[dir];
      if (shapeIds.length === 0) return;
      // shape_id le plus fréquent pour cette direction
      const counts = new Map();
      shapeIds.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
      const bestShapeId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const pts = shapePoints.get(bestShapeId);
      if (pts && pts.length > 1) {
        segments.push(pts.map(p => [p.lat, p.lon]));
      }
    });

    if (segments.length > 0) {
      linesOut[route.route_short_name || routeId] = {
        color: `#${route.route_color || "888888"}`,
        textColor: `#${route.route_text_color || "FFFFFF"}`,
        type: classifyVehicleType(route.route_short_name || routeId, BUSTRAM_PREFIXES),
        segments,
      };
    }
  });

  fs.writeFileSync(path.join(OUT, "lines.json"), JSON.stringify(linesOut));
  console.log(`✅ lines.json (${Object.keys(linesOut).length} lignes tracées)`);
} else {
  console.log("⚠️  Pas de shapes.txt trouvé, lines.json non généré.");
}

// ── 3. stop-meta.json + stops/{stop_id}.json (index arrêts + passages) ────────────
console.log("Construction de l'index arrêts (à partir de stop_times.txt)...");

const idxDep = stHeaders.indexOf("departure_time");
const tripMap = new Map();
trips.forEach(t => tripMap.set(t.trip_id, t));
const routeMap = new Map();
routes.forEach(r => routeMap.set(r.route_id, r));

const index = {}; // stop_id -> [{dep, n, c, h, d, s}]
let count = 0;
for (let i = 1; i < stLines.length; i++) {
  const line = stLines[i];
  if (!line.trim()) continue;
  const cols = line.split(",");
  const stop_id = cols[idxStopId]?.trim();
  const dep = cols[idxDep]?.trim();
  const trip_id = cols[idxTripId]?.trim();
  if (!stop_id || !dep || !trip_id) continue;
  const trip = tripMap.get(trip_id);
  if (!trip) continue;
  const route = routeMap.get(trip.route_id);
  if (!route) continue;

  if (!index[stop_id]) index[stop_id] = [];
  index[stop_id].push({
    dep,
    n: route.route_short_name,
    c: route.route_color,
    h: trip.trip_headsign,
    d: trip.direction_id,
    s: trip.service_id,
  });
  count++;
}
console.log(`${count} passages pour ${Object.keys(index).length} arrêts.`);

// ArretPanel attend le vocabulaire "brt" (pas "bustram") pour les lignes premium,
// cf. TYPE_CONFIG dans src/components/ArretPanel.jsx.
const stopTypeOf = (routeShortName) =>
  classifyVehicleType(routeShortName, BUSTRAM_PREFIXES) === "bustram" ? "brt" : "bus";

for (const [stop_id, passages] of Object.entries(index)) {
  const seen = new Set();
  const deduped = [];
  const typesSet = new Set();
  for (const p of passages) {
    const key = `${p.dep}|${p.n}|${p.h}`;
    if (!seen.has(key)) { seen.add(key); deduped.push(p); }
    typesSet.add(stopTypeOf(p.n));
  }
  deduped.sort((a, b) => a.dep.localeCompare(b.dep));
  deduped._types = [...typesSet];
  fs.writeFileSync(path.join(STOPS_OUT, `${stop_id}.json`), JSON.stringify(deduped));
}

const nameGroups = {};
for (const s of stops) {
  const lat = parseFloat(s.stop_lat);
  const lon = parseFloat(s.stop_lon);
  if (!s.stop_name || isNaN(lat) || isNaN(lon)) continue;
  if (!index[s.stop_id]) continue;
  const key = s.stop_name.toLowerCase().trim();
  if (!nameGroups[key]) nameGroups[key] = { name: s.stop_name.trim(), entries: [] };
  const types = [...new Set(index[s.stop_id].map(p => stopTypeOf(p.n)))];
  nameGroups[key].entries.push({ id: s.stop_id, lat, lon, types });
}
const meta = Object.values(nameGroups);
fs.writeFileSync(path.join(OUT, "stop-meta.json"), JSON.stringify(meta));
console.log(`✅ stop-meta.json (${meta.length} noms distincts)`);

const sizes = fs.readdirSync(STOPS_OUT).map(f => fs.statSync(path.join(STOPS_OUT, f)).size);
console.log(`✅ ${sizes.length} fichiers stops/`);
console.log(`\nTerminé. Sortie : ${OUT}`);
