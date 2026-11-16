// AABB vs voxel collision with per-axis snapping.
import { W, D } from './world.js';
import { SOLID, B } from './blocks.js';

export function solidAt(world, x, y, z) {
  if (x < 0 || z < 0 || x >= W || z >= D) return true; // invisible walls at the island edge
  if (y < 0) return true;
  return SOLID[world.get(x, y, z)] === 1;
}

function overlaps(world, px, py, pz, hw, h) {
  const x0 = Math.floor(px - hw), x1 = Math.floor(px + hw - 1e-4);
  const y0 = Math.floor(py), y1 = Math.floor(py + h - 1e-4);
  const z0 = Math.floor(pz - hw), z1 = Math.floor(pz + hw - 1e-4);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (solidAt(world, x, y, z)) return true;
  return false;
}

// body: { pos: Vector3 (feet centre), vel: Vector3, w, h }
export function moveBody(world, b, dt) {
  const hw = b.w / 2;
  const maxD = Math.max(Math.abs(b.vel.x), Math.abs(b.vel.y), Math.abs(b.vel.z)) * dt;
  const steps = Math.max(1, Math.ceil(maxD / 0.3));
  const sdt = dt / steps;
  b.onGround = false; b.hitWall = false; b.hitCeil = false;
  for (let s = 0; s < steps; s++) {
    // Y
    let ny = b.pos.y + b.vel.y * sdt;
    if (overlaps(world, b.pos.x, ny, b.pos.z, hw, b.h)) {
      if (b.vel.y < 0) { ny = Math.floor(ny) + 1; b.onGround = true; }
      else { ny = Math.floor(ny + b.h) - b.h - 0.001; b.hitCeil = true; }
      if (overlaps(world, b.pos.x, ny, b.pos.z, hw, b.h)) ny = b.pos.y;
      b.landVel = b.vel.y;
      b.vel.y = 0;
    }
    b.pos.y = ny;
    // X
    let nx = b.pos.x + b.vel.x * sdt;
    if (overlaps(world, nx, b.pos.y, b.pos.z, hw, b.h)) {
      if (b.vel.x > 0) nx = Math.floor(nx + hw) - hw - 0.001; else nx = Math.floor(nx - hw) + 1 + hw + 0.001;
      if (overlaps(world, nx, b.pos.y, b.pos.z, hw, b.h)) nx = b.pos.x;
      b.vel.x = 0; b.hitWall = true;
    }
    b.pos.x = nx;
    // Z
    let nz = b.pos.z + b.vel.z * sdt;
    if (overlaps(world, b.pos.x, b.pos.y, nz, hw, b.h)) {
      if (b.vel.z > 0) nz = Math.floor(nz + hw) - hw - 0.001; else nz = Math.floor(nz - hw) + 1 + hw + 0.001;
      if (overlaps(world, b.pos.x, b.pos.y, nz, hw, b.h)) nz = b.pos.z;
      b.vel.z = 0; b.hitWall = true;
    }
    b.pos.z = nz;
  }
  if (!b.onGround && b.vel.y <= 0 && overlaps(world, b.pos.x, b.pos.y - 0.02, b.pos.z, hw, b.h)) b.onGround = true;
  b.inWater = world.get(Math.floor(b.pos.x), Math.floor(b.pos.y + b.h * 0.4), Math.floor(b.pos.z)) === B.WATER;
  b.headInWater = world.get(Math.floor(b.pos.x), Math.floor(b.pos.y + b.h * 0.9), Math.floor(b.pos.z)) === B.WATER;
}

// Can the body step up onto the obstacle in direction (dx,dz)?
export function canStep(world, b, dx, dz) {
  const hw = b.w / 2;
  const tx = b.pos.x + Math.sign(dx) * (hw + 0.3), tz = b.pos.z + Math.sign(dz) * (hw + 0.3);
  const fy = Math.floor(b.pos.y + 0.05);
  const front = solidAt(world, Math.floor(tx), fy, Math.floor(tz));
  if (!front) return false;
  for (let k = 1; k <= Math.ceil(b.h); k++) if (solidAt(world, Math.floor(tx), fy + k, Math.floor(tz))) return false;
  if (solidAt(world, Math.floor(b.pos.x), fy + Math.ceil(b.h), Math.floor(b.pos.z))) return false;
  return true;
}

// Voxel DDA ray cast. Returns {x,y,z, nx,ny,nz, dist, id} or null
export function raycast(world, ox, oy, oz, dx, dy, dz, maxDist, pred) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tmx = dx > 0 ? (x + 1 - ox) * tdx : dx < 0 ? (ox - x) * tdx : Infinity;
  let tmy = dy > 0 ? (y + 1 - oy) * tdy : dy < 0 ? (oy - y) * tdy : Infinity;
  let tmz = dz > 0 ? (z + 1 - oz) * tdz : dz < 0 ? (oz - z) * tdz : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let i = 0; i < 256; i++) {
    const id = world.get(x, y, z);
    if (pred(id, x, y, z)) return { x, y, z, nx, ny, nz, dist: t, id };
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
    if (t > maxDist) return null;
  }
  return null;
}
