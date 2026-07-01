import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outputSize } from '../site/resolution.js';

test('native mode returns source dims unchanged (odd dims preserved)', () => {
  assert.deepEqual(outputSize(1920, 1080, 'native'), [1920, 1080]);
  assert.deepEqual(outputSize(1281, 723, 'native'), [1281, 723]);
});

test('unknown/undefined mode falls back to native', () => {
  assert.deepEqual(outputSize(1920, 1080, 'whatever'), [1920, 1080]);
  assert.deepEqual(outputSize(1920, 1080), [1920, 1080]);
});

test('4k anchors the longer side to 3840 (16:9 landscape -> UHD)', () => {
  assert.deepEqual(outputSize(1920, 1080, '4k'), [3840, 2160]);
});

test('2k anchors the longer side to 2560 (16:9 landscape -> QHD)', () => {
  assert.deepEqual(outputSize(1920, 1080, '2k'), [2560, 1440]);
});

test('4k square -> 3840x3840', () => {
  assert.deepEqual(outputSize(1080, 1080, '4k'), [3840, 3840]);
});

test('4k portrait 9:16 -> 2160x3840', () => {
  assert.deepEqual(outputSize(1080, 1920, '4k'), [2160, 3840]);
});

test('downscales when source is bigger than target (4k source at 2k)', () => {
  assert.deepEqual(outputSize(3840, 2160, '2k'), [2560, 1440]);
});

test('preserves aspect ratio within rounding', () => {
  const [w, h] = outputSize(1333, 1000, '4k'); // ratio 1.333
  assert.ok(Math.abs(w / h - 1333 / 1000) < 0.005, `ratio off: ${w}x${h}`);
  assert.equal(Math.max(w, h), 3840);
});

test('tiny source still scales up to the target long side', () => {
  assert.deepEqual(outputSize(1, 1, '2k'), [2560, 2560]);
});

test('invalid/zero source returns [0,0] for every mode', () => {
  assert.deepEqual(outputSize(0, 0, 'native'), [0, 0]);
  assert.deepEqual(outputSize(0, 720, '4k'), [0, 0]);
  assert.deepEqual(outputSize(-5, 100, '2k'), [0, 0]);
});
