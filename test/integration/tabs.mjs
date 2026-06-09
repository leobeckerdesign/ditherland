// Regression: switching Image→Video→Image (and Image→Gerador→Image) must return the
// central canvas to the image, not stay frozen on the last video/gen frame.
import puppeteer from 'puppeteer-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8765/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-webgl'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1500));

// canvas signature = dimensions + a cheap content hash (the image render is deterministic)
const sig = () => page.evaluate(() => {
  const c = document.getElementById('canvas'); const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data; let h = 2166136261 >>> 0;
  for (let i = 0; i < d.length; i += 997) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; }
  return c.width + 'x' + c.height + ':' + (h >>> 0);
});
const click = id => page.evaluate(t => document.getElementById(t).click(), id);

await page.evaluate(() => window.__ditherland.applyPreset('LBK')); // deterministic image baseline
await new Promise(r => setTimeout(r, 400));
const image = await sig();

await click('tab-video'); await new Promise(r => setTimeout(r, 2500));
await click('tab-image'); await new Promise(r => setTimeout(r, 500));
const afterVideo = await sig();

await click('tab-gen'); await new Promise(r => setTimeout(r, 800));
await click('tab-image'); await new Promise(r => setTimeout(r, 500));
const afterGen = await sig();

await browser.close();
const ok = errors.length === 0 && afterVideo === image && afterGen === image;
console.log('image baseline   :', image);
console.log('image after video:', afterVideo, afterVideo === image ? 'OK' : 'STUCK');
console.log('image after gen  :', afterGen, afterGen === image ? 'OK' : 'STUCK');
console.log('pageerrors:', errors);
if (!ok) { console.error('TABS INTEGRATION FAILED'); process.exit(1); }
console.log('TABS INTEGRATION PASS');
