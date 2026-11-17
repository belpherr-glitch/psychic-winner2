// Inspeção do personagem: várias configs, de frente e de costas, no criador.
// uso: npx vite preview --port 4173 &  NODE_PATH=$(npm root -g) node scripts/chars.mjs <pasta> [qualidade 0-2]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] || 'shots';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1100, height: 520 } });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.addInitScript((q) => localStorage.setItem('valebrisa.settings', JSON.stringify({ quality: q, zoom: 1 })), +(process.argv[3] || 1));
await p.goto('http://localhost:4173/');
await p.waitForTimeout(2500);
await p.click('#btn-new');
await p.waitForTimeout(2500);
const base = { name: '', skin: 0, hair: 0, hairColor: 3, eyeColor: 1, eyes: 0, mouth: 0, outfit: 0, shirtColor: 8, pantsColor: 0, accent: 0, hat: 0, ears: 0, back: 0 };
const sets = [
  { height: 1, thighs: 1, hips: 1, chest: 0 },
  { height: 0, thighs: 1, hips: 1, chest: 0, hair: 3, hairColor: 2, outfit: 1, shirtColor: 3, pantsColor: 6, ears: 1, back: 3, hat: 3, accent: 2 },
  { height: 2, thighs: 0, hips: 0, chest: 1, hair: 1, hairColor: 5, outfit: 3, shirtColor: 0, pantsColor: 1, eyeColor: 1 },
  { height: 2, thighs: 1, hips: 1, chest: 1, hair: 1, hairColor: 4, outfit: 0, shirtColor: 0, accent: 0, back: 2, hat: 4, eyeColor: 4, ears: 0 },
  { height: 1, thighs: 2, hips: 2, chest: 2, hair: 2, hairColor: 9, outfit: 2, shirtColor: 7, skin: 2 },
  { height: 1, thighs: 2, hips: 1, chest: 1, hair: 0, hairColor: 10, outfit: 0, shirtColor: 9, accent: 6, ears: 3, eyes: 1, eyeColor: 5 },
  { height: 0, thighs: 0, hips: 0, chest: 0, hair: 5, hairColor: 6, outfit: 3, shirtColor: 8, hat: 5, back: 1, skin: 4 },
  { height: 2, thighs: 2, hips: 2, chest: 2, hair: 3, hairColor: 0, outfit: 1, shirtColor: 5, pantsColor: 3, hat: 2, accent: 3 },
];
const t0 = await p.evaluate((cfg) => { const t = performance.now(); __game.player.char.setConfig(cfg); return performance.now() - t; }, { ...base, hair: 1, outfit: 1, back: 2 });
console.log('setConfig (cabelo+roupa+capa novos): ' + t0.toFixed(0) + ' ms');
let i = 0;
for (const s of sets) {
  for (const [n, ang] of [['f', 0.35], ['b', 2.6]]) {
    await p.evaluate(([cfg, ang]) => { __game.player.char.setConfig(cfg); __game.player.face(ang); }, [{ ...base, ...s }, ang]);
    await p.waitForTimeout(1100);
    await p.screenshot({ path: `${out}/c${i}${n}.png`, clip: { x: 120, y: 30, width: 330, height: 460 } });
  }
  i++;
}
console.log(errs.length ? 'ERROS:\n' + errs.join('\n') : 'sem erros');
await b.close();
