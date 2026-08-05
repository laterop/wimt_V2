// useVehiclesGeneric.js
// Variante de useVehicles.js pour les réseaux "GTFS standard" (hors Montpellier) :
// le flux GTFS-RT est déjà exposé en JSON (proxy Cloudflare -> bus-tracker.fr),
// pas de décodage protobuf nécessaire. Les métadonnées de ligne (couleur, nom,
// destination) viennent de gtfs-data.json généré par scripts/build-network.mjs,
// indexé par route_id (qui vaut route_short_name pour ces réseaux).

import { useState, useEffect, useRef } from "react";
import { BASE } from "../base.js";

export function useVehiclesGeneric({ dataBase, vehiclePositionsUrl, refreshMs = 8000 }) {
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

        const msg = await fetch(vehiclePositionsUrl).then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        });

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
              vehicleType: "bus",
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
  }, [dataBase, vehiclePositionsUrl, refreshMs]);

  return { vehicules, lastUpdate, error, gtfsRef };
}
