// Voxel world storage, procedural generation and lighting.
import { Simplex, mulberry32, hash2 } from './noise.js';
import { B, OPAQUE, SOLID, FILTER, EMIT, RENDER, SMOOTH } from './blocks.js';

export const W = 192, D = 192, H = 112, SEA = 56, CH = 16;
export const HELL = 22; // top of the underworld layer
export const BIOME = { MEADOW: 0, SNOW: 1, DESERT: 2, PRISM: 3, OCEAN: 4, BEACH: 5, SHADOW: 6 };
export const BIOME_NAMES = ['Campos Verdes', 'Picos Gelados', 'Dunas Douradas', 'Clareira Prismática', 'Oceano', 'Praia', 'Ermo Sombrio'];
export function layerName(y, h) { if (y < HELL) return 'Submundo'; if (y < h - 22) return 'Cavernas Profundas'; if (y < h - 6) return 'Subterrâneo'; return null; }

const QSIZE = 1 << 22;
const queue = new Int32Array(QSIZE);

function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

export class World {
  constructor(seed) {
    this.seed = seed;
    this.blocks = new Uint8Array(W * D * H);
    this.light = new Uint8Array(W * D * H);
    this.biome = new Uint8Array(W * D);
    this.height = new Uint8Array(W * D);
    this.surf = new Float32Array(W * D); // continuous visual surface height (0 = use blocks)
    this.forest = new Float32Array(W * D);
    this.edits = new Map();
    this.spawn = { x: W / 2, y: 40, z: D / 2 };
    this.hut = null;
  }
  idx(x, y, z) { return x + W * (z + D * y); }
  inside(x, y, z) { return x >= 0 && z >= 0 && y >= 0 && x < W && z < D && y < H; }
  get(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= H) return B.AIR;
    if (x < 0 || z < 0 || x >= W || z >= D) return y < SEA - 6 ? B.STONE : y <= SEA ? B.WATER : B.AIR;
    return this.blocks[x + W * (z + D * y)];
  }
  getLight(x, y, z) {
    if (y >= H) return 15;
    if (y < 0) return 0;
    if (x < 0 || z < 0 || x >= W || z >= D) return 15;
    return this.light[x + W * (z + D * y)];
  }
  isSolid(x, y, z) { return SOLID[this.get(x, y, z)] === 1; }
  biomeAt(x, z) {
    x = Math.max(0, Math.min(W - 1, Math.floor(x))); z = Math.max(0, Math.min(D - 1, Math.floor(z)));
    return this.biome[x + z * W];
  }
  topSolid(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    for (let y = H - 1; y > 0; y--) { const id = this.get(x, y, z); if (SOLID[id] || id === B.WATER) return y; }
    return 0;
  }
  rawSet(x, y, z, id) { if (this.inside(x, y, z)) this.blocks[x + W * (z + D * y)] = id; }

  // ------------------------------------------------------------ generation
  async generate(progress) {
    const n = new Simplex(this.seed), n2 = new Simplex(this.seed + 17), n3 = new Simplex(this.seed + 99);
    const rnd = mulberry32(this.seed * 7 + 3);
    const cx = W / 2, cz = D / 2;
    const BL = this.blocks;
    const tick = async (p, label) => { if (progress) { progress(p, label); await new Promise((r) => setTimeout(r, 0)); } };

    await tick(0.02, 'Moldando a ilha');
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const dx = x - cx, dz = z - cz;
        const r = Math.hypot(dx, dz) / (W / 2);
        const ang = Math.atan2(dz, dx) + n.noise2(x * 0.008, z * 0.008) * 0.9;
        // five sectors around the island: snow N, desert E, prism SE, shadow SW, meadow W + centre
        const sec = (c) => Math.max(0, Math.cos(ang - c)) ** 4;
        let wS = sec(-Math.PI / 2), wD = sec(0.15), wP = sec(1.35), wX = sec(2.45), wM = sec(Math.PI + 0.5) + sec(-2.3) * 0.8;
        wM += 6 * (1 - smooth(0.12, 0.34, r));
        const sum = wS + wD + wP + wM + wX;
        wS /= sum; wD /= sum; wP /= sum; wM /= sum; wX /= sum;

        const coast = r + n.fbm2(x * 0.02, z * 0.02, 3) * 0.14;
        const land = 1 - smooth(0.6, 0.86, coast);

        const hM = SEA + 4 + n.fbm2(x * 0.022, z * 0.022, 4) * 6 + Math.max(0, n2.fbm2(x * 0.012, z * 0.012, 2)) * 9;
        const hS = SEA + 3 + n2.ridged2(x * 0.024, z * 0.024, 4) * 30 - 6 + n.fbm2(x * 0.05, z * 0.05, 2) * 2;
        const hD = SEA + 3 + (1 - Math.abs(n3.noise2(x * 0.06, z * 0.025))) * 4 + n.fbm2(x * 0.02, z * 0.02, 2) * 2;
        const hP = SEA + 5 + n3.fbm2(x * 0.03, z * 0.03, 4) * 7;
        const hX = SEA + 4 + n.fbm2(x * 0.035 + 40, z * 0.035, 3) * 8 - Math.abs(n2.noise2(x * 0.03, z * 0.03)) * 5;
        const hLand = wM * hM + wS * hS + wD * hD + wP * hP + wX * hX;
        const floor = SEA - 4 - (1 - land) * 9 + n2.noise2(x * 0.05, z * 0.05) * 2;
        let hf = floor + (hLand - floor) * smooth(0, 1, land * 1.15);
        hf = Math.max(4, Math.min(H - 14.01, hf));
        let h = Math.floor(hf);
        this.surf[x + z * W] = hf + 0.5;
        this.forest[x + z * W] = n3.fbm2(x * 0.018 + 300, z * 0.018, 2);

        let biome = BIOME.MEADOW, best = wM;
        if (wS > best) { best = wS; biome = BIOME.SNOW; }
        if (wD > best) { best = wD; biome = BIOME.DESERT; }
        if (wP > best) { best = wP; biome = BIOME.PRISM; }
        if (wX > best) { best = wX; biome = BIOME.SHADOW; }
        if (h < SEA) biome = BIOME.OCEAN;
        else if (h <= SEA + 1 && coast > 0.5 && biome !== BIOME.SNOW) biome = BIOME.BEACH;
        this.biome[x + z * W] = biome;
        this.height[x + z * W] = h;

        const dirtDepth = 3 + Math.floor(hash2(x, z, 5) * 2);
        for (let y = 0; y < H; y++) {
          let id = B.AIR;
          if (y === 0 || (y < 2 && hash2(x * 3 + y, z, 11) < 0.5)) id = B.BEDROCK;
          else if (y < HELL + 2) {
            id = B.ASH;
            const c0 = 5 + n.noise2(x * 0.05, z * 0.05) * 2, c1 = HELL - 4 + n2.noise2(x * 0.06, z * 0.06) * 3;
            if (y > c0 && y < c1) id = y <= 6 ? B.LAVA : B.AIR;
            if (id === B.ASH && hash2(x * 7 + y, z * 3 - y, 41) < 0.025) id = B.MAGMA;
          } else if (y < h - dirtDepth) {
            id = B.STONE;
            if (biome === BIOME.PRISM && y > h - 16) id = B.MOONSTONE;
            if (biome === BIOME.SHADOW && y > h - 14) id = B.SHADOW_STONE;
            if (biome === BIOME.DESERT && y > h - 9) id = B.SANDSTONE;
          } else if (y < h) {
            id = { 0: B.DIRT, 1: B.SNOW, 2: B.SAND, 3: B.DIRT, 4: B.SAND, 5: B.SAND, 6: B.DIRT }[biome];
            if (biome === BIOME.SNOW && y < h - 2) id = B.DIRT;
          } else if (y === h) {
            id = { 0: B.GRASS, 1: B.SNOWY_DIRT, 2: B.SAND, 3: B.PRISM_GRASS, 4: B.SAND, 5: B.SAND, 6: B.SHADOW_GRASS }[biome];
            if (biome === BIOME.OCEAN && hash2(x, z, 8) < 0.3) id = B.DIRT;
            if (biome === BIOME.SNOW && h > SEA + 18) id = B.SNOW;
          } else if (y <= SEA) {
            id = B.WATER;
            if (y === SEA && (biome === BIOME.SNOW || (wS > 0.45 && h < SEA))) id = B.ICE;
          }
          BL[x + W * (z + D * y)] = id;
        }
      }
      if (z % 24 === 0) await tick(0.02 + (z / D) * 0.25, 'Moldando a ilha');
    }

    // Caves
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const h = this.height[x + z * W];
        const wet = h <= SEA + 2;
        const top = wet ? h - 6 : h - 1;
        for (let y = HELL + 3; y < top; y++) {
          const i = x + W * (z + D * y);
          const id = BL[i];
          if (id === B.BEDROCK || id === B.WATER) continue;
          const a = n.noise3(x * 0.045, y * 0.075, z * 0.045);
          const b = n2.noise3(x * 0.045, y * 0.075, z * 0.045);
          let cave = a * a + b * b < 0.006 && (y < h - 3 || hash2(x, z, 77) < 0.6);
          if (!cave && y < h - 8 && y > HELL + 4) cave = n3.noise3(x * 0.03, y * 0.06, z * 0.03) > 0.58;
          if (cave) BL[i] = y < 7 ? B.AIR : B.AIR;
        }
      }
      if (z % 24 === 0) await tick(0.28 + (z / D) * 0.3, 'Escavando cavernas');
    }

    // Ruby pillars connecting layers: a few big vertical shafts down to the underworld
    for (let k = 0; k < 6; k++) {
      let x = 20 + rnd() * (W - 40), z = 20 + rnd() * (D - 40);
      const top = this.height[(x | 0) + (z | 0) * W] - 8;
      for (let y = top; y > HELL - 2; y--) {
        x += (rnd() - 0.5) * 1.2; z += (rnd() - 0.5) * 1.2;
        const r = 1.6 + rnd() * 0.8;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          if (dx * dx + dz * dz > r * r) continue;
          const xx = (x | 0) + dx, zz = (z | 0) + dz;
          if (xx < 1 || zz < 1 || xx >= W - 1 || zz >= D - 1) continue;
          const i = this.idx(xx, y, zz);
          if (BL[i] !== B.BEDROCK && BL[i] !== B.WATER && BL[i] !== B.LAVA) BL[i] = B.AIR;
        }
      }
    }

    // Ores
    await tick(0.6, 'Espalhando minérios');
    const vein = (ore, count, ymin, ymax, size, hosts) => {
      for (let k = 0; k < count; k++) {
        let x = Math.floor(rnd() * W), z = Math.floor(rnd() * D);
        let y = ymin + Math.floor(rnd() * (ymax - ymin));
        for (let s = 0; s < size; s++) {
          const i = this.idx(x, y, z);
          if (this.inside(x, y, z) && hosts.includes(BL[i])) BL[i] = ore;
          x += Math.floor(rnd() * 3) - 1; y += Math.floor(rnd() * 3) - 1; z += Math.floor(rnd() * 3) - 1;
        }
      }
    };
    vein(B.COPPER_ORE, 420, HELL + 4, SEA + 14, 8, [B.STONE, B.SANDSTONE]);
    vein(B.IRON_ORE, 320, HELL + 3, SEA, 7, [B.STONE]);
    vein(B.GOLD_ORE, 200, HELL + 2, SEA - 14, 6, [B.STONE]);
    vein(B.EMBER_ORE, 260, 2, HELL + 2, 7, [B.ASH]);
    vein(B.CRYSTAL_ORE, 320, HELL, H - 20, 6, [B.MOONSTONE]);
    vein(B.CRYSTAL_ORE, 50, HELL + 2, SEA - 14, 5, [B.STONE]);

    // Floating islands
    await tick(0.66, 'Erguendo ilhas no céu');
    for (let k = 0; k < 5; k++) {
      const a = rnd() * Math.PI * 2, rr = 15 + rnd() * 45;
      const ix = Math.floor(cx + Math.cos(a) * rr), iz = Math.floor(cz + Math.sin(a) * rr);
      const iy = SEA + 34 + Math.floor(rnd() * 8), R = 5 + rnd() * 4;
      const prism = this.biomeAt(ix, iz) === BIOME.PRISM;
      for (let dz = -Math.ceil(R); dz <= R; dz++) for (let dx = -Math.ceil(R); dx <= R; dx++) {
        const d = Math.hypot(dx, dz) + n.noise2((ix + dx) * 0.3, (iz + dz) * 0.3) * 1.3;
        if (d > R) continue;
        const depth = Math.floor((1 - d / R) * 7 + 1);
        for (let t = 0; t < depth; t++) {
          const y = iy - t;
          const id = t === 0 ? (prism ? B.PRISM_GRASS : B.GRASS) : t < 3 ? B.DIRT : (prism ? B.MOONSTONE : B.STONE);
          this.rawSet(ix + dx, y, iz + dz, id);
        }
        if (hash2(ix + dx, iz + dz, 31) < 0.06) this.rawSet(ix + dx, iy - depth, iz + dz, B.CRYSTAL_ORE);
      }
      if (prism) this.prismTree(ix, iy + 1, iz, rnd); else this.oak(ix, iy + 1, iz, rnd);
    }

    // Spawn hut near centre
    await tick(0.7, 'Construindo a cabana');
    this.buildHut(cx | 0, cz | 0);

    // Surface decoration
    await tick(0.74, 'Plantando árvores');
    for (let z = 2; z < D - 2; z++) for (let x = 2; x < W - 2; x++) {
      const h = this.height[x + z * W];
      const bio = this.biome[x + z * W];
      const top = BL[this.idx(x, h, z)];
      const above = BL[this.idx(x, h + 1, z)];
      if (above !== B.AIR || h >= H - 16) continue;
      if (this.hut && Math.abs(x - this.hut.x) < 9 && Math.abs(z - this.hut.z) < 9) continue;
      const r = hash2(x, z, 1234);
      const r2 = hash2(x, z, 4321);
      const fo = this.forest[x + z * W];
      const treeP = fo > 0.15 ? 0.045 : fo > 0 ? 0.012 : 0.003;
      if (bio === BIOME.MEADOW && top === B.GRASS) {
        if (r < treeP) { if (r2 < 0.65) this.tallTree(x, h + 1, z, rnd); else this.oak(x, h + 1, z, rnd); }
        else if (r < 0.34) {
          let f = B.TALL_GRASS;
          const fl = hash2(Math.floor(x / 5), Math.floor(z / 5), 77); // flowers grow in patches
          if (r2 < 0.22 * fl) f = [B.FLOWER_YELLOW, B.FLOWER_RED, B.FLOWER_BLUE, B.FLOWER_PURPLE][Math.floor(fl * 40) % 4];
          else if (r2 > 0.985) f = B.MUSHROOM;
          else if (r2 > 0.97) f = B.FLOWER_PURPLE;
          this.rawSet(x, h + 1, z, f);
        }
      } else if (bio === BIOME.SHADOW && top === B.SHADOW_GRASS) {
        if (r < treeP * 0.8) this.shadowTree(x, h + 1, z, rnd);
        else if (r < 0.22) this.rawSet(x, h + 1, z, r2 < 0.2 ? B.SHADOW_SHROOM : B.SHADOW_THORN);
      } else if (bio === BIOME.SNOW && (top === B.SNOWY_DIRT || top === B.SNOW)) {
        if (r < 0.03) this.pine(x, h + 1, z, rnd);
        else if (r < 0.04) this.rawSet(x, h + 1, z, B.DEAD_BUSH);
      } else if (bio === BIOME.DESERT && top === B.SAND) {
        if (r < 0.007) this.cactus(x, h + 1, z, rnd);
        else if (r < 0.018) this.rawSet(x, h + 1, z, B.DEAD_BUSH);
      } else if (bio === BIOME.PRISM && top === B.PRISM_GRASS) {
        if (r < 0.026) this.prismTree(x, h + 1, z, rnd);
        else if (r < 0.03) { this.rawSet(x, h + 1, z, B.CRYSTAL_ORE); }
        else if (r < 0.3) this.rawSet(x, h + 1, z, r2 < 0.3 ? B.PRISM_TUFT : r2 < 0.42 ? B.FLOWER_YELLOW : r2 < 0.5 ? B.FLOWER_BLUE : B.TALL_GRASS);
      } else if (bio === BIOME.BEACH && top === B.SAND && r < 0.004) {
        this.tallTree(x, h + 1, z, rnd);
      }
    }
    // Treasure chests in caves and the underworld
    this.chests = [];
    for (let k = 0, placed = 0; k < 30000 && placed < 46; k++) {
      const x = 2 + Math.floor(rnd() * (W - 4)), z = 2 + Math.floor(rnd() * (D - 4));
      const deep = rnd() < 0.2;
      const y = deep ? 7 + Math.floor(rnd() * 10) : HELL + 3 + Math.floor(rnd() * (this.height[x + z * W] - HELL - 10));
      if (BL[this.idx(x, y, z)] === B.AIR && BL[this.idx(x, y + 1, z)] === B.AIR && SOLID[BL[this.idx(x, y - 1, z)]]) {
        this.rawSet(x, y, z, B.CHEST);
        placed++;
      }
    }
    // Cave flora
    for (let k = 0; k < 6000; k++) {
      const x = 1 + Math.floor(rnd() * (W - 2)), z = 1 + Math.floor(rnd() * (D - 2));
      const y = HELL + 2 + Math.floor(rnd() * (this.height[x + z * W] - HELL - 8));
      if (BL[this.idx(x, y, z)] === B.AIR && SOLID[BL[this.idx(x, y - 1, z)]] && BL[this.idx(x, y - 1, z)] !== B.WATER) {
        this.rawSet(x, y, z, rnd() < 0.7 ? B.GLOWCAP : B.MUSHROOM);
      }
    }

    await tick(0.8, 'Acendendo a luz do sol');
    this.relight(0, 0, W - 1, D - 1);
  }

  buildHut(x0, z0) {
    // find flat-ish ground
    let base = 0;
    for (let dz = -4; dz <= 4; dz++) for (let dx = -5; dx <= 5; dx++) base = Math.max(base, this.height[(x0 + dx) + (z0 + dz) * W]);
    base = Math.max(base, SEA + 2);
    const hx = 4, hz = 3; // half extents (walls at ±hx, ±hz)
    for (let dz = -hz - 2; dz <= hz + 2; dz++) for (let dx = -hx - 2; dx <= hx + 2; dx++) {
      const x = x0 + dx, z = z0 + dz;
      const h = this.height[x + z * W];
      for (let y = Math.min(h, base) - 3; y <= base; y++) this.rawSet(x, y, z, y === base ? B.GRASS : y > base - 3 ? B.DIRT : B.STONE);
      for (let y = base + 1; y < base + 12; y++) this.rawSet(x, y, z, B.AIR);
      this.height[x + z * W] = base;
      this.surf[x + z * W] = base + 1;
    }
    // blend the plateau into the surrounding hills
    for (let dz = -hz - 8; dz <= hz + 8; dz++) for (let dx = -hx - 8; dx <= hx + 8; dx++) {
      const d = Math.max(Math.abs(dx) - (hx + 2), Math.abs(dz) - (hz + 2));
      if (d <= 0) continue;
      const x = x0 + dx, z = z0 + dz;
      if (x < 1 || z < 1 || x >= W - 1 || z >= D - 1) continue;
      const k = x + z * W;
      const S0 = this.surf[k] || this.height[k] + 1;
      if (this.height[k] < SEA) continue;
      const t = Math.min(1, d / 6), tt = t * t * (3 - 2 * t);
      const S = (base + 1) * (1 - tt) + S0 * tt;
      const nh = Math.floor(S - 0.5);
      const top = this.get(x, this.height[k], z);
      for (let y = Math.min(nh, this.height[k]) - 2; y <= Math.max(nh, this.height[k]) + 1; y++) {
        const cur = this.get(x, y, z);
        if (y <= nh) { if (y === nh) this.rawSet(x, y, z, top === B.SAND ? B.SAND : B.GRASS); else if (!SMOOTH[cur] || y >= nh - 2) this.rawSet(x, y, z, B.DIRT); }
        else if (SMOOTH[cur] || RENDER[cur] === 2) this.rawSet(x, y, z, B.AIR);
      }
      this.height[k] = nh;
      this.surf[k] = S;
    }
    const fy = base + 1;
    for (let dz = -hz; dz <= hz; dz++) for (let dx = -hx; dx <= hx; dx++) {
      const x = x0 + dx, z = z0 + dz;
      this.rawSet(x, base, z, B.PLANKS);
      const edge = Math.abs(dx) === hx || Math.abs(dz) === hz;
      const corner = Math.abs(dx) === hx && Math.abs(dz) === hz;
      for (let y = fy; y < fy + 4; y++) {
        if (corner) this.rawSet(x, y, z, B.LOG);
        else if (edge) {
          let id = y === fy + 3 ? B.LOG : B.PLANKS;
          if (y === fy + 1 && (dz === 0 || dx === 0) && !(dx === hx && dz === 0)) id = B.AIR; // windows
          if (dx === hx && dz === 0 && y < fy + 2) id = B.AIR; // door
          if (dx === hx && Math.abs(dz) === 1 && y === fy + 2) id = B.PLANKS;
          this.rawSet(x, y, z, id);
        }
      }
    }
    // roof
    for (let k = 0; k <= hz + 1; k++) {
      for (let dx = -hx - 1; dx <= hx + 1; dx++) {
        for (const s of [-1, 1]) {
          const dz = s * (hz + 1 - k);
          this.rawSet(x0 + dx, fy + 4 + k, z0 + dz, Math.abs(dx) === hx + 1 ? B.LOG : B.BRICK);
        }
      }
      // gable walls
      if (k > 0) for (let dz = -(hz + 1 - k) + 1; dz <= hz - k; dz++) {
        this.rawSet(x0 - hx, fy + 3 + k, z0 + dz, B.PLANKS);
        this.rawSet(x0 + hx, fy + 3 + k, z0 + dz, B.PLANKS);
      }
    }
    this.rawSet(x0 - hx + 1, fy, z0 - hz + 1, B.WORKBENCH);
    this.rawSet(x0 - hx + 1, fy, z0 + hz - 1, B.TORCH);
    this.rawSet(x0 + hx - 1, fy, z0 - hz + 1, B.TORCH);
    this.rawSet(x0 + hx + 1, fy, z0 + 2, B.TORCH);
    this.rawSet(x0 + hx + 1, fy, z0 - 2, B.TORCH);
    // path of stone brick in front of door
    for (let k = 1; k <= 5; k++) this.rawSet(x0 + hx + k, base, z0, B.BRICK);
    this.hut = { x: x0, z: z0, y: fy };
    this.spawn = { x: x0 + hx + 3.5, y: fy + 0.1, z: z0 + 0.5 };
  }

  placeLeaf(x, y, z, id) {
    if (!this.inside(x, y, z)) return;
    const i = this.idx(x, y, z), c = this.blocks[i];
    if (c === B.AIR || (RENDER[c] === 2)) this.blocks[i] = id;
  }
  oak(x, y, z, rnd) {
    const th = 4 + Math.floor(rnd() * 3);
    for (let i = 0; i < th; i++) this.rawSet(x, y + i, z, B.LOG);
    const slab = (cy, R, t, ox, oz) => {
      for (let dy = 0; dy < t; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        if (Math.abs(dx) === R && Math.abs(dz) === R) continue; // clipped corners
        this.placeLeaf(x + dx + ox, cy + dy, z + dz + oz, B.LEAVES);
      }
    };
    slab(y + th - 1, 2, 2, 0, 0);
    slab(y + th + 1, 1, 1, 0, 0);
  }
  tallTree(x, y, z, rnd) {
    const th = 9 + Math.floor(rnd() * 7);
    for (let i = 0; i < th; i++) this.rawSet(x, y + i, z, B.LOG);
    const slab = (cy, Rx, Rz, t, ox, oz) => {
      for (let dy = 0; dy < t; dy++) for (let dz = -Rz; dz <= Rz; dz++) for (let dx = -Rx; dx <= Rx; dx++) {
        if (Math.abs(dx) === Rx && Math.abs(dz) === Rz && hash2(x + dx, z + dz, cy) < 0.7) continue;
        this.placeLeaf(x + dx + ox, cy + dy, z + dz + oz, B.DARK_LEAVES);
      }
    };
    // big flat canopy made of stacked, slightly offset slabs
    const R = 3 + Math.floor(rnd() * 2);
    slab(y + th - 2, R, R - (rnd() < 0.5 ? 1 : 0), 2, 0, 0);
    slab(y + th, R - 1, R - 1, 1, Math.floor(rnd() * 3) - 1, Math.floor(rnd() * 3) - 1);
    if (rnd() < 0.6) slab(y + th + 1, 1, 1, 1, 0, 0);
    // side branches with small leaf boxes lower on the trunk
    const nb = Math.floor(rnd() * 3);
    for (let k = 0; k < nb; k++) {
      const by = y + Math.floor(th * (0.45 + rnd() * 0.3));
      const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rnd() * 4)];
      this.placeLeaf(x + dx, by, z + dz, B.LOG);
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) this.placeLeaf(x + dx * 2 + a * (dx || 1) - (dx ? 0 : 0), by + b, z + dz * 2 + c * (dz || 1), B.DARK_LEAVES);
    }
  }
  shadowTree(x, y, z, rnd) {
    const th = 6 + Math.floor(rnd() * 6);
    for (let i = 0; i < th; i++) this.rawSet(x, y + i, z, B.SHADOW_LOG);
    // thorny dead branches in a V shape plus a few purple leaf clumps
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (rnd() < 0.35) continue;
      let bx = x, bz = z;
      const by0 = y + th - 1 - Math.floor(rnd() * 3);
      for (let k = 1; k <= 3; k++) { bx += dx; bz += dz; this.placeLeaf(bx, by0 + k, bz, B.SHADOW_LOG); }
      if (rnd() < 0.6) for (let a = -1; a <= 0; a++) for (let b = 0; b < 2; b++) this.placeLeaf(bx + a, by0 + 4 + b, bz, B.SHADOW_LEAVES);
    }
    this.placeLeaf(x, y + th, z, B.SHADOW_LEAVES);
  }
  pine(x, y, z, rnd) {
    const th = 7 + Math.floor(rnd() * 5);
    for (let i = 0; i < th; i++) this.rawSet(x, y + i, z, B.PINE_LOG);
    let k = 0;
    for (let yy = y + th; yy >= y + 2; yy--, k++) {
      const R = Math.min(3.2, 0.6 + k * 0.38) - (k % 2) * 0.9;
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
        if (Math.abs(dx) + Math.abs(dz) * 0.95 <= R + 0.2 || Math.hypot(dx, dz) <= R) this.placeLeaf(x + dx, yy, z + dz, B.PINE_LEAVES);
      }
    }
    this.placeLeaf(x, y + th + 1, z, B.PINE_LEAVES);
  }
  cactus(x, y, z, rnd) {
    const th = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < th; i++) this.rawSet(x, y + i, z, B.CACTUS);
    if (th >= 3 && rnd() < 0.6) {
      const dir = rnd() < 0.5 ? 1 : -1;
      this.placeLeaf(x + dir, y + 1, z, B.CACTUS); this.placeLeaf(x + dir, y + 2, z, B.CACTUS);
    }
  }
  prismTree(x, y, z, rnd) {
    const th = 6 + Math.floor(rnd() * 6);
    for (let i = 0; i < th; i++) this.rawSet(x, y + i, z, B.PALE_LOG);
    const cols = [B.PRISM_PINK, B.PRISM_GOLD, B.PRISM_LILAC];
    const clump = (cx, cy, cz, s, id) => {
      for (let dy = 0; dy < s; dy++) for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) this.placeLeaf(cx + dx, cy + dy, cz + dz, id);
    };
    clump(x - 1, y + th - 1, z - 1, 3, cols[Math.floor(rnd() * 3)]);
    const n = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const hy = y + Math.floor(th * 0.4 + rnd() * th * 0.6);
      const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rnd() * 4)];
      const len = 1 + Math.floor(rnd() * 2);
      for (let i = 1; i <= len; i++) this.placeLeaf(x + dir[0] * i, hy, z + dir[1] * i, B.PALE_LOG);
      const s = 2;
      clump(x + dir[0] * (len + 1) - (dir[0] === 0 ? 1 : dir[0] < 0 ? 1 : 0), hy, z + dir[1] * (len + 1) - (dir[1] === 0 ? 1 : dir[1] < 0 ? 1 : 0), s, cols[Math.floor(rnd() * 3)]);
    }
  }

  // ------------------------------------------------------------ lighting
  // Recompute light in [x0..x1]×[z0..z1] (full height). Light spreads beyond the box only upward.
  relight(x0, z0, x1, z1) {
    x0 = Math.max(0, x0); z0 = Math.max(0, z0); x1 = Math.min(W - 1, x1); z1 = Math.min(D - 1, z1);
    const L = this.light, BL = this.blocks;
    const WD = W * D;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      let s = 15;
      for (let y = H - 1; y >= 0; y--) {
        const i = x + W * (z + D * y);
        const id = BL[i], f = FILTER[id];
        if (f >= 15) s = 0; else if (f > 0) s = Math.max(0, s - f);
        L[i] = s | (EMIT[id] << 4);
      }
    }
    let head = 0, tail = 0;
    const push = (i) => { queue[tail] = i; tail = (tail + 1) & (QSIZE - 1); };
    const bx0 = Math.max(0, x0 - 1), bz0 = Math.max(0, z0 - 1), bx1 = Math.min(W - 1, x1 + 1), bz1 = Math.min(D - 1, z1 + 1);
    for (let y = 0; y < H; y++) for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) {
      const i = x + W * (z + D * y);
      const l = L[i];
      if (l === 0) continue;
      const s = l & 15;
      if (l >> 4 >= 2) { push(i); continue; }
      if (s < 2) continue;
      // only seed sky cells that have a darker transparent neighbour
      let need = false;
      if (x > 0 && !OPAQUE[BL[i - 1]] && (L[i - 1] & 15) < s - 1) need = true;
      else if (x < W - 1 && !OPAQUE[BL[i + 1]] && (L[i + 1] & 15) < s - 1) need = true;
      else if (z > 0 && !OPAQUE[BL[i - W]] && (L[i - W] & 15) < s - 1) need = true;
      else if (z < D - 1 && !OPAQUE[BL[i + W]] && (L[i + W] & 15) < s - 1) need = true;
      else if (y > 0 && !OPAQUE[BL[i - WD]] && (L[i - WD] & 15) < s - 1) need = true;
      else if (y < H - 1 && !OPAQUE[BL[i + WD]] && (L[i + WD] & 15) < s - 1) need = true;
      if (need) push(i);
    }
    while (head !== tail) {
      const i = queue[head]; head = (head + 1) & (QSIZE - 1);
      const l = L[i], s = l & 15, b = l >> 4;
      const x = i % W, t = (i / W) | 0, z = t % D, y = (t / D) | 0;
      for (let k = 0; k < 6; k++) {
        let n;
        if (k === 0) { if (x === 0) continue; n = i - 1; }
        else if (k === 1) { if (x === W - 1) continue; n = i + 1; }
        else if (k === 2) { if (z === 0) continue; n = i - W; }
        else if (k === 3) { if (z === D - 1) continue; n = i + W; }
        else if (k === 4) { if (y === 0) continue; n = i - WD; }
        else { if (y === H - 1) continue; n = i + WD; }
        const f = FILTER[BL[n]];
        if (f >= 15) continue;
        const ns = s - 1 - f, nb = b - 1 - f;
        const c = L[n];
        let cs = c & 15, cb = c >> 4, ch = false;
        if (ns > cs) { cs = ns; ch = true; }
        if (nb > cb) { cb = nb; ch = true; }
        if (ch) { L[n] = cs | (cb << 4); push(n); }
      }
    }
  }

  // Change a block; returns the box of chunks that need remeshing.
  setBlock(x, y, z, id, record = true) {
    if (!this.inside(x, y, z)) return null;
    const i = this.idx(x, y, z);
    const old = this.blocks[i];
    if (old === id) return null;
    this.blocks[i] = id;
    if (record) this.edits.set(i, id);
    if ((SMOOTH[old] || SMOOTH[id]) && y >= this.height[x + z * W] - 1) this.surf[x + z * W] = 0;
    const R = 15;
    const ax0 = Math.max(0, x - R), ax1 = Math.min(W - 1, x + R), az0 = Math.max(0, z - R), az1 = Math.min(D - 1, z + R);
    // snapshot old light to find what changed
    const snap = new Uint8Array((ax1 - ax0 + 3) * (az1 - az0 + 3) * H);
    const sw = ax1 - ax0 + 3, sd = az1 - az0 + 3;
    const sx0 = ax0 - 1, sz0 = az0 - 1;
    for (let yy = 0; yy < H; yy++) for (let zz = 0; zz < sd; zz++) for (let xx = 0; xx < sw; xx++) {
      const wx = sx0 + xx, wz = sz0 + zz;
      if (wx < 0 || wz < 0 || wx >= W || wz >= D) continue;
      snap[xx + sw * (zz + sd * yy)] = this.light[this.idx(wx, yy, wz)];
    }
    this.relight(ax0, az0, ax1, az1);
    let mx0 = x, mx1 = x, mz0 = z, mz1 = z, my0 = y, my1 = y;
    for (let yy = 0; yy < H; yy++) for (let zz = 0; zz < sd; zz++) for (let xx = 0; xx < sw; xx++) {
      const wx = sx0 + xx, wz = sz0 + zz;
      if (wx < 0 || wz < 0 || wx >= W || wz >= D) continue;
      if (snap[xx + sw * (zz + sd * yy)] !== this.light[this.idx(wx, yy, wz)]) {
        if (wx < mx0) mx0 = wx; if (wx > mx1) mx1 = wx;
        if (wz < mz0) mz0 = wz; if (wz > mz1) mz1 = wz;
        if (yy < my0) my0 = yy; if (yy > my1) my1 = yy;
      }
    }
    return { x0: mx0 - 1, x1: mx1 + 1, z0: mz0 - 1, z1: mz1 + 1, old };
  }

  applyEdits(list) {
    for (const [i, id] of list) {
      const old = this.blocks[i];
      this.blocks[i] = id; this.edits.set(i, id);
      const x = i % W, t = (i / W) | 0, z = t % D, y = (t / D) | 0;
      if ((SMOOTH[old] || SMOOTH[id]) && y >= this.height[x + z * W] - 1) this.surf[x + z * W] = 0;
    }
  }
  // Visual ground offset at a point: difference between smooth surface and block top (for feet/props)
  groundOffset(px, pz, footY) {
    const fx = px - 0.5, fz = pz - 0.5;
    const x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
    let acc = 0, wsum = 0;
    for (let k = 0; k < 4; k++) {
      const x = x0 + (k & 1), z = z0 + (k >> 1);
      if (x < 0 || z < 0 || x >= W || z >= D) continue;
      const S = this.surf[x + z * W], h = this.height[x + z * W];
      if (!S || Math.abs(h + 1 - footY) > 1.01) continue;
      const w = ((k & 1) ? tx : 1 - tx) * ((k >> 1) ? tz : 1 - tz);
      acc += (S - footY) * w; wsum += w;
    }
    return wsum > 0.3 ? Math.max(-0.6, Math.min(0.6, acc / wsum)) : 0;
  }
}
