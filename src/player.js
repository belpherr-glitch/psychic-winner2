// Movimentação do jogador: aceleração suave, giro suave, colisão e poeirinha ao correr.
import * as THREE from 'three';
import { Character } from './character.js';

export const WALK_SPEED = 1.9, RUN_SPEED = 4.2;
const RADIUS = 0.36;

export class Player {
  constructor(scene, cfg, world) {
    this.char = new Character(cfg);
    this.group = this.char.group;
    scene.add(this.group);
    this.world = world;
    this.pos = this.group.position;
    this.pos.copy(world.spawn);
    this.vel = new THREE.Vector2();
    this.heading = 0;
    this.speed = 0;

    this.puffs = [];
    const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#f3e3c2', transparent: true, opacity: 0 }));
      m.visible = false;
      scene.add(m);
      this.puffs.push({ m, t: 1 });
    }
    this.puffTimer = 0;
  }

  face(angle) {
    this.heading = angle;
    this.group.rotation.y = angle;
  }

  // mv: {x, y, m} relativo à câmera; camYaw: ângulo da câmera em volta do jogador
  update(dt, mv, camYaw) {
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    // tela-direita = (cos, -sin), tela-frente = (-sin, -cos)
    const dx = mv.x * cos - mv.y * sin, dz = -mv.x * sin - mv.y * cos;
    // até ~55% do analógico anda; perto do máximo corre
    const target = mv.m === 0 ? 0 : mv.m < 0.6 ? WALK_SPEED * (0.55 + mv.m * 0.75) : THREE.MathUtils.lerp(WALK_SPEED, RUN_SPEED, Math.min(1, (mv.m - 0.6) / 0.3));
    const k = 1 - Math.exp(-dt * (mv.m ? 9 : 12));
    this.vel.x += (dx * target - this.vel.x) * k;
    this.vel.y += (dz * target - this.vel.y) * k;
    this.speed = this.vel.length();

    if (mv.m > 0) {
      const want = Math.atan2(dx, dz);
      let diff = ((want - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.heading += diff * (1 - Math.exp(-dt * 12));
    }
    this.group.rotation.y = this.heading;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    this.collide();
    this.char.update(dt, this.speed, WALK_SPEED, RUN_SPEED);
    this.updatePuffs(dt);
  }

  collide() {
    const p = this.pos, w = this.world, B = w.bounds;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of w.colliders.circles) {
        const dx = p.x - c.x, dz = p.z - c.z, min = c.r + RADIUS;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          p.x = c.x + (dx / d) * min;
          p.z = c.z + (dz / d) * min;
        }
      }
      for (const b of w.colliders.boxes) {
        const x0 = b.x0 - RADIUS, x1 = b.x1 + RADIUS, z0 = b.z0 - RADIUS, z1 = b.z1 + RADIUS;
        if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) {
          const pen = [p.x - x0, x1 - p.x, p.z - z0, z1 - p.z];
          const m = Math.min(...pen);
          if (m === pen[0]) p.x = x0; else if (m === pen[1]) p.x = x1; else if (m === pen[2]) p.z = z0; else p.z = z1;
        }
      }
    }
    p.x = Math.max(-B, Math.min(B, p.x));
    p.z = Math.max(-B, Math.min(B, p.z));
  }

  updatePuffs(dt) {
    this.puffTimer -= dt;
    if (this.speed > RUN_SPEED * 0.8 && this.puffTimer <= 0) {
      this.puffTimer = 0.2;
      const p = this.puffs.find((q) => q.t >= 1);
      if (p) {
        p.t = 0;
        p.m.visible = true;
        p.m.position.set(this.pos.x - Math.sin(this.heading) * 0.25 + (Math.random() - 0.5) * 0.2, 0.08, this.pos.z - Math.cos(this.heading) * 0.25 + (Math.random() - 0.5) * 0.2);
        p.m.rotation.y = Math.random() * 3;
      }
    }
    for (const p of this.puffs) {
      if (p.t >= 1) continue;
      p.t += dt * 2.2;
      p.m.position.y += dt * 0.5;
      p.m.scale.setScalar(0.8 + p.t * 1.6);
      p.m.material.opacity = 0.7 * (1 - p.t);
      if (p.t >= 1) p.m.visible = false;
    }
  }
}
