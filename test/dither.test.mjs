import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgb, buildPalette } from '../site/dither.js';

test('hexToRgb parses 6-digit hex with and without #', () => {
  assert.deepEqual(hexToRgb('#00201C'), [0, 32, 28]);
  assert.deepEqual(hexToRgb('#F05524'), [240, 85, 36]);
  assert.deepEqual(hexToRgb('00FF7F'), [0, 255, 127]);
});

test('buildPalette maps an array of hex strings to rgb triples', () => {
  assert.deepEqual(buildPalette(['#000000', '#FFFFFF']), [[0, 0, 0], [255, 255, 255]]);
});

import { luminance, applyBC } from '../site/dither.js';

test('luminance returns normalized 0..1 with Rec.709 weights', () => {
  assert.ok(Math.abs(luminance(255, 255, 255) - 1) < 1e-9);
  assert.equal(luminance(0, 0, 0), 0);
  assert.ok(Math.abs(luminance(255, 0, 0) - 0.2126) < 1e-6);
});

test('applyBC is identity at neutral', () => {
  assert.equal(applyBC(0.5, 0, 0), 0.5);
});

test('applyBC contrast expands around 0.5 and clamps', () => {
  assert.equal(applyBC(0.25, 0, 100), 0);   // (0.25-0.5)*2 + 0.5 = 0
  assert.equal(applyBC(0.75, 0, 100), 1);
});

test('applyBC brightness shifts and clamps to [0,1]', () => {
  assert.equal(applyBC(0.5, 50, 0), 1);      // 0.5 + 0.5
  assert.equal(applyBC(0.5, -100, 0), 0);
});

import { bandIndex } from '../site/dither.js';

test('auto banding splits [0,1] uniformly into N levels', () => {
  assert.equal(bandIndex(0.1, 4), 0);
  assert.equal(bandIndex(0.3, 4), 1);
  assert.equal(bandIndex(0.6, 4), 2);
  assert.equal(bandIndex(0.9, 4), 3);
  assert.equal(bandIndex(0.4, 2), 0);
  assert.equal(bandIndex(0.6, 2), 1);
});

test('manual thresholds override the auto split', () => {
  assert.equal(bandIndex(0.70, 2, [0.8]), 0);
  assert.equal(bandIndex(0.85, 2, [0.8]), 1);
});

import { ditherImageData, BAYER } from '../site/dither.js';

function solidGray(w, h, v) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    data[p] = data[p + 1] = data[p + 2] = v; data[p + 3] = 255;
  }
  return { width: w, height: h, data };
}

test('BAYER matrices are normalized into [0,1)', () => {
  for (const size of [2, 4, 8]) {
    const m = BAYER[size];
    assert.equal(m.length, size);
    for (const row of m) for (const v of row) assert.ok(v >= 0 && v < 1);
  }
});

test('Bayer matrices exist for all 5 levels (2..32), square and normalized', () => {
  for (const size of [2, 4, 8, 16, 32]) {
    const m = BAYER[size];
    assert.ok(m, `BAYER[${size}] missing`);
    assert.equal(m.length, size);
    assert.equal(m[0].length, size);
    for (const row of m) for (const v of row) assert.ok(v >= 0 && v < 1);
  }
  // level-2 (4x4) generator must reproduce the canonical matrix
  assert.equal(BAYER[4][0][1], 8 / 16);
  assert.equal(BAYER[4][3][3], 5 / 16);
});

test('bayer 2-level on mid-gray yields both palette colors ~50/50', () => {
  const src = solidGray(16, 16, 128);
  const palette = buildPalette(['#000000', '#FFFFFF']);
  const out = ditherImageData(src, { levels: 2, palette, algorithm: 'bayer', bayerSize: 4 });
  let black = 0, white = 0;
  for (let i = 0; i < 16 * 16; i++) {
    const p = i * 4;
    if (out.data[p] === 0) black++; else if (out.data[p] === 255) white++;
  }
  assert.equal(black + white, 256);
  assert.ok(Math.abs(black - white) <= 64, `balance off: ${black}/${white}`);
});

function hGradient(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4;
    const v = Math.round((x / (w - 1)) * 255);
    data[p] = data[p + 1] = data[p + 2] = v; data[p + 3] = 255;
  }
  return { width: w, height: h, data };
}

test('floyd error diffusion approximately conserves mean luminance', () => {
  const w = 64, h = 16, src = hGradient(w, h);
  const palette = buildPalette(['#000000', '#FFFFFF']);
  const out = ditherImageData(src, { levels: 2, palette, algorithm: 'floyd' });
  let inSum = 0, outSum = 0;
  for (let i = 0; i < w * h; i++) { const p = i * 4; inSum += src.data[p] / 255; outSum += out.data[p] / 255; }
  assert.ok(Math.abs(inSum - outSum) / (w * h) < 0.03, `mean drift too large`);
});

