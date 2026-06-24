import { ditherImageData, buildPalette } from './dither.js';
import { buildCurveLUT } from './curve.js';
import { field as genFieldRaw } from './noise.js';
import { renderTextured, TILE as TEX_TILE } from './texture.js';
import { validateUploadSize } from './limits.js';

const LBK_RAMP = ['#00201C', '#005C54', '#F05524', '#C4B597']; // bege (#C4B597) é a cor mais clara → última banda
// Curated 4-color palettes (LBK + combos). Each is sorted dark→light by luminance so the
// tonal mapping is correct and the menu preview is WYSIWYG with what gets applied.
const lum = hex => { const n = parseInt(hex.slice(1), 16); return 0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255); };
const PRESETS = [
  { name: 'LBK',    colors: LBK_RAMP },
  { name: 'No.81',  colors: ['#fecea8', '#ff847b', '#e84a5f', '#2a363b'] },
  { name: 'No.82',  colors: ['#4a266a', '#7f4a88', '#de95ba', '#ffd9e8'] },
  { name: 'No.83',  colors: ['#a7ff83', '#17b978', '#086972', '#071a52'] },
  { name: 'No.84',  colors: ['#ff7c38', '#e03e36', '#b80d57', '#700961'] },
  { name: 'No.85',  colors: ['#2f9296', '#46b7b9', '#87dfd6', '#dff5f2'] },
  { name: 'No.86',  colors: ['#c0ffc2', '#fdffba', '#ffeab6', '#f69d9d'] },
  { name: 'No.87',  colors: ['#537791', '#c1c0b9', '#f7f6e7', '#e7e6e1'] },
  { name: 'No.88',  colors: ['#8f8787', '#ebcbae', '#f9f9f9', '#a6e4e7'] },
  { name: 'No.89',  colors: ['#f2bbbb', '#ed93cb', '#ca82f8', '#a1d9ff'] },
  { name: 'No.90',  colors: ['#ba52ed', '#ff99fe', '#a4f6f9', '#e4fffe'] },
  { name: 'No.91',  colors: ['#00fff5', '#00adb5', '#393e46', '#222831'] },
  { name: 'No.92',  colors: ['#eeeeee', '#4ecca3', '#393e46', '#232931'] },
  { name: 'No.93',  colors: ['#1f4e5f', '#79a8a9', '#aacfd0', '#f4f7f7'] },
  { name: 'No.94',  colors: ['#355c7d', '#c06c84', '#f67280', '#f8b195'] },
  { name: 'No.95',  colors: ['#f8ecfd', '#c264fe', '#a82ffc', '#7a08fa'] },
  { name: 'No.96',  colors: ['#80d6ff', '#edf798', '#fab57a', '#f06868'] },
  { name: 'No.97',  colors: ['#70a1d7', '#a1de93', '#f7f48b', '#f47c7c'] },
  { name: 'No.98',  colors: ['#2eb872', '#a3de83', '#feffe4', '#fa4659'] },
  { name: 'No.99',  colors: ['#756c83', '#f38181', '#b9e1dc', '#fbfbfb'] },
  { name: 'No.100', colors: ['#d988bc', '#ffa8b8', '#ffd2a5', '#fffffc'] },
].map(p => ({ name: p.name, ramp: [...p.colors].sort((a, b) => lum(a) - lum(b)) }));
let presetIdx = 0; // index into PRESETS, or -1 when the swatches don't match any (Personalizado)
const $ = id => document.getElementById(id);

const display = $('canvas');
const dctx = display.getContext('2d');
const off = document.createElement('canvas');
const octx = off.getContext('2d', { willReadFrequently: true });

let mediaType = 'image';
let source = null;            // active element renderFrame reads (points at imgSource or vidSource)
let imgSource = null, vidSource = null; // kept per-mode so the image isn't lost when a video loads
let rafId = 0;
let recorder = null, recChunks = [];
let curvePoints = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
let curveLUT = buildCurveLUT(curvePoints);
const S = {};                 // named custom sliders (brightness/contrast/scale)
let cutSliders = [];
let videoDefaulted = false;
let genTime = 0;
let genRaf = 0;
let bgImage = null;

