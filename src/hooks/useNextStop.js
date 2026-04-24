// useNextStop.js
// Calcule le prochain arrêt de chaque véhicule en temps réel
// à partir des séquences d'arrêts GTFS et de la position GPS.

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

// Angle entre la direction du véhicule et la direction vers un point cible.
// Retourne 0..180.
function angleToTarget(vLat, vLon, vBearing, tLat, tLon) {
  const dLon = (tLon - vLon) * Math.cos((vLat * Math.PI) / 180);
  const dLat = tLat - vLat;
  const bearing = ((Math.atan2(dLon, dLat) * 180) / Math.PI + 360) % 360;
  return Math.abs(((bearing - vBearing + 540) % 360) - 180);
}

// ─── Calcul du prochain arrêt pour un véhicule ────────────────────────────────

// Renvoie { stopId, stopName, stopLat, stopLon, distM, seq, isAtStop }
// ou null si on ne peut pas déterminer.
export function computeNextStop(vehicle, gtfsData) {
  const line = gtfsData[vehicle.route_short_name];
  if (!line) return null;

  const dir = String(vehicle.direction_id ?? "0");
  const stops = line.traces?.[dir];
  if (!stops || stops.length === 0) return null;

  // Filtrer les stops avec coords valides
  const validStops = stops.filter(
    (s) =>
      s.lat !== null &&
      s.lon !== null &&
      !isNaN(parseFloat(s.lat)) &&
      !isNaN(parseFloat(s.lon))
  );
  if (validStops.length === 0) return null;

  const vLat = vehicle.lat;
  const vLon = vehicle.lon;
  const vBearing = vehicle.bearing ?? 0;
  const vSpeed = vehicle.speed ?? 0;

  // Calculer la distance à chaque stop
  const withDist = validStops.map((s) => ({
    ...s,
    lat: parseFloat(s.lat),
    lon: parseFloat(s.lon),
    dist: distKm(vLat, vLon, parseFloat(s.lat), parseFloat(s.lon)),
  }));

  // Trouver le stop le plus proche (toutes directions)
  const nearest = withDist.reduce((a, b) => (a.dist < b.dist ? a : b));
  const nearestDist = nearest.dist * 1000; // en mètres

  // Si le véhicule est à moins de 60m du stop et vitesse faible : il est À l'arrêt
  const isAtStop = nearestDist < 60 && vSpeed < 2;

  if (isAtStop) {
    // Il vient d'arriver ou est à l'arrêt : le prochain est le suivant dans la séquence
    const nearestIdx = withDist.indexOf(nearest);
    const nextStop = withDist[nearestIdx + 1] || nearest;
    return {
      stopId: nextStop.id,
      stopName: nextStop.name,
      stopLat: nextStop.lat,
      stopLon: nextStop.lon,
      distM: nextStop.dist * 1000,
      seq: nextStop.seq,
      isAtStop: true,
      currentStop: nearest.name,
    };
  }

  // Sinon : chercher le premier stop devant le véhicule (angle < 90° par rapport au bearing)
  // parmi les stops proches (on prend les N premiers par distance)
  const sorted = [...withDist].sort((a, b) => a.dist - b.dist);

  // Stratégie : parmi les 5 stops les plus proches, prendre celui qui est devant
  // avec la distance minimale.
  let nextStop = null;
  for (const s of sorted.slice(0, 8)) {
    const angle = vBearing > 0
      ? angleToTarget(vLat, vLon, vBearing, s.lat, s.lon)
      : 180; // si pas de bearing, on prend juste le plus proche
    if (angle < 90) {
      nextStop = s;
      break;
    }
  }

  // Fallback : si aucun stop n'est "devant" (bearing mal renseigné ou fin de ligne),
  // prendre le plus proche.
  if (!nextStop) nextStop = sorted[0];

  return {
    stopId: nextStop.id,
    stopName: nextStop.name,
    stopLat: nextStop.lat,
    stopLon: nextStop.lon,
    distM: nextStop.dist * 1000,
    seq: nextStop.seq,
    isAtStop: false,
    currentStop: null,
  };
}

// ─── Hook React ───────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";

export function useNextStop(vehicules) {
  const [nextStops, setNextStops] = useState(new Map()); // vehicle.id -> nextStop info
  const gtfsRef = useRef(null);

  useEffect(() => {
    loadGtfsData().then((data) => {
      gtfsRef.current = data;
    });
  }, []);

  useEffect(() => {
    if (!gtfsRef.current || vehicules.length === 0) return;
    const gtfsData = gtfsRef.current;

    const map = new Map();
    for (const v of vehicules) {
      const result = computeNextStop(v, gtfsData);
      if (result) map.set(v.id, result);
    }
    setNextStops(map);
  }, [vehicules]);

  return nextStops;
}
