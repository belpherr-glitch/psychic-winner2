// Instanced cube particles + floating damage numbers.
import * as THREE from 'three';

const MAX = 600;
export class Particles {
  constructor(scene) {
    const g = new THREE.BoxGeometry(1, 1, 1);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(g, this.mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.p = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.e = new THREE.Euler();
  }
  spawn(x, y, z, vx, vy, vz, color, size = 0.1, life = 0.8, grav = 18, glow = false) {
    if (this.p.length >= MAX) this.p.shift();
    this.p.push({ x, y, z, vx, vy, vz, c: color, size, life, max: life, grav, glow, rot: Math.random() * 6 });
  }
  burst(x, y, z, colors, n = 12, speed = 4, size = 0.12) {
    for (let i = 0; i < n; i++) {
      const c = colors[Math.floor(Math.random() * colors.length)];
      this.spawn(x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed, c, size * (0.6 + Math.random() * 0.8), 0.5 + Math.random() * 0.5);
    }
  }
  update(dt, world, light) {
    const arr = this.p;
    let n = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) { arr.splice(i, 1); continue; }
      p.vy -= p.grav * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (p.grav > 0 && world.isSolid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) { p.vx *= 0.3; p.vz *= 0.3; p.vy = 0; }
      else { p.x = nx; p.y = ny; p.z = nz; }
      p.rot += dt * 4;
    }
    for (const p of arr) {
      if (n >= MAX) break;
      const k = Math.min(1, p.life / p.max * 2);
      const sz = p.size * (p.glow ? k : Math.min(1, k + 0.3));
      this.e.set(p.rot, p.rot * 0.7, 0);
      this.q.setFromEuler(this.e);
      this.s.set(sz, sz, sz);
      this.m.compose(new THREE.Vector3(p.x, p.y, p.z), this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      const l = p.glow ? 1 : light(p.x, p.y, p.z);
      this.mesh.instanceColor.setXYZ(n, p.c.r * l, p.c.g * l, p.c.b * l);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

export class DamageText {
  constructor(scene) { this.scene = scene; this.list = []; }
  add(x, y, z, text, color = '#ffb347', big = false) {
    const c = document.createElement('canvas');
    const fs = big ? 44 : 34;
    c.width = 192; c.height = 64;
    const g = c.getContext('2d');
    g.font = `bold ${fs}px "Pixelify Sans", "Courier New", monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 7; g.strokeStyle = '#1a0f12'; g.strokeText(text, 96, 34);
    g.fillStyle = color; g.fillText(text, 96, 34);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, transparent: true, fog: false }));
    s.renderOrder = 20;
    const sc = big ? 1.6 : 1.2;
    s.scale.set(sc * 3, sc, 1);
    s.position.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6);
    this.scene.add(s);
    this.list.push({ s, life: 1.0, vy: 2.2 });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.life -= dt; d.vy -= dt * 2.5;
      d.s.position.y += d.vy * dt;
      d.s.material.opacity = Math.min(1, d.life * 2);
      if (d.life <= 0) { this.scene.remove(d.s); d.s.material.map.dispose(); d.s.material.dispose(); this.list.splice(i, 1); }
    }
  }
}
