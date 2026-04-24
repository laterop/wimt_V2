#!/usr/bin/env node
// Génère public/stops/{stop_id}.json + public/stop-meta.json (index de recherche)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "../public");
const stopsDir = path.join(publicDir, "stops");
if (!fs.existsSync(stopsDir)) fs.mkdirSync(stopsDir);

function parseCsv(raw) {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r/g, "");
  const lines = text.split("\n").filter(l => l.trim());
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.split(",");
    const obj = {};
    headers.forEach((h, i) => obj[h] = (cols[i] || "").trim());
    return obj;
  });
}

// ── Routes ──────────────────────────────────────────────────────────────────
console.log("Chargement routes.txt...");
const routes = parseCsv(fs.readFileSync(path.join(publicDir, "routes.txt"), "utf8"));
const routeMap = {};
const TRAM_IDS = new Set();
const BRT_IDS  = new Set();
for (const r of routes) {
  routeMap[r.route_id] = { n: r.route_short_name, c: r.route_color, t: r.route_type };
  if (r.route_type === "0" || ["1","2","3","4","5"].includes(r.route_short_name)) TRAM_IDS.add(r.route_id);
  if (r.route_short_name === "A") BRT_IDS.add(r.route_id);
}

// ── Trips ────────────────────────────────────────────────────────────────────
console.log("Chargement trips.txt...");
const trips = parseCsv(fs.readFileSync(path.join(publicDir, "trips.txt"), "utf8"));
const tripMap = {};
for (const t of trips) {
  tripMap[t.trip_id] = { route_id: t.route_id, h: t.trip_headsign, d: t.direction_id, s: t.service_id };
}

// ── Stop names ────────────────────────────────────────────────────────────────
console.log("Chargement stops.txt...");
const stopsRaw = parseCsv(fs.readFileSync(path.join(publicDir, "stops.txt"), "utf8"));
const stopNames = {}; // stop_id -> { name, lat, lon }
for (const s of stopsRaw) {
  const lat = parseFloat(s.stop_lat);
  const lon = parseFloat(s.stop_lon);
  if (s.stop_name && !isNaN(lat) && !isNaN(lon)) {
    stopNames[s.stop_id] = { name: s.stop_name.trim(), lat, lon };
  }
}

// ── Stop_times ────────────────────────────────────────────────────────────────
console.log("Chargement stop_times.txt...");
const raw = fs.readFileSync(path.join(publicDir, "stop_times.txt"), "utf8");
const text = raw.replace(/^\uFEFF/, "").replace(/\r/g, "");
const lines = text.split("\n");
const headers = lines[0].split(",").map(h => h.trim());
const stopIdIdx = headers.indexOf("stop_id");
const depIdx    = headers.indexOf("departure_time");
const tripIdIdx = headers.indexOf("trip_id");

const index = {}; // stop_id -> [ {dep, n, c, h, d, s} ]
const stopTypes = {}; // stop_id -> Set of "tram"|"brt"|"bus"

let count = 0;
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  const cols = line.split(",");
  const stop_id  = (cols[stopIdIdx] || "").trim();
  const dep      = (cols[depIdx]    || "").trim();
  const trip_id  = (cols[tripIdIdx] || "").trim();
  if (!stop_id || !dep || !trip_id) continue;
  const trip = tripMap[trip_id];
  if (!trip) continue;
  const route = routeMap[trip.route_id];
  if (!route) continue;

  // Détecter le type
  let vtype = "bus";
  if (TRAM_IDS.has(trip.route_id)) vtype = "tram";
  else if (BRT_IDS.has(trip.route_id)) vtype = "brt";

  if (!index[stop_id]) { index[stop_id] = []; stopTypes[stop_id] = new Set(); }
  stopTypes[stop_id].add(vtype);
  index[stop_id].push({ dep, n: route.n, c: route.c, h: trip.h, d: trip.d, s: trip.s });
  count++;
}

console.log(`${count} passages pour ${Object.keys(index).length} arrêts.`);

// ── Écriture des fichiers par stop ────────────────────────────────────────────
const seen_keys = {};
for (const [stop_id, passages] of Object.entries(index)) {
  const seen = new Set();
  const deduped = [];
  for (const p of passages) {
    const key = `${p.dep}|${p.n}|${p.h}`;
    if (!seen.has(key)) { seen.add(key); deduped.push(p); }
  }
  deduped.sort((a, b) => a.dep.localeCompare(b.dep));
  // Ajouter les types de lignes qui desservent cet arrêt
  deduped._types = [...stopTypes[stop_id]];
  fs.writeFileSync(path.join(stopsDir, `${stop_id}.json`), JSON.stringify(deduped));
}

// ── Index de recherche (stop-meta.json) ───────────────────────────────────────
// Grouper les stops par nom (insensible à la casse) et rassembler les stop_ids par type
const nameGroups = {}; // nom normalisé -> { displayName, entries: [{id, lat, lon, types}] }

for (const [stop_id, { name, lat, lon }] of Object.entries(stopNames)) {
  if (!index[stop_id]) continue; // pas de passages, on ignore
  const key = name.toLowerCase().trim();
  if (!nameGroups[key]) nameGroups[key] = { name, entries: [] };
  nameGroups[key].entries.push({
    id: stop_id,
    lat, lon,
    types: [...(stopTypes[stop_id] || new Set())],
  });
}

// Aplatir en tableau pour la recherche
const meta = Object.values(nameGroups).map(g => ({
  name: g.name,
  entries: g.entries,
}));

fs.writeFileSync(path.join(publicDir, "stop-meta.json"), JSON.stringify(meta));
const metaSize = fs.statSync(path.join(publicDir, "stop-meta.json")).size;
console.log(`✅ stop-meta.json: ${(metaSize/1024).toFixed(0)} KB | ${meta.length} noms distincts`);

const sizes = fs.readdirSync(stopsDir).map(f => fs.statSync(path.join(stopsDir, f)).size);
console.log(`✅ ${sizes.length} fichiers stops/ | Moy: ${(sizes.reduce((a,b)=>a+b,0)/sizes.length/1024).toFixed(1)} KB`);
