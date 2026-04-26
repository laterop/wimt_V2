export default function AboutPanel({ theme: t }) {
  const section = (title, children) => (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: t.textHint, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );

  const card = (children, extra = {}) => (
    <div style={{ background: t.cardBg, borderRadius: 14, border: `0.5px solid ${t.border}`, padding: "16px 18px", marginBottom: 10, ...extra }}>
      {children}
    </div>
  );

  const link = (href, label) => (
    <a href={href} target="_blank" rel="noreferrer"
      style={{ color: t.accent, textDecoration: "none", fontWeight: 500 }}>
      {label}
    </a>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", background: t.bg }}>

      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: 28, paddingBottom: 24, borderBottom: `0.5px solid ${t.border}` }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg,#0074c9,#00b4d8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto 12px" }}>🚍</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: "-0.5px" }}>WimT</div>
        <div style={{ fontSize: 12, color: t.textSub, marginTop: 4 }}>Where is my TaM</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, padding: "4px 12px", background: "rgba(0,116,201,0.1)", borderRadius: 20, border: "0.5px solid rgba(0,116,201,0.25)" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }}></span>
          <span style={{ fontSize: 11, color: t.accent, fontWeight: 600 }}>Open Source · v1.2.0</span>
        </div>
      </div>

      {section("À propos",
        card(
          <>
            <p style={{ fontSize: 13, color: t.text, lineHeight: 1.75, margin: 0 }}>
              WimT est une application web indépendante qui affiche en temps réel la position des trams et bus du réseau <strong>TaM</strong> (Transports de l'agglomération de Montpellier).
            </p>
            <p style={{ fontSize: 13, color: t.textSub, lineHeight: 1.75, margin: "10px 0 0" }}>
              Elle est développée à titre personnel, sans affiliation avec TaM ou Montpellier Méditerranée Métropole.
            </p>
          </>
        )
      )}

      {section("Comment ça marche",
        <>
          {[
            {
              icon: "📡",
              title: "Mise à jour toutes les 8 secondes",
              desc: "WimT interroge les serveurs Open Data de Montpellier Méditerranée Métropole via un proxy Cloudflare Workers pour récupérer le flux GTFS-RT. Ce flux contient la position GPS, la vitesse et la direction de chaque véhicule en service.",
            },
            {
              icon: "📍",
              title: "Calcul du prochain arrêt",
              desc: "À partir de la position GPS du véhicule et des données horaires GTFS statiques (stop_times.txt), l'application calcule géométriquement l'arrêt le plus proche sur le trajet prévu et estime la progression entre deux arrêts.",
            },
            {
              icon: "🗺️",
              title: "Affichage sur la carte",
              desc: "Chaque véhicule est représenté par un marqueur coloré avec le numéro de ligne. Un cône de direction indique le sens de déplacement. En cliquant sur un véhicule, tu vois la bande de ligne en bas avec sa position en temps réel.",
            },
          ].map(item => (
            <div key={item.title} style={{ background: t.cardBg, borderRadius: 14, border: `0.5px solid ${t.border}`, padding: "14px 16px", marginBottom: 8, display: "flex", gap: 14, alignItems: "flex-start" }}>
              <span style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.65 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {section("Le réseau TAM",
        <>
          {card(
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 12 }}>Les lignes de tramway</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { num: "1", color: "#0074c9", fg: "#fff", from: "Mosson", to: "Odysseum" },
                  { num: "2", color: "#e63946", fg: "#fff", from: "Saint-Jean-de-Védas Centre", to: "Jacou" },
                  { num: "3", color: "#f4a261", fg: "#fff", from: "Juvignac", to: "Lattes Centre" },
                  { num: "4", color: "#2a9d8f", fg: "#fff", from: "Mosson", to: "Garcia Lorca" },
                  { num: "5", color: "#8338ec", fg: "#fff", from: "Saint-Clément-de-Rivière", to: "Gare Saint-Roch" },
                ].map(l => (
                  <div key={l.num} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 28, height: 22, borderRadius: 6, background: l.color, color: l.fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{l.num}</div>
                    <div style={{ fontSize: 12, color: t.textSub }}>
                      <span style={{ color: t.text, fontWeight: 500 }}>{l.from}</span>
                      <span style={{ margin: "0 5px", color: t.textHint }}>↔</span>
                      <span style={{ color: t.text, fontWeight: 500 }}>{l.to}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {card(
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 12 }}>BusTram & Bus</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ minWidth: 28, height: 22, borderRadius: 6, background: "#00b4d8", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, padding: "0 6px", flexShrink: 0 }}>A</div>
                  <div style={{ fontSize: 12, color: t.textSub }}>
                    BusTram à haut niveau de service. <span style={{ color: t.text, fontWeight: 500 }}>Clapiers ↔ Lattes</span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: t.textSub, paddingLeft: 38, lineHeight: 1.6 }}>
                  Le réseau bus TaM comprend plus de 30 lignes urbaines couvrant l'ensemble de la métropole, ainsi que des lignes de soirée et des navettes vers les zones d'activité.
                </div>
              </div>
            </>
          )}
          {card(
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { label: "5 lignes de tram", icon: "🚊" },
                { label: "1 BusTram", icon: "🚌" },
                { label: "+30 lignes de bus", icon: "🚍" },
                { label: "~260 km²", icon: "📐", sub: "aire desservie" },
              ].map(s => (
                <div key={s.label} style={{ flex: "1 1 calc(50% - 10px)", background: t.inputBg, borderRadius: 10, border: `0.5px solid ${t.border}`, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 18 }}>{s.icon}</span>
                  <div style={{ fontSize: 12, fontWeight: 600, color: t.text, marginTop: 4 }}>{s.label}</div>
                  {s.sub && <div style={{ fontSize: 10, color: t.textHint }}>{s.sub}</div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {section("Astuces d'utilisation",
        <>
          {[
            {
              icon: "🔍",
              title: "Cliquer sur un véhicule",
              desc: "Appuie sur n'importe quel marqueur sur la carte pour sélectionner un véhicule. La bande de ligne apparaît en bas avec sa position en temps réel sur le trajet.",
            },
            {
              icon: "📊",
              title: "Onglet Thermomètres",
              desc: "Vue d'ensemble de toutes les lignes actives. Chaque ligne affiche ses véhicules positionnés sur un diagramme représentant le trajet. Clique sur un véhicule pour le retrouver sur la carte.",
            },
            {
              icon: "🚏",
              title: "Onglet Arrêts",
              desc: "Recherche un arrêt par son nom et filtre par type (Tram, BusTram, Bus). Tape au moins une lettre pour lancer la recherche. Tu verras les prochains passages en temps réel.",
            },
            {
              icon: "🌙",
              title: "Thème clair / sombre",
              desc: "Le bouton en haut à droite bascule entre le thème clair et sombre. Ton choix est sauvegardé localement sur ton appareil.",
            },
            {
              icon: "📐",
              title: "Naviguer sur la carte",
              desc: "Pince pour zoomer, fais glisser pour te déplacer. La carte se centre automatiquement sur le véhicule sélectionné lors d'un clic depuis l'onglet Thermomètres.",
            },
          ].map(item => (
            <div key={item.title} style={{ background: t.cardBg, borderRadius: 14, border: `0.5px solid ${t.border}`, padding: "14px 16px", marginBottom: 8, display: "flex", gap: 14, alignItems: "flex-start" }}>
              <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 3 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.65 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {section("Données & sources",
        <>
          {card(
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                {
                  icon: "📡",
                  title: "Positions en temps réel",
                  desc: "GTFS-RT VehiclePosition, mis à jour toutes les 8 secondes",
                  src: "data.montpellier3m.fr",
                  href: "https://data.montpellier3m.fr/dataset/tam-gtfs-temps-reel",
                },
                {
                  icon: "🗓",
                  title: "Horaires des arrêts",
                  desc: "GTFS statique (stop_times.txt, trips.txt, routes.txt)",
                  src: "data.montpellier3m.fr",
                  href: "https://data.montpellier3m.fr/dataset/tam-gtfs-atp",
                },
                {
                  icon: "🗺",
                  title: "Fond de carte",
                  desc: "OpenStreetMap via CARTO",
                  src: "openstreetmap.org",
                  href: "https://www.openstreetmap.org/copyright",
                },
              ].map(item => (
                <div key={item.title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>{item.desc}</div>
                    <div style={{ fontSize: 11, marginTop: 3 }}>{link(item.href, item.src)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {section("Changelog",
        <>
          {[
            {
              version: "v1.2.0",
              date: "Avril 2026",
              badge: "actuelle",
              badgeColor: "#22c55e",
              items: [
                "Onglet Arrêts : liste complète avec recherche et filtres Tram/BusTram/Bus",
                "Thermomètres : labels à 45°, taille de texte augmentée",
                "Renommage BRT → BusTram dans toute l'interface",
                "Page À propos complète",
              ],
            },
            {
              version: "v1.1.0",
              date: "Mars 2026",
              badge: null,
              items: [
                "Panneau de ligne horizontal (bande de route en bas de carte)",
                "Onglet Thermomètres : vue synthétique toutes lignes",
                "SplashScreen de chargement",
                "Thème clair / sombre persistant",
                "Proxy Cloudflare Workers pour contourner le CORS",
              ],
            },
            {
              version: "v1.0.0",
              date: "Janvier 2026",
              badge: null,
              items: [
                "Première version publique",
                "Carte interactive avec marqueurs colorés par ligne",
                "Cône de direction selon le bearing GPS",
                "Calcul du prochain arrêt depuis GTFS statique",
                "Mise à jour automatique toutes les 8 secondes",
              ],
            },
          ].map(rel => (
            <div key={rel.version} style={{ background: t.cardBg, borderRadius: 14, border: `0.5px solid ${t.border}`, padding: "14px 16px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: t.text }}>{rel.version}</div>
                {rel.badge && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: rel.badgeColor, background: `${rel.badgeColor}18`, border: `0.5px solid ${rel.badgeColor}44`, borderRadius: 10, padding: "1px 7px" }}>
                    {rel.badge}
                  </span>
                )}
                <span style={{ fontSize: 11, color: t.textHint, marginLeft: "auto" }}>{rel.date}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {rel.items.map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 10, color: t.accent, marginTop: 2, flexShrink: 0 }}>▸</span>
                    <span style={{ fontSize: 12, color: t.textSub, lineHeight: 1.5 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {section("Open source",
        card(
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: t.isDark ? "#24292e" : "#000", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg viewBox="0 0 16 16" width="22" height="22" fill="#fff">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>Code source sur GitHub</div>
              <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>Licence MIT, contributions bienvenues</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>{link("https://github.com/laterop/wimt_V2", "github.com/laterop/wimt_V2")}</div>
            </div>
          </div>
        )
      )}

      {section("Mentions légales",
        card(
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.text, marginBottom: 4 }}>Éditeur</div>
              <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.6 }}>
                Application développée à titre personnel. Aucune société éditrice.
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.text, marginBottom: 4 }}>Hébergement</div>
              <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.6 }}>
                {link("https://vercel.com", "Vercel Inc.")} — San Francisco, CA, USA
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.text, marginBottom: 4 }}>Données personnelles</div>
              <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.6 }}>
                WimT ne collecte aucune donnée personnelle. Aucun cookie de traçage, aucun compte requis. Le thème (clair/sombre) est enregistré localement sur ton appareil uniquement.
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.text, marginBottom: 4 }}>Responsabilité</div>
              <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.6 }}>
                Les données affichées proviennent de l'Open Data de Montpellier Méditerranée Métropole. WimT ne garantit pas leur exactitude ni leur disponibilité en temps réel. Pour des informations officielles, consulter {link("https://www.tam-voyages.com", "tam-voyages.com")}.
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.text, marginBottom: 4 }}>Licences des données</div>
              <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.6 }}>
                Données TAM sous {link("https://www.etalab.gouv.fr/licence-ouverte-open-licence", "Licence Ouverte Etalab v2.0")}. Données cartographiques © {link("https://www.openstreetmap.org/copyright", "OpenStreetMap contributors")}, © {link("https://carto.com/attributions", "CARTO")}.
              </div>
            </div>
          </div>
        )
      )}

      {section("Stack technique",
        card(
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {["React 18", "Vite 6", "React-Leaflet", "GTFS-RT", "protobuf.js", "Cloudflare Workers", "Vercel"].map(tech => (
              <span key={tech} style={{ fontSize: 11, fontWeight: 500, color: t.textSub, background: t.inputBg, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: "4px 10px" }}>
                {tech}
              </span>
            ))}
          </div>
        )
      )}

      <div style={{ textAlign: "center", padding: "8px 0 20px", color: t.textHint, fontSize: 11 }}>
        Fait avec 🚌 à Montpellier
      </div>

    </div>
  );
}
