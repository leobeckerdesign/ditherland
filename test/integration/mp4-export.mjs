import puppeteer from 'puppeteer-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8765/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-webgl'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await sleep(1500);

const fails = [];
const check = (cond, msg) => { if (!cond) fails.push(msg); };

// --- load a video so the capture path has moving frames ---
await page.evaluate(() => window.__ditherland.loadVideoFromUrl('/demo-video-02.mp4'));
await sleep(3000);
await page.evaluate(() => window.__ditherland.applyPreset('LBK'));
await sleep(1000);

// --- resolution selector drives the output canvas size (independent of source aspect) ---
const nativeDims = await page.evaluate(() => { window.__ditherland.setOutRes('native'); return window.__ditherland.displaySize(); });
check(nativeDims[0] > 0 && nativeDims[1] > 0, `native dims invalid: ${nativeDims}`);

const dims2k = await page.evaluate(() => { window.__ditherland.setOutRes('2k'); return window.__ditherland.displaySize(); });
check(Math.max(...dims2k) === 2560, `2k long edge != 2560: ${dims2k}`);

const dims4k = await page.evaluate(() => { window.__ditherland.setOutRes('4k'); return window.__ditherland.displaySize(); });
check(Math.max(...dims4k) === 3840, `4k long edge != 3840: ${dims4k}`);

// aspect ratio preserved between native and 4k
const rNative = nativeDims[0] / nativeDims[1], r4k = dims4k[0] / dims4k[1];
check(Math.abs(rNative - r4k) < 0.02, `aspect drifted native ${rNative} vs 4k ${r4k}`);

// --- capture at native: end-to-end mp4 (or webm fallback), type must match engine ---
await page.evaluate(() => window.__ditherland.setOutRes('native'));
await sleep(300);
const capV = await page.evaluate(() => window.__ditherland.captureMs(1500));
check(capV.size > 0, `video capture empty: ${JSON.stringify(capV)}`);
check(['mp4', 'webm'].includes(capV.engine), `unexpected engine: ${capV.engine}`);
check(capV.type === (capV.engine === 'mp4' ? 'video/mp4' : 'video/webm'), `type/engine mismatch: ${JSON.stringify(capV)}`);

// --- generator mode: resolution + capture ---
await page.evaluate(() => window.__ditherland.gen.select());
await sleep(600);
const gen2k = await page.evaluate(() => { window.__ditherland.setOutRes('2k'); return window.__ditherland.displaySize(); });
check(Math.max(...gen2k) === 2560, `gen 2k long edge != 2560: ${gen2k}`);
await page.evaluate(() => window.__ditherland.setOutRes('native'));
await sleep(300);
const capG = await page.evaluate(() => window.__ditherland.captureMs(1200));
check(capG.size > 0, `gen capture empty: ${JSON.stringify(capG)}`);
check(capG.type === (capG.engine === 'mp4' ? 'video/mp4' : 'video/webm'), `gen type/engine mismatch: ${JSON.stringify(capG)}`);

await browser.close();
check(errors.length === 0, `pageerrors: ${JSON.stringify(errors)}`);

console.log('video capture:', JSON.stringify(capV));
console.log('gen capture:  ', JSON.stringify(capG));
console.log('dims native/2k/4k:', nativeDims, dims2k, dims4k);
if (fails.length) { console.error('MP4 EXPORT INTEGRATION FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('MP4 EXPORT INTEGRATION PASS  (engine used:', capV.engine + ')');
