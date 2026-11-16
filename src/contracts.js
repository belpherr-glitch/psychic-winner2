// Contratos: cada um gera um canteiro com zona marcada e critério de entrega.
import * as THREE from 'three';
import { clamp } from './util.js';
import {
  H, LOOSE, MAT, G, CELL, CA, HALF, toG, toW, heightAt,
  addPile, clearGrass, roughen, carvePit, forRect,
} from './terrain.js';

export const JOBS = [
  {
    id: 'lote', title: 'Nivelar lote residencial', client: 'Família Moreira', soil: 0, pay: 1400, req: ['loader'],
    blurb: 'Corte os montes e preencha as covas até o lote ficar na linha de nível. Tolerância de 15 cm.',
    size: '14 × 12 m',
    setup(c) {
      const z = [-7, -4, 7, 8];
      clearGrass(...z, 2);
      roughen(...z, 0.9, 0.16, c.rand);
      addPile(-3, 4, 2.6, 1.3, 0, c.rand);
      addPile(4, -1, 2.2, 1.0, 0, c.rand);
      return { type: 'level', zone: z, tol: 0.15, need: 0.85 };
    },
  },
  {
    id: 'estrada', title: 'Estrada de cascalho na margem', client: 'Prefeitura de Rio Claro', soil: 0, pay: 2600, req: ['loader', 'truck'],
    blurb: 'Leve o cascalho do pátio até a faixa da estrada e espalhe uma camada de pelo menos 12 cm.',
    size: '4 × 28 m',
    setup(c) {
      const z = [11, -14, 15, 14];
      clearGrass(...z, 1);
      addPile(-6, -19, 4.4, 2.1, 1, c.rand);
      addPile(1.5, -21, 3.2, 1.5, 1, c.rand);
      clearGrass(-11, -25, 6, -14, 1.5);
      return { type: 'spread', zone: z, tol: 0.12, need: 0.8, mat: 1, reserved: [[-11, -25, 6, -14]] };
    },
  },
  {
    id: 'aterro', title: 'Aterrar buraco de erosão', client: 'Sítio Boa Vista', soil: 0, pay: 1900, req: ['loader'],
    blurb: 'A chuva abriu uma vala. Use a areia dos montes para aterrar até o nível do terreno.',
    size: '7 × 6 m',
    setup(c) {
      const z = [-3.5, -2, 3.5, 4];
      c.target = new Float32Array(H);
      clearGrass(...z, 2.5);
      carvePit(...z, 1.25, 1.1);
      addPile(-11, 3, 3.6, 1.8, 2, c.rand);
      addPile(-10, -6, 3.3, 1.7, 2, c.rand);
      return { type: 'fill', zone: z, tol: 0.15, need: 0.85, reserved: [[-15, -10, -6, 7]] };
    },
  },
  {
    id: 'fundacao', title: 'Cavar fundação de galpão', client: 'Agro Cerrado Ltda.', soil: 3, pay: 2900, req: ['loader'],
    blurb: 'Escave a área marcada 90 cm abaixo do terreno. Argila é dura: entre com a caçamba em várias passadas.',
    size: '9 × 7 m',
    setup(c) {
      const z = [-4.5, -3, 4.5, 4];
      clearGrass(...z, 1.5);
      c.target = new Float32Array(H);
      for (let i = 0; i < c.target.length; i++) c.target[i] -= 0.9;
      return { type: 'dig', zone: z, tol: 0.15, need: 0.8 };
    },
  },
  {
    id: 'botafora', title: 'Retirar monte de terra', client: 'Construtora Horizonte', soil: 0, pay: 2300, req: ['loader', 'truck'],
    blurb: 'Carregue o caminhão e despeje 20 m³ de terra no bota-fora marcado do outro lado do terreno.',
    size: '20 m³',
    setup(c) {
      addPile(-3, 3, 5.4, 2.4, 0, c.rand);
      clearGrass(-9, -3, 3, 9, 1);
      const hx = -22, hz = 24;
      clearGrass(hx - 5, hz - 5, hx + 5, hz + 5, 1);
      return { type: 'haul', haul: { x: hx, z: hz, r: 5, target: 20 }, reserved: [[-9, -3, 3, 9], [hx - 7, hz - 7, hx + 7, hz + 7]] };
    },
  },
  {
    id: 'loteamento', title: 'Terraplanagem de loteamento', client: 'Incorporadora Vale Verde', soil: 0, pay: 6500, req: ['dozer'],
    blurb: 'Área grande com morros. Use o trator de esteira para cortar os altos e jogar nos baixos.',
    size: '24 × 20 m',
    setup(c) {
      const z = [-12, -8, 12, 12];
      clearGrass(...z, 2);
      roughen(...z, 2.0, 0.09, c.rand);
      addPile(-6, 6, 3.6, 1.6, 0, c.rand);
      addPile(7, -3, 3.4, 1.5, 0, c.rand);
      return { type: 'level', zone: z, tol: 0.2, need: 0.8 };
    },
  },
  {
    id: 'livre', title: 'Pátio livre', client: 'Seu pátio', soil: 0, pay: 0, req: [],
    blurb: 'Sem prazo e sem cliente. Montes de terra, cascalho, areia e argila para treinar.',
    size: 'Livre',
    setup(c) {
      addPile(-9, 2, 3.4, 1.7, 0, c.rand);
      addPile(0, 10, 3.4, 1.7, 1, c.rand);
      addPile(9, 2, 3.4, 1.7, 2, c.rand);
      addPile(0, -6, 3.4, 1.7, 3, c.rand);
      clearGrass(-13, -10, 13, 14, 2);
      return { type: 'free' };
    },
  },
];

