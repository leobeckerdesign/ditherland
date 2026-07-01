# Ditherland — Export MP4 + Seletor de Resolução (2K/4K)

**Data:** 2026-07-01
**Branch:** `feat/mp4-export-resolution`
**Autor:** Claude (para Leo Becker)

## Objetivo

Duas melhorias no export do Ditherland, pedidas pelo Leo:

1. **Export de vídeo em `.mp4` (H.264)** no lugar do `.webm` atual, universal (abre no
   Premiere, toca em Instagram/iOS).
2. **Seletor de resolução de saída** — `Nativo | 2K | 4K` — para vídeo, gerador e imagem.

Ambas tocam o mesmo caminho de export, por isso vão juntas.

## Contexto do código atual

- `site/ditherland.js` orquestra tudo. Canvas de saída = `display` (`#canvas`).
- Modos (`mediaType`): `image` | `video` | `gen`.
- Render: `renderFrame()` (image/video) e `renderGen()` (gen); `triggerRender()` despacha.
- Loops: `videoLoop()` (usa `requestVideoFrameCallback`, cai pra rAF) e `genLoop()` (rAF,
  avança `genTime += 0.05`).
- Dimensões de saída HOJE = tamanho da fonte: vídeo → `videoWidth/Height`; gen →
  `genSize()` (1080×1080 ou tamanho do fundo); imagem → tamanho natural.
- Export HOJE (`exportOutput`, ~L330): imagem → PNG via `toBlob`; vídeo/gen → `MediaRecorder`
  em `display.captureStream(30)` gravando `video/webm`, start/stop no mesmo botão.
- Hook de teste `window.__ditherland.recordMs(ms)` grava webm e resolve com o tamanho em bytes.
- Servidor: nginx com CSP em DOIS blocos (server + location /). GA4 carregado. Deploy manual
  via Coolify (push em `main` não auto-deploya).

## Decisões travadas (com o Leo)

- **Motor MP4:** WebCodecs (`VideoEncoder`) + `mp4-muxer` (JS puro, ~15KB, MIT), fallback
  `MediaRecorder`/WebM na fatia sem WebCodecs (Safari ≤16, Firefox <130).
- **Áudio:** vídeo-only (igual ao WebM de hoje). Passar áudio da fonte = fast-follow separado,
  fora do escopo.
- **2K/4K:** ancora no **lado maior** — 2K = 2560, 4K = 3840 — aspect da fonte preservado.
  (16:9 → 3840×2160; 1:1 → 3840×3840; 9:16 → 2160×3840.)
- **Resolução vale pra todos os modos** (imagem/vídeo/gen). Default = **Nativo** (nada muda
  pra quem não tocar).
- **Servidor:** zero mudança em `nginx.conf`/CSP (WebCodecs é nativo; muxer carrega de `'self'`).

## Arquitetura

### Módulo novo: `site/mp4.js` (bounded, testável)

Encapsula WebCodecs + muxer. Não sabe nada do resto do app.

```
isMp4Supported({ width, height, fps }) -> Promise<boolean>
  // VideoEncoder.isConfigSupported; false gracioso se a API não existe (ex.: node).

createMp4Recorder({ width, height, fps, bitrate }) -> {
  addFrame(source /* canvas */, tsMicros),   // cria VideoFrame, encoda, fecha
  finish() -> Promise<Blob('video/mp4')>     // flush + finalize + Blob
}
```

- Import: `mp4-muxer.mjs` auto-hospedado em `site/vendor/mp4-muxer.mjs`.
- Muxer: `fastStart: 'in-memory'` (moov na frente → seek/Premiere), `firstTimestampBehavior:'offset'`.
- Codec: tenta High `avc1.640028`; se `isConfigSupported` negar, cai pra Baseline `avc1.42E01F`.
- Bitrate: `clamp(round(w*h*fps*0.12), 4Mbps, 40Mbps)` — alto pra preservar as bordas do dither.
- Dimensões **arredondadas pra par** (exigência do H.264).

### `site/ditherland.js`

**Resolução (Feature 2):**
- Estado `outResMode` ∈ `{ 'native', '2k', '4k' }` (default `'native'`).
- `outputSize(srcW, srcH)`: se `native` → `[srcW, srcH]`; senão escala pelo lado maior
  (2560/3840), aspect preservado, arredondando. Usado por `renderFrame`/`renderGen`/`genSize`.
