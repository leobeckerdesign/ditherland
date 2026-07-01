import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evenDims, chooseBitrate, mp4CandidateSizes, isMp4Supported, createMp4Recorder } from '../site/mp4.js';

test('evenDims floors each dimension to an even number (H.264 requires even)', () => {
  assert.deepEqual(evenDims(1920, 1080), [1920, 1080]);
  assert.deepEqual(evenDims(1281, 723), [1280, 722]);
  assert.deepEqual(evenDims(3841, 2161), [3840, 2160]);
});

test('evenDims never goes below 2', () => {
  assert.deepEqual(evenDims(1, 1), [2, 2]);
  assert.deepEqual(evenDims(0, 0), [2, 2]);
});

test('chooseBitrate scales with pixels*fps and stays within [4Mbps, 40Mbps]', () => {
  // 1600x900@30 lands inside the band -> raw formula (0.12 bpp)
  assert.equal(chooseBitrate(1600, 900, 30), 5_184_000);
  assert.equal(chooseBitrate(1920, 1080, 30), 7_464_960);
  assert.equal(chooseBitrate(3840, 2160, 30), 29_859_840);
});

test('chooseBitrate clamps tiny resolutions up to the 4Mbps floor', () => {
  assert.equal(chooseBitrate(320, 240, 30), 4_000_000);
});

test('chooseBitrate clamps huge resolutions down to the 40Mbps ceiling', () => {
  assert.ok(chooseBitrate(7680, 4320, 60) <= 40_000_000);
  assert.equal(chooseBitrate(7680, 4320, 60), 40_000_000);
});

test('mp4CandidateSizes: first candidate is the requested size (evened)', () => {
  const c = mp4CandidateSizes(3840, 3840);
  assert.deepEqual(c[0], [3840, 3840]);
  assert.deepEqual(mp4CandidateSizes(1281, 723)[0], [1280, 722]);
});

test('mp4CandidateSizes: descending long edge, all even, aspect preserved (square stays square)', () => {
  const c = mp4CandidateSizes(3840, 3840);
  assert.ok(c.length > 1, 'should offer smaller fallbacks below 4k');
  for (let i = 1; i < c.length; i++) {
    assert.ok(Math.max(...c[i]) < Math.max(...c[i - 1]), `not descending at ${i}`);
  }
  for (const [w, h] of c) {
    assert.equal(w % 2, 0); assert.equal(h % 2, 0);
    assert.equal(w, h, 'square must stay square');
  }
});

test('mp4CandidateSizes: respects the long-edge floor (never below 640)', () => {
  const c = mp4CandidateSizes(3840, 3840, 640);
  assert.ok(Math.min(...c.map(s => Math.max(...s))) >= 640);
});

test('mp4CandidateSizes: landscape keeps ~16:9 aspect on the way down', () => {
  const c = mp4CandidateSizes(3840, 2160);
  for (const [w, h] of c) assert.ok(Math.abs(w / h - 16 / 9) < 0.02, `aspect drift at ${w}x${h}`);
});

test('isMp4Supported resolves false gracefully when WebCodecs is absent (node)', async () => {
  assert.equal(typeof globalThis.VideoEncoder, 'undefined'); // sanity: node has no WebCodecs
  assert.equal(await isMp4Supported({ width: 1920, height: 1080, fps: 30 }), false);
});

test('createMp4Recorder rejects with a clear error when WebCodecs is absent', async () => {
  await assert.rejects(
    createMp4Recorder({ width: 640, height: 480, fps: 30 }),
    /VideoEncoder/i,
  );
});
