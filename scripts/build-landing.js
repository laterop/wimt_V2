// build-landing.js
// Copie la page vitrine statique (landing/index.html) dans dist/
// après que Vite a buildé l'app React dans dist/carte/

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const src  = path.join(ROOT, 'landing', 'index.html');
const dest = path.join(ROOT, 'dist', 'index.html');

if (!fs.existsSync(src)) {
  console.error('❌ landing/index.html introuvable');
  process.exit(1);
}

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.copyFileSync(src, dest);
console.log('✅ landing/index.html → dist/index.html');
