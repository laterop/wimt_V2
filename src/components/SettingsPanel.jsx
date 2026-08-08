// SettingsPanel.jsx
// Modal listant chaque fonctionnalité personnalisable de l'appli, avec un
// interrupteur on/off. Nouvelle feature visuelle -> une entrée ici.

const FEATURES = [
  {
    key: "showDelayBadge",
    label: "Badge de retard",
    desc: "Affiche les pastilles +1 / -4 (retard ou avance) sur les véhicules et dans le panneau ligne.",
  },
  {
    key: "showDirectionArrow",
    label: "Flèche de direction",
    desc: "Affiche la flèche de sens de circulation sur les marqueurs véhicules.",
  },
  {
    key: "mergeStops",
    label: "Fusion des arrêts aller/retour",
    desc: "Regroupe sur la carte les arrêts proches du même nom (aller + retour) en un seul marqueur.",
  },
  {
    key: "autoDeclutter",
    label: "Allègement automatique au zoom",
    desc: "Réduit le détail des marqueurs (flèche, étiquette, badge) en dézoomant, pour garder la carte lisible.",
  },
];

function Toggle({ checked, onChange, accent }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      style={{
        width: 40, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
        position: "relative", flexShrink: 0, padding: 0,
        background: checked ? accent : "rgba(122,127,148,0.35)",
        transition: "background 0.15s",
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: checked ? 19 : 3,
        width: 18, height: 18, borderRadius: "50%", background: "#fff",
        transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }} />
    </button>
  );
}

export default function SettingsPanel({ t, settings, onToggle, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 3000,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: t.panelBg, borderRadius: 18, width: "min(440px, 100%)",
          maxHeight: "80vh", overflowY: "auto",
          border: `0.5px solid ${t.border}`,
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
          fontFamily: "'Inter',system-ui,sans-serif",
        }}
      >
        <div style={{ padding: "16px 18px", borderBottom: `0.5px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: t.panelBg }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Réglages</div>
            <div style={{ fontSize: 11, color: t.textSub, marginTop: 1 }}>Personnalise l'affichage, sauvegardé sur cet appareil</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: t.textHint, fontSize: 22, padding: 0, lineHeight: 1 }}>×</button>
        </div>

        <div>
          {FEATURES.map(f => (
            <div key={f.key} style={{ padding: "14px 18px", borderBottom: `0.5px solid ${t.border}`, display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{f.label}</div>
                <div style={{ fontSize: 11, color: t.textSub, marginTop: 3, lineHeight: 1.5 }}>{f.desc}</div>
              </div>
              <Toggle checked={!!settings[f.key]} onChange={() => onToggle(f.key)} accent={t.accent} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
