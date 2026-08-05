// networks.js
// Configuration des réseaux "GTFS standard" (hors Montpellier, qui a son propre
// pipeline). Consommé par GenericApp.jsx via un main-<network>.jsx dédié.

export const NIMES = {
  id: "nimes",
  cityName: "Nîmes",
  locationLabel: "à Nîmes",
  operator: "Tango",
  tagline: "Where is my Tango",
  center: [43.8367, 4.3601],
  zoom: 13,
  dataBase: "nimes/",
  vehiclePositionsUrl: "https://wimt-proxy.drivedemerde.workers.dev?feed=nimes-vehicle",
  vehicleFormat: "json",
  dataSourceLabel: "transport.data.gouv.fr",
  dataSourceUrl: "https://transport.data.gouv.fr/datasets/offre-de-transport-du-reseau-tango-de-nimes-metropole-gtfs-gtfs-rt",
  rtCreditLabel: "gtfs.bus-tracker.fr",
  rtCreditUrl: "https://gtfs.bus-tracker.fr",
};

// liO Occitanie : réseau régional de cars interurbains (13 départements).
// Ce n'est pas un réseau urbain — pas de bus de ville, mais des lignes qui
// relient les villes et villages d'un même département aux pôles urbains.
export const LIO = {
  id: "lio",
  cityName: "Occitanie",
  locationLabel: "en Occitanie",
  operator: "liO",
  tagline: "Where is my liO",
  // Centre approximatif de la région, zoom large car le réseau couvre
  // une grande partie de l'Occitanie (13 départements).
  center: [43.6, 2.3],
  zoom: 8,
  dataBase: "lio/",
  vehiclePositionsUrl: "https://wimt-proxy.drivedemerde.workers.dev?feed=lio-vehicle",
  vehicleFormat: "protobuf",
  dataSourceLabel: "transport.data.gouv.fr",
  dataSourceUrl: "https://transport.data.gouv.fr/datasets/reseau-lio-occitanie",
  rtCreditLabel: "lio.2cloud.app",
  rtCreditUrl: "https://transport.data.gouv.fr/resources/84094",
};
