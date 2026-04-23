import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import protobuf from 'protobufjs';
import csv from 'csv-parser';
import { Readable } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Les fichiers CSV sont dans /data à la racine du projet
const DATA_DIR = path.join(__dirname, '..', 'data');
const PROTO_PATH = path.join(__dirname, '..', 'public', 'gtfs-realtime.proto');

function loadCSV(filePath, keyField) {
  return new Promise((resolve, reject) => {
    const store = new Map();
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        store.set(row[keyField]?.trim(), row);
      })
      .on('end', () => resolve(store))
      .on('error', reject);
  });
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const [trips, routes] = await Promise.all([
      loadCSV(path.join(DATA_DIR, 'trips.txt'), 'trip_id'),
      loadCSV(path.join(DATA_DIR, 'routes.txt'), 'route_id'),
    ]);

    const response = await fetch('https://data.montpellier3m.fr/TAM_MMM_GTFSRT/VehiclePosition.pb');
    const buffer = await response.arrayBuffer();

    const protoText = fs.readFileSync(PROTO_PATH, 'utf8');
    const root = protobuf.parse(protoText).root;
    const FeedMessage = root.lookupType('transit_realtime.FeedMessage');
    const message = FeedMessage.decode(new Uint8Array(buffer));

    let positions = message.entity
      .filter(e => e.vehicle && e.vehicle.position)
      .map(e => {
        const veh = e.vehicle;
        const trip = veh.trip || {};
        const pos = veh.position || {};

        const route_id_raw = trip.routeId?.trim() || '?';
        const route_id = route_id_raw.replace(/^.*:/, '');

        const route = routes.get(route_id) || {};
        const trip_headsign = trips.get(trip.tripId)?.trip_headsign || 'Direction inconnue';

        return {
          id: veh.vehicle?.id || veh.id || '???',
          lat: pos.latitude,
          lon: pos.longitude,
          bearing: pos.bearing || null,
          speed: pos.speed || null,
          route_id,
          route_short_name: route.route_short_name || '?',
          route_color: route.route_color || '000000',
          headsign: trip_headsign,
          direction_id: trip.directionId ?? null,
          timestamp: veh.timestamp?.low ?? null,
        };
      });

    if (positions.length === 0) {
      positions.push({
        id: 'TEST',
        lat: 43.6117,
        lon: 3.8767,
        route_id: 'T1',
        route_short_name: '1',
        route_color: '0074c9',
        headsign: 'Simulation',
      });
    }

    res.status(200).json(positions);
  } catch (err) {
    console.error('Erreur serverless vehicles:', err);
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
}