export const STAGING = [[-17, -27], [-10.5, -27], [-4, -27], [2.5, -27]];

/* ---------- avaliação e sobreposição ---------- */
const C_OK = new THREE.Color(0x3fd27a), C_CUT = new THREE.Color(0xff6a3d), C_FILL = new THREE.Color(0x3f8dff), C_NEED = new THREE.Color(0xffd23f);

export class Job {
  constructor(def, spec, ctx, scene) {
    this.def = def;
    Object.assign(this, spec);
    this.progress = 0;
    this.delivered = 0;
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    if (this.zone) {
      const [x0, z0, x1, z1] = this.zone;
      this.gx0 = Math.ceil(toG(x0)); this.gx1 = Math.floor(toG(x1));
      this.gz0 = Math.ceil(toG(z0)); this.gz1 = Math.floor(toG(z1));
      this.nx = this.gx1 - this.gx0 + 1; this.nz = this.gz1 - this.gz0 + 1;
      const n = this.nx * this.nz;
      this.T = new Float32Array(n);
      if (this.type === 'level') {
        let s = 0;
        this.eachZone((i) => { s += H[i]; });
        const mean = s / n;
        this.T.fill(mean);
        this.level = mean;
      } else if (this.type === 'spread') {
        this.eachZone((i, k) => { this.T[k] = H[i] + this.tol; });
        this.base = this.T.map((v) => v - this.tol);
      } else {
        this.eachZone((i, k) => { this.T[k] = ctx.target[i]; });
      }
      this.buildOverlay();
      this.buildStakes();
    }
    if (this.haul) this.buildHaulRing();
    this.buildMarker();
  }

  eachZone(fn) {
    let k = 0;
    for (let z = this.gz0; z <= this.gz1; z++) for (let x = this.gx0; x <= this.gx1; x++) fn(z * G + x, k++, x, z);
  }

  center() {
    if (this.zone) return [(this.zone[0] + this.zone[2]) / 2, (this.zone[1] + this.zone[3]) / 2];
    if (this.haul) return [this.haul.x, this.haul.z];
    return [0, 0];
  }

