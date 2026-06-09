// texture.js — pure stipple/halftone fill for dithered output. No DOM.
// "Textura" on: each band's solid block becomes a dot pattern whose density tracks
// the band tone (darkest = solid, lightest = sparsest). Gaps transparent; dots use
// the band's own color. Dot grid is a fixed TILE×TILE screen-space lattice.

export const TILE = 4;

// 4 density tiles (TILE×TILE), flat row-major (1 = dot, 0 = gap). Dots spread evenly.
// L0 solid 16/16 → L1 ~50% (8) → L2 ~25% (4) → L3 ~12.5% (2).
export const TEXTURE_PATTERNS = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
];

// band index (0 = darkest) → density level 0..3, spread across available bands.
export function textureLevel(band, numBands) {
  if (numBands <= 1) return 0;
  const t = band / (numBands - 1);
  return Math.min(TEXTURE_PATTERNS.length - 1, Math.round(t * (TEXTURE_PATTERNS.length - 1)));
}

// Build the textured RGBA from a low-res banded result, on a PERFECT integer grid.
// low: { width, height, data (RGBA), bands (Uint8Array band index per cell) }
// block = output px per low-res cell (the "Escala" block). Internally snapped so that
// cell = block / TILE is an integer → every sub-cell is exactly cell×cell px, uniform,
// never broken by rounding. Output size = (low.width × blk) × (low.height × blk).
// The caller scales `block` with the Escala so the whole grid grows/shrinks uniformly.
export function renderTextured(low, block, numBands) {
  const { width: w, height: h, data, bands } = low;
  const cell = Math.max(1, (block / TILE) | 0);
  const blk = cell * TILE;
  const W = w * blk, H = h * blk;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const ci = cy * w + cx, sp = ci * 4;
      const transparent = data[sp + 3] === 0;
      const lvl = transparent ? 0 : textureLevel(bands[ci], numBands);
      const r = data[sp], g = data[sp + 1], b = data[sp + 2];
      const ox0 = cx * blk, oy0 = cy * blk;
      for (let sy = 0; sy < TILE; sy++) {
        for (let sx = 0; sx < TILE; sx++) {
          const on = !transparent && TEXTURE_PATTERNS[lvl][sy * TILE + sx] === 1;
          for (let yy = 0; yy < cell; yy++) {
            let op = ((oy0 + sy * cell + yy) * W + ox0 + sx * cell) * 4;
            for (let xx = 0; xx < cell; xx++, op += 4) {
              if (on) { out[op] = r; out[op + 1] = g; out[op + 2] = b; out[op + 3] = 255; }
              else out[op + 3] = 0;
            }
          }
        }
      }
    }
  }
  return { width: W, height: H, data: out };
}
