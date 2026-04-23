# 🚍 TAM Live

Carte en temps réel des trams et bus du réseau TAM de Montpellier, basée sur l'open data GTFS-RT de Montpellier Méditerranée Métropole.

![TAM Live preview](https://img.shields.io/badge/status-live-22c55e?style=flat-square) ![Vite](https://img.shields.io/badge/Vite-6-646cff?style=flat-square&logo=vite&logoColor=white) ![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=black) ![Vercel](https://img.shields.io/badge/Vercel-deployed-black?style=flat-square&logo=vercel)

---

## Fonctionnalités

- **Positions en temps réel** des véhicules TAM (trams, bus, BRT), rafraîchies toutes les 8 secondes
- **Carte interactive** avec thème clair et sombre (fond CartoDB)
- **Sidebar** avec regroupement par ligne, filtrage par numéro ou direction, tri par vitesse
- **Statut des véhicules** : en mouvement ou à l'arrêt, vitesse en km/h
- **Export CSV** de la liste des véhicules affichés
- **Serverless-ready** : déployable sur Vercel sans serveur dédié

## Stack

- [React 18](https://react.dev) + [Vite 6](https://vitejs.dev)
- [React-Leaflet](https://react-leaflet.js.org) pour la carte
- [Tailwind CSS](https://tailwindcss.com)
- Vercel Serverless Functions pour le proxy GTFS-RT
- Données open data [Montpellier 3M](https://data.montpellier3m.fr)

## Lancer en local

```bash
npm install

# Terminal 1 : proxy GTFS-RT
node server.js

# Terminal 2 : frontend
npm run dev
```

L'app sera disponible sur `http://localhost:5173`. Le proxy tourne sur le port `3001`.

## Déployer sur Vercel

```bash
npm i -g vercel
vercel --prod
```

Ou importer directement le repo depuis [vercel.com](https://vercel.com). Le fichier `vercel.json` est déjà configuré, aucun réglage supplémentaire n'est nécessaire.

## Structure du projet

```
wimt/
├── api/
│   └── vehicles.js        # Serverless function Vercel (proxy GTFS-RT)
├── data/
│   ├── routes.txt          # Données statiques GTFS (lignes)
│   └── trips.txt           # Données statiques GTFS (trajets)
├── public/
│   └── gtfs-realtime.proto # Schéma protobuf GTFS-RT
├── src/
│   ├── App.jsx             # Composant principal
│   ├── main.jsx
│   └── index.css
├── server.js               # Proxy Express pour le dev local
├── vercel.json
└── vite.config.js
```

## Source des données

Les positions des véhicules sont récupérées depuis le flux GTFS-RT public de la TAM :

```
https://data.montpellier3m.fr/TAM_MMM_GTFSRT/VehiclePosition.pb
```

Les fichiers `routes.txt` et `trips.txt` proviennent du GTFS statique de la TAM, téléchargeable sur [data.montpellier3m.fr](https://data.montpellier3m.fr).

---

Fait avec ❤️ à Montpellier
