// MP4 (H.264) export via WebCodecs VideoEncoder + mp4-muxer (self-hosted, no wasm).
// Pure helpers (evenDims / chooseBitrate) are unit-tested in node; the recorder needs a
// browser with WebCodecs. isMp4Supported() degrades gracefully where WebCodecs is absent
// (node, Safari <=16, Firefox <130) so the caller can fall back to WebM.
import { Muxer, ArrayBufferTarget } from './vendor/mp4-muxer.js';

// High → Main → Baseline; first one the browser accepts for the given size wins.
const CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42E01F'];

export function evenDims(w, h) {
  const e = v => Math.max(2, Math.floor((v || 0) / 2) * 2);
  return [e(w), e(h)];
}

// ~0.12 bits/pixel/frame keeps the dither's hard edges crisp, clamped to a sane band.
export function chooseBitrate(w, h, fps) {
  const raw = Math.round(w * h * fps * 0.12);
  return Math.min(40_000_000, Math.max(4_000_000, raw));
}

// Descending list of even, aspect-preserving sizes from (w,h) down to the long-edge floor.
// H.264 caps the frame area (~9.4 MP at Level 5.2), so 4K SQUARE (3840² = 14.7 MP) needs a
// smaller MP4-valid size — we still deliver MP4 instead of dropping to WebM.
export function mp4CandidateSizes(w, h, floorLong = 640) {
  const [ew, eh] = evenDims(w, h);
  const longMax = Math.max(ew, eh);
  const out = [];
  const seen = new Set();
  for (let long = longMax; long >= floorLong; long = Math.floor(long * 0.85)) {
    const f = long / longMax;
    const [cw, ch] = evenDims(ew * f, eh * f);
    const key = cw + 'x' + ch;
    if (!seen.has(key)) { seen.add(key); out.push([cw, ch]); }
  }
  return out;
}

// Real 1-frame encode test. VideoEncoder.isConfigSupported() is optimistic: hardware
// encoders (e.g. NVENC via Media Foundation) can approve a config that then FAILS at real
// encode time — which is exactly what dead-ends the export at "Falha ao gerar o MP4".
// This actually configures, encodes one frame and flushes; only a real success counts.
async function canEncode(codec, w, h, bitrate, fps) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return false;
  let enc = null;
  try {
    return await new Promise(resolve => {
      let settled = false, gotChunk = false;
      const finish = ok => { if (!settled) { settled = true; resolve(ok); } };
      try {
        // success ONLY if a real encoded chunk comes out — flush() can resolve before an async
        // encoder error fires, so "flush resolved" alone is a false positive on some hardware.
        enc = new VideoEncoder({ output: () => { gotChunk = true; finish(true); }, error: () => finish(false) });
        enc.configure({ codec, width: w, height: h, bitrate, framerate: fps });
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const frame = new VideoFrame(c, { timestamp: 0 });
        try { enc.encode(frame, { keyFrame: true }); } finally { frame.close(); }
        enc.flush().then(() => finish(gotChunk)).catch(() => finish(false));
      } catch { finish(false); }
      setTimeout(() => finish(false), 4000); // backstop against a hung configure
    });
  } finally {
    try { if (enc && enc.state !== 'closed') enc.close(); } catch { /* already gone */ }
  }
}

// Finds the largest (codec, size) that the browser can ACTUALLY encode, scaling down if
// needed. Uses isConfigSupported as a cheap pre-filter, then a real encode test as the
// authority. Returns { codec, width, height, bitrate } or null.
async function negotiate(width, height, fps) {
  if (typeof VideoEncoder === 'undefined' || !VideoEncoder.isConfigSupported) return null;
  for (const [w, h] of mp4CandidateSizes(width, height)) {
    const bitrate = chooseBitrate(w, h, fps);
    for (const codec of CODECS) {
      let approved = false;
      try {
        const r = await VideoEncoder.isConfigSupported({ codec, width: w, height: h, bitrate, framerate: fps });
        approved = !!(r && r.supported);
      } catch { approved = false; }
      if (approved && await canEncode(codec, w, h, bitrate, fps)) {
        return { codec, width: w, height: h, bitrate };
      }
    }
  }
  return null;
}

export async function isMp4Supported({ width, height, fps = 30 } = {}) {
  return (await negotiate(width, height, fps)) !== null;
}

// Returns a recorder driven by the caller's render loop:
//   addFrame(canvas, tsMicros)  — encode one frame from a canvas at the given µs timestamp
//   finish() -> Promise<Blob>   — flush + finalize into a 'video/mp4' Blob
export async function createMp4Recorder({ width, height, fps = 30, bitrate } = {}) {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('WebCodecs VideoEncoder indisponível neste navegador');
  }
  const neg = await negotiate(width, height, fps);
  if (!neg) throw new Error(`Nenhum perfil H.264 suportado para ${width}x${height}`);
  const { codec, width: w, height: h } = neg;
  const br = bitrate || neg.bitrate;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: w, height: h },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encErr = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => { encErr = e; },
  });
  encoder.configure({ codec, width: w, height: h, bitrate: br, framerate: fps });

  let frameCount = 0;
  const gop = Math.max(1, Math.round(fps)); // keyframe roughly once per second

  return {
    width: w, height: h, codec,
    addFrame(canvas, tsMicros) {
      if (encErr) throw encErr;
      const frame = new VideoFrame(canvas, { timestamp: Math.max(0, Math.round(tsMicros)) });
      try {
        encoder.encode(frame, { keyFrame: frameCount % gop === 0 });
      } finally {
        frame.close();
      }
      frameCount++;
    },
    async finish() {
      if (encErr) throw encErr;
      await encoder.flush();
      if (encErr) throw encErr;
      muxer.finalize();
      return new Blob([muxer.target.buffer], { type: 'video/mp4' });
    },
    get frameCount() { return frameCount; },
  };
}
