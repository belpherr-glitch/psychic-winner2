// EvoLab core: RNG, rede neural e algoritmo genético
(function () {
  const NL = (window.NL = { W: 640, H: 360, types: {} });

  // RNG com seed (mulberry32) para que todas as IAs de uma geração vejam o mesmo mundo
  NL.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  NL.gauss = function () {
    let u = 0;
    while (!u) u = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * Math.random());
  };

  NL.geneCount = (nI, nH, nO) => (nI + 1) * nH + (nH + 1) * nO;

  NL.randomGenes = function (n) {
    const g = new Float32Array(n);
    for (let k = 0; k < n; k++) g[k] = NL.gauss();
    return g;
  };

  // Rede feedforward: entradas -> 1 camada oculta (tanh) -> saídas (sigmoide)
  NL.Brain = class {
    constructor(nI, nH, nO, genes) {
      this.nI = nI;
      this.nH = nH;
      this.nO = nO;
      this.g = genes;
      this.inp = new Float32Array(nI);
      this.hid = new Float32Array(nH);
      this.out = new Float32Array(nO);
    }
    run(x) {
      const g = this.g, nI = this.nI, nH = this.nH, nO = this.nO;
      let k = 0;
      for (let h = 0; h < nH; h++) {
        let s = g[k++];
        for (let i = 0; i < nI; i++) s += g[k++] * x[i];
        this.hid[h] = Math.tanh(s);
      }
      for (let o = 0; o < nO; o++) {
        let s = g[k++];
        for (let h = 0; h < nH; h++) s += g[k++] * this.hid[h];
        this.out[o] = 1 / (1 + Math.exp(-s));
      }
      for (let i = 0; i < nI; i++) this.inp[i] = x[i];
      return this.out;
    }
    w1(i, h) { return this.g[h * (this.nI + 1) + 1 + i]; }
    w2(h, o) { return this.g[(this.nI + 1) * this.nH + o * (this.nH + 1) + 1 + h]; }
  };

  NL.mutate = function (genes, rate, str) {
    const c = genes.slice();
    for (let k = 0; k < c.length; k++) if (Math.random() < rate) c[k] += NL.gauss() * str;
    return c;
  };

  // ranked: [{genes, fitness}] ordenado do melhor pro pior. Devolve n genomas novos.
  NL.evolve = function (ranked, n, cfg) {
    const out = [];
    const nElite = Math.max(1, Math.round((n * cfg.elite) / 100));
    for (let i = 0; i < nElite && i < ranked.length && out.length < n; i++) out.push(ranked[i].genes.slice());
    const pool = Math.max(2, Math.ceil(ranked.length * 0.3));
    const pick = () => {
      let b = pool;
      for (let t = 0; t < 3; t++) b = Math.min(b, Math.floor(Math.random() * pool));
      return ranked[Math.min(b, ranked.length - 1)].genes;
    };
    const rate = cfg.mut / 100;
    while (out.length < n) {
      const a = pick(), b = pick();
      const cross = Math.random() < 0.6;
      const c = new Float32Array(a.length);
      for (let k = 0; k < c.length; k++) {
        c[k] = cross && Math.random() < 0.5 ? b[k] : a[k];
        if (Math.random() < rate) c[k] += NL.gauss() * cfg.str;
      }
      out.push(c);
    }
    return out;
  };
})();