// ---- lbk-ditherland-style custom slider (div track + progress + handle) ----
function createSlider(mount, { min, max, value, step = 1, fmt = v => v, valueEl, onInput }) {
  mount.replaceChildren();
  const container = document.createElement('div'); container.className = 'slider-container';
  const tc = document.createElement('div'); tc.className = 'slider-track-container';
  const track = document.createElement('div'); track.className = 'slider-track overflow-hidden'; track.style.flex = '1 1 0%';
  const prog = document.createElement('div'); prog.className = 'slider-progress';
  const handle = document.createElement('div'); handle.className = 'slider-handle';
  prog.appendChild(handle); track.appendChild(prog); tc.appendChild(track); container.appendChild(tc); mount.appendChild(container);
  const api = { value };
  const paint = () => { prog.style.width = ((api.value - min) / (max - min) * 100) + '%'; if (valueEl) valueEl.textContent = fmt(api.value); };
  const setFrac = frac => {
    frac = frac < 0 ? 0 : frac > 1 ? 1 : frac;
    api.value = Math.round((min + frac * (max - min)) / step) * step;
    paint(); onInput && onInput(api.value);
  };
  const fromEvent = e => { const r = track.getBoundingClientRect(); setFrac((e.clientX - r.left) / r.width); };
  let down = false;
  track.addEventListener('pointerdown', e => { down = true; track.setPointerCapture(e.pointerId); fromEvent(e); });
  track.addEventListener('pointermove', e => { if (down) fromEvent(e); });
  track.addEventListener('pointerup', () => { down = false; });
  paint();
  return api;
}
function activeVal(groupId) { return document.querySelector('#' + groupId + ' [data-state=on]')?.dataset.value; }
function wireGroup(groupId, onChange) {
  document.querySelectorAll('#' + groupId + ' button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#' + groupId + ' button').forEach(x => x.setAttribute('data-state', 'off'));
    b.setAttribute('data-state', 'on');
    onChange && onChange();
  }));
}

function resampleRamp(ramp, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(ramp[Math.round(i * (ramp.length - 1) / (n - 1))]);
  return out;
}
function currentLevels() { return +(activeVal('levels-group') || 4); }
function animMode() { return activeVal('anim-group') || 'blobs'; }
function textureOn() { const b = $('texture-toggle'); return !!b && b.getAttribute('data-state') === 'on'; }
function animSpeed() { const v = S.speed ? S.speed.value : 30; return 0.05 + (v / 100) * 4.95; } // 0 = muito lento (0.05) → 100 = nível 50 de antes (5)
function readPalette(levels) {
  const hexes = [];
  for (let i = 0; i < levels; i++) hexes.push($('swatch' + i).value);
  return buildPalette(hexes);
}
function readThresholds(levels) {
  if (cutSliders.length !== levels - 1) return undefined;
  return cutSliders.map(s => s.value / 100).sort((a, b) => a - b);
}
function readAlphaForBand(levels) {
  if (mediaType !== 'gen' && mediaType !== 'video') return undefined;
  const arr = [];
  for (let i = 0; i < levels; i++) {
    const btn = $('alpha' + i);
    arr.push(btn && btn.getAttribute('data-state') === 'on' ? 0 : 255);
  }
  return arr;
}
function getOpts() {
  const levels = currentLevels();
  return {
    levels,
    palette: readPalette(levels),
    algorithm: activeVal('algo-group') || 'bayer',
    bayerSize: +(activeVal('matrix-group') || 4),
    brightness: S.brightness ? S.brightness.value : 0,
    contrast: S.contrast ? S.contrast.value : 0,
    thresholds: readThresholds(levels),
    curveLUT,
    alphaForBand: readAlphaForBand(levels),
  };
}
function sourceSize() {
  if (!source) return [0, 0];
  return mediaType === 'video' ? [source.videoWidth, source.videoHeight]
                               : [source.naturalWidth, source.naturalHeight];
}
// block (texture mode) = output px per low-res cell, snapped to a multiple of TILE so
// sub-cells are integer/uniform. Field is sampled at ceil(display/block) cells so the
// perfect grid covers the canvas (overflow clipped on drawImage). One coupled grid.
function textureBlock(scale) { return TEX_TILE * Math.max(1, Math.round(scale / TEX_TILE)); }

