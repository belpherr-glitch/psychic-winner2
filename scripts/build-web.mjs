// Copies the static game into www/ for the Android (Capacitor) build.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const p of ['index.html', 'src', 'vendor']) cpSync(p, `www/${p}`, { recursive: true });
console.log('www/ pronto');
