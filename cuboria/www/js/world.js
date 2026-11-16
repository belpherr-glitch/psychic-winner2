// Cubória: mundo 3D (geração, luz do céu + luz colorida, água que escorre, edições salvas)
(function () {
  const CB = window.CB, B = CB.B, D = CB.D;
  const OPQ = (CB.OPQ = new Uint8Array(256)), SOL = (CB.SOL = new Uint8Array(256));
  D.forEach((d, i) => { if (d) { OPQ[i] = d.opaque ? 1 : 0; SOL[i] = d.solid ? 1 : 0; } });
  const SEA = (CB.SEA = 50);
  const LEAFY = new Uint8Array(256);
  D.forEach((d, i) => { if (d && d.leafy) LEAFY[i] = 1; });
  let QUEUE = null;
  const lerpN = (a, b, t) => a + (b - a) * Math.min(1, t);

  class World {
    constructor(W, H, seed) {
      this.W = W; this.H = H; this.seed = seed;
      const n = (this.n = W * W * H);
      this.t = new Uint8Array(n);
      this.S = new Uint8Array(n); // luz do céu 0..15
      this.R = new Uint8Array(n); this.G = new Uint8Array(n); this.Bl = new Uint8Array(n); // luz colorida
      this.hm = new Int16Array(W * W);
      this.bio = new Uint8Array(W * W); // 0 floresta, 1 deserto, 2 neve, 3 cristal
      this.edits = new Map();
      this.dirty = new Set();
      this.flow = []; // água escorrendo: [idx, nível]
      this.lvl = new Map();
      this.SN = W >> 4; this.SY = H >> 4;
      this.spawn = [W / 2, 60, W / 2];
      if (!QUEUE) QUEUE = new Int32Array(1 << 22);
    }
    idx(x, y, z) { return (y * this.W + z) * this.W + x; }
    inside(x, y, z) { return x >= 0 && z >= 0 && y >= 0 && x < this.W && z < this.W && y < this.H; }
    get(x, y, z) {
      if (y < 0) return B.BEDROCK;
      if (x < 0 || z < 0 || x >= this.W || z >= this.W || y >= this.H) return B.AIR;
      return this.t[(y * this.W + z) * this.W + x];
    }
    // pra física: fora do mundo (nas laterais) é parede invisível
    solid(x, y, z) {
      if (x < 0 || z < 0 || x >= this.W || z >= this.W || y < 0) return true;
      if (y >= this.H) return false;
      return SOL[this.t[(y * this.W + z) * this.W + x]] === 1;
    }
    light(x, y, z) {
      if (!this.inside(x, y, z)) return [y >= this.H ? 15 : 0, 0, 0, 0];
      const i = this.idx(x, y, z);
      return [this.S[i], this.R[i], this.G[i], this.Bl[i]];
    }
    markDirty(x0, y0, z0, x1, y1, z1) {
      const SN = this.SN;
      for (let sy = Math.max(0, y0 >> 4); sy <= Math.min(this.SY - 1, y1 >> 4); sy++)
        for (let sz = Math.max(0, z0 >> 4); sz <= Math.min(SN - 1, z1 >> 4); sz++)
          for (let sx = Math.max(0, x0 >> 4); sx <= Math.min(SN - 1, x1 >> 4); sx++) this.dirty.add((sy * SN + sz) * SN + sx);
    }
    set(x, y, z, id, quiet) {
      if (!this.inside(x, y, z) || y < 1) return;
      const i = this.idx(x, y, z);
      if (this.t[i] === id) return;
      this.t[i] = id;
      this.edits.set(i, id);
      const c = z * this.W + x;
      if (id !== B.AIR && D[id].kind !== 'liquid' && y > this.hm[c]) this.hm[c] = y;
      else if (y === this.hm[c] && (id === B.AIR || D[id].kind === 'liquid')) {
        let k = y;
        while (k > 0) { const v = this.t[this.idx(x, k, z)]; if (v !== B.AIR && D[v].kind !== 'liquid') break; k--; }
        this.hm[c] = k;
      }
      if (id === B.AIR) this.wake(x, y, z);
      if (!quiet) this.relight(x - 15, y - 15, z - 15, x + 15, y + 15, z + 15);
    }
    // água vizinha escorre pro buraco novo
    wake(x, y, z) {
      for (const [dx, dy, dz] of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
        const j = this.idx(x + dx, y + dy, z + dz);
        if (this.inside(x + dx, y + dy, z + dz) && this.t[j] === B.WATER) this.flow.push(j);
      }
    }
    // um passo da água: cai primeiro; se apoiada, espalha pros lados perdendo nível
    stepFlow(budget) {
      const { W, t } = this, q = this.flow;
      this.flow = [];
      let box = null;
      const touch = (x, y, z) => {
        if (!box) box = [x, y, z, x, y, z];
        else { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.min(box[2], z); box[3] = Math.max(box[3], x); box[4] = Math.max(box[4], y); box[5] = Math.max(box[5], z); }
      };
      const fill = (x, y, z, lvl) => {
        if (!this.inside(x, y, z) || y < 1) return false;
        const j = this.idx(x, y, z), id = t[j];
        if (id !== B.AIR && !(D[id].kind === 'sprite' && !D[id].light)) return false;
        t[j] = B.WATER;
        this.edits.set(j, B.WATER);
        this.lvl.set(j, lvl);
        this.flow.push(j);
        touch(x, y, z);
        return true;
      };
      for (let k = 0; k < q.length; k++) {
        if (k >= budget) { this.flow.push(...q.slice(k)); break; }
        const i = q[k];
        if (t[i] !== B.WATER) continue;
        const x = i % W, z = ((i / W) | 0) % W, y = (i / (W * W)) | 0;
        const lvl = this.lvl.has(i) ? this.lvl.get(i) : 8;
        if (fill(x, y - 1, z, 7)) continue;
        const below = this.get(x, y - 1, z);
        if (lvl > 1 && below !== B.WATER) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) fill(x + dx, y, z + dz, lvl - 1);
      }
      if (box) {
        this.relight(box[0] - 15, box[1] - 15, box[2] - 15, box[3] + 15, box[4] + 15, box[5] + 15);
        for (let x = box[0]; x <= box[3]; x++) for (let z = box[2]; z <= box[5]; z++) { const c = z * W + x; while (this.hm[c] > 0 && t[this.idx(x, this.hm[c], z)] === B.AIR) this.hm[c]--; }
      }
    }

    // ───── luz: céu desce pelas colunas e se espalha; luz colorida sai das tochas, cristais, lava ─────
    relight(x0, y0, z0, x1, y1, z1) {
      const { W, H, t } = this;
      x0 = Math.max(0, x0); y0 = Math.max(0, y0); z0 = Math.max(0, z0);
      x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1); z1 = Math.min(W - 1, z1);
      const WW = W * W, Q = QUEUE, QN = Q.length;
      const inBox = (x, y, z) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1;
      const spread = (A, cost) => {
        let head = 0, tail = 0;
        const push = (i) => { Q[tail] = i; tail = (tail + 1) % QN; };
        // fontes: células da caixa com luz + a casca em volta da caixa
        for (let y = y0 - 1; y <= y1 + 1; y++) {
          if (y < 0 || y >= H) continue;
          for (let z = z0 - 1; z <= z1 + 1; z++) {
            if (z < 0 || z >= W) continue;
            const edgeYZ = y < y0 || y > y1 || z < z0 || z > z1;
            for (let x = x0 - 1; x <= x1 + 1; x++) {
              if (x < 0 || x >= W) continue;
              const i = (y * W + z) * W + x, v = A[i];
              if (v < 2) continue;
              if (edgeYZ || x < x0 || x > x1) { push(i); continue; }
              // dentro: só semeia quem tem vizinho mais escuro (economiza muito)
              if ((x > 0 && A[i - 1] < v - 1 && !OPQ[t[i - 1]]) || (x < W - 1 && A[i + 1] < v - 1 && !OPQ[t[i + 1]]) ||
                (z > 0 && A[i - W] < v - 1 && !OPQ[t[i - W]]) || (z < W - 1 && A[i + W] < v - 1 && !OPQ[t[i + W]]) ||
                (y > 0 && A[i - WW] < v - 1 && !OPQ[t[i - WW]]) || (y < H - 1 && A[i + WW] < v - 1 && !OPQ[t[i + WW]])) push(i);
            }
          }
        }
        while (head !== tail) {
          const i = Q[head]; head = (head + 1) % QN;
          const v = A[i], x = i % W, z = ((i / W) | 0) % W, y = (i / WW) | 0;
          for (let k = 0; k < 6; k++) {
            let nx = x, ny = y, nz = z;
            if (k === 0) nx++; else if (k === 1) nx--; else if (k === 2) nz++; else if (k === 3) nz--; else if (k === 4) ny++; else ny--;
            if (!inBox(nx, ny, nz)) continue;
            const j = (ny * W + nz) * W + nx, id = t[j];
            if (OPQ[id]) continue;
            const nv = v - (id === B.WATER ? 2 : LEAFY[id] ? 2 : cost);
            if (nv > A[j]) { A[j] = nv; if (nv > 1) push(j); }
          }
        }
      };
      // céu: coluna de cima pra baixo
      const S = this.S;
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          let lv = 15;
          for (let y = H - 1; y >= y0; y--) {
            const i = (y * W + z) * W + x, id = t[i];
            if (lv > 0) { if (OPQ[id]) lv = 0; else if (id === B.WATER) lv = Math.max(0, lv - 2); else if (LEAFY[id]) lv = Math.max(0, lv - 1); }
            if (y <= y1) S[i] = lv;
          }
        }
      spread(S, 1);
      // luz colorida
      const CHN = [this.R, this.G, this.Bl];
      for (let c = 0; c < 3; c++) {
        const A = CHN[c];
        for (let y = y0; y <= y1; y++)
          for (let z = z0; z <= z1; z++) {
            let i = (y * W + z) * W + x0;
            for (let x = x0; x <= x1; x++, i++) { const L = D[t[i]].light; A[i] = L ? L[c] : 0; }
          }
        spread(A, 1);
      }
      this.markDirty(x0 - 1, y0 - 1, z0 - 1, x1 + 1, y1 + 1, z1 + 1);
    }

    // ───── geração (em passos, pra mostrar o progresso) ─────
    // escala: o personagem tem ~3,5 blocos de altura, então tudo aqui é "grande" em blocos
    *generate() {
      const { W, H, seed: s, t } = this, F2 = CB.fbm2, H2 = CB.hash2, H3 = CB.hash3;
      const I = (x, y, z) => (y * W + z) * W + x;
      const c = W / 2;
      // terreno
      for (let z = 0; z < W; z++) {
        for (let x = 0; x < W; x++) {
          const dist = Math.hypot(x - c, z - c), k = Math.min(1, Math.max(0, (dist - 26) / 34));
          let temp = F2(x / 150, z / 150, s + 1), moist = F2(x / 120, z / 120, s + 2);
          temp = 0.5 + (temp - 0.5) * k * 1.7; moist = 0.4 + (moist - 0.4) * k * 1.5;
          const bio = temp < 0.35 ? 2 : temp > 0.6 ? 1 : moist > 0.56 ? 3 : 0;
          const mount = Math.min(1, Math.max(0, (0.41 - temp) / 0.12)), flat = Math.min(1, Math.max(0, (temp - 0.56) / 0.1));
          let h = 56 + (F2(x / 110, z / 110, s + 3) - 0.5) * 40 * (1 - 0.6 * flat) + (F2(x / 34, z / 34, s + 4) - 0.5) * 12 * (1 - 0.5 * flat) +
            (F2(x / 11, z / 11, s + 6) - 0.5) * 3;
          const ridge = 1 - Math.abs(F2(x / 60, z / 60, s + 5) * 2 - 1);
          h += mount * ridge * ridge * 42;
          if (dist < 44) h = Math.max(h, lerpN(SEA + 7, h, Math.max(0, (dist - 22) / 22)));
          h = Math.round(Math.max(14, Math.min(H - 30, h)));
          const ci = z * W + x;
          this.hm[ci] = h; this.bio[ci] = bio;
          const dirt = 5 + Math.floor(H2(x, z, s) * 4);
          for (let y = 0; y < H; y++) {
            const i = I(x, y, z);
            if (y === 0) { t[i] = B.BEDROCK; continue; }
            if (y > h) { if (y <= SEA) t[i] = bio === 2 && y === SEA ? B.ICE : B.WATER; continue; }
            const d = h - y, under = h < SEA + 1;
            if (d === 0) t[i] = under ? B.SAND : [B.GRASS, B.SAND, B.SNOW, B.PGRASS][bio];
            else if (d <= dirt) t[i] = under || bio === 1 ? B.SAND : bio === 2 && d < 3 ? B.SNOW : B.DIRT;
            else t[i] = y < 28 ? B.DEEP : B.STONE;
          }
        }
        if (z % 16 === 15) yield 0.22 * (z / W);
      }
      // cavernas grandes (ruído 3D em baixa resolução, interpolado)
      const G = 6, gw = Math.ceil(W / G) + 2, gh = Math.ceil(H / G) + 2, grid = new Float32Array(gw * gw * gh);
      for (let gy = 0; gy < gh; gy++) for (let gz = 0; gz < gw; gz++) for (let gx = 0; gx < gw; gx++)
        grid[(gy * gw + gz) * gw + gx] = H3(gx, gy, gz, s + 9) * 0.5 + H3(gx >> 1, gy >> 1, gz >> 1, s + 10) * 0.5;
      const carve = (x, y, z) => {
        if (x < 1 || z < 1 || x >= W - 1 || z >= W - 1 || y < 1 || y >= H - 1) return;
        const i = I(x, y, z), id = t[i];
        if (id === B.BEDROCK || id === B.WATER || id === B.ICE || t[i + W * W] === B.WATER) return;
        t[i] = y < 12 ? B.LAVA : B.AIR;
      };
      for (let y = 2; y < H - 2; y++) {
        for (let z = 1; z < W - 1; z++) for (let x = 1; x < W - 1; x++) {
          if (y > this.hm[z * W + x] - 12) continue;
          const fx = x / G, fy = y / G, fz = z / G, ix = fx | 0, iy = fy | 0, iz = fz | 0, ax = fx - ix, ay = fy - iy, az = fz - iz;
          const g = (a, b, cc) => grid[((iy + b) * gw + iz + cc) * gw + ix + a];
          const v = ((g(0, 0, 0) * (1 - ax) + g(1, 0, 0) * ax) * (1 - az) + (g(0, 0, 1) * (1 - ax) + g(1, 0, 1) * ax) * az) * (1 - ay) +
            ((g(0, 1, 0) * (1 - ax) + g(1, 1, 0) * ax) * (1 - az) + (g(0, 1, 1) * (1 - ax) + g(1, 1, 1) * ax) * az) * ay;
          if (v > 0.79) carve(x, y, z);
        }
        if (y % 8 === 0) yield 0.22 + 0.13 * (y / H);
      }
      // túneis: minhocas que cavam esferas
      const worms = Math.round((W * W) / 420);
      for (let k = 0; k < worms; k++) {
        let x = H2(k, 1, s + 11) * W, z = H2(k, 2, s + 11) * W;
        const top = this.hm[(z | 0) * W + (x | 0)];
        let y = H2(k, 3, s + 11) < 0.3 && top > SEA + 3 ? top : 8 + H2(k, 4, s + 11) * (top - 16);
        let yaw = H2(k, 5, s + 11) * 6.283, pitch = (H2(k, 6, s + 11) - 0.5) * 0.6;
        const len = 120 + H2(k, 7, s + 11) * 200;
        for (let st = 0; st < len; st++) {
          const r = 2.3 + 2.2 * (0.5 + 0.5 * Math.sin(st * 0.09 + k)), rc = Math.ceil(r);
          if (st % 2 === 0)
            for (let dy = -rc; dy <= rc; dy++) for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++)
              if (dx * dx + dy * dy * 1.5 + dz * dz <= r * r) carve(Math.round(x + dx), Math.round(y + dy), Math.round(z + dz));
          yaw += (H2(k, st, s + 12) - 0.5) * 0.35;
          pitch = Math.max(-0.6, Math.min(0.45, pitch * 0.92 + (H2(k, st, s + 13) - 0.52) * 0.25));
          x += Math.cos(yaw) * Math.cos(pitch); z += Math.sin(yaw) * Math.cos(pitch); y += Math.sin(pitch);
          if (y < 5) pitch = Math.abs(pitch);
        }
        if (k % 20 === 0) yield 0.35 + 0.13 * (k / worms);
      }
      // minérios em veios (bolotas ao longo de um caminho)
      const vein = (id, n, ylo, yhi, size, salt) => {
        for (let k = 0; k < n; k++) {
          let x = H2(k, 1, s + salt) * W, z = H2(k, 2, s + salt) * W, y = ylo + H2(k, 3, s + salt) * (yhi - ylo);
          const m = size + Math.floor(H2(k, 4, s + salt) * size);
          for (let j = 0; j < m; j++) {
            for (let d = 0; d < 7; d++) {
              const xi = Math.round(x) + (d === 1) - (d === 2), yi = Math.round(y) + (d === 3) - (d === 4), zi = Math.round(z) + (d === 5) - (d === 6);
              if (xi > 0 && zi > 0 && xi < W - 1 && zi < W - 1 && yi > 0 && yi < H) {
                const i = I(xi, yi, zi);
                if (t[i] === B.STONE || t[i] === B.DEEP) t[i] = id;
              }
            }
            x += H2(k, j * 3, s + salt + 1) * 2 - 1; y += H2(k, j * 3 + 1, s + salt + 1) * 2 - 1; z += H2(k, j * 3 + 2, s + salt + 1) * 2 - 1;
          }
        }
      };
      const vol = (W * W * H) / (224 * 224 * 112);
      vein(B.COAL, 520 * vol, 24, 90, 4, 20);
      vein(B.COPPER, 380 * vol, 22, 74, 3, 21);
      vein(B.IRON, 300 * vol, 12, 56, 3, 22);
      vein(B.GOLD, 180 * vol, 5, 36, 3, 23);
      vein(B.CRYSTAL, 150 * vol, 5, 44, 2, 24);
      vein(B.RUBY, 80 * vol, 2, 20, 2, 25);
      for (let k = 0; k < 400 * vol; k++) {
        const x = Math.floor(H2(k, 1, s + 30) * W), z = Math.floor(H2(k, 2, s + 30) * W);
        if (this.bio[z * W + x] !== 3) continue;
        const y = this.hm[z * W + x] - 6 - Math.floor(H2(k, 3, s + 30) * 20);
        for (let d = 0; d < 4; d++) { const yy = y + d; if (yy > 1 && t[I(x, yy, z)] === B.STONE) t[I(x, yy, z)] = B.CRYSTAL; }
      }
      yield 0.52;
      // ilhas flutuantes
      const isl = [];
      for (let k = 0; k < Math.round(8 * (W * W) / (224 * 224)); k++) {
        const cx = 24 + H2(k, 1, s + 60) * (W - 48), cz = 24 + H2(k, 2, s + 60) * (W - 48), cy = 90 + H2(k, 3, s + 60) * 8, r = 7 + H2(k, 4, s + 60) * 6;
        if (Math.hypot(cx - c, cz - c) < 30) continue;
        isl.push([Math.round(cx), Math.round(cy), Math.round(cz), r]);
        for (let z = Math.floor(cz - r - 2); z <= cz + r + 2; z++)
          for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
            if (x < 1 || z < 1 || x >= W - 1 || z >= W - 1) continue;
            const d = Math.hypot(x - cx, z - cz) / (r * (0.85 + 0.3 * H2(x, z, s + 61)));
            if (d > 1) continue;
            const top = Math.round(cy + (1 - d * d) * 2), depth = (1 - d) * r * 1.1 + H2(x, z, s + 62) * 2;
            for (let y = Math.floor(cy - depth); y <= top; y++) {
              if (y < 1 || y >= H) continue;
              t[I(x, y, z)] = y === top ? B.GRASS : y > top - 3 ? B.DIRT : H3(x, y, z, s + 63) < 0.06 ? B.GOLD : B.STONE;
            }
            if (H2(x, z, s + 64) < 0.5 && top + 1 < H) t[I(x, top + 1, z)] = B.TGRASS;
          }
      }
      yield 0.56;
      // árvores
      const put = (x, y, z, id) => {
        if (x < 1 || z < 1 || x >= W - 1 || z >= W - 1 || y < 1 || y >= H) return;
        const i = I(x, y, z), v = t[i];
        if (v === B.AIR || v === B.TGRASS || v === B.FLOWER) t[i] = id;
      };
      const disk = (cx, cy, cz, r, th, id, salt) => {
        const rc = Math.ceil(r);
        for (let dy = 0; dy < th; dy++) for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++)
          if (dx * dx + dz * dz <= r * r - 0.6 * H3(cx + dx, cy + dy, cz + dz, s + salt) * r) put(cx + dx, cy + dy, cz + dz, id);
      };
      const trunk = (x, y, z, h, thick, id) => {
        for (let k = 1; k <= h; k++) for (let a = 0; a < thick; a++) for (let b = 0; b < thick; b++) t[I(x + a, y + k, z + b)] = id;
        // raízes
        if (thick > 1) for (const [dx, dz] of [[-1, 0], [2, 1], [0, 2], [1, -1]]) if (H2(x + dx, z + dz, s + 44) < 0.6) put(x + dx, y + 1, z + dz, id);
      };
      const oak = (x, y, z, r, leaf) => {
        const h = 11 + Math.floor(r * 8), thick = r > 0.45 ? 2 : 1;
        trunk(x, y, z, h, thick, B.LOG);
        const tx = x + (thick - 1) * 0.5, tz = z + (thick - 1) * 0.5, layers = 3 + (r > 0.6 ? 1 : 0);
        for (let k = 0; k < layers; k++) {
          const ly = y + h - 1 - k * 2.6 + 1, rad = (k === 0 ? 2.6 : 3.6 + k * 0.9) + H2(x, z + k, s + 45) * 1.4;
          const ox = Math.round((H2(x + k, z, s + 46) - 0.5) * 3), oz = Math.round((H2(x, z + k, s + 47) - 0.5) * 3);
          disk(Math.round(tx) + ox, Math.round(ly), Math.round(tz) + oz, rad, 2, leaf, 48 + k);
          if (k > 0) for (let b = 0; b <= Math.abs(ox) + Math.abs(oz); b++) put(Math.round(tx + (ox * b) / 4), Math.round(ly), Math.round(tz + (oz * b) / 4), B.LOG);
        }
      };
      const pine = (x, y, z, r, snowy) => {
        const h = 15 + Math.floor(r * 10);
        trunk(x, y, z, h, 1, B.LOG);
        for (let k = 4; k <= h + 1; k += 2) {
          const rad = ((h + 2 - k) / h) * 5.2 + 0.4;
          disk(x, y + k, z, rad, 1, B.PINE, 50 + k);
          if (snowy) { const rc = Math.ceil(rad); for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) if (t[I(x + dx, y + k, z + dz)] === B.PINE && H3(x + dx, k, z + dz, s + 51) < 0.55) put(x + dx, y + k + 1, z + dz, B.SNOW); }
        }
        put(x, y + h + 2, z, B.PINE);
      };
      const LEAFS = [B.PLEAVES, B.LEAF_Y, B.LEAF_B, B.LEAF_V];
      const candy = (x, y, z, r) => {
        const h = 13 + Math.floor(r * 12);
        trunk(x, y, z, h, 1, B.PALE);
        const n = 4 + Math.floor(r * 4);
        for (let k = 0; k < n; k++) {
          const cx = x + Math.round((H2(x + k, z, s + 52) - 0.5) * 8), cz = z + Math.round((H2(x, z + k, s + 53) - 0.5) * 8);
          const cy = y + h - Math.floor(H2(x + k, z + k, s + 54) * 6), id = LEAFS[Math.floor(H2(k, x + z, s + 55) * 4)];
          const sx = 1 + Math.floor(H2(k, x, s + 56) * 2), sz = 1 + Math.floor(H2(k, z, s + 57) * 2);
          for (let dy = 0; dy < 2; dy++) for (let dz = -sz; dz <= sz; dz++) for (let dx = -sx; dx <= sx; dx++) put(cx + dx, cy + dy, cz + dz, id);
          for (let b = 1; b <= 4; b++) { const bx = Math.round(x + ((cx - x) * b) / 4), bz = Math.round(z + ((cz - z) * b) / 4), by = Math.round(cy - 1 - (4 - b) * 0.5); put(bx, by, bz, B.PALE); }
        }
      };
      const cactus = (x, y, z, r) => {
        const h = 5 + Math.floor(r * 5);
        for (let k = 1; k <= h; k++) t[I(x, y + k, z)] = B.CACTUS;
        if (r > 0.4) { const a = 2 + Math.floor(r * 2), dx = r > 0.7 ? 1 : 0, dz = 1 - dx; put(x + dx, y + a, z + dz, B.CACTUS); put(x + dx * 2, y + a, z + dz * 2, B.CACTUS); for (let k = 1; k <= 3; k++) put(x + dx * 2, y + a + k, z + dz * 2, B.CACTUS); }
      };
      for (let z = 3; z < W - 4; z++)
        for (let x = 3; x < W - 4; x++) {
          const ci = z * W + x, h = this.hm[ci], bio = this.bio[ci], top = t[I(x, h, z)];
          if (h <= SEA || t[I(x, h + 1, z)] !== B.AIR) continue;
          const r = H2(x, z, s + 40), r2 = H2(z, x, s + 41);
          if (Math.hypot(x - c, z - c) < 7) continue;
          if (top === B.GRASS && bio === 0 && r < 0.0085) { oak(x, h, z, r2, H2(x, z, s + 49) < 0.2 ? B.LEAF_O : B.LEAVES); continue; }
          if ((top === B.SNOW || top === B.GRASS) && bio === 2 && r < 0.011) { pine(x, h, z, r2, true); continue; }
          if (top === B.PGRASS && r < 0.011) { candy(x, h, z, r2); continue; }
          if (top === B.SAND && bio === 1 && r < 0.003) { cactus(x, h, z, r2); continue; }
          if (top === B.GRASS || top === B.PGRASS) {
            if (r > 0.975) put(x, h + 1, z, B.FLOWER);
            else if (r > (bio === 0 ? 0.62 : 0.74)) put(x, h + 1, z, B.TGRASS);
          }
        }
      for (const [cx, cy, cz, r] of isl) {
        let top = cy + 1;
        while (top < H - 2 && t[I(cx, top, cz)] !== B.AIR) top++;
        if (top < H - 30) oak(cx, top - 1, cz, 0.3, B.LEAVES);
      }
      yield 0.66;
      // cavernas: cogumelos brilhantes e cristais de vida no chão
      for (let y = 2; y < H - 2; y++) {
        for (let z = 1; z < W - 1; z++) {
          let i = I(1, y, z);
          for (let x = 1; x < W - 1; x++, i++) {
            if (t[i] !== B.AIR || !SOL[t[i - W * W]] || y > this.hm[z * W + x] - 8) continue;
            const q = H3(x, y, z, s + 50);
            if (q < 0.0011 && y < 64) t[i] = B.HEART;
            else if (q < 0.022) t[i] = B.MUSH;
          }
        }
        if (y % 16 === 0) yield 0.66 + 0.08 * (y / H);
      }
      // alturas finais (com árvores) e ponto de nascimento
      for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
        let y = H - 1;
        while (y > 0) { const v = t[I(x, y, z)]; if (v !== B.AIR && D[v].kind !== 'liquid' && D[v].kind !== 'sprite') break; y--; }
        this.hm[z * W + x] = y;
      }
      const sx = Math.floor(c), sz = Math.floor(c);
      let sy = this.hm[sz * W + sx] + 1;
      for (let y = sy; y < sy + 5; y++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (D[t[I(sx + dx, y, sz + dz)]].solid) t[I(sx + dx, y, sz + dz)] = B.AIR;
      this.spawn = [sx + 0.5, sy + 0.05, sz + 0.5];
      yield 0.76;
      this.relight(0, 0, 0, W - 1, H - 1, W - 1);
      this.dirty.clear();
      yield 1;
    }
    applyEdits(list) {
      for (let k = 0; k < list.length; k += 2) {
        const i = list[k], id = list[k + 1];
        this.t[i] = id;
        this.edits.set(i, id);
      }
      // refaz alturas das colunas tocadas
      const W = this.W;
      for (let k = 0; k < list.length; k += 2) {
        const i = list[k], x = i % W, z = ((i / W) | 0) % W, c = z * W + x;
        let y = this.H - 1;
        while (y > 0) { const v = this.t[this.idx(x, y, z)]; if (v !== B.AIR && D[v].kind !== 'liquid') break; y--; }
        this.hm[c] = y;
      }
      this.relight(0, 0, 0, W - 1, this.H - 1, W - 1);
      this.dirty.clear();
    }
    editList() { const out = []; for (const [i, id] of this.edits) out.push(i, id); return out; }
  }
  CB.World = World;
})();