function imgDither(w, h) {
  off.width = w; off.height = h;
  octx.drawImage(source, 0, 0, w, h);
  return ditherImageData(octx.getImageData(0, 0, w, h), getOpts());
}
function renderFrame() {
  if (!source) return;
  const [sw, sh] = sourceSize();
  if (!sw || !sh) return;
  const scale = Math.max(1, S.scale ? S.scale.value : 2);
  display.width = sw; display.height = sh;
  dctx.imageSmoothingEnabled = false;
  dctx.clearRect(0, 0, sw, sh);
  // no modo Vídeo, o fundo carregado fica atrás — aparece pelas bandas transparentes (∅) do vídeo ditherizado
  if (mediaType === 'video' && bgImage) dctx.drawImage(bgImage, 0, 0, sw, sh);
  if (textureOn()) {
    const block = textureBlock(scale);
    const out = imgDither(Math.max(1, Math.ceil(sw / block)), Math.max(1, Math.ceil(sh / block)));
    const tex = renderTextured(out, block, currentLevels());
    off.width = tex.width; off.height = tex.height;
    octx.putImageData(new ImageData(tex.data, tex.width, tex.height), 0, 0);
    dctx.drawImage(off, 0, 0);
  } else {
    const w = Math.max(1, Math.round(sw / scale)), h = Math.max(1, Math.round(sh / scale));
    const out = imgDither(w, h);
    octx.putImageData(new ImageData(out.data, w, h), 0, 0);
    dctx.drawImage(off, 0, 0, w, h, 0, 0, sw, sh);
  }
}

function genSize() {
  if (bgImage) return [bgImage.naturalWidth, bgImage.naturalHeight];
  return [1080, 1080];
}
function genDither(w, h) {
  const f = genFieldRaw(w, h, genTime, { mode: animMode(), speed: animSpeed(), seed: 1 });
  const src = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = Math.round(f[i] * 255);
    const p = i * 4; src[p] = src[p + 1] = src[p + 2] = v; src[p + 3] = 255;
  }
  return ditherImageData({ width: w, height: h, data: src }, getOpts());
}
function renderGen() {
  const [W, H] = genSize();
  const scale = Math.max(1, S.scale ? S.scale.value : 2);
  display.width = W; display.height = H;
  dctx.imageSmoothingEnabled = false;
  dctx.clearRect(0, 0, W, H);
  if (bgImage) dctx.drawImage(bgImage, 0, 0, W, H);
  if (textureOn()) {
    const block = textureBlock(scale);
    const out = genDither(Math.max(1, Math.ceil(W / block)), Math.max(1, Math.ceil(H / block)));
    const tex = renderTextured(out, block, currentLevels());
    off.width = tex.width; off.height = tex.height;
    octx.putImageData(new ImageData(tex.data, tex.width, tex.height), 0, 0);
    dctx.drawImage(off, 0, 0);
  } else {
    const w = Math.max(1, Math.round(W / scale)), h = Math.max(1, Math.round(H / scale));
    const out = genDither(w, h);
    off.width = w; off.height = h;
    octx.putImageData(new ImageData(out.data, w, h), 0, 0);
    dctx.drawImage(off, 0, 0, w, h, 0, 0, W, H);
  }
}
function triggerRender() { if (mediaType === 'gen') renderGen(); else renderFrame(); }
function genLoop() {
  if (mediaType !== 'gen') { genRaf = 0; return; }
  genTime += 0.05;
  renderGen();
  genRaf = requestAnimationFrame(genLoop);
}

