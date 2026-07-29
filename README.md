# Count Tool — React port

React rewrite of the Google Apps Script counting tool, focused on staying
light with 30+ large photos per session.

## Why it's still an Apps Script app

`google.script.run` (used for `createProject`, `saveLayerPoints`, etc.) only
exists inside the sandboxed iframe that `HtmlService` serves — it isn't
callable from a React app hosted elsewhere over plain `fetch()`. So the
backend (`Code.gs`) is untouched, and the React app is built into **one
self-contained `index.html`** (Vite + `vite-plugin-singlefile` inlines all
JS/CSS) that gets pasted back into the Apps Script project as `index.html`,
served by `doGet`. Everything else about the deploy process stays the same
as before.

`Stylesheet.html`, `LayerPanel.html`, `ToolbarCounting.html`, `JavaScript.html`
are superseded — delete them from the Apps Script project once the new
`index.html` is in place.

## What actually changed for performance

The old app, per uploaded photo: `FileReader` → base64 data URL → `new
Image()` → decoded at **full native resolution** → kept alive in memory for
every layer, for the whole session. With 30 photos at ~4000×3000 that's
~30 × 48MB of raw decoded pixels resident at once, before anything is even
drawn — that's what makes the tab crawl or crash.

`src/lib/imageEngine.js` replaces that with:

1. **No base64, no `<img>`.** Uses `createImageBitmap(file, { resizeWidth,
   resizeHeight })`, which lets the browser downscale *while* decoding —
   much cheaper than decode-full-then-resize.
2. **Two bitmaps per photo, both capped:**
   - a ~96px thumbnail, kept for the layer panel (tiny, cheap to keep all
     of them resident)
   - a "working" bitmap capped at 1600px on the long side for the counting
     canvas — already more than any real screen needs, so native
     resolution is never decoded for on-screen use.
3. **Only one working bitmap resident at a time** (`WorkingBitmapCache`,
   `src/hooks/useImageStore.js`). Switching layers `close()`s the previous
   one and lazily re-decodes from the original `File` handle when you
   switch back — `File` objects don't hold decoded pixels, so keeping 30+
   of them around is cheap.
4. **Uploads process sequentially**, not `Promise.all`, so a 30-photo batch
   never triggers 30 simultaneous full decodes at once; progress is shown
   incrementally instead.
5. **`React.memo` on layer list items** (`LayerPanel.jsx`) so scrolling /
   selecting through a long layer list doesn't re-render every thumbnail.

Net effect: peak decoded-pixel memory stays roughly flat whether the
project has 5 photos or 300.

## Project structure

```
src/
  lib/imageEngine.js      the performance-critical piece described above
  lib/gasApi.js           promise wrapper over google.script.run (+ dev mock)
  hooks/useImageStore.js  owns File/ImageBitmap refs outside React state
  state/appReducer.js     app state (project, layers, tool, zoom, toasts...)
  components/             CanvasCounter, LayerPanel, toolbars, modal, toast
  App.jsx                 wiring
  styles.css              ported 1:1 from the original Stylesheet.html
Code.gs                   backend, unchanged except doGet (see below)
```

## Build & deploy

```bash
npm install
npm run build        # -> dist/index.html (single self-contained file)
```

Then in the Apps Script project:
1. Replace `index.html` with the contents of `dist/index.html`.
2. Delete `Stylesheet.html`, `LayerPanel.html`, `ToolbarCounting.html`,
   `JavaScript.html`.
3. Replace `Code.gs` with the `Code.gs` in this folder (only `doGet` changed
   — it now uses `createHtmlOutputFromFile` instead of
   `createTemplateFromFile`, since there's no `<?!= include(...) ?>` left to
   evaluate).
4. Deploy as before (Deploy → New deployment / Manage deployments).

## Local development

```bash
npm run dev
```

Runs against an in-memory mock backend (`isDevMode` in `gasApi.js`) so you
can iterate on the UI without deploying to Apps Script each time. The "DEV
MODE" badge means you're not talking to the real backend.

## Notes / things you may want to revisit

- `WorkingBitmapCache` is set to keep only **1** working bitmap resident
  (`new WorkingBitmapCache(1)` in `useImageStore.js`). Bump to `2` if you'd
  like adjacent-layer prefetching later (e.g. pre-decode the next photo
  while the user is still counting the current one) — the cache already
  supports it, just call `getWorkingBitmap` for the neighbor layer.
- `WORKING_MAX_DIM` (1600px) and `THUMB_MAX_DIM` (96px) are in
  `imageEngine.js` if you want to tune quality vs. memory further.
- `createImageBitmap`'s `resizeWidth/resizeHeight` options are broadly
  supported in current Chrome/Edge/Firefox/Safari; a fallback path (decode
  full + canvas-resize) is included for anything older, though it briefly
  costs more memory for that one photo.
