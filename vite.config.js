import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main:  r('index.html'),             // page d'accueil — choix du réseau
        carte: r('carte/index.html'),       // app carte temps réel (Montpellier)
        nimes: r('carte/nimes/index.html'), // app carte temps réel (Nîmes)
      },
    },
  },
});