- `renderFrame`/`renderGen`: `display.width/height` passam pela `outputSize`. O grid de dither
  continua derivado da FONTE + escala (padrão não muda, só o raster cresce); o `drawImage`
  final de upscale usa as dims de saída.
- UI: controle segmentado `Nativo | 2K | 4K` no bloco de export (`index.html`), estilo `dl-`
  das abas. Wire troca `outResMode` + `triggerRender()`.

**Export MP4 (Feature 1):**
- `capturer` (módulo): `{ active, recorder /* mp4 rec */, start, grab, stop }`.
- `videoLoop`/`genLoop`: após render, se `capturer.active` → `capturer.grab()` (timestamp por
  tempo real decorrido desde o start).
- `exportOutput`:
  - `image` → PNG (respeita a resolução de saída automaticamente; sem mudança de fluxo).
  - `video`/`gen`:
    - Se `await isMp4Supported(dims)` → cria `createMp4Recorder`, trava dims de captura (par),
      ativa `capturer`, label "Parar e salvar". No 2º clique: para o loop de captura, label
      "Salvando…", `await finish()`, baixa `ditherland[-gen].mp4`.
    - Senão → caminho WebM atual + aviso curto ("navegador sem MP4, salvamos WebM").
- Canvas de captura de tamanho fixo (dims travadas no start, pares): cada frame desenha
  `display` nele (reescala se `display` mudou de tamanho no meio) → dims constantes pro H.264.

## Fluxo de dados (export vídeo, caminho MP4)

```
clique Export
  -> dims = outputSize(source)  (par)
  -> isMp4Supported(dims)? sim
  -> rec = createMp4Recorder(dims); capturer.start(rec)
  -> [loop] renderFrame -> capturer.grab(): VideoFrame(display) -> rec.addFrame
  -> clique Parar
  -> capturer.stop(); blob = await rec.finish()  -> downloadBlob(blob, 'ditherland.mp4')
```

## Tratamento de erros / edge cases

- **4K de conteúdo quadrado** (3840² = 14.7M px) pode passar do limite de encoders H.264 HW.
  `isMp4Supported` pega isso antes → aviso + fallback pro maior tamanho suportado, ou WebM.
- **Sem WebCodecs** → fallback WebM (código atual mantido) + aviso.
- **`VideoEncoder.error`** → aborta captura, avisa, oferece WebM.
- **Downscale** (fonte 4K → 2K): funciona; mantém `imageSmoothingEnabled=false` (crispez).
- **Mudança de dims no meio da captura**: canvas de captura fixo absorve (reescala).

## Testes

- **Unit (node:test):** `test/mp4.test.mjs` — `isMp4Supported` retorna `false` gracioso sem
  WebCodecs (node), e a API (`createMp4Recorder`) existe e valida args. Os 45 unit dos motores
  puros ficam intactos.
- **Integração (puppeteer, Chrome real):** estende `window.__ditherland` com um hook que roda
  ~1s de captura no modo atual e devolve `{ type, size, engine, width, height }`. Assertivas:
  `engine:'mp4'`, `type:'video/mp4'`, `size>0`; e 2K/4K → dims corretas. Fallback WebM coberto
  forçando o engine. Novo arquivo/ajuste em `test/integration/`.
- Smoke local: `python serve.py 8765` + rodar os itests contra `http://127.0.0.1:8765/`.

## Impacto no servidor / deploy

- **nginx.conf/CSP:** nenhuma mudança. WebCodecs é API nativa; `mp4-muxer.mjs` carrega de
  `'self'` (já liberado por `script-src 'self'`). Sem wasm, sem eval, sem COOP/COEP. GA intacto.
- **Deploy:** manual via Coolify (`tag_or_uuid=b6fj0978ak2h2mi1crcobv49`) SÓ após o Leo autorizar.

## Fora de escopo (YAGNI)

- Áudio no MP4 (fast-follow).
- Resoluções custom além de 2K/4K.
- Multi-thread ffmpeg.wasm / cross-origin isolation.

## Não mexer

- `site/tools/cover/ditherland.jpeg` (modificado no working tree, origem desconhecida — não é
  do agente; NÃO commitar/descartar sem o Leo).
