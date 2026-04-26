# WimT — Where is my TaM

Carte temps réel des trams et bus du réseau TAM de Montpellier, basée sur l'open data GTFS-RT de Montpellier Méditerranée Métropole.

![status](https://img.shields.io/badge/status-live-22c55e?style=flat-square)
![React 18](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=black)
![Vite 6](https://img.shields.io/badge/Vite-6-646cff?style=flat-square&logo=vite&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-deployed-black?style=flat-square&logo=vercel)

---

## Fonctionnalités

- **Positions en temps réel** des trams, BRT et bus (rafraîchissement toutes les 8 secondes)
- **Tracés permanents** de toutes les lignes sur la carte, colorés par ligne
- **Marqueurs directionnels** avec cône de vision orienté selon le cap du véhicule
- **Diagramme de ligne** horizontal (style intérieur tram) : tous les véhicules d'une ligne positionnés sur leur séquence d'arrêts en temps réel
- **Thermomètres** : tableau de bord de toutes les lignes actives avec positions en temps réel
- **Panneau Arrêt** : saisir un nom d'arrêt, voir les prochains passages avec localisation du véhicule sur la carte
- **Page de démarrage** avec stats live (trams, BRT, bus en service) avant d'entrer dans la carte
- **Filtres** : afficher/masquer trams, BRT, bus
- **Thème clair/sombre** persisté en localStorage
- **Fond de carte CartoDB** (Dark Matter / Positron selon le thème)
- **Lazy loading** : chaque onglet charge son code à la première visite

---

## Architecture

```
Flux GTFS-RT (TAM)
        │
        ▼
Cloudflare Worker          ← proxy CORS, hébergé sur workers.dev
(cloudflare-worker/worker.js)
        │
        ▼
useVehicles (hook React)   ← décode le protobuf client-side via protobufjs
        │  +  GTFS statique (routes.txt, trips.txt)
        ▼
useNextStop (hook React)   ← calcul géométrique du prochain arrêt
        │  +  gtfs-data.json (séquences d'arrêts pré-générées)
        ▼
App.jsx                    ← état global, routing par onglets
   ├── SplashScreen         ← page de démarrage avec stats live
   ├── MapView              ← carte Leaflet + tracés + marqueurs + RoutePanel
   │     ├── VehicleMarker  ← marqueur SVG avec cône de direction
   │     └── RoutePanel     ← diagramme horizontal de ligne
   ├── ThermometresPanel    ← tableau de bord de toutes les lignes actives
   ├── ArretPanel           ← recherche d'arrêt + prochains passages
   ├── AboutPanel           ← infos légales et sources
   └── LignesPanel          ← liste des lignes actives (inline dans App.jsx)
```

---

## Pipeline des données

### 1. Positions en temps réel (GTFS-RT)

Le flux `VehiclePosition.pb` de la TAM est un binaire protobuf. Il ne peut pas être consommé directement depuis le navigateur à cause des restrictions CORS. Un **Cloudflare Worker** (`cloudflare-worker/worker.js`) sert de proxy transparent : il relaie la requête vers les serveurs TAM et ajoute les headers CORS nécessaires.

Le hook `useVehicles` charge en parallèle le flux live et les fichiers GTFS statiques (`routes.txt`, `trips.txt`) pour enrichir chaque position avec le nom de ligne, la couleur, la destination et le type de véhicule.

### 2. Tracés des lignes

Le hook `useAllTraces` charge une seule fois `LigneTram.json` et `BusLigne.json` (open data MMM) et construit une Map `short_name → { color, textColor, type, segments }`. Les tracés sont affichés en permanence sur la carte avec une opacité adaptative (plein sur la ligne sélectionnée, atténué sur les autres).

### 3. Calcul du prochain arrêt

La TAM publie un flux `TripUpdate.pb` censé donner les temps de passage prévus, mais ce flux retourne en réalité les mêmes données que `VehiclePosition.pb` (aucun `StopTimeUpdate`). L'application calcule donc le prochain arrêt **géométriquement** :

1. `generate-gtfs-data.mjs` pré-génère `public/gtfs-data.json` à partir du GTFS statique : pour chaque ligne et direction, une séquence ordonnée d'arrêts avec leurs coordonnées GPS.
2. Le hook `useNextStop` compare la position GPS de chaque véhicule à cette séquence, en tenant compte du cap (`bearing`) pour déterminer dans quelle direction il se déplace.
3. Détection "à l'arrêt" : distance < 60 m ET vitesse < 2 km/h.

### 4. Données des arrêts (panneau Arrêt)

Le script `build-stop-index.js` (exécuté automatiquement au `npm run build`) génère :

- `public/stop-meta.json` — noms d'arrêts distincts avec le type (tram/BRT/bus) et les identifiants GTFS associés. Utilisé pour la recherche.
- `public/stops/{stop_id}.json` — un fichier par arrêt avec les prochains passages de la journée en cours. Chargé à la demande lors de la sélection d'un arrêt.

---

## Structure du projet

```
wimt/
├── cloudflare-worker/
│   └── worker.js              Proxy CORS Cloudflare (à déployer sur workers.dev)
├── public/
│   ├── gtfs-realtime.proto    Schéma protobuf GTFS-RT
│   ├── routes.txt             GTFS statique — lignes
│   ├── trips.txt              GTFS statique — trajets
│   ├── stops.txt              GTFS statique — arrêts (coordonnées)
│   ├── stop_times.txt         GTFS statique — horaires par arrêt
│   ├── LigneTram.json         Tracés géographiques des lignes tram (open data MMM)
│   ├── BusLigne.json          Tracés géographiques des lignes bus
│   ├── ArretsTram.json        Arrêts tram avec coordonnées (open data MMM)
│   ├── ArretsBus.json         Arrêts bus avec coordonnées
│   ├── gtfs-data.json         Séquences d'arrêts par ligne/direction (généré par scripts/)
│   ├── stop-meta.json         Index de recherche des arrêts (généré au build)
│   └── stops/                 Un JSON par arrêt avec les horaires du jour (généré au build)
├── scripts/
│   ├── build-stop-index.js    Génère stop-meta.json + stops/*.json (lancé à chaque build)
│   └── generate-gtfs-data.mjs Génère gtfs-data.json (à relancer après mise à jour GTFS)
├── src/
│   ├── App.jsx                Composant racine — état global, onglets, filtres
│   ├── base.js                Export BASE_URL (préfixe pour tous les fetch statiques)
│   ├── theme.js               Palette de couleurs clair/sombre
│   ├── index.css              Reset CSS minimal
│   ├── main.jsx               Point d'entrée React
│   ├── hooks/
│   │   ├── useVehicles.js     Fetch GTFS-RT + décodage protobuf + enrichissement GTFS
│   │   ├── useNextStop.js     Calcul géométrique du prochain arrêt par véhicule
│   │   ├── useAllTraces.js    Chargement et cache de tous les tracés de lignes
│   │   └── useGTFS.js         Chargement et cache des fichiers GTFS statiques
│   └── components/
│       ├── MapView.jsx        Carte Leaflet — tracés permanents, marqueurs, overlays
│       ├── VehicleMarker.jsx  Marqueur SVG directionnel avec cône de vision
│       ├── RoutePanel.jsx     Diagramme horizontal de ligne (tous les véhicules actifs)
│       ├── ThermometresPanel.jsx  Tableau de bord de toutes les lignes actives
│       ├── SplashScreen.jsx   Page de démarrage avec stats live
│       ├── ArretPanel.jsx     Recherche d'arrêt et affichage des prochains passages
│       └── AboutPanel.jsx     Mentions légales et sources de données
├── index.html
├── vite.config.js
├── vercel.json
└── package.json
```

---

## Lancer en local

```bash
# Cloner et installer les dépendances
git clone https://github.com/laterop/wimt_V2.git
cd wimt_V2
npm install

# Lancer le serveur de développement
npm run dev
```

L'app sera disponible sur `http://localhost:5173`. Elle se connecte directement au proxy Cloudflare en production.

Pour pointer vers un proxy local, créer un fichier `.env.local` :

```
VITE_GTFS_RT_URL=http://localhost:8787
```

Puis lancer le worker avec [Wrangler](https://developers.cloudflare.com/workers/wrangler/) :

```bash
npx wrangler dev cloudflare-worker/worker.js
```

---

## Déployer

### Frontend — Vercel

```bash
npm i -g vercel
vercel --prod
```

Ou importer le repo depuis [vercel.com](https://vercel.com). Le fichier `vercel.json` est déjà configuré.

### Proxy CORS — Cloudflare Workers

```bash
cd cloudflare-worker
npx wrangler deploy worker.js --name tam-proxy
```

L'URL du worker déployé doit ensuite être renseignée dans la variable d'environnement `VITE_GTFS_RT_URL` sur Vercel.

---

## Mettre à jour les données GTFS

Les horaires et tracés sont publiés par la TAM sur [data.montpellier3m.fr](https://data.montpellier3m.fr). Après téléchargement d'un nouveau GTFS statique :

```bash
# 1. Remplacer les fichiers sources dans public/
cp routes.txt trips.txt stops.txt stop_times.txt public/

# 2. Regénérer les séquences d'arrêts (utilisées par useNextStop)
node scripts/generate-gtfs-data.mjs

# 3. Les fichiers stops/ et stop-meta.json sont regénérés automatiquement au prochain build
npm run build
```

---

## Sources de données

| Source | Contenu | Licence |
|--------|---------|---------|
| [data.montpellier3m.fr](https://data.montpellier3m.fr) — GTFS-RT | Positions temps réel (VehiclePosition.pb) | Licence Ouverte Etalab |
| [data.montpellier3m.fr](https://data.montpellier3m.fr) — GTFS statique | Horaires, arrêts, tracés de lignes | Licence Ouverte Etalab |
| [OpenStreetMap](https://openstreetmap.org) / [CARTO](https://carto.com) | Fond de carte | ODbL / CARTO |

---

Fait avec ❤️ à Montpellier — licence MIT
