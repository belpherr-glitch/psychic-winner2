// A fazenda: chão pintado em pixel art, casa, cerca, árvores, lago e céu.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cozyMat, waterMat } from './materials.js';
import * as T from './textures.js';
import { LAYOUT, groundKind, rng } from './textures.js';

// caixa com UV proporcional ao tamanho (a textura repete em vez de esticar)
function texBox(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, (uv.getX(k) * spans[f][0]) / tile, (uv.getY(k) * spans[f][1]) / tile);
  }
  return g;
}

export function buildWorld(scene) {
  const colliders = { circles: [], boxes: [] };
  const updaters = [];
  const r = rng(1234);
  const mesh = (geo, mat, x = 0, y = 0, z = 0, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  // ---------- céu ----------
  const horizon = new THREE.Color('#ffe9c9');
  scene.background = T.canvasTex(4, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#6fb7ea');
    g.addColorStop(0.45, '#a9dcf2');
    g.addColorStop(0.62, '#ffe9c9');
    g.addColorStop(1, '#ffe9c9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 128);
  });
  scene.background.magFilter = THREE.LinearFilter;
  scene.fog = new THREE.Fog(horizon, 48, 125);

  const hillMat = new THREE.MeshBasicMaterial({ color: '#8fc98a' });
  const hillMat2 = new THREE.MeshBasicMaterial({ color: '#a5d6a0' });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + r() * 0.3, d = 78 + r() * 30;
    const h = mesh(new THREE.SphereGeometry(1, 10, 6), i % 2 ? hillMat : hillMat2, Math.cos(a) * d, -2, Math.sin(a) * d, false);
    h.scale.set(22 + r() * 16, 9 + r() * 9, 22 + r() * 16);
    h.receiveShadow = false;
  }
  const cloudMat = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false });
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    const n = 3 + ((r() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(5 + r() * 5, 2 + r() * 1.5, 4 + r() * 3), cloudMat);
      b.position.set(k * 3.6 - n * 1.8, r() * 1.2, r() * 2);
      g.add(b);
    }
    const a = r() * Math.PI * 2, d = 70 + r() * 50;
    g.position.set(Math.cos(a) * d, 30 + r() * 16, Math.sin(a) * d);
    scene.add(g);
    clouds.push(g);
  }
  updaters.push((dt) => {
    for (const c of clouds) {
      c.position.x += dt * 0.5;
      if (c.position.x > 130) c.position.x = -130;
    }
  });

  // ---------- chão ----------
  const gt = T.groundTextures();
  const farm = mesh(new THREE.PlaneGeometry(gt.size, gt.size).rotateX(-Math.PI / 2), cozyMat({ map: gt.farm, rim: 0 }), 0, 0, 0, false);
  gt.outer.repeat.set(160, 160);
  const outer = mesh(new THREE.PlaneGeometry(320, 320).rotateX(-Math.PI / 2), cozyMat({ map: gt.outer, rim: 0 }), 0, -0.02, 0, false);
  outer.receiveShadow = false;
  void farm;

  // ---------- casa ----------
  const H = LAYOUT.house;
  const plank = T.plankTex(), shingle = T.shingleTex(), stone = T.stoneTex(), wood = T.woodTex(), brick = T.brickTex();
  const wallMat = cozyMat({ map: plank });
  const woodMat = cozyMat({ map: wood });
  const roofMat = cozyMat({ map: shingle });
  const front = H.z + H.d / 2;
  mesh(texBox(H.w + 0.4, 0.5, H.d + 0.4), cozyMat({ map: stone }), H.x, 0.25, H.z);
  mesh(texBox(H.w, 3.2, H.d), wallMat, H.x, 2.1, H.z);
  // telhado de duas águas
  const run = H.d / 2 + 0.6, rise = 2.5, slope = Math.hypot(run, rise), ang = Math.atan2(rise, run);
  for (const s of [1, -1]) {
    const slab = mesh(texBox(H.w + 1.2, 0.22, slope + 0.1), roofMat, H.x, 3.7 + rise / 2 - 0.12, H.z + (s * run) / 2);
    slab.rotation.x = s * ang;
  }
  mesh(texBox(H.w + 1.3, 0.2, 0.36), cozyMat({ color: '#a8463a', map: wood }), H.x, 3.7 + rise - 0.06, H.z);
  const tri = new THREE.Shape([new THREE.Vector2(-H.d / 2, 0), new THREE.Vector2(H.d / 2, 0), new THREE.Vector2(0, (rise * (H.d / 2)) / run)]);
  const triGeo = new THREE.ShapeGeometry(tri);
  const tuv = triGeo.attributes.uv;
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getX(i) / 2, tuv.getY(i) / 2);
  for (const s of [1, -1]) {
    const g = mesh(triGeo, cozyMat({ map: plank, side: THREE.DoubleSide }), H.x + s * (H.w / 2), 3.7, H.z);
    g.rotation.y = (s * Math.PI) / 2;
  }
  // chaminé + fumaça
  mesh(texBox(0.9, 2.2, 0.9, 1), cozyMat({ map: brick }), H.x + 2.6, 5.3, H.z - 1.2);
  mesh(texBox(1.1, 0.2, 1.1, 1), cozyMat({ map: stone }), H.x + 2.6, 6.45, H.z - 1.2);
  const puffMat = new THREE.MeshBasicMaterial({ color: '#fffaf0', transparent: true, opacity: 0.85 });
  const puffs = [];
  for (let i = 0; i < 5; i++) {
    const p = mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), puffMat.clone(), 0, 0, 0, false);
    p.receiveShadow = false;
    p.userData.t = i / 5;
    puffs.push(p);
  }
  updaters.push((dt) => {
    for (const p of puffs) {
      const t = (p.userData.t = (p.userData.t + dt * 0.11) % 1);
      p.position.set(H.x + 2.6 + t * 1.6 + Math.sin(t * 9) * 0.15, 6.7 + t * 3.4, H.z - 1.2);
      p.scale.setScalar(0.5 + t * 1.5);
      p.rotation.y = t * 3;
      p.material.opacity = 0.85 * (1 - t) * Math.min(1, t * 8);
    }
  });
  // porta, janelas, varanda
  const doorX = H.x;
  mesh(new THREE.BoxGeometry(1.3, 2.1, 0.12), cozyMat({ map: T.doorTex() }), doorX, 1.55, front + 0.03);
  const winTex = T.windowTex();
  for (const wx of [-2.9, 2.9]) {
    mesh(new THREE.BoxGeometry(1.4, 1.4, 0.12), cozyMat({ map: winTex }), H.x + wx, 2.3, front + 0.03);
    mesh(texBox(1.5, 0.3, 0.4, 1), woodMat, H.x + wx, 1.45, front + 0.2); // floreira
  }
  mesh(new THREE.BoxGeometry(1.3, 1.3, 0.12), cozyMat({ map: winTex }), H.x - H.w / 2 - 0.03, 2.3, H.z).rotation.y = Math.PI / 2;
  mesh(new THREE.BoxGeometry(1.3, 1.3, 0.12), cozyMat({ map: winTex }), H.x + H.w / 2 + 0.03, 2.3, H.z).rotation.y = Math.PI / 2;
  mesh(texBox(3, 0.5, 1.5, 1), woodMat, doorX, 0.25, front + 0.75);
  mesh(texBox(2, 0.25, 0.5, 1), woodMat, doorX, 0.125, front + 1.75);
  for (const px of [-1.35, 1.35]) mesh(texBox(0.18, 2.5, 0.18, 1), woodMat, doorX + px, 1.75, front + 1.35);
  const porch = mesh(texBox(3.6, 0.16, 2, 2), roofMat, doorX, 3.1, front + 0.85);
  porch.rotation.x = 0.28;
  colliders.boxes.push({ x0: H.x - H.w / 2 - 0.25, x1: H.x + H.w / 2 + 0.25, z0: H.z - H.d / 2 - 0.25, z1: front + 0.25 });
  colliders.boxes.push({ x0: doorX - 1.5, x1: doorX + 1.5, z0: front, z1: front + 1.5 });

  // caixa de correio
  const mx = H.x + 3.3, mz = front + 2.4;
  mesh(texBox(0.14, 1, 0.14, 1), woodMat, mx, 0.5, mz);
  mesh(new THREE.BoxGeometry(0.42, 0.34, 0.6), cozyMat({ color: '#e8615a', map: T.noiseTex() }), mx, 1.15, mz);
  mesh(new THREE.BoxGeometry(0.05, 0.3, 0.1), cozyMat({ color: '#f6cf57' }), mx + 0.24, 1.3, mz + 0.1);
  colliders.circles.push({ x: mx, z: mz, r: 0.3 });

  // ---------- cerca ----------
  const F = LAYOUT.fence;
  const posts = [], rails = [];
  const dummy = new THREE.Object3D();
  const side = (ax, fixed) => {
    for (let t = -F; t <= F; t += 2) {
      const x = ax === 'x' ? t : fixed, z = ax === 'x' ? fixed : t;
      const gate = ax === 'x' && fixed > 0 && Math.abs(t) < 2;
      if (!gate) posts.push([x, z]);
      if (t < F && !(ax === 'x' && fixed > 0 && t >= -2 && t < 2)) rails.push([ax === 'x' ? t + 1 : fixed, ax === 'x' ? fixed : t + 1, ax === 'x' ? 0 : Math.PI / 2]);
    }
  };
  side('x', -F); side('x', F); side('z', -F); side('z', F);
  const postI = new THREE.InstancedMesh(texBox(0.26, 1.15, 0.26, 1), woodMat, posts.length);
  posts.forEach((p, i) => { dummy.position.set(p[0], 0.575, p[1]); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); postI.setMatrixAt(i, dummy.matrix); });
  const railI = new THREE.InstancedMesh(texBox(2, 0.14, 0.09, 1), cozyMat({ color: '#e9d2a8', map: wood }), rails.length * 2);
  rails.forEach((p, i) => {
    for (let k = 0; k < 2; k++) {
      dummy.position.set(p[0], 0.45 + k * 0.42, p[1]); dummy.rotation.set(0, p[2], 0); dummy.updateMatrix();
      railI.setMatrixAt(i * 2 + k, dummy.matrix);
    }
  });
  for (const m of [postI, railI]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  // porteira
  for (const s of [-1, 1]) {
    mesh(texBox(0.3, 1.5, 0.3, 1), woodMat, s * 2, 0.75, F);
    mesh(texBox(1.85, 0.14, 0.09, 1), woodMat, s * 1.02, 0.95, F);
    mesh(texBox(1.85, 0.14, 0.09, 1), woodMat, s * 1.02, 0.45, F);
    mesh(texBox(2.0, 0.12, 0.08, 1), woodMat, s * 1.02, 0.7, F).rotation.z = s * 0.26;
  }

  // ---------- árvores ----------
  const bark = cozyMat({ map: T.barkTex() });
  function treeGeo(kind) {
    const trunk = new THREE.CylinderGeometry(0.24, 0.36, 2, 6).translate(0, 1, 0);
    const parts = [];
    if (kind === 'oak') {
      for (const b of [[0, 3, 0, 1.6], [1, 2.6, 0.3, 1.1], [-0.9, 2.7, -0.4, 1.15], [0.1, 4, 0.1, 1.05], [-0.2, 2.8, 0.9, 0.9]]) {
        const s = new THREE.SphereGeometry(b[3], 7, 5);
        s.translate(b[0], b[1], b[2]);
        parts.push(s);
      }
    } else {
      [[1.5, 1.9, 1.5], [1.2, 1.7, 2.6], [0.85, 1.5, 3.6]].forEach((c) => parts.push(new THREE.ConeGeometry(c[0], c[1], 7).translate(0, c[2] + c[1] / 2 - 0.6, 0)));
    }
    return mergeGeometries([trunk, mergeGeometries(parts)], true);
  }
  const spots = { oak: [], pine: [] };
  const inside = [[-23, -21], [-24.5, -7], [-21, 15], [22.5, 19], [24, 3], [7, -23], [-17, 23.5], [24.5, -6], [-1, -24]];
  inside.forEach((p, i) => { spots[i % 3 === 2 ? 'pine' : 'oak'].push([p[0], p[1], 0.9 + r() * 0.25]); colliders.circles.push({ x: p[0], z: p[1], r: 0.55 }); });
  for (let i = 0; i < 150; i++) {
    const x = (r() * 2 - 1) * 50, z = (r() * 2 - 1) * 50;
    if (Math.max(Math.abs(x), Math.abs(z)) < F + 2.2) continue;
    if (Math.abs(x) < 3.5 && z > F) continue;
    spots[r() < 0.35 ? 'pine' : 'oak'].push([x, z, 0.9 + r() * 0.6]);
  }
  const leafMats = {
    oak: cozyMat({ map: T.leafTex('#58a843', 66), wind: 0.012 }),
    pine: cozyMat({ map: T.leafTex('#3f8f58', 67), wind: 0.008 }),
  };
  for (const kind of ['oak', 'pine']) {
    leafMats[kind].map.repeat.set(3, 2);
    const inst = new THREE.InstancedMesh(treeGeo(kind), [bark, leafMats[kind]], spots[kind].length);
    const col = new THREE.Color();
    spots[kind].forEach((p, i) => {
      dummy.position.set(p[0], 0, p[1]); dummy.rotation.set(0, r() * 6.28, 0); dummy.scale.setScalar(p[2]); dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      inst.setColorAt(i, col.setHSL(0.13 + r() * 0.04, 0.35, 0.86 + r() * 0.14));
    });
    dummy.scale.setScalar(1);
    inst.castShadow = true;
    inst.receiveShadow = true;
    scene.add(inst);
  }

  // ---------- arbustos e pedras ----------
  const bushGeo = new THREE.SphereGeometry(0.7, 7, 5).scale(1, 0.75, 1).translate(0, 0.42, 0);
  const bushes = [[-14.5, -16.2], [-3.4, -16.4], [-26, 26], [26, 26], [-26, -26], [12, -25.5], [26, -24], [-25, 4], [4, 26.3], [-6, 26.2]];
  const bushI = new THREE.InstancedMesh(bushGeo, cozyMat({ map: T.leafTex('#63b04a', 68), wind: 0.02 }), bushes.length);
  bushes.forEach((p, i) => {
    dummy.position.set(p[0], 0, p[1]); dummy.rotation.set(0, r() * 6, 0); dummy.scale.setScalar(0.85 + r() * 0.5); dummy.updateMatrix();
    bushI.setMatrixAt(i, dummy.matrix);
    colliders.circles.push({ x: p[0], z: p[1], r: 0.6 });
  });
  bushI.castShadow = bushI.receiveShadow = true;
  scene.add(bushI);

  const rockGeo = new THREE.DodecahedronGeometry(0.5, 0).scale(1.2, 0.75, 1);
  const rocks = [[20.5, -11.2, 1.2], [12.6, -19.5, 0.9], [22.6, -19, 0.7], [-20, 2, 1], [-15, 26, 0.8], [21, 12, 1.1], [14.4, -12.6, 0.6], [-3, 10, 0.6]];
  const rockI = new THREE.InstancedMesh(rockGeo, cozyMat({ color: '#a9a4b5', map: T.noiseTex() }), rocks.length);
  rocks.forEach((p, i) => {
    dummy.position.set(p[0], 0.2 * p[2], p[1]); dummy.rotation.set(0, r() * 6, 0); dummy.scale.setScalar(p[2]); dummy.updateMatrix();
    rockI.setMatrixAt(i, dummy.matrix);
    colliders.circles.push({ x: p[0], z: p[1], r: 0.55 * p[2] });
  });
  rockI.castShadow = rockI.receiveShadow = true;
  scene.add(rockI);
  dummy.scale.setScalar(1);

  // ---------- lago ----------
  const Pn = LAYOUT.pond;
  const water = mesh(new THREE.CircleGeometry(Pn.r, 28).rotateX(-Math.PI / 2), waterMat(Pn, Pn.r), Pn.x, 0.03, Pn.z, false);
  water.receiveShadow = false;
  const padMat = cozyMat({ color: '#5fb060', map: T.noiseTex() });
  for (const p of [[1.6, 1.2, 0.5], [-2, -0.6, 0.42], [0.4, -2.4, 0.36], [-1.2, 2.3, 0.3]]) {
    mesh(new THREE.CircleGeometry(p[2], 7, 0.5, 5.6).rotateX(-Math.PI / 2), padMat, Pn.x + p[0], 0.05, Pn.z + p[1], false);
  }
  colliders.circles.push({ x: Pn.x, z: Pn.z, r: Pn.r - 0.15 });

  // ---------- capim e flores (instanciados, balançam com o vento) ----------
  const quad = new THREE.PlaneGeometry(0.75, 0.75).translate(0, 0.375, 0);
  const cross = mergeGeometries([quad, quad.clone().rotateY(Math.PI / 2)]);
  const nrm = cross.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  const scatter = (tex, count, wind, test) => {
    const m = cozyMat({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, wind, rim: 0 });
    const inst = new THREE.InstancedMesh(cross, m, count);
    let n = 0, guard = 0;
    while (n < count && guard++ < count * 30) {
      const x = (r() * 2 - 1) * 44, z = (r() * 2 - 1) * 44;
      if (!test(x, z)) continue;
      dummy.position.set(x, 0, z); dummy.rotation.set(0, r() * 3.14, 0); dummy.scale.setScalar(0.7 + r() * 0.6); dummy.updateMatrix();
      inst.setMatrixAt(n++, dummy.matrix);
    }
    inst.count = n;
    inst.receiveShadow = true;
    scene.add(inst);
    dummy.scale.setScalar(1);
  };
  const freeGrass = (x, z) => {
    if (groundKind(x, z, 0.5) !== 'grass') return false;
    for (const b of colliders.boxes) if (x > b.x0 - 0.3 && x < b.x1 + 0.3 && z > b.z0 - 0.3 && z < b.z1 + 0.3) return false;
    return true;
  };
  scatter(T.tuftTex(1), 1100, 0.16, freeGrass);
  scatter(T.tuftTex(2, '#7cc356'), 700, 0.16, freeGrass);
  const inFarm = (x, z) => freeGrass(x, z) && Math.max(Math.abs(x), Math.abs(z)) < 40;
  scatter(T.flowerTex('#ffffff'), 70, 0.1, inFarm);
  scatter(T.flowerTex('#ff9db5', '#fff3a0'), 60, 0.1, inFarm);
  scatter(T.flowerTex('#ffd95a', '#f08a3c'), 60, 0.1, inFarm);
  scatter(T.flowerTex('#b79cff'), 45, 0.1, inFarm);
  // flores nas floreiras
  for (const wx of [-2.9, 2.9]) for (let k = -1; k <= 1; k++) {
    const f = mesh(cross, cozyMat({ map: T.flowerTex(k ? '#ff9db5' : '#ffd95a'), alphaTest: 0.5, side: THREE.DoubleSide, wind: 0.05, rim: 0 }), H.x + wx + k * 0.45, 1.55, front + 0.22, false);
    f.scale.setScalar(0.7);
  }

  return {
    colliders,
    bounds: F - 0.6,
    spawn: new THREE.Vector3(H.x, 0, front + 4.2),
    update(dt) { for (const u of updaters) u(dt); },
  };
}
