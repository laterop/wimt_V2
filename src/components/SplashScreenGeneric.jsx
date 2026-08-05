// SplashScreenGeneric.jsx
// Variante de SplashScreen.jsx pour les réseaux "GTFS standard" (JSON direct,
// pas de protobuf) : Nîmes, puis Perpignan.

import { useState, useEffect } from "react";
import { getTheme } from "../theme";

async function fetchStats(vehiclePositionsUrl) {
  const msg = await fetch(vehiclePositionsUrl).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
  const lignesActives = new Set();
  let bus = 0;
  (msg.entity || []).forEach(e => {
    if (!e.vehicle?.position) return;
    const rid = e.vehicle.trip?.routeId;
    if (rid) lignesActives.add(String(rid));
    bus++;
  });
  return { bus, lignes: lignesActives.size };
}

export default function SplashScreenGeneric({ onEnter, network }) {
  const { cityName, tagline, vehiclePositionsUrl, operator } = network;
  const theme = localStorage.getItem("wimt-theme") || "dark";
  const t = getTheme(theme === "dark");

  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [dots, setDots]       = useState("");

  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchStats(vehiclePositionsUrl)
      .then(s => { setStats(s); setLoading(false); })
      .catch(() => { setStats(null); setLoading(false); });
  }, [vehiclePositionsUrl]);

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
      <div style={{
        position: "absolute", width: 600, height: 600,
        borderRadius: "50%",
        background: `radial-gradient(circle, rgba(0,116,201,0.07) 0%, transparent 70%)`,
        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, maxWidth: 340, width: "100%", padding: "0 24px" }}>

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

        <div style={{ fontSize: 32, fontWeight: 800, color: t.text, letterSpacing: "-0.5px", marginBottom: 6 }}>
          WimT
        </div>
        <div style={{ fontSize: 14, color: t.textSub, marginBottom: 36 }}>
          {tagline}
        </div>

        <div style={{
          width: "100%",
          background: t.cardBg,
          border: `0.5px solid ${t.border}`,
          borderRadius: 18,
          padding: "18px 20px",
          marginBottom: 28,
          minHeight: 100,
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
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 10, borderBottom: `0.5px solid ${t.border}` }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "block", flexShrink: 0, boxShadow: "0 0 0 3px rgba(34,197,94,0.2)" }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#22c55e" }}>Réseau en service</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: t.textHint }}>
                  {stats.lignes} ligne{stats.lignes > 1 ? "s" : ""} actives
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16, width: 22, textAlign: "center", flexShrink: 0 }}>🚌</span>
                <span style={{ fontSize: 13, color: t.textSub, flex: 1 }}>Bus en service</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#f59e0b" }}>{stats.bus}</span>
              </div>
            </>
          )}
        </div>

        <button
          onClick={handleEnter}
          style={{
            width: "100%",
            padding: "14px 0",
            borderRadius: 14,
            background: loading ? t.border : "linear-gradient(135deg, #0074c9, #00b4d8)",
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

        <div style={{ marginTop: 20, fontSize: 10, color: t.textHint, textAlign: "center", lineHeight: 1.5 }}>
          Données open data {operator} · {cityName}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      `}</style>
    </div>
  );
}
