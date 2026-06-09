import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE, TEXTURE_PATTERNS, textureLevel, renderTextured } from '../site/texture.js';

test('there are 4 density patterns, each TILE*TILE, L0 solid, densities strictly decreasing', () => {
  assert.equal(TEXTURE_PATTERNS.length, 4);
  for (const p of TEXTURE_PATTERNS) assert.equal(p.length, TILE * TILE);
  assert.equal(TEXTURE_PATTERNS[0].reduce((a, b) => a + b, 0), TILE * TILE);
  const sums = TEXTURE_PATTERNS.map(p => p.reduce((a, b) => a + b, 0));
  for (let i = 1; i < sums.length; i++) assert.ok(sums[i] < sums[i - 1], `level ${i} not sparser`);
  assert.ok(sums[sums.length - 1] >= 1, 'sparsest still has at least one dot');
});

test('textureLevel: darkest band -> 0, lightest -> 3, identity at 4 bands', () => {
  assert.equal(textureLevel(0, 4), 0);
  assert.equal(textureLevel(3, 4), 3);
  assert.deepEqual([0, 1, 2, 3].map(b => textureLevel(b, 4)), [0, 1, 2, 3]);
  assert.equal(textureLevel(0, 2), 0);
  assert.equal(textureLevel(1, 2), 3);
  let prev = -1;
  for (let b = 0; b < 4; b++) { const l = textureLevel(b, 4); assert.ok(l >= prev); prev = l; }
});

function lowCell(rgb, band, alpha = 255) {
  return { width: 1, height: 1, data: new Uint8ClampedArray([rgb[0], rgb[1], rgb[2], alpha]), bands: new Uint8Array([band]) };
}

// renderTextured(low, block, numBands): each low-res cell becomes a block of `block`
// px subdivided into a fixed TILE×TILE pattern of uniform integer cell = block/TILE px.

test('output size = low size × block; block is TILE × cell', () => {
  const out = renderTextured(lowCell([1, 2, 3], 0), TILE * 5, 2);
  assert.equal(out.width, TILE * 5);
  assert.equal(out.height, TILE * 5);
});

test('solid band (level 0) fills the whole block opaque in the band color', () => {
  const block = TILE * 3;
  const out = renderTextured(lowCell([10, 20, 30], 0), block, 2); // band0 -> level0 solid
  for (let i = 0; i < block * block; i++) {
    const p = i * 4;
    assert.deepEqual([out.data[p], out.data[p + 1], out.data[p + 2], out.data[p + 3]], [10, 20, 30, 255]);
  }
});

test('a transparent low-res cell stays fully transparent regardless of pattern', () => {
  const out = renderTextured(lowCell([10, 20, 30], 1, 0), TILE * 2, 2);
  for (let i = 0; i < out.width * out.height; i++) assert.equal(out.data[i * 4 + 3], 0);
});

test('PERFECT GRID: every pattern cell is a uniform cell×cell block, no broken/uneven cells', () => {
  const cell = 5, block = TILE * cell;
  const out = renderTextured(lowCell([200, 100, 50], 1), block, 2); // band1,numBands2 -> level3 sparse
  const lvl = textureLevel(1, 2);
  for (let sy = 0; sy < TILE; sy++) for (let sx = 0; sx < TILE; sx++) {
    const on = TEXTURE_PATTERNS[lvl][sy * TILE + sx] === 1;
    for (let yy = 0; yy < cell; yy++) for (let xx = 0; xx < cell; xx++) {
      const p = ((sy * cell + yy) * block + (sx * cell + xx)) * 4;
      if (on) assert.deepEqual([out.data[p], out.data[p + 1], out.data[p + 2], out.data[p + 3]], [200, 100, 50, 255], `cell(${sx},${sy}) px(${xx},${yy})`);
      else assert.equal(out.data[p + 3], 0, `cell(${sx},${sy}) px(${xx},${yy}) must be transparent`);
    }
  }
});

test('the pattern grows uniformly with the block (same fill fraction at any size)', () => {
  const low = lowCell([200, 50, 50], 1);
  const frac = img => { let n = 0; for (let i = 3; i < img.data.length; i += 4) if (img.data[i] === 255) n++; return n / (img.width * img.height); };
  const small = renderTextured(low, TILE * 2, 2);  // cell 2
  const big = renderTextured(low, TILE * 9, 2);    // cell 9
  assert.ok(Math.abs(frac(small) - frac(big)) < 1e-9, `fill fraction must be size-independent: ${frac(small)} vs ${frac(big)}`);
});

test('multiple blocks tile perfectly side by side, all the same size', () => {
  const low = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]), bands: new Uint8Array([0, 1]) };
  const cell = 4, block = TILE * cell;
  const out = renderTextured(low, block, 2);
  assert.equal(out.width, 2 * block);
  assert.equal(out.height, block);
  // left block: band 0 (solid) entirely red opaque
  for (let oy = 0; oy < block; oy++) for (let ox = 0; ox < block; ox++) {
    const p = (oy * out.width + ox) * 4;
    assert.equal(out.data[p + 3], 255, `left (${ox},${oy})`);
    assert.equal(out.data[p], 255);
  }
  // right block: band 1 -> level 3 sparse, sampled at each cell's top-left pixel
  const lvl = textureLevel(1, 2);
  for (let sy = 0; sy < TILE; sy++) for (let sx = 0; sx < TILE; sx++) {
    const on = TEXTURE_PATTERNS[lvl][sy * TILE + sx] === 1;
    const p = ((sy * cell) * out.width + (block + sx * cell)) * 4;
    assert.equal(out.data[p + 3], on ? 255 : 0, `right cell(${sx},${sy})`);
  }
});
