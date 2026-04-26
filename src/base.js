// Préfixe de base pour tous les assets statiques.
// En dev (vite dev) : "/"  — En prod (/carte/) : "/carte/"
// Vite injecte import.meta.env.BASE_URL automatiquement.
export const BASE = import.meta.env.BASE_URL;
