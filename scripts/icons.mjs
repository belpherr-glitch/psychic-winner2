// Gera o ícone do app (um brotinho em pixel art) em todas as densidades do Android.
// uso: NODE_PATH=$(npm root -g) node scripts/icons.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const res = 'android/app/src/main/res';
const D = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const b = await chromium.launch();
const p = await b.newPage();
const draw = (size, mode) => p.evaluate(([size, mode]) => {
  const G = 27; // grade lógica do pixel art
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); const u = size / G;
  const R = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(Math.round(px * u), Math.round(py * u), Math.ceil(w * u), Math.ceil(h * u)); };
  if (mode !== 'fg') {
    if (mode === 'round') { x.beginPath(); x.arc(size / 2, size / 2, size / 2, 0, 7); x.clip(); }
    R(0, 0, G, G, '#8fd4ee'); R(0, 13, G, 14, '#ffe9c9');
  }
  // terra
  R(7, 18, 13, 3, '#b98250'); R(8, 17, 11, 1, '#c99560'); R(8, 21, 11, 1, '#8a5a37'); R(10, 19, 2, 1, '#8a5a37'); R(16, 19, 1, 1, '#dcbf90');
  // caule
  R(13, 11, 1, 7, '#3f8a3d');
  // folha esquerda
  R(8, 9, 5, 3, '#6fbf5a'); R(9, 8, 3, 1, '#6fbf5a'); R(9, 12, 4, 1, '#3f8a3d'); R(9, 9, 2, 1, '#a5e07f');
  // folha direita
  R(14, 6, 6, 4, '#6fbf5a'); R(15, 5, 4, 1, '#6fbf5a'); R(14, 10, 5, 1, '#3f8a3d'); R(16, 6, 2, 1, '#a5e07f');
  return c.toDataURL('image/png').split(',')[1];
}, [size, mode]);
for (const [d, k] of Object.entries(D)) {
  writeFileSync(`${res}/mipmap-${d}/ic_launcher_foreground.png`, Buffer.from(await draw(Math.round(108 * k), 'fg'), 'base64'));
  writeFileSync(`${res}/mipmap-${d}/ic_launcher.png`, Buffer.from(await draw(Math.round(48 * k), 'full'), 'base64'));
  writeFileSync(`${res}/mipmap-${d}/ic_launcher_round.png`, Buffer.from(await draw(Math.round(48 * k), 'round'), 'base64'));
}
await b.close();
console.log('icones ok');
