// Sky dome, pixel sun & moon, stars, voxel clouds and the day/night palette.
import * as THREE from 'three';
import { Painter } from './pixel.js';
import { mulberry32 } from './noise.js';

const C = (h) => new THREE.Color(h);
const DAY_TOP = C('#3f86dc'), DAY_HOR = C('#b9dcf6');
const SET_TOP = C('#3d5aa0'), SET_HOR = C('#f39a6a');
const NIGHT_TOP = C('#04081a'), NIGHT_HOR = C('#16224a');

function spriteTex(p) {
  const t = new THREE.CanvasTexture(p.toCanvas());
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.uniforms = {
      uTop: { value: DAY_TOP.clone() }, uHor: { value: DAY_HOR.clone() },
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uGlow: { value: new THREE.Color('#fff2c0') },
    };
    const dome = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 16), new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uGlow; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y, -1.0, 1.0); float t = pow(max(h, 0.0), 0.55);
          vec3 c = mix(uHor, uTop, t); if (h < 0.0) c = mix(uHor, uHor * 0.7, clamp(-h * 3.0, 0.0, 1.0));
          float g = max(dot(vDir, uSun), 0.0); c += uGlow * (pow(g, 24.0) * 0.6 + pow(g, 4.0) * 0.12);
          // dithered banding for a pixel feel
          gl_FragColor = vec4(floor(c * 48.0) / 48.0, 1.0); }`,
    }));
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.dome = dome;
    this.group.add(dome);

    // sun
    const sp = new Painter(32, 32, 5);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const d = Math.max(Math.abs(x - 15.5), Math.abs(y - 15.5));
      const r = Math.hypot(x - 15.5, y - 15.5);
      if (d < 8) sp.set(x, y, d < 6 ? (r < 4 ? '#fffbe6' : '#ffe98a') : '#ffd24a');
      else if (r < 15 && ((x + y) % 4 === 0 || x === 15 || x === 16 || y === 15 || y === 16)) sp.set(x, y, [255, 210, 90, 110]);
    }
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex(sp), fog: false, depthWrite: false, transparent: true }));
    this.sun.scale.set(70, 70, 1);
    this.sun.renderOrder = -9;
    this.group.add(this.sun);
    // moon (crescent with craters)
    const mp = new Painter(16, 16, 6);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const r = Math.hypot(x - 7.5, y - 7.5), r2 = Math.hypot(x - 10.5, y - 5.5);
      if (r < 6.5 && r2 > 5) mp.set(x, y, r > 5.5 ? '#c8d0e8' : '#eef2ff');
    }
    mp.set(4, 8, '#b8c0dc'); mp.set(5, 10, '#b8c0dc'); mp.set(6, 11, '#c8d0e8');
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex(mp), fog: false, depthWrite: false, transparent: true }));
    this.moon.scale.set(45, 45, 1);
    this.moon.renderOrder = -9;
    this.group.add(this.moon);

    // stars
    const rnd = mulberry32(77);
    const sp2 = [], sc = [];
    for (let i = 0; i < 700; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const v = new THREE.Vector3(r * Math.cos(a), Math.abs(u) * 0.9 + 0.05, r * Math.sin(a)).normalize().multiplyScalar(400);
      sp2.push(v.x, v.y, v.z);
      const b = 0.6 + rnd() * 0.4;
      sc.push(b, b, b * (0.9 + rnd() * 0.2));
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp2, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    this.starMat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    this.buildClouds();
  }

  buildClouds() {
    const rnd = mulberry32(1234);
    const pos = [], col = [], idx = [];
    const box = (x0, y0, z0, w, h, d) => {
      const faces = [
        [[1, 1, 1], [1, 1, 0], [1, 0, 0], [1, 0, 1], 0.86], [[0, 1, 0], [0, 1, 1], [0, 0, 1], [0, 0, 0], 0.86],
        [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1], 1.0], [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0], 0.7],
        [[0, 1, 1], [1, 1, 1], [1, 0, 1], [0, 0, 1], 0.92], [[1, 1, 0], [0, 1, 0], [0, 0, 0], [1, 0, 0], 0.8],
      ];
      for (const f of faces) {
        const base = pos.length / 3;
        for (let k = 0; k < 4; k++) {
          const c = f[k];
          pos.push(x0 + c[0] * w, y0 + c[1] * h, z0 + c[2] * d);
          const s = f[4] * (c[1] ? 1 : 0.9);
          col.push(s, s, Math.min(1, s * 1.04));
        }
        idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
      }
    };
    this.cloudSpan = 520;
    for (let i = 0; i < 34; i++) {
      const cx = (rnd() - 0.5) * this.cloudSpan, cz = (rnd() - 0.5) * this.cloudSpan, cy = 105 + rnd() * 30;
      const n = 5 + Math.floor(rnd() * 8);
      const spread = 10 + rnd() * 14;
      for (let k = 0; k < n; k++) {
        const w = 6 + rnd() * 12, d = 6 + rnd() * 12;
        const ox = (rnd() - 0.5) * spread * 2, oz = (rnd() - 0.5) * spread;
        const fall = 1 - Math.min(1, Math.hypot(ox / spread, oz / spread));
        const h = 3 + fall * 8 + rnd() * 3;
        box(cx + ox - w / 2, cy, cz + oz - d / 2, w, h, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    this.cloudMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.93 });
    this.clouds = new THREE.Mesh(g, this.cloudMat);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -5;
    const copy = new THREE.Mesh(g, this.cloudMat);
    copy.frustumCulled = false; copy.renderOrder = -5; copy.position.x = -this.cloudSpan;
    this.clouds.add(copy);
    this.cloudOff = 0;
    this.scene.add(this.clouds);
  }

  // t: 0 sunrise, .25 noon, .5 sunset, .75 midnight
  update(t, camPos, dt, worldCenter) {
    const a = t * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.35).normalize();
    const h = sunDir.y;
    const day = THREE.MathUtils.smoothstep(h, -0.15, 0.25);
    const dusk = Math.max(0, 1 - Math.abs(h) / 0.3) * 0.9;
    const top = NIGHT_TOP.clone().lerp(DAY_TOP, day).lerp(SET_TOP, dusk * 0.5);
    const hor = NIGHT_HOR.clone().lerp(DAY_HOR, day).lerp(SET_HOR, dusk * 0.75);
    this.uniforms.uTop.value.copy(top);
    this.uniforms.uHor.value.copy(hor);
    this.uniforms.uSun.value.copy(sunDir);
    this.uniforms.uGlow.value.set(h > -0.2 ? '#ffe6a8' : '#000000').multiplyScalar(Math.max(0, Math.min(1, (h + 0.2) * 3)));
    this.group.position.copy(camPos);
    this.sun.position.copy(sunDir).multiplyScalar(300);
    this.moon.position.copy(sunDir).multiplyScalar(-300);
    this.starMat.opacity = Math.max(0, 1 - day * 1.6);
    this.cloudMat.color.copy(new THREE.Color(0.2, 0.22, 0.32).lerp(new THREE.Color(1, 1, 1), day)).lerp(new THREE.Color(1, 0.75, 0.6), dusk * 0.5);
    this.cloudOff = (this.cloudOff + dt * 1.6) % this.cloudSpan;
    this.clouds.position.set(worldCenter.x + this.cloudOff, 0, worldCenter.z);
    const skyTint = new THREE.Color(0.55, 0.62, 0.95).lerp(new THREE.Color(1, 1, 1), day).lerp(new THREE.Color(1, 0.82, 0.7), dusk * 0.4);
    return { day: 0.16 + 0.84 * day, fog: hor, skyTint, sunDir, isNight: h < -0.08 };
  }
}
