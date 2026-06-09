import puppeteer from 'puppeteer-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8765/';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1500));

// enter generator mode and stop the rAF loop for deterministic frames
await page.evaluate(() => { window.__ditherland.gen.select(); window.__ditherland.gen.stop(); });
await new Promise(r => setTimeout(r, 300));

// canvas is 1080x1080 with no background
const size = await page.evaluate(() => window.__ditherland.gen.displaySize());

// animation: two different t values produce different frames
const a = await page.evaluate(() => { window.__ditherland.gen.renderAt(0); return window.__ditherland.gen.checksum(); });
const b = await page.evaluate(() => { window.__ditherland.gen.renderAt(5); return window.__ditherland.gen.checksum(); });

// the slide mode also animates end-to-end (exercises the mode-selector hook)
const sa = await page.evaluate(() => { window.__ditherland.gen.setMode('slide'); window.__ditherland.gen.renderAt(0); return window.__ditherland.gen.checksum(); });
const sb = await page.evaluate(() => { window.__ditherland.gen.renderAt(7); return window.__ditherland.gen.checksum(); });
await page.evaluate(() => window.__ditherland.gen.setMode('blobs')); // reset to default mode

// texture toggle changes the render (still 1080x1080, no bg yet)
const texDiff = await page.evaluate(() => {
  window.__ditherland.gen.renderAt(2); const before = window.__ditherland.gen.checksum();
  document.getElementById('texture-toggle').click();
  window.__ditherland.gen.renderAt(2); const after = window.__ditherland.gen.checksum();
  document.getElementById('texture-toggle').click(); // back to off
  return before !== after;
});

// default band-0 transparent → overlay has alpha-0 pixels
const hasTransparent = await page.evaluate(() => { window.__ditherland.gen.renderAt(0); return window.__ditherland.gen.overlayHasTransparent(); });

// background shows through the transparent band
const sawBackground = await page.evaluate(async () => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 4;
  const g = cv.getContext('2d'); g.fillStyle = '#ff0000'; g.fillRect(0, 0, 4, 4);
  await window.__ditherland.gen.loadBgFromUrl(cv.toDataURL());
  window.__ditherland.gen.renderAt(0);
  const c = document.getElementById('canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let red = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 60 && d[i + 2] < 60) red++;
  return red > 0;
});

// export: record ~700ms of webm from the live generator loop
await page.evaluate(() => { window.__ditherland.gen.select(); }); // restart rAF loop so frames flow
const webmSize = await page.evaluate(() => window.__ditherland.recordMs(700));

await browser.close();
const ok = errors.length === 0 && size[0] === 1080 && size[1] === 1080 && a !== b && sa !== sb && texDiff && hasTransparent && sawBackground && webmSize > 0;
console.log('pageerrors:', errors);
console.log('size:', size, 'checksums:', a, b, 'slide:', sa, sb, 'texture:', texDiff, 'transparent:', hasTransparent, 'bgVisible:', sawBackground, 'webm:', webmSize);
if (!ok) { console.error('GENERATOR INTEGRATION FAILED'); process.exit(1); }
console.log('GENERATOR INTEGRATION PASS');
