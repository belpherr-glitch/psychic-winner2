// Tiny synthesized sound effects and a gentle generative soundtrack (WebAudio).
let ctx = null, master = null, musicGain = null, noiseBuf = null;
export const audioState = { sfx: true, music: true };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone(type, f0, f1, dur, vol = 0.3, dest = master, delay = 0) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.005, vol, dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, ftype, f0, f1, q = 1) {
  const t = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = ftype; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); env(g, t, 0.004, vol, dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

export function sfx(name) {
  if (!ctx || !audioState.sfx) return;
  const r = Math.random();
  switch (name) {
    case 'dig': noise(0.07, 0.25, 'bandpass', 900 + r * 600, 500, 2); break;
    case 'break': noise(0.16, 0.35, 'lowpass', 2400, 300, 1); tone('square', 120, 60, 0.08, 0.06); break;
    case 'place': tone('sine', 200, 110, 0.07, 0.35); noise(0.05, 0.15, 'lowpass', 1500, 400); break;
    case 'swing': noise(0.13, 0.18, 'highpass', 800, 3000, 0.7); break;
    case 'hit': tone('square', 260, 110, 0.09, 0.12); noise(0.06, 0.2, 'bandpass', 1200, 600, 1.5); break;
    case 'hurt': tone('sawtooth', 340, 140, 0.22, 0.14); break;
    case 'jump': tone('sine', 280, 460, 0.09, 0.08); break;
    case 'pickup': tone('sine', 780 + r * 100, 1300, 0.07, 0.12); break;
    case 'magic': tone('sine', 900, 1800, 0.18, 0.12); tone('triangle', 1400, 2200, 0.12, 0.05, master, 0.04); break;
    case 'gloop': tone('sine', 180, 420, 0.12, 0.18); break;
    case 'craft': tone('triangle', 520, 520, 0.07, 0.15); tone('triangle', 780, 780, 0.1, 0.15, master, 0.08); break;
    case 'roar': tone('sawtooth', 90, 45, 1.3, 0.3); noise(1.2, 0.3, 'lowpass', 600, 120, 1); break;
    case 'slam': tone('sine', 90, 30, 0.5, 0.5); noise(0.4, 0.4, 'lowpass', 900, 80, 1); break;
    case 'death': tone('square', 400, 60, 0.8, 0.12); break;
    case 'drink': tone('sine', 300, 600, 0.15, 0.15); tone('sine', 500, 900, 0.15, 0.1, master, 0.12); break;
    case 'boss_die': tone('sawtooth', 200, 30, 2.0, 0.3); noise(1.6, 0.35, 'lowpass', 2000, 60); break;
    case 'click': tone('square', 900, 900, 0.03, 0.05); break;
  }
}

// --- generative music: soft triangle arpeggios over a pad
const SCALE_DAY = [0, 2, 4, 7, 9, 12, 14, 16];
const SCALE_NIGHT = [0, 3, 5, 7, 10, 12, 15, 17];
let musicTimer = 0, step = 0, chord = 0;
export function updateMusic(dt, night, boss) {
  if (!ctx || !audioState.music) return;
  musicTimer -= dt;
  if (musicTimer > 0) return;
  const tempo = boss ? 0.2 : 0.42;
  musicTimer = tempo;
  const root = boss ? 45 : night ? 50 : 55; // midi
  const scale = night || boss ? SCALE_NIGHT : SCALE_DAY;
  const prog = [0, 5, 3, 4];
  if (step % 16 === 0) {
    chord = prog[(step / 16) % 4 | 0];
    const f = 440 * Math.pow(2, (root - 12 + scale[chord % scale.length] - 69) / 12);
    tone('triangle', f, f, tempo * 15, 0.22, musicGain);
    tone('sine', f * 1.5, f * 1.5, tempo * 15, 0.12, musicGain);
  }
  const pattern = boss ? [0, 2, 4, 2, 5, 4, 2, 4] : [0, 2, 4, 5, 4, 2, 3, 1];
  if (boss || Math.random() < 0.75) {
    const n = scale[(pattern[step % 8] + chord) % scale.length];
    const f = 440 * Math.pow(2, (root + n - 69) / 12);
    tone(boss ? 'square' : 'triangle', f, f, tempo * 0.9, boss ? 0.06 : 0.12, musicGain);
  }
  step++;
}