// ---- palette / threshold UI sync ----
function syncPaletteVisibility() {
  const levels = currentLevels();
  for (let i = 0; i < 4; i++) {
    const show = i < levels;
    $('swatch' + i).style.display = show ? '' : 'none';
    const a = $('alpha' + i); if (a) a.style.display = show ? '' : 'none';
  }
}
function buildCutSliders() {
  const levels = currentLevels();
  const box = $('cuts');
  box.replaceChildren();
  cutSliders = [];
  for (let i = 0; i < levels - 1; i++) {
    const lbl = document.createElement('div'); lbl.className = 'dl-cutlabel'; lbl.textContent = `Corte ${i + 1}`;
    box.appendChild(lbl);
    const mount = document.createElement('div'); box.appendChild(mount);
    cutSliders.push(createSlider(mount, { min: 1, max: 99, value: Math.round((i + 1) / levels * 100), onInput: triggerRender }));
  }
}
function applyRamp(ramp) {
  const cols = resampleRamp(ramp, currentLevels());
  for (let i = 0; i < cols.length; i++) $('swatch' + i).value = cols[i];
  triggerRender();
}
function presetStrip(ramp, levels) {
  const s = document.createElement('span'); s.className = 'dl-preset-strip';
  for (const c of resampleRamp(ramp, levels)) { const i = document.createElement('i'); i.style.background = c; s.appendChild(i); }
  return s;
}
function renderPresetMenu() {
  const menu = $('preset-menu'); menu.replaceChildren();
  const levels = currentLevels();
  PRESETS.forEach((p, idx) => {
    const opt = document.createElement('button');
    opt.type = 'button'; opt.className = 'dl-preset-opt'; opt.setAttribute('role', 'option'); opt.dataset.i = idx;
    opt.title = p.name;                       // name as tooltip — the row itself is a full-bleed strip
    opt.appendChild(presetStrip(p.ramp, levels));
    opt.addEventListener('click', () => { presetIdx = idx; applyRamp(p.ramp); paintTrigger(); closePresetMenu(); });
    menu.appendChild(opt);
  });
}
function paintTrigger() {
  const levels = currentLevels();
  const strip = $('preset-trigger-strip'); strip.replaceChildren();
  for (let i = 0; i < levels; i++) { const c = document.createElement('i'); c.style.background = $('swatch' + i).value; strip.appendChild(c); }
  $('preset-trigger-name').textContent = presetIdx >= 0 ? PRESETS[presetIdx].name : 'Personalizado';
  $('preset-menu').querySelectorAll('.dl-preset-opt').forEach((o, i) => o.setAttribute('aria-selected', String(i === presetIdx)));
}
// recompute which preset (if any) the current swatches match, for the current Cores count
function detectSelected() {
  const levels = currentLevels();
  const cur = []; for (let i = 0; i < levels; i++) cur.push($('swatch' + i).value.toLowerCase());
  presetIdx = PRESETS.findIndex(p => {
    const cols = resampleRamp(p.ramp, levels).map(c => c.toLowerCase());
    return cols.length === cur.length && cols.every((c, i) => c === cur[i]);
  });
  paintTrigger();
}
function openPresetMenu() {
  const menu = $('preset-menu'), r = $('preset-trigger').getBoundingClientRect();
  menu.style.left = r.left + 'px';
  menu.style.top = (r.bottom + 4) + 'px';
  menu.style.width = r.width + 'px';
  menu.style.maxHeight = Math.max(120, Math.min(264, window.innerHeight - r.bottom - 12)) + 'px';
  menu.hidden = false;
  $('preset-trigger').setAttribute('aria-expanded', 'true');
}
function closePresetMenu() { $('preset-menu').hidden = true; $('preset-trigger').setAttribute('aria-expanded', 'false'); }
function setupPresets() {
  renderPresetMenu();
  const trigger = $('preset-trigger');
  trigger.addEventListener('click', e => {
    e.stopPropagation();
    trigger.getAttribute('aria-expanded') === 'true' ? closePresetMenu() : openPresetMenu();
  });
  document.addEventListener('click', e => { if (!trigger.closest('.dl-preset').contains(e.target)) closePresetMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePresetMenu(); });
  // fixed-positioned menu detaches if the PANEL scrolls → close it then. Scope to the panel's
  // own scroll (scroll doesn't bubble, so scrolling inside the menu won't trip this).
  const scroller = trigger.closest('[class*="overflow-y-scroll"]');
  if (scroller) scroller.addEventListener('scroll', closePresetMenu);
  window.addEventListener('resize', closePresetMenu);
  detectSelected();
}

// ---- media loading ----
function loadImage(file) {
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(img.src); imgSource = img; if (mediaType === 'image') { source = img; renderFrame(); } };
  img.src = URL.createObjectURL(file);
}
function loadBackground(file) {
  const img = new Image();
  img.onload = () => { bgImage = img; URL.revokeObjectURL(img.src); triggerRender(); };
  img.src = URL.createObjectURL(file);
}

function videoLoop() {
  renderFrame();
  if (mediaType === 'video' && source && !source.paused && !source.ended) {
    if (source.requestVideoFrameCallback) source.requestVideoFrameCallback(videoLoop);
    else rafId = requestAnimationFrame(videoLoop);
  }
}
function loadVideo(file) {
  const v = document.createElement('video');
  v.muted = true; v.loop = true; v.playsInline = true;
  v.onloadeddata = () => {
    // o vídeo precisa do blob URL enquanto toca; só dá pra revogar o do vídeo anterior
    if (vidSource && vidSource.src.startsWith('blob:')) URL.revokeObjectURL(vidSource.src);
    vidSource = v; if (mediaType === 'video') { source = v; v.play().then(() => videoLoop()).catch(() => videoLoop()); }
  };
  v.src = URL.createObjectURL(file);
}

