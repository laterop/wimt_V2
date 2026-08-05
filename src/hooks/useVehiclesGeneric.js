// useVehiclesGeneric.js
// Variante de useVehicles.js pour les réseaux "GTFS standard" (hors Montpellier) :
// - format "json"     : le flux GTFS-RT est déjà exposé en JSON (ex: proxy -> bus-tracker.fr
//                        pour Nîmes), pas de décodage nécessaire.
// - format "protobuf"  : flux GTFS-RT binaire standard (ex: liO Occitanie), décodé côté
//                        client avec protobufjs + gtfs-realtime.proto (comme Montpellier).
// Les métadonnées de ligne (couleur, nom, destination) viennent de gtfs-data.json généré
// par scripts/build-network.mjs, indexé par route_id (qui vaut route_short_name ici).

import { useState, useEffect, useRef } from "react";
import protobuf from "protobufjs";
import { BASE } from "../base.js";
import { classifyVehicleType } from "../lib/classifyVehicleType.js";

let feedMessageTypeCache = null;
async function getFeedMessageType() {
  if (feedMessageTypeCache) return feedMessageTypeCache;
  const protoText = await fetch(`${BASE}gtfs-realtime.proto`).then(r => r.text());
  const root = protobuf.parse(protoText).root;
  feedMessageTypeCache = root.lookupType("transit_realtime.FeedMessage");
  return feedMessageTypeCache;
}

export function useVehiclesGeneric({ dataBase, vehiclePositionsUrl, format = "json", busTramPrefixes = [], refreshMs = 8000 }) {
  const [vehicules, setVehicules] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);
  const gtfsRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        if (!gtfsRef.current) {
          gtfsRef.current = await fetch(`${BASE}${dataBase}gtfs-data.json`).then(r => r.json());
        }
        const gtfsData = gtfsRef.current;

        let msg;
        if (format === "protobuf") {
          const [FeedMessage, buf] = await Promise.all([
            getFeedMessageType(),
            fetch(vehiclePositionsUrl).then(r => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              return r.arrayBuffer();
            }),
          ]);
          msg = FeedMessage.decode(new Uint8Array(buf));
        } else {
          msg = await fetch(vehiclePositionsUrl).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          });
        }

        const positions = (msg.entity || [])
          .filter(e =>
            e.vehicle?.position &&
            e.vehicle.position.latitude != null &&
            e.vehicle.position.longitude != null &&
            e.vehicle.position.latitude !== 0 &&
            e.vehicle.position.longitude !== 0
          )
          .map(e => {
            const veh = e.vehicle;
            const trip = veh.trip || {};
            const pos = veh.position || {};
            const route_id = String(trip.routeId ?? "?").trim();
            const route = gtfsData[route_id] || {};
            const dir = String(trip.directionId ?? 0);
            const trace = route.traces?.[dir] || [];
            const headsign = trace.length
              ? trace[trace.length - 1].name
              : (route.long_name || "Direction inconnue");

            // GTFS-RT: speed en m/s -> km/h
            const speedKmh = pos.speed != null ? pos.speed * 3.6 : null;

            return {
              id: veh.vehicle?.id || veh.id || String(e.id),
              lat: pos.latitude,
              lon: pos.longitude,
              bearing: pos.bearing ?? null,
              speed: speedKmh,
              route_id,
              trip_id: trip.tripId || null,
              route_short_name: route.short_name || route_id,
              route_long_name: route.long_name || "",
              route_color: route.color || "0074c9",
              route_text_color: route.text_color || "FFFFFF",
              route_type: route.type ?? 3,
              vehicleType: classifyVehicleType(route.short_name || route_id, busTramPrefixes),
              headsign,
              direction_id: dir,
            };
          });

        if (!cancelled) {
          setVehicules(positions);
          setLastUpdate(new Date());
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Erreur fetch vehicles (generic):", err);
          setError(err.message);
        }
      }
    };

    fetchData();
    const interval = setInterval(fetchData, refreshMs);
    return () => { cancelled = true; clearInterval(interval); };
  }, [dataBase, vehiclePositionsUrl, format, refreshMs, busTramPrefixes]);

  return { vehicules, lastUpdate, error, gtfsRef };
}
