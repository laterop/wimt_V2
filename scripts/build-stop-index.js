#!/usr/bin/env node
// Génère public/stops/ : un fichier JSON par stop_id avec les passages

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

// Charger calendar.txt si présent (pour filtrer par jour)
let calendarMap = null;
const calendarPath = path.join(publicDir, "calendar.txt");
if (fs.existsSync(calendarPath)) {
  console.log("Chargement calendar.txt...");
  const cal = parseCsv(fs.readFileSync(calendarPath, "utf8"));
  calendarMap = {};
  for (const c of cal) calendarMap[c.service_id] = c;
}

console.log("Chargement routes.txt...");
const routes = parseCsv(fs.readFileSync(path.join(publicDir, "routes.txt"), "utf8"));
const routeMap = {};
for (const r of routes) {
  routeMap[r.route_id] = { n: r.route_short_name, c: r.route_color };
}

console.log("Chargement trips.txt...");
const trips = parseCsv(fs.readFileSync(path.join(publicDir, "trips.txt"), "utf8"));
const tripMap = {};
for (const t of trips) {
  tripMap[t.trip_id] = { route_id: t.route_id, h: t.trip_headsign, d: t.direction_id, s: t.service_id };
}

console.log("Chargement stop_times.txt...");
const raw = fs.readFileSync(path.join(publicDir, "stop_times.txt"), "utf8");
const text = raw.replace(/^\uFEFF/, "").replace(/\r/g, "");
const lines = text.split("\n");
const headers = lines[0].split(",").map(h => h.trim());

const stopIdIdx = headers.indexOf("stop_id");
const depIdx = headers.indexOf("departure_time");
const tripIdIdx = headers.indexOf("trip_id");

const index = {};
let count = 0;
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  const cols = line.split(",");
  const stop_id = (cols[stopIdIdx] || "").trim();
  const dep = (cols[depIdx] || "").trim();
  const trip_id = (cols[tripIdIdx] || "").trim();
  if (!stop_id || !dep || !trip_id) continue;
  const trip = tripMap[trip_id];
  if (!trip) continue;
  const route = routeMap[trip.route_id];
  if (!route) continue;
  if (!index[stop_id]) index[stop_id] = [];
  index[stop_id].push({ dep, ...route, h: trip.h, d: trip.d, s: trip.s });
  count++;
}

console.log(`${count} passages pour ${Object.keys(index).length} arrêts.`);

// Dédoublonnage et tri, puis écriture par stop
let fileCount = 0;
for (const [stop_id, passages] of Object.entries(index)) {
  // Dédoublonnage : même dep+n+h → garder une occurrence par service_id distinct
  const seen = new Set();
  const deduped = [];
  for (const p of passages) {
    const key = `${p.dep}|${p.n}|${p.h}`;
    if (!seen.has(key)) { seen.add(key); deduped.push(p); }
  }
  deduped.sort((a, b) => a.dep.localeCompare(b.dep));
  fs.writeFileSync(path.join(stopsDir, `${stop_id}.json`), JSON.stringify(deduped));
  fileCount++;
}

console.log(`✅ ${fileCount} fichiers générés dans public/stops/`);
const sizes = fs.readdirSync(stopsDir).map(f => fs.statSync(path.join(stopsDir, f)).size);
const totalMB = sizes.reduce((a, b) => a + b, 0) / 1024 / 1024;
const avgKB = sizes.reduce((a, b) => a + b, 0) / sizes.length / 1024;
console.log(`Total: ${totalMB.toFixed(1)} MB | Moy/fichier: ${avgKB.toFixed(1)} KB | Max: ${(Math.max(...sizes)/1024).toFixed(1)} KB`);