function exportOutput() {
  if (mediaType === 'image') {
    if (!source) return;
    display.toBlob(b => downloadBlob(b, 'ditherland.png'), 'image/png');
    return;
  }
  // video OR gen → record a WebM of the composite canvas
  if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
  const stream = display.captureStream(30);
  recChunks = [];
  recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  recorder.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
  recorder.onstop = () => {
    downloadBlob(new Blob(recChunks, { type: 'video/webm' }), mediaType === 'gen' ? 'ditherland-gen.webm' : 'ditherland.webm');
    $('export-label').textContent = 'Exportar';
  };
  recorder.start();
  $('export-label').textContent = 'Parar e salvar';
}
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- tone curve widget ----
const curveCanvas = $('curve');
const cctx = curveCanvas.getContext('2d');
function curveToPx(p) { return [p.x * curveCanvas.width, (1 - p.y) * curveCanvas.height]; }
function pxToCurve(mx, my) { return { x: mx / curveCanvas.width, y: 1 - my / curveCanvas.height }; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function rebuildCurve() { curveLUT = buildCurveLUT(curvePoints); triggerRender(); drawCurve(); }
function drawCurve() {
  const w = curveCanvas.width, h = curveCanvas.height;
  cctx.clearRect(0, 0, w, h);
  cctx.strokeStyle = 'rgba(255,255,255,.08)';
  cctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    cctx.beginPath(); cctx.moveTo(w * i / 4, 0); cctx.lineTo(w * i / 4, h); cctx.stroke();
    cctx.beginPath(); cctx.moveTo(0, h * i / 4); cctx.lineTo(w, h * i / 4); cctx.stroke();
  }
  cctx.strokeStyle = '#6ee7b7'; cctx.lineWidth = 2; cctx.beginPath();
  for (let px = 0; px <= w; px++) { const y = (1 - curveLUT[Math.round(px / w * 255)]) * h; px ? cctx.lineTo(px, y) : cctx.moveTo(px, y); }
  cctx.stroke();
  cctx.fillStyle = '#fff';
  for (const p of curvePoints) { const [x, y] = curveToPx(p); cctx.beginPath(); cctx.arc(x, y, 4, 0, 7); cctx.fill(); }
}
let dragIdx = -1;
function pointAt(mx, my) {
  for (let i = 0; i < curvePoints.length; i++) { const [x, y] = curveToPx(curvePoints[i]); if (Math.hypot(x - mx, y - my) < 9) return i; }
  return -1;
}
function localXY(e) { const r = curveCanvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * curveCanvas.width, (e.clientY - r.top) / r.height * curveCanvas.height]; }
curveCanvas.addEventListener('pointerdown', e => {
  const [mx, my] = localXY(e); const i = pointAt(mx, my);
  if (i >= 0) { dragIdx = i; curveCanvas.setPointerCapture(e.pointerId); return; }
  const np = pxToCurve(mx, my); const nx = clamp01(np.x);
  curvePoints.push({ x: nx, y: clamp01(np.y) });
  curvePoints.sort((a, b) => a.x - b.x); dragIdx = curvePoints.findIndex(p => p.x === nx);
  curveCanvas.setPointerCapture(e.pointerId); rebuildCurve();
});
curveCanvas.addEventListener('pointermove', e => {
  if (dragIdx < 0) return;
  const [mx, my] = localXY(e); const np = pxToCurve(mx, my);
  const isEnd = dragIdx === 0 || dragIdx === curvePoints.length - 1;
  curvePoints[dragIdx] = { x: isEnd ? curvePoints[dragIdx].x : clamp01(np.x), y: clamp01(np.y) };
  curvePoints.sort((a, b) => a.x - b.x); rebuildCurve();
});
curveCanvas.addEventListener('pointerup', () => { dragIdx = -1; });
curveCanvas.addEventListener('dblclick', e => {
  const [mx, my] = localXY(e); const i = pointAt(mx, my);
  if (i > 0 && i < curvePoints.length - 1) { curvePoints.splice(i, 1); rebuildCurve(); }
});
$('curve-reset').addEventListener('click', () => { curvePoints = [{ x: 0, y: 0 }, { x: 1, y: 1 }]; rebuildCurve(); });

