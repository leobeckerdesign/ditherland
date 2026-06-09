import { test } from 'node:test';
import assert from 'node:assert/strict';
import { field } from '../site/noise.js';

const W = 24, H = 24;

test('output has length w*h and every value is within [0,1]', () => {
  for (const mode of ['blobs', 'flicker', 'slide']) {
    const f = field(W, H, 0, { mode, speed: 1, seed: 7 });
    assert.equal(f.length, W * H);
    for (let i = 0; i < f.length; i++) assert.ok(f[i] >= 0 && f[i] <= 1, `${mode}[${i}]=${f[i]}`);
  }
});

test('deterministic: same (mode, t, seed) yields identical arrays', () => {
  for (const mode of ['blobs', 'flicker', 'slide']) {
    const a = field(W, H, 1.5, { mode, speed: 2, seed: 3 });
    const b = field(W, H, 1.5, { mode, speed: 2, seed: 3 });
    assert.deepEqual([...a], [...b]);
  }
});

test('different seed changes the field', () => {
  const a = field(W, H, 0, { mode: 'blobs', speed: 1, seed: 1 });
  const b = field(W, H, 0, { mode: 'blobs', speed: 1, seed: 2 });
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) diff++;
  assert.ok(diff > a.length / 2, `expected most cells to differ, got ${diff}`);
});

test('blobs are spatially smooth (neighbors are close)', () => {
  const f = field(W, H, 0, { mode: 'blobs', speed: 1, seed: 5 });
  let sum = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 1; x < W; x++) {
    sum += Math.abs(f[y * W + x] - f[y * W + x - 1]); n++;
  }
  assert.ok(sum / n < 0.2, `mean neighbor diff too high: ${sum / n}`);
});

test('flicker is stable within a time step and changes across steps (speed=1)', () => {
  const t0a = field(W, H, 0.0, { mode: 'flicker', speed: 1, seed: 9 });
  const t0b = field(W, H, 0.4, { mode: 'flicker', speed: 1, seed: 9 }); // floor(0.4)=0 → same step
  assert.deepEqual([...t0a], [...t0b]);
  const t1 = field(W, H, 1.0, { mode: 'flicker', speed: 1, seed: 9 });  // floor(1.0)=1 → new step
  let diff = 0;
  for (let i = 0; i < t0a.length; i++) if (Math.abs(t0a[i] - t1[i]) > 1e-6) diff++;
  assert.ok(diff > t0a.length / 3, `flicker did not change across steps: ${diff}`);
});

test('slide stays smooth and changes over time', () => {
  const a = field(W, H, 0, { mode: 'slide', speed: 1, seed: 4 });
  const b = field(W, H, 3, { mode: 'slide', speed: 1, seed: 4 });
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) diff++;
  assert.ok(diff > a.length / 3, `slide did not move: ${diff}`);
  let sum = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 1; x < W; x++) { sum += Math.abs(b[y * W + x] - b[y * W + x - 1]); n++; }
  assert.ok(sum / n < 0.2, `slide not smooth: ${sum / n}`);
});

test('blobs animate over time', () => {
  const a = field(W, H, 0, { mode: 'blobs', speed: 1, seed: 5 });
  const b = field(W, H, 3, { mode: 'blobs', speed: 1, seed: 5 });
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) diff++;
  assert.ok(diff > a.length / 3, `blobs did not animate: ${diff}`);
});
