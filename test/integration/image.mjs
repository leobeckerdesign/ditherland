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

// load the bundled sample image via the test hook, then render with the LBK 4-color preset
await page.evaluate(() => window.__ditherland.loadImageFromUrl('/image_demo.png'));
await new Promise(r => setTimeout(r, 1500));
await page.evaluate(() => window.__ditherland.applyPreset('LBK'));
await new Promise(r => setTimeout(r, 800));

const distinct = await page.evaluate(() => {
  const c = document.getElementById('canvas');
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const set = new Set();
  for (let i = 0; i < d.length; i += 4) set.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
  return [...set];
});

await browser.close();
const ok = errors.length === 0 && distinct.length >= 3 && distinct.length <= 6;
console.log('pageerrors:', errors);
console.log('distinct colors:', distinct);
if (!ok) { console.error('IMAGE INTEGRATION FAILED'); process.exit(1); }
console.log('IMAGE INTEGRATION PASS');
