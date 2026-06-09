// curve.js — pure tone-curve → 256-entry LUT. Monotone cubic Hermite (Fritsch–Carlson).
// points: [{x,y}] in [0,1], ascending x, including x=0 and x=1. No DOM.

export function buildCurveLUT(points) {
  const pts = [...points].sort((a, b) => a.x - b.x);
  const n = pts.length;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);

  // secant slopes
  const d = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i];
    d[i] = dx <= 1e-9 ? 0 : (ys[i + 1] - ys[i]) / dx;
  }
  // tangents (Fritsch–Carlson → monotonicity preserved)
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (d[i - 1] * d[i] <= 0) ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const evalAt = x => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (i < n - 1 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    return h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1];
  };

  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = clamp01(evalAt(i / 255));
  return lut;
}
