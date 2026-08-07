// useTripDelays.js
// Décode le flux GTFS-RT TripUpdate et calcule, pour chaque trip_id, le retard
// (ou l'avance) le plus récent en secondes, tel que fourni directement par
// l'exploitant. Retourne une Map<trip_id, delaySeconds> à faire correspondre
// avec v.trip_id (véhicules issus de VehiclePosition).
//
// Contrairement à VehiclePosition, ce flux n'est aujourd'hui exploité que
// pour Montpellier : c'est le seul réseau dont le flux expose un "delay"
// déjà calculé par l'exploitant. Passer tripUpdateUrl=null désactive le hook.

import { useState, useEffect } from "react";
import protobuf from "protobufjs";
import { BASE } from "../base.js";

let feedMessageTypeCache = null;
async function getFeedMessageType() {
  if (feedMessageTypeCache) return feedMessageTypeCache;
  const protoText = await fetch(`${BASE}gtfs-realtime.proto`).then(r => r.text());
  const root = protobuf.parse(protoText).root;
  feedMessageTypeCache = root.lookupType("transit_realtime.FeedMessage");
  return feedMessageTypeCache;
}

// Les champs int64 (arrival.time, departure.time) sont décodés en Long par
// protobufjs, pas en number natif.
function toNum(x) {
  if (x == null) return null;
  if (typeof x === "number") return x;
  if (typeof x.toNumber === "function") return x.toNumber();
  return Number(x);
}

export function useTripDelays(tripUpdateUrl, refreshMs = 20000) {
  const [delays, setDelays] = useState(new Map());

  useEffect(() => {
    if (!tripUpdateUrl) { setDelays(new Map()); return; }
    let cancelled = false;

    const fetchData = async () => {
      try {
        const [FeedMessage, buf] = await Promise.all([
          getFeedMessageType(),
          fetch(tripUpdateUrl).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.arrayBuffer();
          }),
        ]);
        const msg = FeedMessage.decode(new Uint8Array(buf));
        const now = Math.floor(Date.now() / 1000);
        const map = new Map();

        for (const e of msg.entity || []) {
          const tu = e.tripUpdate;
          const tripId = tu?.trip?.tripId;
          const updates = tu?.stopTimeUpdate;
          if (!tripId || !updates || updates.length === 0) continue;

          // On garde la mise à jour la plus proche de "maintenant" : le
          // dernier arrêt déjà passé (mesure la plus fiable), sinon le
          // premier arrêt à venir (estimation).
          let best = null;
          for (const u of updates) {
            const t = toNum(u.arrival?.time) || toNum(u.departure?.time);
            if (!t) continue;
            if (t <= now) { best = u; continue; }
            if (!best) best = u;
            break;
          }
          if (!best) best = updates[updates.length - 1];

          const delaySec = best.arrival?.delay ?? best.departure?.delay;
          if (delaySec != null) map.set(tripId, delaySec);
        }

        if (!cancelled) setDelays(map);
      } catch (err) {
        console.error("Erreur fetch trip updates:", err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, refreshMs);
    return () => { cancelled = true; clearInterval(interval); };
  }, [tripUpdateUrl, refreshMs]);

  return delays;
}
