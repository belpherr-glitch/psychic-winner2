export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
export const wrapA = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeNoise(r) {
  const S = 256;
  const v = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) v[i] = r() * 2 - 1;
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) * S, y1 = ((yi + 1) & 255) * S;
    return lerp(lerp(v[x0 + y0], v[x1 + y0], u), lerp(v[x0 + y1], v[x1 + y1], u), w);
  };
}

export function fbm(n, x, y, oct) {
  let s = 0, a = 1, f = 1, t = 0;
  for (let i = 0; i < oct; i++) {
    s += n(x * f, y * f) * a;
    t += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / t;
}

export const money = (n) => 'R$ ' + Math.round(n).toLocaleString('pt-BR');
export const m3 = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
