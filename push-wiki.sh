#!/bin/bash
cd /tmp/wimt-wiki-repo

cat > Home.md << 'EOF'
# WimT — Where is my TaM

Bienvenue sur le wiki de **WimT**, une carte temps réel des trams et bus du réseau TAM de Montpellier.

## Pages

- [[Architecture]] — Vue d'ensemble technique du projet
- [[Pipeline des données]] — Comment les données GTFS-RT et statiques sont traitées
- [[Composants]] — Description de chaque composant React
- [[Hooks]] — Documentation des hooks personnalisés
- [[Déploiement]] — Déployer sur Vercel et Cloudflare Workers
- [[Mettre à jour le GTFS]] — Procédure de mise à jour des données statiques

## Liens rapides

- [Repo GitHub](https://github.com/laterop/wimt_V2)
- [App en production](https://wimt-v2.vercel.app)
- [Open data TAM](https://data.montpellier3m.fr)
EOF

cat > Architecture.md << 'EOF'
# Architecture

## Vue d'ensemble

```
Flux GTFS-RT (TAM)
        │
        ▼
Cloudflare Worker          ← proxy CORS, hébergé sur workers.dev
        │
        ▼
useVehicles (hook React)   ← décode le protobuf client-side via protobufjs
        │  +  GTFS statique (routes.txt, trips.txt)
        ▼
useNextStop (hook React)   ← calcul géométrique du prochain arrêt
        │  +  gtfs-data.json
        ▼
App.jsx
   ├── SplashScreen
   ├── MapView
   │     ├── VehicleMarker
   │     └── RoutePanel
   ├── ThermometresPanel
   ├── ArretPanel
   ├── AboutPanel
   └── LignesPanel
```

## Stack technique

| Outil | Rôle |
|-------|------|
| React 18 | UI, state management |
| Vite 6 | Bundler, dev server |
| React-Leaflet | Carte interactive |
| protobufjs | Décodage GTFS-RT |
| PapaParse | Parsing CSV |
| Cloudflare Workers | Proxy CORS |
| Vercel | Hébergement frontend |
EOF

cat > 'Pipeline-des-données.md' << 'EOF'
# Pipeline des données

## 1. Positions en temps réel (GTFS-RT)

Le flux `VehiclePosition.pb` est relayé par un Cloudflare Worker (proxy CORS). `useVehicles` décode le protobuf et enrichit chaque véhicule avec les données GTFS statiques. Rafraîchissement toutes les 8 secondes.

## 2. Tracés des lignes

`useAllTraces` charge `LigneTram.json` et `BusLigne.json` une seule fois. Retourne `Map<short_name, { color, textColor, type, segments }>`.

## 3. Calcul du prochain arrêt

La TAM ne fournit pas de StopTimeUpdate utilisable. Calcul géométrique :

1. `generate-gtfs-data.mjs` génère `gtfs-data.json` : séquences d'arrêts par ligne/direction
2. `useNextStop` compare la position GPS au `bearing` du véhicule
3. Détection à l'arrêt : distance < 60 m ET vitesse < 2 km/h

## 4. Données des arrêts

`build-stop-index.js` (lancé au build) génère :
- `stop-meta.json` — index pour l'autocomplétion
- `stops/{id}.json` — passages de la journée par arrêt
EOF

cat > Composants.md << 'EOF'
# Composants

## App.jsx
Composant racine. État global, routing par onglets, lazy loading via `React.lazy()`.

## SplashScreen
Page de démarrage avec stats live (trams/BRT/bus en service).

## MapView
Carte Leaflet. Tracés permanents de toutes les lignes + marqueurs véhicules.

## VehicleMarker
Marqueur SVG avec cône de direction orienté selon le `bearing` GPS.

## RoutePanel
Diagramme horizontal de ligne (style intérieur tram). Tous les véhicules de la ligne sur leur séquence d'arrêts. Sélecteur aller/retour.

## ThermometresPanel
Onglet "Lignes". Chaque ligne = thermomètre horizontal, arrêts en abscisse (labels 45°), véhicules positionnés en temps réel.

## ArretPanel
Onglet "Arrêt". Autocomplétion, mini-carte, prochains passages avec état temps réel du véhicule.

## AboutPanel
Mentions légales et sources de données.

## LignesPanel
Inline dans App.jsx. Liste des lignes actives groupées par ligne.
EOF

cat > Hooks.md << 'EOF'
# Hooks

## useVehicles
Positions temps réel, rafraîchissement 8s.
Retourne : `{ vehicules, lastUpdate, error, gtfsRef }`
Chaque véhicule : `{ id, lat, lon, bearing, speed, route_short_name, route_color, vehicleType, headsign, direction_id }`

## useNextStop
Prochain arrêt géométrique depuis `gtfs-data.json`.
Retourne : `Map<vehicleId, { stopId, stopName, distM, seqIndex, fullSequence, isAtStop, currentStop }>`
Exports : `computeNextStop(vehicle, gtfsData)`, `countStopsAway(nextStopInfo, targetStopId)`

## useAllTraces
Tracés de toutes les lignes, cache mémoire.
Retourne : `Map<short_name, { color, textColor, type, segments }>`

## useGTFS
Fichiers GTFS statiques en cache.
Retourne : `{ routes, trips, FeedMessage, tramTraces, busTraces, tramStops, busStops }`
Export : `getVehicleType(routeShortName, routeType)`
EOF

cat > Déploiement.md << 'EOF'
# Déploiement

## Frontend — Vercel

```bash
npm i -g vercel
vercel --prod
```

Variable d'environnement à configurer sur Vercel :

| Variable | Valeur |
|----------|--------|
| `VITE_GTFS_RT_URL` | URL du Cloudflare Worker |

## Proxy CORS — Cloudflare Workers

```bash
cd cloudflare-worker
npx wrangler deploy worker.js --name tam-proxy
```

Test en local :
```bash
npx wrangler dev cloudflare-worker/worker.js
# .env.local : VITE_GTFS_RT_URL=http://localhost:8787
```

## Build

```bash
npm run build
# → build-stop-index.js + vite build → dist/
```

## Architecture

```
Utilisateur → Vercel → Cloudflare Worker → Serveurs TAM
```
EOF

cat > 'Mettre-à-jour-le-GTFS.md' << 'EOF'
# Mettre à jour le GTFS

Les données évoluent 2 à 3 fois par an (changements de service TAM).

## Procédure

1. Télécharger le GTFS sur [data.montpellier3m.fr](https://data.montpellier3m.fr)
2. Remplacer dans `public/` : `routes.txt`, `trips.txt`, `stops.txt`, `stop_times.txt`
3. Regénérer les séquences d'arrêts :
   ```bash
   node scripts/generate-gtfs-data.mjs
   ```
4. Mettre à jour les GeoJSON si besoin : `LigneTram.json`, `BusLigne.json`, `ArretsTram.json`, `ArretsBus.json`
5. Builder et déployer :
   ```bash
   npm run build
   git add -A && git commit -m "chore: update GTFS data" && git push
   ```

`stop-meta.json` et `stops/*.json` sont régénérés automatiquement au build.
EOF

git add -A
git commit -m "init: wiki complet"
git push