// ---- wiring ----
function wire() {
  $('file').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const size = validateUploadSize(f.size);
    if (!size.ok) { alert(size.message); e.target.value = ''; return; }
    if (mediaType === 'gen') loadBackground(f);
    else if (mediaType === 'video') loadVideo(f);
    else loadImage(f);
  });
  // input de fundo dedicado do modo Vídeo (separado do #file, que carrega o vídeo)
  $('bg-file').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const size = validateUploadSize(f.size);
    if (!size.ok) { alert(size.message); e.target.value = ''; return; }
    loadBackground(f);
    e.target.value = ''; // permite recarregar o mesmo arquivo
  });
  $('clear-bg').addEventListener('click', () => { bgImage = null; triggerRender(); });
  $('export').addEventListener('click', exportOutput);
  setupPresets();

  function setTab(b) {
    document.querySelectorAll('#tab-image,#tab-video,#tab-gen').forEach(x => x.setAttribute('data-state', x === b ? 'active' : 'inactive'));
    mediaType = b.id === 'tab-video' ? 'video' : b.id === 'tab-gen' ? 'gen' : 'image';
    const gc = $('gen-controls'); if (gc) gc.style.display = mediaType === 'gen' ? '' : 'none';
    // bandas transparentes (∅) e o carregador de fundo valem pro Gerador E pro Vídeo
    const ar = $('alpha-row'); if (ar) ar.style.display = (mediaType === 'gen' || mediaType === 'video') ? '' : 'none';
    const vbg = $('video-bg-controls'); if (vbg) vbg.style.display = mediaType === 'video' ? '' : 'none';
    // Nível (Bayer matrix) is imperceptible as a live control on moving video / animated gen,
    // so lock that block off there; it stays active in image mode.
    const nivelCard = $('matrix-group').closest('.overflow-hidden');
    if (nivelCard) nivelCard.classList.toggle('dl-disabled', mediaType !== 'image');
    // stop the modes we're leaving (each loop also self-stops via its own mediaType guard)
    if (mediaType !== 'gen' && genRaf) { cancelAnimationFrame(genRaf); genRaf = 0; }
    if (mediaType !== 'video' && vidSource) vidSource.pause();

    if (mediaType === 'gen') {
      $('file').accept = 'image/*';
      $('load-label').textContent = 'Carregar fundo';
      $('export-label').textContent = 'Exportar';
      syncPaletteVisibility();
      if (!genRaf) genLoop();
      return;
    }
    if (mediaType === 'video') {
      $('file').accept = 'video/*';
      $('load-label').textContent = 'Carregar Vídeo';
      $('export-label').textContent = 'Exportar';
      syncPaletteVisibility(); // alinha os botões ∅ ao número de Cores ativo
      if (vidSource) { source = vidSource; vidSource.play().then(() => videoLoop()).catch(() => videoLoop()); }
      else if (!videoDefaulted) {                       // first video entry: load the sample once
        videoDefaulted = true;
        const v = document.createElement('video');
        v.muted = true; v.loop = true; v.playsInline = true;
        v.onloadeddata = () => { vidSource = v; if (mediaType === 'video') { source = v; v.play().then(() => videoLoop()).catch(() => videoLoop()); } };
        v.src = '/demo-video-02.mp4';
      }
      return;
    }
    // image — restore the image source and re-render (fixes getting stuck on the video/gen frame)
    $('file').accept = 'image/*';
    $('load-label').textContent = 'Carregar Imagem';
    $('export-label').textContent = 'Baixar';
    if (imgSource) { source = imgSource; renderFrame(); }
  }
  document.querySelectorAll('#tab-image,#tab-video,#tab-gen').forEach(b => b.addEventListener('click', () => setTab(b)));

  wireGroup('algo-group', triggerRender);
  wireGroup('matrix-group', triggerRender);
  wireGroup('levels-group', () => { syncPaletteVisibility(); buildCutSliders(); renderPresetMenu(); detectSelected(); triggerRender(); });
  wireGroup('anim-group', () => { if (mediaType === 'gen') renderGen(); });

  S.brightness = createSlider($('brightness-mount'), { min: -100, max: 100, value: 0, valueEl: $('brightness-o'), onInput: triggerRender });
  S.contrast = createSlider($('contrast-mount'), { min: -100, max: 100, value: 0, valueEl: $('contrast-o'), onInput: triggerRender });
  S.scale = createSlider($('scale-mount'), { min: 1, max: 300, value: 10, step: 1, fmt: v => v + '×', valueEl: $('scale-o'), onInput: triggerRender });
  S.speed = createSlider($('speed-mount'), { min: 0, max: 100, value: 30, step: 1, valueEl: $('speed-o'), onInput: () => { if (mediaType === 'gen') renderGen(); } });

  for (let i = 0; i < 4; i++) $('swatch' + i).addEventListener('input', () => { triggerRender(); detectSelected(); });

  for (let i = 0; i < 4; i++) $('alpha' + i).addEventListener('click', e => {
    const btn = e.currentTarget;
    btn.setAttribute('data-state', btn.getAttribute('data-state') === 'on' ? 'off' : 'on');
    triggerRender(); // re-renderiza no Gerador e no Vídeo
  });

  $('texture-toggle').addEventListener('click', e => {
    const b = e.currentTarget;
    const on = b.getAttribute('data-state') !== 'on';
    b.setAttribute('data-state', on ? 'on' : 'off');
    b.textContent = on ? 'On' : 'Off';
    triggerRender();
  });

  syncPaletteVisibility();
  buildCutSliders();
  $('cuts-auto').addEventListener('click', () => { buildCutSliders(); triggerRender(); });
}
wire();
drawCurve();

