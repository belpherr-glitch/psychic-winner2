// Cubória: renderização WebGL em 3D (blocos com texturas procedurais, céu, névoa, entidades e brilho)
(function () {
  const CB = window.CB, B = CB.B, D = CB.D, OPQ = CB.OPQ;
  const PREC = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
  const BIT = 'float bit(float n, float b) { return mod(floor(n / b + 0.001), 2.0); }\n';
  const HASH = `
float hash(vec2 p) { p = mod(p, 251.0); return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
`;
  const LIGHT = `
vec3 shadeLight(float sky, vec3 rgb, vec3 skyCol, float sun) {
  vec3 L = skyCol * sky * sun + rgb * 1.35;
  return vec3(1.0) - exp(-L * 1.7) + 0.025;
}
`;

  const SH = `
uniform sampler2D uShadow; uniform float uShOn; uniform vec2 uShTex;
float unpackD(vec4 c) { return dot(c, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0)); }
float shadowAt(vec4 sh) {
  if (uShOn < 0.5) return 1.0;
  vec3 c = sh.xyz / sh.w * 0.5 + 0.5;
  if (c.x < 0.0 || c.y < 0.0 || c.x > 1.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
  float s = 0.0, z = c.z - 0.0015;
  s += step(z, unpackD(texture2D(uShadow, c.xy + vec2(-0.5, -0.5) * uShTex)));
  s += step(z, unpackD(texture2D(uShadow, c.xy + vec2(0.5, -0.5) * uShTex)));
  s += step(z, unpackD(texture2D(uShadow, c.xy + vec2(-0.5, 0.5) * uShTex)));
  s += step(z, unpackD(texture2D(uShadow, c.xy + vec2(0.5, 0.5) * uShTex)));
  vec2 e = abs(c.xy - 0.5) * 2.0;
  return mix(s * 0.25, 1.0, smoothstep(0.8, 1.0, max(e.x, e.y)));
}
`;
  const VS_CHUNK = `
attribute vec3 aPos; attribute vec4 aLight; attribute vec4 aInfo; attribute vec3 aNorm;
uniform mat4 uMVP; uniform mat4 uLVP; uniform vec3 uOff; uniform vec3 uEye; uniform float uTime;
varying vec3 vPos; varying vec4 vLight; varying vec4 vInfo; varying float vDist; varying vec3 vView; varying vec3 vN; varying vec4 vSh;
${BIT}
void main() {
  vec3 wp = aPos / 32.0 - 2.0 + uOff, p = wp; vN = aNorm;
  float fl = aInfo.w, top = bit(fl, 16.0);
  if (bit(fl, 2.0) > 0.5) { p.x += top * sin(uTime * 2.0 + wp.x * 0.9 + wp.z * 0.6) * 0.07; p.z += top * cos(uTime * 1.6 + wp.z * 0.8) * 0.05; }
  if (bit(fl, 4.0) > 0.5) p.y += top * (sin(uTime * 2.3 + wp.x * 1.9 + wp.z * 0.8) * 0.035 + sin(uTime * 1.7 - wp.z * 1.3) * 0.025);
  vPos = wp; vLight = aLight; vInfo = aInfo; vView = p - uEye; vDist = length(vView); vSh = uLVP * vec4(p + aNorm * 0.12, 1.0);
  gl_Position = uMVP * vec4(p, 1.0);
}`;
  const FS_CHUNK = PREC + BIT + HASH + LIGHT + `

${SH}uniform sampler2D uPal; uniform sampler2D uAtlas; uniform vec3 uSky; uniform vec3 uSunDir; uniform vec3 uLightDir; uniform float uDirK; uniform vec3 uHor; uniform float uTime; uniform float uPass;
uniform vec3 uFogCol; uniform vec2 uFog; uniform vec3 uSunCol;
varying vec3 vPos; varying vec4 vLight; varying vec4 vInfo; varying float vDist; varying vec3 vView; varying vec3 vN; varying vec4 vSh;
void main() {
  float n = vInfo.x, id = vInfo.y, ao = vInfo.z / 255.0, fl = vInfo.w;
  float u = (id + 0.5) / 64.0;
  vec3 c1 = texture2D(uPal, vec2(u, 0.125)).rgb, c2 = texture2D(uPal, vec2(u, 0.375)).rgb;
  vec4 m = texture2D(uPal, vec2(u, 0.625)), m3 = texture2D(uPal, vec2(u, 0.875));
  float style = floor(m.r * 255.0 + 0.5), emis = m.g, alpha = m.b;
  vec3 col = c1; float e = 0.0;
  vec3 Nn = normalize(vN), A = abs(Nn);
  bool topf = A.y >= A.x && A.y >= A.z && Nn.y > 0.0, botf = A.y >= A.x && A.y >= A.z && Nn.y <= 0.0, side = !topf && !botf;
  if (style > 19.5) { col = (bit(fl, 8.0) > 0.5 ? c2 : c1); e = bit(fl, 8.0) > 0.5 ? 0.0 : emis; }
  else {
    float tile = topf || (side && Nn.y > 0.5) ? m3.r : botf ? m3.b : m3.g;
    tile = floor(tile * 255.0 + 0.5);
    vec2 uv = side ? (A.x > A.z ? vec2(vPos.z, vPos.y) : vec2(vPos.x, vPos.y)) : vPos.xz;
    if (style > 9.5 && style < 10.5) uv += vec2(uTime * 0.25, uTime * 0.12);
    if (style > 8.5 && style < 9.5) uv += vec2(uTime * 0.08, uTime * 0.05);
    vec2 f = clamp(fract(uv), 0.002, 0.998);
    if (side) f.y = 1.0 - f.y;
    vec4 tx = texture2D(uAtlas, (vec2(mod(tile, 16.0), floor(tile / 16.0)) + f) / 16.0);
    if (tx.a < 0.04) discard;
    col = tx.rgb;
    if (abs(tx.a - 0.784) < 0.02) e = max(emis, 0.85);
    if (uPass > 0.5) alpha = id == 17.0 ? alpha : tx.a;
  }
  vec3 N = Nn;
  float ndl = max(dot(N, uLightDir), 0.0);
  float shd = vLight.x > 0.25 ? shadowAt(vSh) : 1.0;
  float sun = 0.48 + uDirK * ndl * shd * 0.95;
  if (style > 5.5 && style < 6.5) sun += uDirK * 0.18 * max(dot(-N, uLightDir), 0.0);
  vec3 L = shadeLight(vLight.x, vLight.yzw, uSky, sun);
  float sh = (A.x * 0.8 + A.z * 0.9 + A.y * (N.y > 0.0 ? 1.0 : 0.6)) / (A.x + A.y + A.z);
  vec3 lit = col * L * sh * ao;
  lit = mix(lit, col * 1.15, e);
  vec3 vd = normalize(vView);
  if (style > 9.5 && style < 10.5) {
    float fr = pow(1.0 - max(dot(N, -vd), 0.0), 4.0);
    lit = mix(lit, uHor * (0.35 + 0.65 * vLight.x), fr * 0.55);
    alpha = mix(alpha, 0.9, fr);
  }
  float fog = smoothstep(uFog.x, uFog.y, vDist);
  vec3 fc = uFogCol + uSunCol * pow(max(dot(vd, uSunDir), 0.0), 6.0) * 0.45;
  lit = mix(lit, fc, fog);
  gl_FragColor = vec4(lit, uPass > 0.5 ? mix(alpha, 1.0, fog) : e * 0.9 * (1.0 - fog));
}`;

  const VS_ENT = `
attribute vec3 aPos; attribute vec3 aCol; attribute vec3 aLit; attribute vec2 aNE;
uniform mat4 uMVP; uniform mat4 uLVP; uniform vec3 uEye;
varying vec3 vCol; varying vec3 vLit; varying vec2 vNE; varying float vDist; varying vec4 vSh;
void main() { vCol = aCol; vLit = aLit; vNE = aNE; vDist = length(aPos - uEye); vSh = uLVP * vec4(aPos, 1.0); gl_Position = uMVP * vec4(aPos, 1.0); }`;
  const FS_ENT = PREC + SH + `
uniform vec3 uFogCol; uniform vec2 uFog; uniform float uDirK;
varying vec3 vCol; varying vec3 vLit; varying vec2 vNE; varying float vDist; varying vec4 vSh;
void main() {
  float e = vNE.y, cloud = step(1.5, e);
  e -= cloud * 2.0;
  float shd = cloud > 0.5 ? 1.0 : shadowAt(vSh);
  vec3 c = mix(vCol * vLit * vNE.x * (1.0 - 0.38 * uDirK * (1.0 - shd)), vCol * 1.15, e);
  float fog = smoothstep(uFog.x, uFog.y, vDist) * (1.0 - cloud * 0.8);
  gl_FragColor = vec4(mix(c, uFogCol, fog), e * 0.9 * (1.0 - fog));
}`;

  const VS_SHC = `
attribute vec3 aPos; attribute vec4 aLight; attribute vec4 aInfo; attribute vec3 aNorm;
uniform mat4 uLVP; uniform vec3 uOff; varying float vZ;
void main() { vec4 p = uLVP * vec4(aPos / 32.0 - 2.0 + uOff, 1.0); vZ = p.z * 0.5 + 0.5; gl_Position = p; }`;
  const VS_SHE = `
attribute vec3 aPos; attribute vec3 aCol; attribute vec3 aLit; attribute vec2 aNE;
uniform mat4 uLVP; varying float vZ;
void main() { vec4 p = uLVP * vec4(aPos, 1.0); vZ = p.z * 0.5 + 0.5; gl_Position = aNE.y > 1.5 ? vec4(2.0, 2.0, 2.0, 1.0) : p; }`;
  const FS_SH = PREC + `
varying float vZ;
void main() { vec4 e = fract(vZ * vec4(1.0, 255.0, 65025.0, 16581375.0)); e -= e.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0); gl_FragColor = e; }`;
  const VS_QUAD = 'attribute vec2 aP; varying vec2 vUv; void main() { vUv = aP * 0.5 + 0.5; gl_Position = vec4(aP, 0.0, 1.0); }';
  const FS_SKY = PREC + HASH + `
uniform vec3 uF; uniform vec3 uR; uniform vec3 uU; uniform float uTan; uniform float uAsp;
uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uStars;
uniform vec3 uEye; uniform float uTime; uniform float uDepth; uniform vec3 uCave;
varying vec2 vUv;
void main() {
  vec3 dir = normalize(uF + uR * (vUv.x * 2.0 - 1.0) * uTan * uAsp + uU * (vUv.y * 2.0 - 1.0) * uTan);
  float y = dir.y;
  vec3 col = mix(uHor, uZen, pow(clamp(y, 0.0, 1.0), 0.5));
  col = mix(col, uHor * 0.7, clamp(-y * 4.0, 0.0, 1.0));
  float sd = dot(dir, uSunDir);
  float disc = smoothstep(0.9975, 0.9985, sd), glow = pow(max(sd, 0.0), 80.0) * 0.7 + pow(max(sd, 0.0), 6.0) * 0.25;
  col += uSunCol * (disc + glow);
  float a = disc * 0.95 + glow * 0.55;
  float md = dot(dir, -uSunDir), moon = smoothstep(0.9982, 0.999, md) * uStars;
  col += vec3(0.85, 0.9, 1.0) * moon; a += moon * 0.7;
  if (uStars > 0.01 && y > 0.0) {
    vec3 q = floor(dir * 180.0);
    float s = step(0.996, hash(q.xy + q.z * 17.0)) * (0.6 + 0.4 * sin(uTime * 3.0 + hash(q.zy) * 40.0));
    col += vec3(s) * uStars * smoothstep(0.0, 0.25, y); a += s * uStars * 0.5;
  }
  // cordilheira distante, com neve nos picos
  float az = atan(dir.z, dir.x);
  float mh = 0.035 + 0.075 * (vnoise(vec2(az * 3.0, 1.0)) * 0.65 + vnoise(vec2(az * 9.0, 4.0)) * 0.35);
  float mh2 = 0.015 + 0.04 * vnoise(vec2(az * 6.0 + 9.0, 7.0));
  float ridge = abs(fract(az * 14.0 + vnoise(vec2(az * 5.0, 2.0))) - 0.5);
  mh += (0.5 - ridge) * 0.03;
  if (y < mh) {
    vec3 mc = mix(uHor * 0.72, uZen * 0.6 + uHor * 0.25, 0.4);
    if (y > mh - 0.02 && mh > 0.075) mc = mix(mc, vec3(0.95, 0.97, 1.0) * (0.35 + 0.65 * length(uSunCol) * 0.7 + 0.2), 0.75);
    col = mix(col, mc, 0.85); a = 0.0;
  }
  if (y < mh2) { col = mix(col, uHor * 0.55 + uZen * 0.2, 0.75); a = 0.0; }
  col = mix(col, uCave, uDepth);
  gl_FragColor = vec4(col, a * (1.0 - uDepth));
}`;
  const FS_BRIGHT = PREC + `
uniform sampler2D uTex; uniform vec2 uTexel; varying vec2 vUv;
vec3 tap(vec2 o) { vec4 s = texture2D(uTex, vUv + o * uTexel); return s.rgb * s.a + max(s.rgb - 0.92, 0.0) * 0.4; }
void main() { gl_FragColor = vec4((tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0))) * 0.25, 1.0); }`;
  const FS_BLUR = PREC + `
uniform sampler2D uTex; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(uTex, vUv).rgb * 0.227;
  c += (texture2D(uTex, vUv + uDir * 1.385).rgb + texture2D(uTex, vUv - uDir * 1.385).rgb) * 0.316;
  c += (texture2D(uTex, vUv + uDir * 3.231).rgb + texture2D(uTex, vUv - uDir * 3.231).rgb) * 0.07;
  gl_FragColor = vec4(c, 1.0);
}`;
  const FS_RAYS = PREC + `
uniform sampler2D uTex; uniform vec2 uSun; varying vec2 vUv;
void main() {
  vec2 d = (uSun - vUv) / 24.0; vec2 uv = vUv; vec3 c = vec3(0.0); float w = 1.0;
  for (int i = 0; i < 24; i++) { c += texture2D(uTex, uv).rgb * w; w *= 0.95; uv += d; }
  gl_FragColor = vec4(c / 11.0, 1.0);
}`;
  const FS_POST = PREC + `
uniform sampler2D uScene; uniform sampler2D uBloom; uniform sampler2D uDepth; uniform float uBloomK; uniform float uHurt; uniform float uWater;
uniform float uOutline; uniform vec2 uTexel; uniform vec3 uInk; uniform sampler2D uRays; uniform vec3 uRayCol; varying vec2 vUv;
float lin(vec2 uv) { float d = texture2D(uDepth, uv).r; return 0.08 * 400.0 / (400.0 - d * (400.0 - 0.08)); }
void main() {
  vec3 c = texture2D(uScene, vUv).rgb + texture2D(uBloom, vUv).rgb * uBloomK;
  if (uOutline > 0.5) {
    float zc = lin(vUv);
    float zn = min(min(lin(vUv + vec2(uTexel.x, 0.0)), lin(vUv - vec2(uTexel.x, 0.0))), min(lin(vUv + vec2(0.0, uTexel.y)), lin(vUv - vec2(0.0, uTexel.y))));
    float edge = smoothstep(0.06, 0.16, (zc - zn) / zc) * (1.0 - smoothstep(55.0, 120.0, zc));
    c = mix(c, uInk, edge * 0.38);
  }
  c += texture2D(uRays, vUv).rgb * uRayCol;
  // cor: saturação, contraste em S, sombras puxando pro azul e luzes pro quente
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.12);
  c = c / (1.0 + max(c - 1.0, 0.0) * 0.6);
  c = mix(c, c * vec3(0.35, 0.7, 1.1), uWater);
  vec2 v = vUv - 0.5;
  c *= 1.0 - 0.22 * pow(length(v) * 1.35, 2.4);
  c = mix(c, vec3(0.9, 0.1, 0.15), uHurt * smoothstep(0.25, 0.75, length(v)));
  gl_FragColor = vec4(c, 1.0);
}`;

  // ───── matrizes ─────
  const M = (CB.M = {
    persp(fov, asp, n, f) {
      const t = 1 / Math.tan(fov / 2), r = new Float32Array(16);
      r[0] = t / asp; r[5] = t; r[10] = (f + n) / (n - f); r[11] = -1; r[14] = (2 * f * n) / (n - f);
      return r;
    },
    look(e, c, up) {
      let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz);
      zx /= l; zy /= l; zz /= l;
      let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
      l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
    },
    mul(a, b) {
      const r = new Float32Array(16);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
        r[i * 4 + j] = s;
      }
      return r;
    },
  });

  // ───── modelos pequenos feitos de caixinhas: [x0,x1,y0,y1,z0,z1, usaCor2] em 1/16 de bloco ─────
  const MODELS = {
    [B.TGRASS]: [[2, 3, 0, 14, 3, 4, 0], [5, 6, 0, 20, 9, 10, 1], [11, 12, 0, 17, 7, 8, 0], [13, 14, 0, 12, 12, 13, 1], [8, 9, 0, 22, 12, 13, 0]],
    [B.FLOWER]: [[7, 9, 0, 13, 7, 9, 1], [5, 11, 12, 16, 5, 11, 0], [7, 9, 16, 17, 7, 9, 0], [3, 7, 5, 6, 7, 9, 1], [10, 13, 8, 9, 7, 9, 1]],
    [B.MUSH]: [[6, 10, 0, 6, 6, 10, 1], [3, 13, 5, 9, 3, 13, 0], [5, 11, 9, 10, 5, 11, 0]],
    [B.TORCH]: [[7, 9, 0, 10, 7, 9, 1], [6, 10, 9, 13, 6, 10, 0]],
    [B.HEART]: [[3, 8, 7, 12, 6, 10, 0], [8, 13, 7, 12, 6, 10, 0], [4, 12, 3, 8, 6, 10, 0], [6, 10, 1, 4, 6, 10, 0]],
    [B.LANTERN]: [[4, 12, 1, 3, 4, 12, 1], [4, 12, 10, 12, 4, 12, 1], [5, 11, 3, 10, 5, 11, 0], [7, 9, 12, 16, 7, 9, 1]],
    [B.BENCH]: [[0, 16, 10, 13, 0, 16, 0], [1, 3, 0, 10, 1, 3, 1], [13, 15, 0, 10, 1, 3, 1], [1, 3, 0, 10, 13, 15, 1], [13, 15, 0, 10, 13, 15, 1]],
    [B.CACTUS]: [[2, 14, 0, 16, 2, 14, 0]],
  };
  // eixos de cada face: [normal, eixo, sinal, eixo b, eixo c]
  const FACES = [[0, 0, 1, 2, 1], [1, 0, -1, 2, 1], [2, 1, 1, 0, 2], [3, 1, -1, 0, 2], [4, 2, 1, 0, 1], [5, 2, -1, 0, 1]];
  const AOK = [0.5, 0.68, 0.84, 1];
  // terreno natural vira superfície lisa; o resto continua em cubos
  const SMOOTH = (CB.SMOOTH = new Uint8Array(256));
  [B.DIRT, B.GRASS, B.STONE, B.SAND, B.SNOW, B.ICE, B.COAL, B.COPPER, B.IRON, B.GOLD, B.CRYSTAL, B.DEEP, B.BEDROCK, B.PGRASS, B.RUBY].forEach((i) => (SMOOTH[i] = 1));
  const P = 20, PI = (x, y, z) => ((y + 2) * P + (z + 2)) * P + (x + 2);
  const Q = 18, QI = (x, y, z) => ((y + 1) * Q + (z + 1)) * Q + (x + 1); // densidade: -1..16
  const DV = 17, DI = (x, y, z) => ((y + 1) * DV + (z + 1)) * DV + (x + 1); // vértices duais: -1..15

  class Mesh {
    constructor() {
      this.buf = new ArrayBuffer(65536 * 20);
      this.u16 = new Uint16Array(this.buf);
      this.u8 = new Uint8Array(this.buf);
      this.i8 = new Int8Array(this.buf);
      this.idx = new Uint16Array(65536 * 3 / 2);
      this.n = 0; this.ni = 0;
    }
    reset() { this.n = 0; this.ni = 0; }
    full() { return this.n > 65520; }
    // posição em 1/32 de bloco, deslocada +2 blocos (pra caber valores um pouco negativos)
    v(x, y, z, l0, l1, l2, l3, nrm, id, ao, fl, nx, ny, nz) {
      const k = this.n++, o = k * 10, b = k * 20;
      this.u16[o] = x + 64; this.u16[o + 1] = y + 64; this.u16[o + 2] = z + 64;
      const u8 = this.u8;
      u8[b + 8] = l0 * 17; u8[b + 9] = l1 * 17; u8[b + 10] = l2 * 17; u8[b + 11] = l3 * 17;
      u8[b + 12] = nrm; u8[b + 13] = id; u8[b + 14] = ao; u8[b + 15] = fl;
      if (nx === undefined) { nx = nrm === 0 ? 1 : nrm === 1 ? -1 : 0; ny = nrm === 2 ? 1 : nrm === 3 ? -1 : 0; nz = nrm === 4 ? 1 : nrm === 5 ? -1 : 0; }
      this.i8[b + 16] = Math.round(nx * 127); this.i8[b + 17] = Math.round(ny * 127); this.i8[b + 18] = Math.round(nz * 127);
      return k;
    }
    q(a, b, c, d, flip) {
      const I = this.idx, o = this.ni;
      if (flip) { I[o] = b; I[o + 1] = c; I[o + 2] = d; I[o + 3] = b; I[o + 4] = d; I[o + 5] = a; }
      else { I[o] = a; I[o + 1] = b; I[o + 2] = c; I[o + 3] = a; I[o + 4] = c; I[o + 5] = d; }
      this.ni += 6;
    }
  }

  function gl0(gl, tex) { gl.bindTexture(gl.TEXTURE_2D, tex); for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST); }
  class Gfx {
    constructor(canvas) {
      const gl = (this.gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance' }) ||
        canvas.getContext('experimental-webgl'));
      if (!gl) throw new Error('WebGL indisponível');
      this.cv = canvas;
      this.chunk = this.prog(VS_CHUNK, FS_CHUNK, ['aPos', 'aLight', 'aInfo', 'aNorm']);
      this.ent = this.prog(VS_ENT, FS_ENT, ['aPos', 'aCol', 'aLit', 'aNE']);
      this.sky = this.prog(VS_QUAD, FS_SKY, ['aP']);
      this.bright = this.prog(VS_QUAD, FS_BRIGHT, ['aP']);
      this.blur = this.prog(VS_QUAD, FS_BLUR, ['aP']);
      this.post = this.prog(VS_QUAD, FS_POST, ['aP']);
      this.rays = this.prog(VS_QUAD, FS_RAYS, ['aP']);
      this.shc = this.prog(VS_SHC, FS_SH, ['aPos', 'aLight', 'aInfo', 'aNorm']);
      this.she = this.prog(VS_SHE, FS_SH, ['aPos', 'aCol', 'aLit', 'aNE']);
      this.vmBuf = gl.createBuffer();
      this.shFrame = 0;
      this.quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      this.entBuf = gl.createBuffer();
      this.secs = new Map();
      this.mO = new Mesh(); this.mT = new Mesh();
      this.pid = new Uint8Array(P * P * P);
      this.pl = [new Uint8Array(P * P * P), new Uint8Array(P * P * P), new Uint8Array(P * P * P), new Uint8Array(P * P * P)];
      this.dens = new Float32Array(Q * Q * Q);
      this.dv = new Float32Array(DV * DV * DV * 11); // x,y,z, nx,ny,nz, l0..l3, ao
      this.dvOk = new Uint8Array(DV * DV * DV);
      this.depthExt = gl.getExtension('WEBGL_depth_texture') || gl.getExtension('WEBKIT_WEBGL_depth_texture');
      this.makePalette();
      this.quality = 1; this.viewDist = 64;
      this.fb = null;
    }
    prog(vs, fs, attrs) {
      const gl = this.gl, p = gl.createProgram();
      for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        gl.attachShader(p, s);
      }
      attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
      return { p, u };
    }
    makePalette() {
      const gl = this.gl, data = new Uint8Array(64 * 4 * 4);
      D.forEach((d, id) => {
        if (!d) return;
        data.set([...d.c1, 255], id * 4);
        data.set([...d.c2, 255], (64 + id) * 4);
        const emis = d.emis != null ? d.emis : d.light ? 1 : 0, alpha = d.id === B.WATER ? 0.68 : d.id === B.GLASS ? 0.38 : 1;
        data.set([d.style, Math.round(emis * 255), Math.round(alpha * 255), 0], (128 + id) * 4);
        const tl = CB.TILE[id] || [0, 0, 0];
        data.set([tl[0], tl[1], tl[2], 255], (192 + id) * 4);
      });
      this.pal = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.pal);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 64, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
      this.atlas = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.atlas);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, CB.ATLAS.size, CB.ATLAS.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, CB.ATLAS.data);
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
      for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
    }
    target(w, h, depth) {
      const gl = this.gl, tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR);
      for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      let rb = null, dtex = null;
      if (depth && this.depthExt) {
        dtex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, dtex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
        for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
        for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, dtex, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { gl.deleteTexture(dtex); dtex = null; this.depthExt = null; }
      }
      if (depth && !dtex) {
        rb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      }
      return { tex, fb, rb, dtex, w, h };
    }
    free(t) { if (!t) return; const gl = this.gl; if (t.dtex) gl.deleteTexture(t.dtex); gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); if (t.rb) gl.deleteRenderbuffer(t.rb); }
    resize() {
      const cw = this.cv.clientWidth, ch = this.cv.clientHeight, dpr = window.devicePixelRatio || 1;
      const k = [0.5, Math.min(dpr, 1.5) * 0.62, Math.min(dpr, 2) * 0.85][this.quality];
      const w = Math.max(1, Math.round(cw * k)), h = Math.max(1, Math.round(ch * k));
      if (this.cv.width === w && this.cv.height === h && this.fb && this.lastQ === this.quality) return;
      this.lastQ = this.quality;
      this.cv.width = w; this.cv.height = h;
      [this.fb, this.b1, this.b2, this.b3, this.sh].forEach((t) => this.free(t));
      this.fb = this.target(w, h, true);
      const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2);
      this.b1 = this.target(bw, bh, false);
      this.b2 = this.target(bw, bh, false);
      this.b3 = this.target(bw, bh, false);
      const ss = [0, 0, 2048][this.quality];
      if (ss) { const d = this.depthExt; this.depthExt = null; this.sh = this.target(ss, ss, true); this.depthExt = d; gl0(this.gl, this.sh.tex); } else this.sh = null;
    }

    // ───── malha de uma seção 16x16x16 ─────
    buildSection(world, sx, sy, sz) {
      const { W, H, t } = world, x0 = sx * 16, y0 = sy * 16, z0 = sz * 16;
      const ids = this.pid, PL = this.pl, WS = [world.S, world.R, world.G, world.Bl];
      let any = 0;
      for (let y = -2; y <= 17; y++)
        for (let z = -2; z <= 17; z++)
          for (let x = -2; x <= 17; x++) {
            const gx = x0 + x, gy = y0 + y, gz = z0 + z, p = PI(x, y, z);
            if (gx >= 0 && gz >= 0 && gy >= 0 && gx < W && gz < W && gy < H) {
              const i = (gy * W + gz) * W + gx;
              ids[p] = t[i];
              PL[0][p] = WS[0][i]; PL[1][p] = WS[1][i]; PL[2][p] = WS[2][i]; PL[3][p] = WS[3][i];
              if (t[i] && x >= -1 && y >= -1 && z >= -1 && x <= 16 && y <= 16 && z <= 16) any++;
            } else {
              ids[p] = gy < 0 ? B.BEDROCK : gx < 0 || gz < 0 || gx >= W || gz >= W ? (gy < world.hm[Math.min(W - 1, Math.max(0, gz)) * W + Math.min(W - 1, Math.max(0, gx))] ? B.STONE : B.AIR) : B.AIR;
              PL[0][p] = gy < 0 ? 0 : 15; PL[1][p] = PL[2][p] = PL[3][p] = 0;
            }
          }
      const O = this.mO, T = this.mT;
      O.reset(); T.reset();
      if (!any) return { O, T };
      const S0 = PL[0], S1 = PL[1], S2 = PL[2], S3 = PL[3];
      this.smooth(ids, PL, O);
      const lt = [0, 0, 0, 0];
      const op = (p) => OPQ[ids[p]] && !SMOOTH[ids[p]];
      const step = [1, P * P, P]; // x, y, z no índice acolchoado
      for (let y = 0; y < 16; y++)
        for (let z = 0; z < 16; z++)
          for (let x = 0; x < 16; x++) {
            const p = PI(x, y, z), id = ids[p];
            if (!id || SMOOTH[id]) continue;
            const d = D[id];
            if (O.full() || T.full()) continue;
            const mdl = MODELS[id];
            if (id === B.TGRASS && this.quality === 0 && ((x0 + x) * 7 + (z0 + z) * 13) % 3 !== 0) continue;
            if (mdl || d.kind === 'sprite') {
              const fl = d.sway ? 2 : 0, L0 = S0[p], L1 = S1[p], L2 = S2[p], L3 = S3[p];
              for (const m of mdl) this.box(O, x * 32 + m[0] * 2, x * 32 + m[1] * 2, y * 32 + m[2] * 2, y * 32 + m[3] * 2, z * 32 + m[4] * 2, z * 32 + m[5] * 2, L0, L1, L2, L3, id, fl | (m[6] ? 8 : 0), y * 32 + m[3] * 2);
              continue;
            }
            const liquid = d.kind === 'liquid', leafy = d.leafy, glass = id === B.GLASS;
            const buf = id === B.WATER || glass ? T : O;
            let topH = 32;
            if (liquid && ids[p + P * P] !== id) topH = 28;
            const cell = [x, y, z];
            for (const F of FACES) {
              const [nrm, a, sg, bAx, cAx] = F;
              const q = p + sg * step[a], nid = ids[q];
              if (OPQ[nid] && !SMOOTH[nid]) continue;
              if (liquid && SMOOTH[nid]) continue;
              if (nid === id && (liquid || leafy || glass)) continue;
              if (leafy && D[nid].leafy) continue;
              if (liquid && nid !== B.AIR && D[nid].kind !== 'sprite' && nrm !== 2 && D[nid].solid && !D[nid].leafy) continue;
              if (liquid && nrm === 3 && D[nid].solid) continue;
              const vs = [0, 0, 0, 0], aos = [0, 0, 0, 0];
              for (let k = 0; k < 4; k++) {
                const cb = k === 1 || k === 2 ? 1 : 0, cc = k >= 2 ? 1 : 0;
                const s1 = q + (cb ? 1 : -1) * step[bAx], s2 = q + (cc ? 1 : -1) * step[cAx], cr = s1 + (cc ? 1 : -1) * step[cAx];
                const o1 = op(s1), o2 = op(s2), oc = op(cr);
                const ao = liquid ? 3 : o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
                let n = 1;
                lt[0] = S0[q]; lt[1] = S1[q]; lt[2] = S2[q]; lt[3] = S3[q];
                if (!OPQ[ids[q]]) { /* ok */ } else { lt[0] = S0[p]; lt[1] = S1[p]; lt[2] = S2[p]; lt[3] = S3[p]; }
                if (!OPQ[ids[s1]]) { n++; lt[0] += S0[s1]; lt[1] += S1[s1]; lt[2] += S2[s1]; lt[3] += S3[s1]; }
                if (!OPQ[ids[s2]]) { n++; lt[0] += S0[s2]; lt[1] += S1[s2]; lt[2] += S2[s2]; lt[3] += S3[s2]; }
                if (!OPQ[ids[cr]] && !(o1 && o2)) { n++; lt[0] += S0[cr]; lt[1] += S1[cr]; lt[2] += S2[cr]; lt[3] += S3[cr]; }
                const pos = [cell[0] * 32, cell[1] * 32, cell[2] * 32];
                pos[a] += sg > 0 ? (a === 1 ? topH : 32) : 0;
                pos[bAx] += cb * (bAx === 1 ? topH : 32);
                pos[cAx] += cc * (cAx === 1 ? topH : 32);
                const fl = liquid && topH < 32 && pos[1] === y * 32 + topH ? 4 | 16 : 0;
                aos[k] = ao;
                vs[k] = buf.v(pos[0], pos[1], pos[2], lt[0] / n, lt[1] / n, lt[2] / n, lt[3] / n, nrm, id, Math.round(AOK[ao] * 255), fl);
              }
              buf.q(vs[0], vs[1], vs[2], vs[3], aos[0] + aos[2] < aos[1] + aos[3]);
            }
          }
      return { O, T };
    }
    // superfície lisa (surface nets): a densidade é o bloco cru + um pouco da média dos vizinhos,
    // então nada some nem aparece, só os cantos ficam arredondados
    smooth(ids, PL, O) {
      const den = this.dens, dv = this.dv, ok = this.dvOk;
      let anyS = false;
      for (let y = -1; y <= 16; y++)
        for (let z = -1; z <= 16; z++)
          for (let x = -1; x <= 16; x++) {
            const raw = SMOOTH[ids[PI(x, y, z)]];
            if (raw) anyS = true;
            den[QI(x, y, z)] = raw;
          }
      if (!anyS) return;
      const S0 = PL[0], S1 = PL[1], S2 = PL[2], S3 = PL[3];
      const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
      const cd = new Float32Array(8);
      ok.fill(0);
      for (let y = -1; y <= 15; y++)
        for (let z = -1; z <= 15; z++)
          for (let x = -1; x <= 15; x++) {
            let inside = 0;
            for (let k = 0; k < 8; k++) { const v = den[QI(x + (k & 1), y + ((k >> 2) & 1), z + ((k >> 1) & 1))]; cd[k] = v; if (v >= 0.5) inside++; }
            if (inside === 0 || inside === 8) continue;
            let px = 0, py = 0, pz = 0, n = 0;
            for (const [a, b] of EDGES) {
              const da = cd[a], db = cd[b];
              if ((da >= 0.5) === (db >= 0.5)) continue;
              const tt = (0.5 - da) / (db - da);
              const ax = a & 1, ay = (a >> 2) & 1, az = (a >> 1) & 1, bx = b & 1, by = (b >> 2) & 1, bz = (b >> 1) & 1;
              px += ax + (bx - ax) * tt; py += ay + (by - ay) * tt; pz += az + (bz - az) * tt; n++;
            }
            const o = DI(x, y, z) * 11;
            dv[o] = x + 0.5 + px / n; dv[o + 1] = y + 0.5 + py / n; dv[o + 2] = z + 0.5 + pz / n;
            let gx = cd[1] - cd[0] + cd[3] - cd[2] + cd[5] - cd[4] + cd[7] - cd[6];
            let gy = cd[4] - cd[0] + cd[5] - cd[1] + cd[6] - cd[2] + cd[7] - cd[3];
            let gz = cd[2] - cd[0] + cd[3] - cd[1] + cd[6] - cd[4] + cd[7] - cd[5];
            const gl = Math.hypot(gx, gy, gz) || 1;
            dv[o + 3] = -gx / gl; dv[o + 4] = -gy / gl; dv[o + 5] = -gz / gl;
            let l0 = 0, l1 = 0, l2 = 0, l3 = 0, m = 0, avg = 0;
            for (let k = 0; k < 8; k++) {
              avg += cd[k];
              if (cd[k] >= 0.5) continue;
              const p = PI(x + (k & 1), y + ((k >> 2) & 1), z + ((k >> 1) & 1));
              if (OPQ[ids[p]] && !SMOOTH[ids[p]]) continue;
              l0 += S0[p]; l1 += S1[p]; l2 += S2[p]; l3 += S3[p]; m++;
            }
            m = m || 1;
            dv[o + 6] = l0 / m; dv[o + 7] = l1 / m; dv[o + 8] = l2 / m; dv[o + 9] = l3 / m;
            dv[o + 10] = Math.max(0.45, Math.min(1, 1 - (avg / 8 - 0.5) * 1.7));
            ok[DI(x, y, z)] = 1;
          }
      const V = (c, id, nx, ny, nz) => {
        const o = c * 11, ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        const nrm = ay >= ax && ay >= az ? (ny > 0 ? 2 : 3) : ax >= az ? (nx > 0 ? 0 : 1) : nz > 0 ? 4 : 5;
        return O.v(Math.round(dv[o] * 32), Math.round(dv[o + 1] * 32), Math.round(dv[o + 2] * 32), dv[o + 6], dv[o + 7], dv[o + 8], dv[o + 9], nrm, id, Math.round(dv[o + 10] * 255), 0, nx, ny, nz);
      };
      for (let y = 0; y < 16; y++)
        for (let z = 0; z < 16; z++)
          for (let x = 0; x < 16; x++) {
            const sp = den[QI(x, y, z)] >= 0.5;
            for (let a = 0; a < 3; a++) {
              const qx = x + (a === 0), qy = y + (a === 1), qz = z + (a === 2);
              const sq = den[QI(qx, qy, qz)] >= 0.5;
              if (sp === sq || O.full()) continue;
              const id = sp ? ids[PI(x, y, z)] : ids[PI(qx, qy, qz)];
              // os 4 vértices duais em volta da aresta
              let c;
              if (a === 0) c = [DI(x, y - 1, z - 1), DI(x, y, z - 1), DI(x, y, z), DI(x, y - 1, z)];
              else if (a === 1) c = [DI(x - 1, y, z - 1), DI(x, y, z - 1), DI(x, y, z), DI(x - 1, y, z)];
              else c = [DI(x - 1, y - 1, z), DI(x, y - 1, z), DI(x, y, z), DI(x - 1, y, z)];
              if (!ok[c[0]] || !ok[c[1]] || !ok[c[2]] || !ok[c[3]]) continue;
              // normal plana da face, apontando do lado sólido pro vazio
              const o0 = c[0] * 11, o1 = c[1] * 11, o2 = c[2] * 11, o3 = c[3] * 11;
              const ex = dv[o2] - dv[o0], ey = dv[o2 + 1] - dv[o0 + 1], ez = dv[o2 + 2] - dv[o0 + 2];
              const fx = dv[o3] - dv[o1], fy = dv[o3 + 1] - dv[o1 + 1], fz = dv[o3 + 2] - dv[o1 + 2];
              let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
              const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
              const want = sp ? 1 : -1, comp = a === 0 ? nx : a === 1 ? ny : nz;
              if (comp * want < 0) { nx = -nx; ny = -ny; nz = -nz; }
              const v0 = V(c[0], id, nx, ny, nz), v1 = V(c[1], id, nx, ny, nz), v2 = V(c[2], id, nx, ny, nz), v3 = V(c[3], id, nx, ny, nz);
              O.q(v0, v1, v2, v3, false);
            }
          }
    }
    box(buf, X0, X1, Y0, Y1, Z0, Z1, L0, L1, L2, L3, id, fl, top) {
      const V = (x, y, z, n) => buf.v(x, y, z, L0, L1, L2, L3, n, id, 255, fl | (y >= top ? 16 : 0));
      const F = [
        [0, [X1, Y0, Z0], [X1, Y0, Z1], [X1, Y1, Z1], [X1, Y1, Z0]], [1, [X0, Y0, Z1], [X0, Y0, Z0], [X0, Y1, Z0], [X0, Y1, Z1]],
        [2, [X0, Y1, Z0], [X1, Y1, Z0], [X1, Y1, Z1], [X0, Y1, Z1]], [3, [X0, Y0, Z1], [X1, Y0, Z1], [X1, Y0, Z0], [X0, Y0, Z0]],
        [4, [X0, Y0, Z1], [X1, Y0, Z1], [X1, Y1, Z1], [X0, Y1, Z1]], [5, [X1, Y0, Z0], [X0, Y0, Z0], [X0, Y1, Z0], [X1, Y1, Z0]],
      ];
      for (const f of F) { const a = V(...f[1], f[0]), b = V(...f[2], f[0]), c = V(...f[3], f[0]), d = V(...f[4], f[0]); buf.q(a, b, c, d, false); }
    }
    upload(key, mesh, pos) {
      const gl = this.gl, old = this.secs.get(key);
      if (old) this.drop(key, old);
      const up = (m) => {
        if (!m.ni) return null;
        const vb = gl.createBuffer(), ib = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(m.buf, 0, m.n * 20), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx.subarray(0, m.ni), gl.STATIC_DRAW);
        return { vb, ib, count: m.ni };
      };
      this.secs.set(key, { O: up(mesh.O), T: up(mesh.T), pos, dirty: false });
    }
    drop(key, s) {
      const gl = this.gl;
      for (const p of [s.O, s.T]) if (p) { gl.deleteBuffer(p.vb); gl.deleteBuffer(p.ib); }
      this.secs.delete(key);
    }
    clearSections() { for (const [k, s] of [...this.secs]) this.drop(k, s); }
    drawSec(prog, s, p) {
      const gl = this.gl;
      gl.uniform3f(prog.u.uOff, s.pos[0], s.pos[1], s.pos[2]);
      gl.bindBuffer(gl.ARRAY_BUFFER, p.vb);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, p.ib);
      gl.vertexAttribPointer(0, 3, gl.UNSIGNED_SHORT, false, 20, 0);
      gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 20, 8);
      gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, false, 20, 12);
      gl.vertexAttribPointer(3, 3, gl.BYTE, true, 20, 16);
      gl.drawElements(gl.TRIANGLES, p.count, gl.UNSIGNED_SHORT, 0);
    }
    quadPass(prog) {
      const gl = this.gl;
      gl.useProgram(prog.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.enableVertexAttribArray(0);
      for (let i = 1; i < 4; i++) gl.disableVertexAttribArray(i);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    // câmera: posição + direção (yaw/pitch)
    setCamera(eye, fwd) {
      this.resize();
      const w = this.cv.width, h = this.cv.height;
      this.fov = 1.0; this.asp = w / h;
      this.eye = eye; this.fwd = fwd;
      this.view = M.look(eye, [eye[0] + fwd[0], eye[1] + fwd[1], eye[2] + fwd[2]], [0, 1, 0]);
      this.proj = M.persp(this.fov, this.asp, 0.08, 400);
      this.vp = M.mul(this.proj, this.view);
      let rx = fwd[2], rz = -fwd[0];
      const l = Math.hypot(rx, rz) || 1; rx /= l; rz /= l;
      this.right = [-rx, 0, -rz];
      const f = fwd, r = this.right;
      this.up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    }
    // seções visíveis; monta as que faltam, as mais perto primeiro, dentro de um orçamento de tempo
    visible(world, ms) {
      const { SN, SY } = world, e = this.eye, f = this.fwd, R = this.viewDist;
      for (const k of world.dirty) { const s = this.secs.get(k); if (s) s.dirty = true; }
      world.dirty.clear();
      const cosH = Math.cos(Math.atan(Math.tan(this.fov / 2) * Math.hypot(1, this.asp))) - 0.05;
      const list = [];
      const r = Math.ceil(R / 16) + 1, cx = Math.floor(e[0] / 16), cz = Math.floor(e[2] / 16);
      for (let sz = Math.max(0, cz - r); sz <= Math.min(SN - 1, cz + r); sz++)
        for (let sx = Math.max(0, cx - r); sx <= Math.min(SN - 1, cx + r); sx++)
          for (let sy = 0; sy < SY; sy++) {
            const mx = sx * 16 + 8 - e[0], my = sy * 16 + 8 - e[1], mz = sz * 16 + 8 - e[2], dh = Math.hypot(mx, mz);
            if (dh > R + 14) continue;
            const dd = Math.hypot(mx, my, mz), dot = mx * f[0] + my * f[1] + mz * f[2];
            if (dd > 20 && dot < dd * cosH - 14) continue;
            list.push([dd, (sy * SN + sz) * SN + sx, sx, sy, sz]);
          }
      list.sort((a, b) => a[0] - b[0]);
      const t0 = performance.now(), out = [];
      for (const [dd, key, sx, sy, sz] of list) {
        let s = this.secs.get(key);
        if ((!s || s.dirty) && performance.now() - t0 < ms) { this.upload(key, this.buildSection(world, sx, sy, sz), [sx * 16, sy * 16, sz * 16]); s = this.secs.get(key); }
        if (s) out.push(s);
      }
      // solta o que ficou longe
      if (this.secs.size > list.length * 2 + 200)
        for (const [k, s] of [...this.secs]) if (Math.hypot(s.pos[0] + 8 - e[0], s.pos[2] + 8 - e[2]) > R + 64) this.drop(k, s);
      this.pending = list.length - out.length;
      return out;
    }
    // quadro: env = { skyCol, zen, hor, sunDir, sunCol, stars, fogCol, fog:[ini,fim], depth, cave, water }
    // mapa de sombra: câmera ortográfica olhando da direção do sol, centrada no jogador
    shadowPass(world, env, batch) {
      const gl = this.gl, R = 46, sz = this.sh.w, ld = env.lightDir;
      const c = env.focus;
      const up = Math.abs(ld[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
      const view = M.look([c[0] + ld[0] * 120, c[1] + ld[1] * 120, c[2] + ld[2] * 120], c, up);
      // encaixa o centro na grade de texels pra sombra não tremer
      const tx = view[12], ty = view[13], k = (2 * R) / sz;
      view[12] = Math.round(tx / k) * k; view[13] = Math.round(ty / k) * k;
      const pr = new Float32Array(16);
      pr[0] = 1 / R; pr[5] = 1 / R; pr[10] = -2 / 239; pr[14] = -241 / 239; pr[15] = 1;
      this.lvp = M.mul(pr, view);
      this.shFrame++;
      if (this.quality < 2 && this.shFrame % 3 !== 1 && this.shReady) return;
      this.shReady = true;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sh.fb);
      gl.viewport(0, 0, sz, sz);
      gl.clearColor(1, 1, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.clearColor(0, 0, 0, 1);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      const sp = this.shc;
      gl.useProgram(sp.p);
      gl.uniformMatrix4fv(sp.u.uLVP, false, this.lvp);
      for (let i = 0; i < 4; i++) gl.enableVertexAttribArray(i);
      for (const s of this.secs.values()) {
        if (!s.O || Math.abs(s.pos[0] + 8 - c[0]) > R + 40 || Math.abs(s.pos[2] + 8 - c[2]) > R + 40) continue;
        this.drawSec(sp, s, s.O);
      }
      if (batch && batch.n) {
        const en = this.she;
        gl.useProgram(en.p);
        gl.uniformMatrix4fv(en.u.uLVP, false, this.lvp);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.entBuf);
        gl.bufferData(gl.ARRAY_BUFFER, batch.d.subarray(0, batch.n * 11), gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 44, 12);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 44, 24);
        gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 44, 36);
        gl.drawArrays(gl.TRIANGLES, 0, batch.n);
      }
    }
    shUniforms(prog, on) {
      const gl = this.gl;
      gl.uniformMatrix4fv(prog.u.uLVP, false, this.lvp || this.vp);
      gl.uniform1f(prog.u.uShOn, on ? 1 : 0);
      if (this.sh) gl.uniform2f(prog.u.uShTex, 1 / this.sh.w, 1 / this.sh.h);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, on ? this.sh.tex : this.pal);
      gl.uniform1i(prog.u.uShadow, 3);
      gl.activeTexture(gl.TEXTURE0);
    }
    render(world, env, time, batch, hurt, vm) {
      const gl = this.gl, w = this.cv.width, h = this.cv.height, e = this.eye;
      const shOn = !!(this.sh && env.dirK > 0.02 && !this.loading);
      if (shOn) this.shadowPass(world, env, batch);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb.fb);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
      const sk = this.sky;
      gl.useProgram(sk.p);
      gl.uniform3fv(sk.u.uF, this.fwd); gl.uniform3fv(sk.u.uR, this.right); gl.uniform3fv(sk.u.uU, this.up);
      gl.uniform1f(sk.u.uTan, Math.tan(this.fov / 2)); gl.uniform1f(sk.u.uAsp, this.asp);
      gl.uniform3fv(sk.u.uZen, env.zen); gl.uniform3fv(sk.u.uHor, env.hor);
      gl.uniform3fv(sk.u.uSunDir, env.sunDir); gl.uniform3fv(sk.u.uSunCol, env.sunCol);
      gl.uniform1f(sk.u.uStars, env.stars); gl.uniform3fv(sk.u.uEye, e); gl.uniform1f(sk.u.uTime, time);
      gl.uniform1f(sk.u.uDepth, env.depth); gl.uniform3fv(sk.u.uCave, env.cave);
      this.quadPass(sk);

      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      const ck = this.chunk;
      gl.useProgram(ck.p);
      gl.uniformMatrix4fv(ck.u.uMVP, false, this.vp);
      gl.uniform3fv(ck.u.uEye, e);
      gl.uniform1f(ck.u.uTime, time);
      gl.uniform3fv(ck.u.uSky, env.skyCol);
      gl.uniform3fv(ck.u.uSunDir, env.sunDir);
      gl.uniform3fv(ck.u.uFogCol, env.fogCol);
      gl.uniform2fv(ck.u.uFog, env.fog);
      gl.uniform3fv(ck.u.uSunCol, env.sunCol);
      gl.uniform3fv(ck.u.uLightDir, env.lightDir);
      gl.uniform1f(ck.u.uDirK, env.dirK);
      gl.uniform3fv(ck.u.uHor, env.hor);
      this.shUniforms(ck, shOn);
      gl.uniform1f(ck.u.uPass, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.pal);
      gl.uniform1i(ck.u.uPal, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.atlas);
      gl.uniform1i(ck.u.uAtlas, 1);
      gl.activeTexture(gl.TEXTURE0);
      for (let i = 0; i < 4; i++) gl.enableVertexAttribArray(i);
      const vis = this.visible(world, this.loading ? 400 : 7);
      for (const s of vis) if (s.O) this.drawSec(ck, s, s.O);

      if (batch && batch.n) {
        const en = this.ent;
        gl.useProgram(en.p);
        gl.uniformMatrix4fv(en.u.uMVP, false, this.vp);
        gl.uniform3fv(en.u.uEye, e);
        gl.uniform3fv(en.u.uFogCol, env.fogCol);
        gl.uniform2fv(en.u.uFog, env.fog);
        gl.uniform1f(en.u.uDirK, env.dirK);
        this.shUniforms(en, shOn);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.entBuf);
        gl.bufferData(gl.ARRAY_BUFFER, batch.d.subarray(0, batch.n * 11), gl.DYNAMIC_DRAW);
        for (let i = 0; i < 4; i++) gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 44, 12);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 44, 24);
        gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 44, 36);
        gl.drawArrays(gl.TRIANGLES, 0, batch.n);
        gl.disableVertexAttribArray(3);
      }

      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
      gl.depthMask(false);
      gl.useProgram(ck.p);
      gl.uniform1f(ck.u.uPass, 1);
      for (let i = 0; i < 4; i++) gl.enableVertexAttribArray(i);
      for (let k = vis.length - 1; k >= 0; k--) if (vis[k].T) this.drawSec(ck, vis[k], vis[k].T);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      if (vm && vm.n) {
        gl.clear(gl.DEPTH_BUFFER_BIT);
        const en = this.ent;
        gl.useProgram(en.p);
        gl.uniformMatrix4fv(en.u.uMVP, false, this.vp);
        gl.uniform3fv(en.u.uEye, e);
        gl.uniform2f(en.u.uFog, 1000, 2000);
        gl.uniform1f(en.u.uDirK, 0);
        this.shUniforms(en, false);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vmBuf);
        gl.bufferData(gl.ARRAY_BUFFER, vm.d.subarray(0, vm.n * 11), gl.DYNAMIC_DRAW);
        for (let i = 0; i < 4; i++) gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 44, 12);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 44, 24);
        gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 44, 36);
        gl.drawArrays(gl.TRIANGLES, 0, vm.n);
      }
      gl.disable(gl.DEPTH_TEST);

      const bloom = this.quality > 0;
      if (bloom) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.b1.fb);
        gl.viewport(0, 0, this.b1.w, this.b1.h);
        gl.useProgram(this.bright.p);
        gl.bindTexture(gl.TEXTURE_2D, this.fb.tex);
        gl.uniform1i(this.bright.u.uTex, 0);
        gl.uniform2f(this.bright.u.uTexel, 1 / w, 1 / h);
        this.quadPass(this.bright);
        const sp = this.project(e[0] + env.sunDir[0] * 500, e[1] + env.sunDir[1] * 500, e[2] + env.sunDir[2] * 500);
        this.rayK = 0;
        if (sp && this.quality > 1 && env.sunDir[1] > -0.05 && env.depth < 0.7) {
          const ux = sp.x / this.cv.clientWidth, uy = 1 - sp.y / this.cv.clientHeight;
          const facing = Math.max(0, this.fwd[0] * env.sunDir[0] + this.fwd[1] * env.sunDir[1] + this.fwd[2] * env.sunDir[2]);
          this.rayK = facing * facing * (1 - env.depth);
          if (this.rayK > 0.01) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.b3.fb);
            gl.useProgram(this.rays.p);
            gl.bindTexture(gl.TEXTURE_2D, this.b1.tex);
            gl.uniform1i(this.rays.u.uTex, 0);
            gl.uniform2f(this.rays.u.uSun, ux, uy);
            this.quadPass(this.rays);
          }
        }
        for (let k = 0; k < 2; k++)
          for (const [src, dst, dx, dy] of [[this.b1, this.b2, 1, 0], [this.b2, this.b1, 0, 1]]) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
            gl.useProgram(this.blur.p);
            gl.bindTexture(gl.TEXTURE_2D, src.tex);
            gl.uniform1i(this.blur.u.uTex, 0);
            gl.uniform2f(this.blur.u.uDir, (dx * (1 + k)) / src.w, (dy * (1 + k)) / src.h);
            this.quadPass(this.blur);
          }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      const po = this.post;
      gl.useProgram(po.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.fb.tex);
      gl.uniform1i(po.u.uScene, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.b1.tex);
      gl.uniform1i(po.u.uBloom, 1);
      gl.uniform1f(po.u.uBloomK, bloom ? (this.quality > 1 ? 0.9 : 0.6) : 0);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, bloom && this.rayK > 0.01 ? this.b3.tex : this.b1.tex);
      gl.uniform1i(po.u.uRays, 4);
      const rk = bloom && this.rayK > 0.01 ? this.rayK * 0.9 : 0;
      gl.uniform3f(po.u.uRayCol, env.sunCol[0] * rk, env.sunCol[1] * rk, env.sunCol[2] * rk);
      gl.uniform1f(po.u.uOutline, this.fb.dtex && this.quality > 0 ? 1 : 0);
      gl.uniform2f(po.u.uTexel, 1 / w, 1 / h);
      gl.uniform3fv(po.u.uInk, env.ink || [0.06, 0.05, 0.12]);
      if (this.fb.dtex) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.fb.dtex); gl.uniform1i(po.u.uDepth, 2); }
      gl.uniform1f(po.u.uHurt, hurt || 0);
      gl.uniform1f(po.u.uWater, env.water || 0);
      this.quadPass(po);
      gl.activeTexture(gl.TEXTURE0);
    }
    // mundo -> tela (pixels CSS); null se atrás da câmera
    project(x, y, z) {
      const m = this.vp, cw = this.cv.clientWidth, ch = this.cv.clientHeight;
      const X = m[0] * x + m[4] * y + m[8] * z + m[12], Y = m[1] * x + m[5] * y + m[9] * z + m[13], Wc = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (Wc < 0.1) return null;
      return { x: (X / Wc * 0.5 + 0.5) * cw, y: (1 - (Y / Wc * 0.5 + 0.5)) * ch };
    }
  }
  CB.Gfx = Gfx;

  // ───── lote de caixinhas das entidades ─────
  class Batch {
    constructor() { this.d = new Float32Array(11 * 36 * 1500); this.n = 0; }
    reset() { this.n = 0; }
    grow() { const d = new Float32Array(this.d.length * 2); d.set(this.d); this.d = d; }
    // m: {x,y,z,yaw,lit,scale?}; caixa em coordenadas do modelo; limb: {p:[x,y,z], ax, az} gira em volta do pivô
    box(m, cx, cy, cz, hx, hy, hz, col, emis, limb, spin) {
      if ((this.n + 36) * 11 > this.d.length) this.grow();
      const sc = m.scale || 1, cyw = Math.cos(m.yaw || 0), syw = Math.sin(m.yaw || 0);
      const ca = Math.cos(limb ? limb.ax || 0 : 0), sa = Math.sin(limb ? limb.ax || 0 : 0);
      const cb = Math.cos(limb ? limb.az || 0 : 0), sb = Math.sin(limb ? limb.az || 0 : 0);
      const cs = Math.cos(spin || 0), ss = Math.sin(spin || 0), cpi = Math.cos(m.pitch || 0), spi = Math.sin(m.pitch || 0);
      const T = (lx, ly, lz) => {
        let x = lx * cs + lz * ss, z = -lx * ss + lz * cs, y = ly;
        x += cx; y += cy; z += cz;
        if (limb) {
          const p = limb.p;
          let dx = x - p[0], dy = y - p[1], dz = z - p[2];
          let y2 = dy * ca - dz * sa, z2 = dy * sa + dz * ca; dy = y2; dz = z2;
          const x2 = dx * cb - dy * sb; y2 = dx * sb + dy * cb; dx = x2; dy = y2;
          x = p[0] + dx; y = p[1] + dy; z = p[2] + dz;
        }
        if (m.pitch) { const y2 = y * cpi - z * spi, z2 = y * spi + z * cpi; y = y2; z = z2; }
        return [m.x + (x * cyw + z * syw) * sc, m.y + y * sc, m.z + (-x * syw + z * cyw) * sc];
      };
      const v = [T(-hx, -hy, hz), T(hx, -hy, hz), T(hx, hy, hz), T(-hx, hy, hz), T(-hx, -hy, -hz), T(hx, -hy, -hz), T(hx, hy, -hz), T(-hx, hy, -hz)];
      const F = [[0, 1, 2, 3], [3, 2, 6, 7], [4, 5, 1, 0], [1, 5, 6, 2], [4, 0, 3, 7], [5, 4, 7, 6]];
      const d = this.d, e = emis || 0, L = m.lit;
      for (const f of F) {
        const a = v[f[0]], b = v[f[1]], c = v[f[2]];
        let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
        let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
        let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        const sh = Math.abs(nx) * 0.8 + Math.abs(nz) * 0.9 + (ny > 0 ? ny : -ny * 0.6);
        for (const k of [0, 1, 2, 0, 2, 3]) {
          const p = v[f[k]], o = this.n * 11;
          d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2];
          d[o + 3] = col[0]; d[o + 4] = col[1]; d[o + 5] = col[2];
          d[o + 6] = L[0]; d[o + 7] = L[1]; d[o + 8] = L[2];
          d[o + 9] = sh; d[o + 10] = e;
          this.n++;
        }
      }
    }
  }
  CB.Batch = Batch;
})();
