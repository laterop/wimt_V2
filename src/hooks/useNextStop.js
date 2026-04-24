// useNextStop.js
// Calcule le prochain arrêt de chaque véhicule en temps réel
// à partir des séquences d'arrêts GTFS et de la position GPS.

import { useState, useEffect, useRef } from "react";

let gtfsDataCache = null;
async function loadGtfsData() {
  if (gtfsDataCache) return gtfsDataCache;
  gtfsDataCache = await fetch("/gtfs-data.json").then(r => r.json());
  return gtfsDataCache;
}

// ─── Géométrie ────────────────────────────────────────────────────────────────

function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function angleToTarget(vLat, vLon, vBearing, tLat, tLon) {
  const dLon = (tLon - vLon) * Math.cos((vLat * Math.PI) / 180);
  const dLat = tLat - vLat;
  const bearing = ((Math.atan2(dLon, dLat) * 180) / Math.PI + 360) % 360;
  return Math.abs(((bearing - vBearing + 540) % 360) - 180);
}

// ─── Calcul du prochain arrêt pour un véhicule ────────────────────────────────
// Retourne :
//   { stopId, stopName, stopLat, stopLon, distM, seqIndex, fullSequence, isAtStop, currentStop }
// seqIndex : index dans fullSequence du prochain stop
// fullSequence : tableau ordonné des stops valides de la ligne+direction
export function computeNextStop(vehicle, gtfsData) {
  const line = gtfsData[vehicle.route_short_name];
  if (!line) return null;

  const dir = String(vehicle.direction_id ?? "0");
  const stops = line.traces?.[dir];
  if (!stops || stops.length === 0) return null;

  // Stops avec coords valides, on garde l'index original pour le comptage
  const fullSequence = stops
    .map((s, i) => ({
      ...s,
      lat: s.lat !== null ? parseFloat(s.lat) : null,
      lon: s.lon !== null ? parseFloat(s.lon) : null,
      origIdx: i,
    }))
    .filter(s => s.lat !== null && s.lon !== null && !isNaN(s.lat) && !isNaN(s.lon));

  if (fullSequence.length === 0) return null;

  const vLat = vehicle.lat;
  const vLon = vehicle.lon;
  const vBearing = vehicle.bearing ?? 0;
  const vSpeed = vehicle.speed ?? 0;

  // Distance de chaque stop au véhicule
  const withDist = fullSequence.map(s => ({
    ...s,
    dist: distKm(vLat, vLon, s.lat, s.lon),
  }));

  // Stop le plus proche
  const nearest = withDist.reduce((a, b) => (a.dist < b.dist ? a : b));
  const nearestDist = nearest.dist * 1000;

  // À l'arrêt si dist < 60m et vitesse faible
  const isAtStop = nearestDist < 60 && vSpeed < 2;

  let nextStop, seqIndex;

  if (isAtStop) {
    const nearestIdx = withDist.indexOf(nearest);
    const nextIdx = Math.min(nearestIdx + 1, withDist.length - 1);
    nextStop = withDist[nextIdx];
    seqIndex = nextIdx;
    return {
      stopId:       nextStop.id,
      stopName:     nextStop.name,
      stopLat:      nextStop.lat,
      stopLon:      nextStop.lon,
      distM:        nearestDist,
      seqIndex,
      fullSequence: withDist,
      isAtStop:     true,
      currentStop:  nearest.name,
      currentStopId: nearest.id,
    };
  }

  // Chercher le premier stop devant le véhicule (bearing < 90°)
  const sorted = [...withDist]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.dist - b.s.dist);

  let found = null;
  for (const { s, i: _i } of sorted.slice(0, 8)) {
    const angle = vBearing > 0
      ? angleToTarget(vLat, vLon, vBearing, s.lat, s.lon)
      : 180;
    if (angle < 90) { found = s; break; }
  }
  if (!found) found = sorted[0].s;

  seqIndex = withDist.indexOf(found);

  return {
    stopId:       found.id,
    stopName:     found.name,
    stopLat:      found.lat,
    stopLon:      found.lon,
    distM:        found.dist * 1000,
    seqIndex,
    fullSequence: withDist,
    isAtStop:     false,
    currentStop:  null,
    currentStopId: null,
  };
}

// Compte le nombre d'arrêts entre la position actuelle du véhicule et un stop cible.
// Retourne { stopsAway, prevStopName } ou null.
export function countStopsAway(nextStopInfo, targetStopId) {
  if (!nextStopInfo) return null;
  const { fullSequence, seqIndex } = nextStopInfo;

  // Chercher le stop cible dans la séquence à partir du prochain arrêt
  for (let i = seqIndex; i < fullSequence.length; i++) {
    if (String(fullSequence[i].id) === String(targetStopId)) {
      const stopsAway = i - seqIndex; // 0 = c'est le prochain, 1 = dans 1 arrêt, etc.
      const prevStop = seqIndex > 0 ? fullSequence[seqIndex - 1] : null;
      return {
        stopsAway,
        nextStopName: fullSequence[seqIndex]?.name,
        prevStopName: prevStop?.name || null,
      };
    }
  }
  return null; // pas trouvé (véhicule a dépassé l'arrêt ou mauvaise direction)
}

// ─── Hook React ───────────────────────────────────────────────────────────────

export function useNextStop(vehicules) {
  const [nextStops, setNextStops] = useState(new Map());
  const gtfsRef = useRef(null);

  useEffect(() => {
    loadGtfsData().then(data => { gtfsRef.current = data; });
  }, []);

  useEffect(() => {
    if (!gtfsRef.current || vehicules.length === 0) return;
    const map = new Map();
    for (const v of vehicules) {
      const result = computeNextStop(v, gtfsRef.current);
      if (result) map.set(v.id, result);
    }
    setNextStops(map);
  }, [vehicules]);

  return nextStops;
}
