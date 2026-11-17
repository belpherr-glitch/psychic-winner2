// Renderiza TODAS as opções do criador no estúdio (frente e costas) numa folha só, pra revisar o estilo inteiro.
// uso: npx vite --port 5173 &  NODE_PATH=$(npm root -g) node scripts/allparts.mjs <saida.png>
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2];
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 420, height: 640 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/studio/');
await p.waitForFunction(() => window.__ready, null, { timeout: 60000 });
const base = { hairColor: 3, eyeColor: 1, shirtColor: 8, pantsColor: 0, accent: 0 };
const looks = [];
for (let h = 0; h < 7; h++) looks.push({ hair: h, hairColor: [3, 1, 0, 6, 5, 9, 10][h] });
for (let o = 0; o < 4; o++) looks.push({ outfit: o, shirtColor: [8, 0, 5, 3][o], pantsColor: [0, 0, 1, 6][o], hair: 2 });
for (let t = 1; t < 6; t++) looks.push({ hat: t, hair: 2, accent: [0, 1, 5, 2, 3][t - 1] });
for (let e = 1; e < 6; e++) looks.push({ ears: e, hair: 2, hairColor: 0 });
for (let k = 1; k < 5; k++) looks.push({ back: k, hair: 2, accent: [7, 0, 1, 4][k - 1] });
for (const [h, t, hp, c] of [[0, 0, 0, 0], [2, 2, 2, 2], [1, 1, 1, 0]]) looks.push({ height: h, thighs: t, hips: hp, chest: c, hair: 2 });
const files = [];
for (let i = 0; i < looks.length; i++) {
  for (const ang of [0, Math.PI]) {
    await p.evaluate(([c, a]) => window.studio.show(c, { ang: a, extra: 0.45 }), [{ ...base, ...looks[i] }, ang]);
    const f = `${out}.${i}.${ang ? 'b' : 'f'}.png`;
    await p.locator('#c').screenshot({ path: f });
    files.push(f);
  }
}
await b.close();
if (errs.length) console.log('ERROS', errs);
execFileSync('python3', ['-c', `
import sys
from PIL import Image
fs = sys.argv[2:]; n = len(fs) // 2; cols = 8; tw, th = 210, 320
rows = (n + cols - 1) // cols
W = Image.new('RGB', (cols * tw * 2, rows * th), 'white')
for i in range(n):
    for k in range(2):
        im = Image.open(fs[i * 2 + k]).resize((tw, th))
        W.paste(im, ((i % cols) * tw * 2 + k * tw, (i // cols) * th))
W.save(sys.argv[1])
`, out, ...files]);
console.log('ok', looks.length, 'looks');
