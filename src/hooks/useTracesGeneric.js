// useTracesGeneric.js
// Équivalent de useAllTraces.js pour les réseaux "GTFS standard" : charge
// lines.json (tracés issus de shapes.txt, générés par scripts/build-network.mjs)
// et retourne une Map short_name -> { color, textColor, type, segments } au même
// format que useAllTraces, pour rester compatible avec MapView.

import { useState, useEffect } from "react";
import { BASE } from "../base.js";

const cache = new Map(); // dataBase -> Map

async function loadTraces(dataBase) {
  if (cache.has(dataBase)) return cache.get(dataBase);
  const raw = await fetch(`${BASE}${dataBase}lines.json`).then(r => r.json());
  const traces = new Map(Object.entries(raw));
  cache.set(dataBase, traces);
  return traces;
}

export function useTracesGeneric(dataBase) {
  const [traces, setTraces] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadTraces(dataBase).then(t => { if (!cancelled) setTraces(t); }).catch(console.error);
    return () => { cancelled = true; };
  }, [dataBase]);

  return traces;
}