// default media so the tool works with zero uploads
(function loadDefaults() {
  const img = new Image();
  img.onload = () => { if (!imgSource) { imgSource = img; if (mediaType === 'image' && !source) { source = img; renderFrame(); } } };
  img.src = '/image_demo.png';
})();

// exposed for integration tests
window.__ditherland = { renderFrame, loadImageFromUrl: url => {
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => { mediaType = 'image'; imgSource = img; source = img; renderFrame(); };
  img.src = url;
} };
window.__ditherland.applyPreset = name => {
  const idx = Math.max(0, PRESETS.findIndex(p => p.name === name));
  presetIdx = idx; applyRamp(PRESETS[idx].ramp); paintTrigger();
};
window.__ditherland.loadVideoFromUrl = url => {
  const v = document.createElement('video');
  v.muted = true; v.loop = true; v.playsInline = true; v.crossOrigin = 'anonymous';
  v.onloadeddata = () => { mediaType = 'video'; vidSource = v; source = v; v.play().then(() => videoLoop()).catch(() => videoLoop()); };
  v.src = url;
};
// hooks do fundo no modo Vídeo (deterministas: pausa o vídeo p/ amostragem estável)
window.__ditherland.video = {
  pause: () => { if (vidSource) vidSource.pause(); },
  loadBgFromUrl: url => new Promise(res => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { bgImage = img; triggerRender(); res(true); };
    img.src = url;
  }),
  clearBg: () => { bgImage = null; triggerRender(); },
  setAlpha: (i, on) => { const b = $('alpha' + i); if (b) { b.setAttribute('data-state', on ? 'on' : 'off'); triggerRender(); } },
};
window.__ditherland.recordMs = ms => new Promise(resolve => {
  const stream = display.captureStream(30);
  const chunks = []; const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = () => resolve(chunks.reduce((n, c) => n + c.size, 0));
  rec.start();
  setTimeout(() => rec.stop(), ms);
});

// generator hooks for integration tests (deterministic, loop-free)
window.__ditherland.gen = {
  select: () => $('tab-gen').click(),
  stop: () => { if (genRaf) cancelAnimationFrame(genRaf); genRaf = 0; },
  renderAt: t => { genTime = t; renderGen(); },
  checksum: () => {
    const d = dctx.getImageData(0, 0, display.width, display.height).data;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < d.length; i += 257) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; }
    return h;
  },
  overlayHasTransparent: () => {
    const d = octx.getImageData(0, 0, off.width, off.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] === 0) return true;
    return false;
  },
  setMode: m => { document.querySelectorAll('#anim-group button').forEach(x => x.setAttribute('data-state', x.dataset.value === m ? 'on' : 'off')); },
  loadBgFromUrl: url => new Promise(res => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { bgImage = img; renderGen(); res(true); };
    img.src = url;
  }),
  displaySize: () => [display.width, display.height],
};
