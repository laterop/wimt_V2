import { useState, useEffect, useRef } from "react";
import { loadGTFS, getVehicleType } from "./useGTFS";

const GTFS_RT_URL = import.meta.env.VITE_GTFS_RT_URL || "https://tam-proxy.drivedemerde.workers.dev";

export function useVehicles() {
  const [vehicules, setVehicules] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);
  const gtfsRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const gtfs = await loadGTFS();
        gtfsRef.current = gtfs;
        const { routes, trips, FeedMessage } = gtfs;

        const response = await fetch(GTFS_RT_URL);
        const buffer = await response.arrayBuffer();
        const message = FeedMessage.decode(new Uint8Array(buffer));

        const positions = message.entity
          .filter(e =>
            e.vehicle && e.vehicle.position &&
            e.vehicle.position.latitude != null &&
            e.vehicle.position.longitude != null &&
            e.vehicle.position.latitude !== 0 &&
            e.vehicle.position.longitude !== 0
          )
          .map(e => {
            const veh = e.vehicle;
            const trip = veh.trip || {};
            const pos = veh.position || {};
            const route_id_raw = trip.routeId?.trim() || "?";
            const route_id = route_id_raw.replace(/^.*:/, "");
            const route = routes.get(route_id) || {};
            const tripData = trips.get(trip.tripId?.trim()) || {};
            const short = route.route_short_name || "?";
            const rtype = parseInt(route.route_type) || 3;

            return {
              id: veh.vehicle?.id || veh.id || "???",
              lat: pos.latitude,
              lon: pos.longitude,
              bearing: pos.bearing || null,
              speed: pos.speed || null,
              route_id,
              route_short_name: short,
              route_long_name: route.route_long_name || "",
              route_color: route.route_color || "000000",
              route_text_color: route.route_text_color || "FFFFFF",
              route_type: rtype,
              vehicleType: getVehicleType(short, rtype),
              headsign: tripData.trip_headsign || "Direction inconnue",
              direction_id: tripData.direction_id ?? null,
            };
          });

        setVehicules(positions);
        setLastUpdate(new Date());
        setError(null);
      } catch (err) {
        console.error("Erreur fetch vehicles :", err);
        setError(err.message);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  return { vehicules, lastUpdate, error, gtfsRef };
}
