// Renderiza configs no estúdio (fundo branco, de frente) e junta com recortes da referência.
// uso: npx vite --port 5173 &  NODE_PATH=$(npm root -g) node scripts/studio.mjs <ref.jpg> <saida.png> '<json [{cfg, crop:[x0,y0,x1,y1], ang}]>'
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const [ref, out, json] = process.argv.slice(2);
const items = JSON.parse(json);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 420, height: 640 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/studio/');
await p.waitForFunction(() => window.__ready, null, { timeout: 60000 });
const shots = [];
for (let i = 0; i < items.length; i++) {
  await p.evaluate(([c, o]) => window.studio.show(c, o), [items[i].cfg, { ang: items[i].ang || 0 }]);
  const f = `${out}.${i}.png`;
  await p.locator('#c').screenshot({ path: f });
  shots.push(f);
}
await b.close();
if (errs.length) console.log('ERROS', errs);
execFileSync('python3', ['-c', `
import sys, json
from PIL import Image
ref = Image.open(sys.argv[1]).convert('RGB'); items = json.loads(sys.argv[3]); shots = sys.argv[4:]
tiles = []
for it, f in zip(items, shots):
    if it.get('crop'):
        r = ref.crop(tuple(it['crop'])); r = r.resize((int(r.width * 640 / r.height), 640)); tiles.append(r)
    tiles.append(Image.open(f).convert('RGB'))
W = Image.new('RGB', (sum(t.width for t in tiles) + 10 * len(tiles), 640), 'white')
x = 0
for t in tiles: W.paste(t, (x, 0)); x += t.width + 10
W.save(sys.argv[2])
`, ref, out, json, ...shots]);
console.log('ok', out);
