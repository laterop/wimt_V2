// useSettings.js
// Préférences de personnalisation de l'affichage, partagées entre tous les
// réseaux (une seule clé localStorage, comme le thème). Chaque feature
// visuelle ajoutée à l'appli peut s'enregistrer ici avec une valeur par
// défaut, et être pilotée depuis le panneau Réglages.

import { useState, useEffect, useCallback } from "react";

const KEY = "wimt-settings";

const DEFAULTS = {
  showDelayBadge:     true,  // badge de retard (+1/-4) sur les véhicules
  showDirectionArrow: true,  // flèche de sens sur les marqueurs véhicules
  mergeStops:         true,  // fusion des arrêts aller/retour proches sur la carte
  autoDeclutter:      true,  // allègement automatique des marqueurs au dézoom
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function useSettings() {
  const [settings, setSettings] = useState(load);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* stockage indisponible */ }
  }, [settings]);

  const toggleSetting = useCallback((key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return { settings, toggleSetting };
}
