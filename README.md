# Ditherland

Ferramenta de **dithering multi-tom** (2–4 cores) para imagem, vídeo e texturas
geradas — com Bayer / Floyd–Steinberg / Atkinson, paletas prontas + edição por cor,
e export sem marca d'água. Roda 100% no navegador, offline, código próprio LBK.

Projeto **standalone** — extraído do antigo mirror em 2026-06; não depende de
nenhum servidor externo nem do build original.

## Rodar

Duplo-clique em `start.bat` (sobe o servidor + abre o navegador), ou:

```
python serve.py 8765 --open
```

Abre em `http://127.0.0.1:8765/`.

## Estrutura

```
ditherland/
├─ serve.py            # servidor estático de dev (no-cache)
├─ start.bat           # launcher duplo-clique
├─ package.json
├─ test/               # unit (dither/curve/noise/texture) + integration (puppeteer)
└─ site/               # raiz web (servida em /)
   ├─ index.html       # a ferramenta
   ├─ ditherland.js    # app
   ├─ dither.js curve.js noise.js texture.js   # motores puros (testáveis)
   ├─ style.css lbk-theme.css                  # base + tema LBK
   ├─ favicon.svg image_demo.png demo-video-02.mp4
   └─ vendor/          # css + fontes (próprios, sem origem externa)
```

## Testes

```
npm test                              # unit (node:test)
node test/integration/image.mjs       # integração (precisa do servidor no ar)
node test/integration/video.mjs
node test/integration/tabs.mjs
node test/integration/generator.mjs
```

## Marca

Tema LBK (dark terminal): verde profundo `#00110E`, laranja `#F05524`, bege `#C4B597`.
Skeuomorfismo retrô (relevo Win95): controles com bisel, grooves recessed, cantos 0px.
