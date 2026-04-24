addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const ENDPOINTS = {
  "vehicle":    "https://data.montpellier3m.fr/GTFS/Urbain/VehiclePosition.pb",
  "tripupdate": "https://data.montpellier3m.fr/GTFS/Urbain/TripUpdate.pb",
};

async function handleRequest(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(request.url);
  const feed = url.searchParams.get("feed") || "vehicle";
  const target = ENDPOINTS[feed] || ENDPOINTS["vehicle"];

  try {
    const response = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WimT/1.0)" },
    });
    const body = await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      headers: {
        ...CORS,
        "Content-Type": "application/octet-stream",
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
