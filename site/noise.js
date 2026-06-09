// noise.js — pure procedural noise field. No DOM. Importable in node and browser.
// field(width, height, t, opts) → Float32Array(width*height) in [0,1].
// modes: 'blobs' (3D value noise morphing through time),
//        'flicker' (per-cell white noise updated in discrete time steps),
//        'slide' (value noise panning over time).
// Deterministic: identical (width,height,t,mode,speed,seed) → identical output.

const FREQ = 0.08; // internal blob frequency (calibrated; not a UI control)

function hash3(ix, iy, iz, seed) {
  let h = seed | 0;
  h = Math.imul(h ^ (ix | 0), 0x27d4eb2d);
  h = Math.imul(h ^ (iy | 0), 0x85ebca6b);
  h = Math.imul(h ^ (iz | 0), 0xc2b2ae35);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967295; // [0,1]
}

const smooth = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

function valueNoise3(x, y, z, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const fx = smooth(x - x0), fy = smooth(y - y0), fz = smooth(z - z0);
  const c = (dx, dy, dz) => hash3(x0 + dx, y0 + dy, z0 + dz, seed);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), fx);
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), fx);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), fx);
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), fx);
  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz); // [0,1]
}

export function field(width, height, t, { mode = 'blobs', speed = 1, seed = 1 } = {}) {
  seed = seed || 1; // seed 0 is degenerate (hash3 fixed point); treat as 1
  const out = new Float32Array(width * height);

  if (mode === 'flicker') {
    // flicker: raw pixel coords → independent per-pixel white noise (FREQ intentionally not applied)
    const step = Math.floor(t * speed);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        out[y * width + x] = hash3(x, y, step, seed);
    return out;
  }

  let ox = 0, oy = 0, z = seed * 0.137; // 0.137: irrational-ish offset so seeds sample different z-fractions
  if (mode === 'slide') { ox = t * speed * 1.7; oy = t * speed * 0.9; }
  else { z += t * speed * 0.5; } // 'blobs' morph through z

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      out[y * width + x] = valueNoise3((x + ox) * FREQ, (y + oy) * FREQ, z, seed);
  return out;
}
