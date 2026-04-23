import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import protobuf from 'protobufjs';
import csv from 'csv-parser';

const app = express();
const PORT = 3001;

app.use(cors());

const GTFS = {
  routes: new Map(),
  trips: new Map()
};

function loadCSV(filePath, keyField, store) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        store.set(row[keyField]?.trim(), row);
      })
      .on('end', resolve)
      .on('error', reject);
  });
}

await loadCSV('./data/trips.txt', 'trip_id', GTFS.trips);
await loadCSV('./data/routes.txt', 'route_id', GTFS.routes);
console.log("✅ Données routes.txt chargées :", GTFS.routes.size, "routes");

app.get('/api/vehicles', async (req, res) => {
  try {
    const response = await fetch("https://data.montpellier3m.fr/TAM_MMM_GTFSRT/VehiclePosition.pb");
    const buffer = await response.arrayBuffer();

    const protoText = fs.readFileSync(path.join("public", "gtfs-realtime.proto"), "utf8");
    const root = protobuf.parse(protoText).root;
    const FeedMessage = root.lookupType("transit_realtime.FeedMessage");
    const message = FeedMessage.decode(new Uint8Array(buffer));

    let positions = message.entity
      .filter(e => e.vehicle && e.vehicle.position)
      .map(e => {
        const veh = e.vehicle;
        const trip = veh.trip || {};
        const pos = veh.position || {};

        const route_id_raw = trip.routeId?.trim() || "?";
        const route_id = route_id_raw.replace(/^.*:/, ""); // Ex: TAM:Route:9-61 => 9-61

        const route = GTFS.routes.get(route_id) || {};
        const trip_headsign = GTFS.trips.get(trip.tripId)?.trip_headsign || "Direction inconnue";

        return {
          id: veh.vehicle?.id || veh.id || "???",
          lat: pos.latitude,
          lon: pos.longitude,
          bearing: pos.bearing || null,
          speed: pos.speed || null,
          route_id: route_id,
          route_short_name: route.route_short_name || "?",
          route_color: route.route_color || "000000",
          headsign: trip_headsign,
          direction_id: trip.directionId ?? null,
          timestamp: veh.timestamp?.low ?? null
        };
      });

    if (positions.length === 0) {
      console.warn("⚠️ Aucun véhicule en circulation, fallback test");
      positions.push({
        id: "TEST",
        lat: 43.6117,
        lon: 3.8767,
        route_id: "T1",
        route_short_name: "1",
        route_color: "0074c9",
        headsign: "Simulation"
      });
    }

    console.log("✅ Envoi de", positions.length, "véhicule(s)");
    res.json(positions);

  } catch (err) {
    console.error("❌ Erreur proxy :", err);
    res.status(500).send("Erreur serveur");
  }
});

app.use(express.static("public"));

app.listen(PORT, () => {
  console.log(`🟢 Proxy prêt sur http://localhost:${PORT}`);
});
