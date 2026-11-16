// Teste visual: abre o jogo no Chromium, passa pelo menu, criador e jogo, e salva screenshots.
// uso: npx vite preview --port 4173 &  node scripts/shots.mjs <pasta-de-saida>
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] || 'shots';
const url = process.argv[3] || 'http://localhost:4173/';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto(url);
await p.waitForTimeout(3500);
await p.screenshot({ path: `${out}/1-menu.png` });
await p.click('#btn-new');
await p.waitForTimeout(3500);
await p.screenshot({ path: `${out}/2-creator.png` });
for (let i = 0; i < 3; i++) {
  await p.click('#btn-random');
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/3-random${i}.png`, clip: { x: 0, y: 0, width: 440, height: 390 } });
}
await p.fill('#creator-rows input', 'Ana');
await p.click('#btn-start');
await p.waitForTimeout(3000);
await p.screenshot({ path: `${out}/4-play-idle.png` });
await p.keyboard.down('KeyS'); await p.keyboard.down('KeyD');
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/5-run.png` });
await p.waitForTimeout(2500);
await p.keyboard.up('KeyS'); await p.keyboard.up('KeyD');
await p.keyboard.down('KeyA'); await p.keyboard.down('ShiftLeft');
await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/6-walk.png` });
await p.keyboard.up('KeyA'); await p.keyboard.up('ShiftLeft');
await p.click('#btn-pause');
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/7-pause.png` });
const info = await p.evaluate(() => ({ calls: __game.renderer.info.render.calls, tris: __game.renderer.info.render.triangles, state: __game.state, save: localStorage.getItem('valebrisa.save') }));
console.log(JSON.stringify(info));
console.log(errs.length ? 'ERROS:\n' + errs.join('\n') : 'sem erros no console');
await b.close();
