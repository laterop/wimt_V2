// stopSchedule.js
// Logique partagée (calendrier, prochains passages, correspondance véhicule)
// entre ArretPanel.jsx (onglet Arrêt) et StopDetail.jsx (panneau ouvert
// depuis le clic sur une ligne). Aucune dépendance React ici.

import { countStopsAway } from "../hooks/useNextStop";
import { BASE } from "../base.js";

// ─── Calendrier ────────────────────────────────────────────────────────────────
// service-dates.json : { "YYYYMMDD": [service_id, ...] }. Pas toujours présent
// (réseau sans calendar.txt/calendar_dates.txt exploitable) : dans ce cas on
// retombe sur un filtrage permissif (tout est considéré actif).

const serviceDatesCache = new Map();
export async function loadServiceDates(dataBase) {
  if (serviceDatesCache.has(dataBase)) return serviceDatesCache.get(dataBase);
  let data = null;
  try {
    const r = await fetch(`${BASE}${dataBase}service-dates.json`);
    if (r.ok) data = await r.json();
  } catch { /* pas de fiche de calendrier pour ce réseau */ }
  serviceDatesCache.set(dataBase, data);
  return data;
}

export function fmtDate(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
export function dateFromStr(s) {
  return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
}
export function addDaysStr(s, n) {
  const d = dateFromStr(s);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}
// Choisit une date par défaut pour la fiche horaire : aujourd'hui si connue,
// sinon la date connue la plus proche (avenir en priorité).
export function pickDefaultDate(serviceDates) {
  const today = fmtDate(new Date());
  if (!serviceDates) return today;
  const dates = Object.keys(serviceDates).sort();
  if (dates.includes(today)) return today;
  const future = dates.find(d => d > today);
  return future || dates[dates.length - 1] || today;
}

export const DOW_LABELS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
export function ficheDateLabel(dateStr) {
  if (!dateStr) return "";
  const d = dateFromStr(dateStr);
  return `${DOW_LABELS[d.getDay()]} ${d.getDate()} ${d.toLocaleDateString("fr-FR", { month: "long" })}`;
}

// En GTFS, les services qui finissent après minuit utilisent des heures > 24
// (ex: 25:30 = 1h30 du matin le lendemain du jour de service).
// Si on est entre minuit et 4h du matin, on est potentiellement encore dans
// la journée de service de la veille : on calcule les timestamps sur deux bases
// (minuit d'aujourd'hui ET minuit d'hier) et on retourne les deux.
export function depToTimestamps(dep) {
  const parts = dep.split(":");
  if (parts.length < 2) return [];
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parseInt(parts[2] || "0", 10);
  const secs = h * 3600 + m * 60 + s;

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
  const yesterdayMidnight = todayMidnight - 86400;

  const results = [todayMidnight + secs];
  if (now.getHours() < 4) {
    results.push(yesterdayMidnight + secs);
  }
  return results;
}

// Jour de service effectif : si on est entre minuit et 4h, le service actif
// peut être celui de la veille (services nocturnes > 24h en GTFS).
function getServiceDays() {
  const now = new Date();
  const dow = now.getDay(); // 0=dim, 1=lun, ..., 6=sam
  const days = [dow];
  if (now.getHours() < 4) {
    days.push((dow + 6) % 7);
  }
  return days;
}

// Fallback heuristique quand aucun service-dates.json n'est disponible pour
// ce réseau (pas de calendar.txt/calendar_dates.txt exploitable au build).
export function isServiceActiveFallback(serviceId) {
  const days = getServiceDays();
  const id = (serviceId || "").toUpperCase();

  const isWeekday = (d) => d >= 1 && d <= 5;
  const isSat     = (d) => d === 6;
  const isSun     = (d) => d === 0;

  if (id.includes("LAV") || id.includes("SEMAINE") || id.includes("RED")) {
    return days.some(isWeekday);
  }
  if (id.includes("SAM") || id.includes("SAMEDI")) {
    return days.some(isSat);
  }
  if (id.includes("DIM") || id.includes("DIMANCHE")) {
    return days.some(isSun);
  }
  return true;
}

// Ensemble des service_id actifs "aujourd'hui" pour le live (inclut la veille
// si on est avant 4h du matin, cf. depToTimestamps).
export function activeServiceIdsNow(serviceDates) {
  if (!serviceDates) return null;
  const today = fmtDate(new Date());
  const ids = new Set(serviceDates[today] || []);
  if (new Date().getHours() < 4) {
    for (const id of serviceDates[addDaysStr(today, -1)] || []) ids.add(id);
  }
  return ids;
}

// ─── Véhicule le plus proche d'un passage ──────────────────────────────────────
// Trouve le meilleur candidat-véhicule pour un passage donné.
// On cherche parmi les véhicules de la même ligne+direction celui dont le prochain
// arrêt (ou un arrêt à venir dans la séquence) correspond à l'arrêt cible.
// On préfère le véhicule le plus avancé (le plus proche dans la séquence).
export function findVehicle(vehicules, nextStops, passage, stopId) {
  const candidates = vehicules.filter(v =>
    v.route_short_name === passage.name &&
    String(v.direction_id) === String(passage.dir)
  );
  if (candidates.length === 0) return null;

  const scored = [];
  for (const v of candidates) {
    const ns = nextStops.get(v.id);
    if (!ns) continue;
    const info = countStopsAway(ns, stopId);
    if (info === null) continue;
    scored.push({ v, ns, info, stopsAway: info.stopsAway });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => a.stopsAway - b.stopsAway);
  return scored[0];
}

export const TYPE_CONFIG = {
  tram: { label: "Tram", icon: "🚊", color: "#3b8eea", bg: "rgba(59,142,234,0.12)" },
  brt:  { label: "BusTram",  icon: "🚌", color: "#e87fa3", bg: "rgba(232,127,163,0.12)" },
  bus:  { label: "Bus",  icon: "🚌", color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
};

export const TYPE_ORDER = ["tram", "brt", "bus"];
