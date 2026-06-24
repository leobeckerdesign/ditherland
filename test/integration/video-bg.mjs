// Feature: no modo Vídeo dá pra carregar um fundo (igual ao Gerador) e ele aparece
// pelas bandas transparentes (∅) do vídeo ditherizado.
import puppeteer from 'puppeteer-core';
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

// entra no modo Vídeo pela UI → os controles de fundo (#video-bg-controls) devem aparecer
await page.evaluate(() => document.getElementById('tab-video').click());
await new Promise(r => setTimeout(r, 300));
const bgControlsVisible = await page.evaluate(() => {
  const el = document.getElementById('video-bg-controls');
  return !!el && getComputedStyle(el).display !== 'none' && !!document.getElementById('bg-file');
});

// carrega o vídeo demo, deixa alguns frames passarem e congela pra amostragem determinística
await page.evaluate(() => window.__ditherland.loadVideoFromUrl('/demo-video-02.mp4'));
await new Promise(r => setTimeout(r, 2500));
await page.evaluate(() => window.__ditherland.applyPreset('LBK'));
await page.evaluate(() => window.__ditherland.video.pause());
await new Promise(r => setTimeout(r, 200));

// alarga a área transparente (bandas 0 e 1) pro fundo aparecer de forma confiável
await page.evaluate(() => { window.__ditherland.video.setAlpha(0, true); window.__ditherland.video.setAlpha(1, true); });

const redOf = () => page.evaluate(() => {
  const c = document.getElementById('canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let red = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 60 && d[i + 2] < 60) red++;
  return red;
});

// sem fundo, as bandas transparentes ficam vazias (nada de vermelho no canvas)
await page.evaluate(() => window.__ditherland.video.clearBg());
const redBefore = await redOf();

// com um fundo vermelho sólido, ele deve aparecer pelas bandas transparentes do vídeo
await page.evaluate(() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 8;
  const g = cv.getContext('2d'); g.fillStyle = '#ff0000'; g.fillRect(0, 0, 8, 8);
  return window.__ditherland.video.loadBgFromUrl(cv.toDataURL());
});
const redAfter = await redOf();

// remover o fundo volta ao estado sem vermelho
await page.evaluate(() => window.__ditherland.video.clearBg());
const redCleared = await redOf();

await browser.close();
const ok = errors.length === 0 && bgControlsVisible && redBefore === 0 && redAfter > 0 && redCleared === 0;
console.log('pageerrors:', errors);
console.log('bg controls visible:', bgControlsVisible, '| red before:', redBefore, '| red after bg:', redAfter, '| red cleared:', redCleared);
if (!ok) { console.error('VIDEO-BG INTEGRATION FAILED'); process.exit(1); }
console.log('VIDEO-BG INTEGRATION PASS');
