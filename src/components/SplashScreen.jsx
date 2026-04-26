import { useState, useEffect } from "react";
import protobuf from "protobufjs";
import { getTheme } from "../theme";
import { BASE } from "../base.js";

// Tente de charger les stats live depuis le proxy Cloudflare
// On réutilise la même URL que useVehicles
const GTFS_RT_URL = import.meta.env.VITE_GTFS_RT_URL || "https://tam-proxy.drivedemerde.workers.dev";

async function fetchStats() {
  const [routesText, protoText] = await Promise.all([
    fetch(`${BASE}routes.txt`).then(r => r.text()),
    fetch(`${BASE}gtfs-realtime.proto`).then(r => r.text()),
  ]);

  // Parse routes pour avoir les couleurs et types
  const routeMap = new Map();
  routesText.split("\n").slice(1).forEach(line => {
    if (!line.trim()) return;
    const cols = line.split(",");
    routeMap.set(cols[0]?.trim(), {
      short_name: cols[2]?.trim() || "?",
      type: parseInt(cols[5]) || 3,
      color: cols[7]?.trim() || "0074c9",
    });
  });

  const root = protobuf.parse(protoText).root;
  const FeedMessage = root.lookupType("transit_realtime.FeedMessage");

  const buf = await fetch(GTFS_RT_URL).then(r => r.arrayBuffer());
  const msg = FeedMessage.decode(new Uint8Array(buf));

  let trams = 0, brt = 0, bus = 0;
  const lignesActives = new Set();

  msg.entity.forEach(e => {
    if (!e.vehicle?.position) return;
    const rid = (e.vehicle.trip?.routeId || "").replace(/^.*:/, "").trim();
    const route = routeMap.get(rid);
    if (!route) return;
    const name = route.short_name.toUpperCase();
    lignesActives.add(name);
    if (name === "A") brt++;
    else if (route.type === 0 || ["1","2","3","4","5"].includes(name)) trams++;
    else bus++;
  });

  return { trams, brt, bus, lignes: lignesActives.size };
}

export default function SplashScreen({ onEnter }) {
  const theme = localStorage.getItem("wimt-theme") || "dark";
  const t = getTheme(theme === "dark");

  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [dots, setDots]       = useState("");

  // Animation des points de chargement
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 400);
    return () => clearInterval(id);
  }, []);

  // Fetch des stats en arrière-plan
  useEffect(() => {
    fetchStats()
      .then(s => { setStats(s); setLoading(false); })
      .catch(() => { setStats(null); setLoading(false); });
  }, []);

  // Animation d'entrée
  const [visible, setVisible] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  const handleEnter = () => {
    setVisible(false);
    setTimeout(onEnter, 300);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: t.bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter',system-ui,sans-serif",
      opacity: visible ? 1 : 0,
      transition: "opacity 0.3s ease",
    }}>

      {/* Cercles décoratifs en arrière-plan */}
      <div style={{
        position: "absolute", width: 600, height: 600,
        borderRadius: "50%",
        background: `radial-gradient(circle, rgba(0,116,201,0.07) 0%, transparent 70%)`,
        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        pointerEvents: "none",
      }} />

      {/* Contenu central */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 0, maxWidth: 340, width: "100%", padding: "0 24px",
      }}>

        {/* Logo */}
        <div style={{
          width: 72, height: 72, borderRadius: 22,
          background: "linear-gradient(135deg, #0074c9, #00b4d8)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 34,
          boxShadow: "0 8px 32px rgba(0,116,201,0.35)",
          marginBottom: 20,
        }}>
          🚍
        </div>

        {/* Titre */}
        <div style={{ fontSize: 32, fontWeight: 800, color: t.text, letterSpacing: "-0.5px", marginBottom: 6 }}>
          WimT
        </div>
        <div style={{ fontSize: 14, color: t.textSub, marginBottom: 36 }}>
          Where is my TaM
        </div>

        {/* Bloc stats */}
        <div style={{
          width: "100%",
          background: t.cardBg,
          border: `0.5px solid ${t.border}`,
          borderRadius: 18,
          padding: "18px 20px",
          marginBottom: 28,
          minHeight: 120,
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          {loading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: t.textHint, fontSize: 13 }}>
              Connexion au réseau{dots}
            </div>
          ) : stats === null ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", flexShrink: 0, display: "block" }} />
              <span style={{ fontSize: 13, color: t.textSub }}>Réseau inaccessible</span>
            </div>
          ) : (
            <>
              {/* Indicateur réseau actif */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 10, borderBottom: `0.5px solid ${t.border}` }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "#22c55e",
                  display: "block", flexShrink: 0,
                  boxShadow: "0 0 0 3px rgba(34,197,94,0.2)",
                }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#22c55e" }}>Réseau en service</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: t.textHint }}>
                  {stats.lignes} ligne{stats.lignes > 1 ? "s" : ""} actives
                </span>
              </div>

              {[
                { emoji: "🚊", label: "Trams",       value: stats.trams, color: "#3b8eea" },
                { emoji: "🚌", label: "BusTram",         value: stats.brt,   color: "#e87fa3" },
                { emoji: "🚌", label: "Bus",         value: stats.bus,   color: "#f59e0b" },
              ].map(({ emoji, label, value, color }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16, width: 22, textAlign: "center", flexShrink: 0 }}>{emoji}</span>
                  <span style={{ fontSize: 13, color: t.textSub, flex: 1 }}>{label} en service</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color }}>{value}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Bouton entrer */}
        <button
          onClick={handleEnter}
          style={{
            width: "100%",
            padding: "14px 0",
            borderRadius: 14,
            background: loading
              ? t.border
              : "linear-gradient(135deg, #0074c9, #00b4d8)",
            border: "none",
            color: "#fff",
            fontSize: 15,
            fontWeight: 700,
            cursor: loading ? "default" : "pointer",
            fontFamily: "'Inter',system-ui,sans-serif",
            letterSpacing: "-0.2px",
            boxShadow: loading ? "none" : "0 4px 16px rgba(0,116,201,0.4)",
            transition: "opacity 0.15s, box-shadow 0.15s",
            opacity: loading ? 0.5 : 1,
          }}
          disabled={loading}
        >
          {loading ? `Chargement${dots}` : "Ouvrir la carte"}
        </button>

        {/* Mention source */}
        <div style={{ marginTop: 20, fontSize: 10, color: t.textHint, textAlign: "center", lineHeight: 1.5 }}>
          Données open data TAM · Montpellier Méditerranée Métropole
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      `}</style>
    </div>
  );
}
