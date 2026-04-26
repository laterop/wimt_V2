// useAllTraces.js
// Charge les tracés GeoJSON de toutes les lignes (tram + bus) une seule fois.
// Retourne une Map : short_name → { color, textColor, segments: [[lat,lon]...] }
// "segments" = liste de polylines (une ligne peut avoir aller + retour = 2 segments)

import { useState, useEffect } from "react";

let cache = null;

async function loadAllTraces() {
  if (cache) return cache;

  const [ligneTram, lignesBus, routesText] = await Promise.all([
    fetch("/LigneTram.json").then(r => r.json()),
    fetch("/BusLigne.json").then(r => r.json()),
    fetch("/routes.txt").then(r => r.text()),
  ]);

  // Couleurs officielles depuis routes.txt (hex sans #)
  const routeColors = new Map();
  routesText.replace(/^\uFEFF/, "").split("\n").slice(1).forEach(line => {
    if (!line.trim()) return;
    const cols = line.split(",");
    const short = cols[2]?.trim();
    const color = cols[5]?.trim();
    const textColor = cols[6]?.trim();
    if (short && color) routeColors.set(short, { color: `#${color}`, textColor: `#${textColor || "FFFFFF"}` });
  });

  const traces = new Map(); // short_name → { color, textColor, type, segments: [] }

  // ── Trams ──────────────────────────────────────────────────────────────
  ligneTram.features.forEach(f => {
    const num = String(f.properties.num_exploitation);
    const geojsonColor = f.properties.code_couleur;
    const rc = routeColors.get(num);
    const color     = rc?.color     || geojsonColor || "#0074c9";
    const textColor = rc?.textColor || "#ffffff";

    if (!traces.has(num)) {
      traces.set(num, { color, textColor, type: "tram", segments: [] });
    }
    const coords = f.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    traces.get(num).segments.push(coords);
  });

  // ── Bus & BRT ──────────────────────────────────────────────────────────
  lignesBus.features.forEach(f => {
    const num = String(f.properties.num_commercial);
    const geojsonColor = f.properties.code_couleur;
    const rc = routeColors.get(num);
    const color     = rc?.color     || geojsonColor || "#888888";
    const textColor = rc?.textColor || "#ffffff";

    const isBRT = num.toUpperCase() === "A";
    const type  = isBRT ? "bustram" : "bus";

    if (!traces.has(num)) {
      traces.set(num, { color, textColor, type, segments: [] });
    }
    const coords = f.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    traces.get(num).segments.push(coords);
  });

  cache = traces;
  return traces;
}

export function useAllTraces() {
  const [traces, setTraces] = useState(null);

  useEffect(() => {
    loadAllTraces().then(setTraces).catch(console.error);
  }, []);

  return traces;
}
