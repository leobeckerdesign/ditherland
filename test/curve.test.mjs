import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCurveLUT } from '../site/curve.js';

test('identity curve maps each input to itself', () => {
  const lut = buildCurveLUT([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  assert.equal(lut.length, 256);
  for (const i of [0, 64, 128, 200, 255]) {
    assert.ok(Math.abs(lut[i] - i / 255) < 0.01, `lut[${i}]=${lut[i]}`);
  }
});

test('LUT is monotonic non-decreasing and clamped to [0,1]', () => {
  const lut = buildCurveLUT([{ x: 0, y: 0.1 }, { x: 0.5, y: 0.9 }, { x: 1, y: 0.95 }]);
  for (let i = 1; i < 256; i++) assert.ok(lut[i] >= lut[i - 1] - 1e-6, `non-monotonic at ${i}`);
  for (let i = 0; i < 256; i++) assert.ok(lut[i] >= 0 && lut[i] <= 1);
});

test('curve honors endpoints', () => {
  const lut = buildCurveLUT([{ x: 0, y: 0.2 }, { x: 1, y: 0.8 }]);
  assert.ok(Math.abs(lut[0] - 0.2) < 0.01);
  assert.ok(Math.abs(lut[255] - 0.8) < 0.01);
});

test('lifting shadows raises low-input output above identity', () => {
  const lut = buildCurveLUT([{ x: 0, y: 0 }, { x: 0.25, y: 0.45 }, { x: 1, y: 1 }]);
  assert.ok(lut[64] > 64 / 255);
});