  buildOverlay() {
    const g = new THREE.BufferGeometry();
    const nx = this.nx, nz = this.nz;
    this.ovPos = new Float32Array(nx * nz * 3);
    this.ovCol = new Float32Array(nx * nz * 3);
    const idx = [];
    for (let z = 0; z < nz - 1; z++) for (let x = 0; x < nx - 1; x++) {
      const a = z * nx + x, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.ovPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.ovCol, 3));
    this.ov = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    this.ov.frustumCulled = false;
    this.ov.renderOrder = 2;
    this.group.add(this.ov);
  }

  buildStakes() {
    const [x0, z0, x1, z1] = this.zone;
    const post = new THREE.MeshLambertMaterial({ color: 0xe9d3a6 });
    const flag = new THREE.MeshLambertMaterial({ color: 0xff5a1f, side: THREE.DoubleSide });
    const pts = [];
    const step = 4;
    const nxs = Math.max(1, Math.round((x1 - x0) / step)), nzs = Math.max(1, Math.round((z1 - z0) / step));
    for (let i = 0; i <= nxs; i++) { pts.push([x0 + ((x1 - x0) * i) / nxs, z0]); pts.push([x0 + ((x1 - x0) * i) / nxs, z1]); }
    for (let i = 1; i < nzs; i++) { pts.push([x0, z0 + ((z1 - z0) * i) / nzs]); pts.push([x1, z0 + ((z1 - z0) * i) / nzs]); }
    for (const [x, z] of pts) {
      const h = heightAt(x, z);
      const tall = this.type === 'level' ? Math.max(0.9, this.level - h + 0.5) : 1.1;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, tall, 0.07), post);
      p.position.set(x, h + tall / 2 - 0.1, z);
      p.castShadow = true;
      this.group.add(p);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.2), flag);
      f.position.set(x + 0.17, h + tall - 0.2, z);
      f.rotation.y = Math.random() * 6;
      this.group.add(f);
    }
    if (this.type === 'level') {
      const y = this.level;
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1, y, z0), new THREE.Vector3(x1, y, z1), new THREE.Vector3(x0, y, z1),
      ]);
      const line = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0xff3b1f }));
      this.group.add(line);
    }
  }

  buildHaulRing() {
    const { x, z, r } = this.haul;
    const g = new THREE.RingGeometry(r - 0.35, r, 48);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i) + x, p.getZ(i) + z) + 0.08);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, depthWrite: false }));
    m.position.set(x, 0, z);
    this.group.add(m);
    this.ring = m;
  }

  buildMarker() {
    const [cx, cz] = this.center();
    if (this.type === 'free') return;
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 4), new THREE.MeshLambertMaterial({ color: 0xff7a1f, emissive: 0x662200 }));
    m.rotation.x = Math.PI;
    m.position.set(cx, heightAt(cx, cz) + 7, cz);
    this.marker = m;
    this.markerY = m.position.y;
    this.group.add(m);
  }

  // partícula pousou: conta pro bota-fora
  onLand(x, z, v) {
    if (!this.haul) return;
    const dx = x - this.haul.x, dz = z - this.haul.z;
    if (dx * dx + dz * dz < this.haul.r * this.haul.r) this.delivered += v;
  }

  evaluate() {
    if (this.type === 'free') { this.progress = 0; return; }
    if (this.type === 'haul') { this.progress = clamp(this.delivered / this.haul.target, 0, 1); return; }
    let ok = 0, n = 0;
    const tol = this.tol;
    const pos = this.ovPos, col = this.ovCol;
    this.eachZone((i, k, x, z) => {
      n++;
      const h = H[i], t = this.T[k], d = h - t;
      let c, good = false;
      if (this.type === 'level') {
        if (Math.abs(d) <= tol) { good = true; c = C_OK; } else c = d > 0 ? C_CUT : C_FILL;
      } else if (this.type === 'fill') {
        if (d >= -tol) { good = true; c = d > 0.6 ? C_CUT : C_OK; } else c = C_FILL;
      } else if (this.type === 'dig') {
        if (d <= tol) { good = true; c = C_OK; } else c = C_CUT;
      } else if (this.type === 'spread') {
        if (h - this.base[k] >= tol && MAT[i] === this.mat && LOOSE[i] > 0.04) { good = true; c = C_OK; } else c = C_NEED;
      }
      if (good) ok++;
      pos[k * 3] = toW(x); pos[k * 3 + 1] = h + 0.04; pos[k * 3 + 2] = toW(z);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    });
    this.ov.geometry.attributes.position.needsUpdate = true;
    this.ov.geometry.attributes.color.needsUpdate = true;
    this.progress = n ? ok / n : 0;
  }

  get goal() { return this.type === 'haul' ? 1 : this.need; }
  get done() { return this.type !== 'free' && this.progress >= this.goal; }

  label() {
    const pct = (v) => Math.round(v * 100) + '%';
    switch (this.type) {
      case 'level': return `Nivelado ${pct(this.progress)} · meta ${pct(this.need)}`;
      case 'fill': return `Aterrado ${pct(this.progress)} · meta ${pct(this.need)}`;
      case 'dig': return `Escavado ${pct(this.progress)} · meta ${pct(this.need)}`;
      case 'spread': return `Cascalho espalhado ${pct(this.progress)} · meta ${pct(this.need)}`;
      case 'haul': return `No bota-fora ${this.delivered.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} de ${this.haul.target} m³`;
      default: return 'Treino livre';
    }
  }

  legend() {
    switch (this.type) {
      case 'level': return [['cut', 'Cortar'], ['fill', 'Aterrar'], ['ok', 'No nível']];
      case 'fill': return [['fill', 'Falta material'], ['ok', 'Aterrado']];
      case 'dig': return [['cut', 'Escavar'], ['ok', 'Na cota']];
      case 'spread': return [['need', 'Sem cascalho'], ['ok', 'Camada pronta']];
      default: return [];
    }
  }

  tick(t) {
    if (this.marker) {
      this.marker.position.y = this.markerY + Math.sin(t * 2.5) * 0.4;
      this.marker.rotation.y = t;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
