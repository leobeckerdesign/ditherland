import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8765/';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-webgl'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1500));

await page.evaluate(() => window.__ditherland.loadVideoFromUrl('/demo-video-02.mp4'));
await new Promise(r => setTimeout(r, 3000));
await page.evaluate(() => window.__ditherland.applyPreset('LBK'));
await new Promise(r => setTimeout(r, 1500));

const distinct = await page.evaluate(() => {
  const c = document.getElementById('canvas'); const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data; const set = new Set();
  for (let i = 0; i < d.length; i += 4) set.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
  return [...set];
});
const blobSize = await page.evaluate(() => window.__ditherland.recordMs(1500));

// capture a cover thumbnail from the live render
fs.mkdirSync('site/tools/cover', { recursive: true });
const el = await page.$('#canvas');
await el.screenshot({ path: 'site/tools/cover/ditherland.jpeg', type: 'jpeg', quality: 82 });

await browser.close();
const ok = errors.length === 0 && distinct.length >= 3 && blobSize > 0;
console.log('pageerrors:', errors);
console.log('distinct colors:', distinct.length, '| webm bytes:', blobSize);
if (!ok) { console.error('VIDEO INTEGRATION FAILED'); process.exit(1); }
console.log('VIDEO INTEGRATION PASS');
