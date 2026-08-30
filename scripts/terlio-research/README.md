# TER liO / trains SNCF en Occitanie : notes de recherche

Statut au 29/08/2026 : la partie la plus incertaine du projet (obtenir un vrai
tracé de voie ferrée, comme le fait trayn.fr) est validée et les données sont
calculées. Reste à écrire le pipeline Node définitif, le endpoint temps réel,
le hook de position et l'intégration dans l'appli (voir plus bas).

## Objectif

Afficher sur la carte les trains SNCF (TER, Intercités, TGV confondus,
demande explicite de Hugo) qui circulent en Occitanie, avec une position
estimée sur la voie (comme trayn.fr), calculée à partir des horaires
théoriques + des retards temps réel, puisque la SNCF ne publie aucun flux
GPS réel pour ses trains.

## Ce qui a été essayé et pourquoi ça n'a pas marché

Deux jeux de données géométriques officiels SNCF ont été testés en premier :
- `lignes-par-region-administrative` (ressources.data.sncf.com)
- `formes-des-lignes-du-rfn` (idem), même filtré sur les tronçons "Exploitée"

Dans les deux cas, les tronçons ne se rebranchent pas correctement entre eux
(des centaines de petits groupes déconnectés, même en fusionnant les points
à moins de 500m). Impossible de faire un calcul de plus court chemin fiable
dessus. Probablement des tronçons découpés par voie/gestionnaire sans que
les coordonnées de jonction coïncident.

## Ce qui marche : OpenStreetMap (Overpass API)

Le réseau ferré d'OpenStreetMap est topologiquement propre (les jonctions
partagent le même identifiant de nœud OSM), donc directement routable.

Requête utilisée (bbox large autour de l'Occitanie) :
```
[out:json][timeout:35][bbox:42.2,-0.4,45.1,4.4];
way["railway"~"^(rail|light_rail)$"]["usage"!~"industrial|military"];
out geom;
```
→ 11812 tronçons, 111423 nœuds, composante connexe principale = 106131 nœuds
(95%). Largement suffisant pour du Dijkstra gare à gare.

## Pipeline (prototypé en Python dans ce dossier, à réécrire en Node)

1. `step2_find_stations.py` : gares SNCF (GTFS national) à moins de 3km du
   réseau ferré Occitanie → `occitanie-stops.json` (979 gares/quais).
2. `step3_find_trips.py` : routes/trips GTFS SNCF touchant au moins une gare
   Occitanie → `occitanie-route-ids.json` / `occitanie-trip-ids.json`
   (100 routes, 4671 trips, TER + Intercités + TGV comme demandé).
3. `build_osm_graph.py` : télécharge/charge le réseau ferré OSM, construit le
   graphe (nœud = id OSM, arête = segment entre deux nœuds consécutifs d'un
   `way`, poids = distance haversine).
4. `step5a_sequences.py` + `step5b_batch.py` : pour chaque route+direction,
   prend le trip avec le plus de gares Occitanie, ne garde QUE ses gares
   Occitanie (les gares hors zone type Paris/Lyon/Clermont sont ignorées
   comme jalons pour éviter de faire router le graphe hors de sa zone), et
   chaîne un Dijkstra entre gares consécutives pour obtenir le tracé réel +
   la position cumulée (distance parcourue) de chaque gare le long du tracé.
   Fallback en ligne droite si pas de chemin trouvé ou détour disproportionné.
5. `step6_simplify.py` : simplification Douglas-Peucker (tolérance ~15m,
   invisible à l'échelle de la carte) → 6.5 Mo → 1 Mo.

Résultat : `public/ter-lio-research/routes-with-polylines.json`
(161 routes+direction, 149 avec un vrai tracé sur la voie, 12 en ligne
droite pour des cas limites comme des TGV ne touchant l'Occitanie qu'en un
point). Chaque entrée contient : `stop_ids`, `stop_names`, `stop_arc_m`
(distance cumulée de chaque gare sur le tracé, en mètres), `polyline`,
`length_m`, infos de ligne (nom, couleur, type).

`public/ter-lio-research/occitanie-stops.json` : les 979 gares retenues.

## Ce qu'il reste à faire

1. **Réécrire ce pipeline en JS** dans `scripts/build-terlio.mjs` (même
   esprit que `scripts/build-network.mjs`), pour que ce soit rejouable sans
   Python. La logique est stable, il s'agit surtout de portage.
2. **Endpoint worker** : proxy du flux GTFS-RT trip-updates SNCF, public,
   sans clé : `https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-trip-updates`
   (rafraîchi toutes les 2 min, horizon 60 min). Pas de flux vehicle-positions
   pour les trains SNCF (confirmé), d'où l'approche par interpolation.
3. **Hook de position** (`useTrainPositions.js` ou similaire) : décoder le
   trip-updates (protobuf, schéma déjà dispo dans `public/gtfs-realtime.proto`,
   message `TripUpdate`), retrouver pour un trip actif son horaire théorique
   + retard par arrêt, en déduire la gare précédente/suivante et la fraction
   de temps écoulée, puis interpoler la position via `stop_arc_m` et
   `polyline` de la route correspondante (marcher le long du polyline jusqu'à
   la distance cible).
4. **Intégration appli** : entrée réseau dans `networks.js` (id `ter-lio` ou
   similaire), point d'entrée `main-terlio.jsx`, icône marqueur train
   distincte des bus/trams.
5. Regénérer périodiquement (le GTFS SNCF et le réseau OSM évoluent, mais pas
   vite ; un rafraîchissement mensuel ou trimestriel suffit largement).

## Sources de données

- GTFS SNCF national (statique) : `https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip`
- GTFS-RT trip-updates SNCF : `https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-trip-updates`
- Réseau ferré OpenStreetMap : Overpass API (`overpass-api.de`), requête ci-dessus
