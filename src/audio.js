// Som sintetizado: motor diesel, bomba hidráulica e terra raspando.
export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(ctx.destination);

    // motor: dente-de-serra + sub em quadrada, filtrados, com "batida" de pistões via LFO
    this.engF = ctx.createBiquadFilter();
    this.engF.type = 'lowpass';
    this.engF.frequency.value = 380;
    this.engF.Q.value = 2;
    this.engG = ctx.createGain();
    this.engG.gain.value = 0;
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    this.o1.connect(this.engF); this.o2.connect(g2).connect(this.engF);
    this.lfo = ctx.createOscillator(); this.lfo.type = 'sine';
    this.lfoG = ctx.createGain(); this.lfoG.gain.value = 0.35;
    const am = ctx.createGain(); am.gain.value = 0.65;
    this.lfo.connect(this.lfoG).connect(am.gain);
    this.engF.connect(am).connect(this.engG).connect(this.master);
    this.o1.start(); this.o2.start(); this.lfo.start();

    // ruído (terra / cascalho)
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = last * 0.6 + w * 0.4; d[i] = last; }
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf; this.noise.loop = true;
    this.digF = ctx.createBiquadFilter(); this.digF.type = 'bandpass'; this.digF.frequency.value = 700; this.digF.Q.value = 0.8;
    this.digG = ctx.createGain(); this.digG.gain.value = 0;
    this.noise.connect(this.digF).connect(this.digG).connect(this.master);
    // fluxo de grãos (despejo)
    this.flowF = ctx.createBiquadFilter(); this.flowF.type = 'highpass'; this.flowF.frequency.value = 1400;
    this.flowG = ctx.createGain(); this.flowG.gain.value = 0;
    this.noise.connect(this.flowF).connect(this.flowG).connect(this.master);
    this.noise.start();

    // hidráulica: chiado agudo
    this.hyd = ctx.createOscillator(); this.hyd.type = 'triangle'; this.hyd.frequency.value = 220;
    this.hydF = ctx.createBiquadFilter(); this.hydF.type = 'bandpass'; this.hydF.frequency.value = 900; this.hydF.Q.value = 3;
    this.hydG = ctx.createGain(); this.hydG.gain.value = 0;
    this.hyd.connect(this.hydF).connect(this.hydG).connect(this.master);
    this.hyd.start();
  }
  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }
  update(rpm, dig, hydro, flow, heavy, idle) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = 0.08;
    const base = heavy ? 30 : 38;
    const f = base + rpm * (heavy ? 42 : 55);
    this.o1.frequency.setTargetAtTime(f, t, k);
    this.o2.frequency.setTargetAtTime(f * 0.5, t, k);
    this.lfo.frequency.setTargetAtTime(f / 4, t, k);
    this.engF.frequency.setTargetAtTime(260 + rpm * 700, t, k);
    this.engG.gain.setTargetAtTime(idle ? 0.06 : 0.11 + rpm * 0.12, t, 0.1);
    this.digG.gain.setTargetAtTime(Math.min(0.35, dig * 0.12), t, 0.06);
    this.digF.frequency.setTargetAtTime(500 + Math.min(dig, 3) * 200, t, 0.1);
    this.flowG.gain.setTargetAtTime(Math.min(0.12, flow * 0.04), t, 0.05);
    this.hydG.gain.setTargetAtTime(hydro * 0.05, t, 0.05);
    this.hyd.frequency.setTargetAtTime(180 + hydro * 120 + rpm * 60, t, 0.1);
  }
}
