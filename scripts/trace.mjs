// Decalque: renderiza o personagem padrão no estúdio e sobrepõe (50%) na referência,
// alinhando topo do cabelo e sola do pé. Gera: referência | modelo | sobreposição.
// uso: npx vite --port 5173 &  NODE_PATH=$(npm root -g) node scripts/trace.mjs <ref.jpg> <x0,y0,x1,y1 topo-do-cabelo..pé> <saida.png> ['{cfg}']
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const [ref, box, out, cfgJson] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 420, height: 640 } });
p.on('pageerror', (e) => console.log('ERRO', e.message));
await p.goto('http://localhost:5173/studio/');
await p.waitForFunction(() => window.__ready, null, { timeout: 60000 });
await p.evaluate((c) => window.studio.show(c, { tight: true }), JSON.parse(cfgJson || '{}'));
await p.locator('#c').screenshot({ path: out + '.mine.png' });
await b.close();
execFileSync('python3', ['-c', `
import sys
from PIL import Image
ref = Image.open(sys.argv[1]).convert('RGB'); x0, y0, x1, y1 = map(float, sys.argv[2].split(','))
mine = Image.open(sys.argv[3]).convert('RGB'); W, H = mine.size
pad = 0.03 * (y1 - y0)                    # mesma folga do estúdio
top, bot = y0 - pad, y1 + pad
cx = (x0 + x1) / 2; half = (bot - top) * W / H / 2
r = ref.crop((int(cx - half), int(top), int(cx + half), int(bot))).resize((W, H), Image.LANCZOS)
over = Image.blend(r, mine, 0.5)
S = Image.new('RGB', (W * 3 + 20, H), 'white')
S.paste(r, (0, 0)); S.paste(mine, (W + 10, 0)); S.paste(over, (2 * W + 20, 0))
S.save(sys.argv[4])
`, ref, box, out + '.mine.png', out]);
console.log('ok', out);