test('atkinson produces both palette colors on a gradient', () => {
  const palette = buildPalette(['#000000', '#FFFFFF']);
  const out = ditherImageData(hGradient(64, 16), { levels: 2, palette, algorithm: 'atkinson' });
  const seen = new Set();
  for (let i = 0; i < 64 * 16; i++) seen.add(out.data[i * 4]);
  assert.ok(seen.has(0) && seen.has(255));
});

test('4-level banding maps known luminances to correct palette colors', () => {
  const vals = [26, 89, 153, 230];
  const data = new Uint8ClampedArray(4 * 4);
  for (let i = 0; i < 4; i++) { const p = i * 4; data[p] = data[p + 1] = data[p + 2] = vals[i]; data[p + 3] = 255; }
  const src = { width: 4, height: 1, data };
  const palette = buildPalette(['#00201C', '#005C54', '#C4B597', '#F05524']);
  const out = ditherImageData(src, { levels: 4, palette, algorithm: 'floyd' });
  assert.deepEqual([out.data[0], out.data[1], out.data[2]], [0, 32, 28]);        // band 0
  assert.deepEqual([out.data[12], out.data[13], out.data[14]], [240, 85, 36]);   // band 3
});

test('curveLUT remaps luminance before banding (darkening curve shifts bands down)', () => {
  const data = new Uint8ClampedArray([128, 128, 128, 255]);
  const src = { width: 1, height: 1, data };
  const palette = buildPalette(['#000000', '#FFFFFF']);
  const darkLUT = new Float32Array(256).fill(0); // map all inputs to 0
  const out = ditherImageData(src, { levels: 2, palette, algorithm: 'floyd', curveLUT: darkLUT });
  assert.deepEqual([out.data[0], out.data[1], out.data[2]], [0, 0, 0]); // band 0 (black)
});

test('absent curveLUT leaves behavior unchanged (still maps white bright in bayer)', () => {
  const data = new Uint8ClampedArray([255, 255, 255, 255]);
  const src = { width: 1, height: 1, data };
  const palette = buildPalette(['#000000', '#FFFFFF']);
  const out = ditherImageData(src, { levels: 2, palette, algorithm: 'bayer', bayerSize: 2 });
  assert.deepEqual([out.data[0], out.data[1], out.data[2]], [255, 255, 255]); // band 1 (white)
});

test('alphaForBand makes the marked band transparent and keeps others opaque', () => {
  // 4 pixels, known luminances → bands 0,1,2,3 with default 4-level split
  const vals = [26, 89, 153, 230];
  const data = new Uint8ClampedArray(4 * 4);
  for (let i = 0; i < 4; i++) { const p = i * 4; data[p] = data[p + 1] = data[p + 2] = vals[i]; data[p + 3] = 255; }
  const src = { width: 4, height: 1, data };
  const palette = buildPalette(['#00201C', '#005C54', '#C4B597', '#F05524']);
  const out = ditherImageData(src, { levels: 4, palette, algorithm: 'floyd', alphaForBand: [0, 255, 255, 255] });
  assert.equal(out.data[3], 0);     // band 0 → transparent
  assert.equal(out.data[7], 255);   // band 1 → opaque
  assert.equal(out.data[11], 255);  // band 2 → opaque
  assert.equal(out.data[15], 255);  // band 3 → opaque
});

test('alphaForBand works in the bayer path too', () => {
  const data = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]); // black, white
  const src = { width: 2, height: 1, data };
  const palette = buildPalette(['#000000', '#FFFFFF']);
  const out = ditherImageData(src, { levels: 2, palette, algorithm: 'bayer', bayerSize: 2, alphaForBand: [0, 255] });
  assert.equal(out.data[3], 0);    // black → band 0 → transparent
  assert.equal(out.data[7], 255);  // white → band 1 → opaque
});

test('absent alphaForBand keeps every pixel opaque (backward compatible)', () => {
  const out = ditherImageData(solidGray(8, 8, 200), { levels: 2, palette: buildPalette(['#000000', '#FFFFFF']), algorithm: 'bayer', bayerSize: 4 });
  for (let i = 3; i < out.data.length; i += 4) assert.equal(out.data[i], 255);
});

test('ditherImageData returns a per-cell band index map (floyd)', () => {
  const vals = [26, 89, 153, 230];
  const data = new Uint8ClampedArray(4 * 4);
  for (let i = 0; i < 4; i++) { const p = i * 4; data[p] = data[p + 1] = data[p + 2] = vals[i]; data[p + 3] = 255; }
  const src = { width: 4, height: 1, data };
  const palette = buildPalette(['#00201C', '#005C54', '#C4B597', '#F05524']);
  const out = ditherImageData(src, { levels: 4, palette, algorithm: 'floyd' });
  assert.equal(out.bands.length, 4);
  assert.deepEqual([...out.bands], [0, 1, 2, 3]);
});

test('band map values stay within 0..levels-1 (bayer)', () => {
  const out = ditherImageData(solidGray(8, 8, 128), { levels: 3, palette: buildPalette(['#000000', '#808080', '#FFFFFF']), algorithm: 'bayer', bayerSize: 4 });
  assert.equal(out.bands.length, 64);
  for (const b of out.bands) assert.ok(b >= 0 && b <= 2);
});
