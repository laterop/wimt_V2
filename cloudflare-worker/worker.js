addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Montpellier (TAM) : flux GTFS-RT bruts en protobuf.
// Nîmes (Tango) : version corrigée de bus-tracker.fr, déjà exposée en JSON.
// liO Occitanie : cars interurbains régionaux (13 départements, dont le 66 —
// Pyrénées-Orientales — qui dessert Perpignan). Flux protobuf standard.
const ENDPOINTS = {
  "vehicle":              { url: "https://data.montpellier3m.fr/GTFS/Urbain/VehiclePosition.pb",         type: "application/octet-stream" },
  "tripupdate":           { url: "https://data.montpellier3m.fr/GTFS/Urbain/TripUpdate.pb",               type: "application/octet-stream" },
  "nimes-vehicle":        { url: "https://gtfs.bus-tracker.fr/gtfs-rt/tango/vehicle-positions?format=json", type: "application/json" },
  "nimes-tripupdate":     { url: "https://gtfs.bus-tracker.fr/gtfs-rt/tango/trip-updates?format=json",       type: "application/json" },
  "lio-vehicle":          { url: "https://lio.2cloud.app/api/gtfsrt/2.0/vehiclepositions/LIO65-6765-2617-7480/bin", type: "application/octet-stream" },
};

async function handleRequest(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(request.url);
  const feed = url.searchParams.get("feed") || "vehicle";
  const target = ENDPOINTS[feed] || ENDPOINTS["vehicle"];

  try {
    const response = await fetch(target.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WimT/1.0)" },
    });
    const body = await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      headers: {
        ...CORS,
        "Content-Type": target.type,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
}
