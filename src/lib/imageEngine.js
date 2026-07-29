/**
 * imageEngine.js
 * ----------------------------------------------------------------------------
 * The single most important file for the "ringan" (lightweight) goal.
 *
 * The OLD app did this per uploaded photo:
 *    FileReader -> base64 data URL -> new Image() -> decode at FULL native
 *    resolution -> keep the <img> alive in memory FOREVER for every layer.
 * With 30 photos at e.g. 4000x3000 that is 30 * ~48MB of raw decoded pixel
 * data resident at once (RGBA), before you even draw anything. That's what
 * makes the tab crawl / crash on phones and mid-range laptops.
 *
 * This engine instead, per photo:
 *   1. Never uses <img> or FileReader/base64 at all.
 *   2. Uses createImageBitmap(file, { resize... }) which lets the browser's
 *      native image decoder downscale WHILE decoding (much cheaper than
 *      decode-full-then-resize).
 *   3. Produces exactly two bitmaps per photo:
 *        - thumb:    ~96px, kept for the whole session (layer panel)
 *        - working:  capped at WORKING_MAX_DIM (default 1600px), which is
 *                    already >= any realistic on-screen canvas size, so we
 *                    never need native resolution for counting/clicking.
 *   4. Only ONE working bitmap is decoded/resident at a time: the active
 *      layer. Switching layers closes the previous working bitmap
 *      (ImageBitmap.close()) and lazily re-decodes from the original File
 *      handle (which is cheap - Files don't hold decoded pixels, just a
 *      handle to the blob) when you switch back.
 *   5. Uploads are processed sequentially (not Promise.all) via a small
 *      queue so 30 simultaneous full-res decodes never spike memory/CPU at
 *      once, and the UI can show incremental progress.
 *
 * Net effect: peak decoded-pixel memory stays roughly constant regardless
 * of whether the project has 5 photos or 300 photos.
 * ----------------------------------------------------------------------------
 */

export const THUMB_MAX_DIM = 96;
export const WORKING_MAX_DIM = 1600; // plenty for any real screen/canvas size

/** Compute target dims preserving aspect ratio, capped at maxDim on the long side. */
function fitDims(w, h, maxDim) {
  if (w <= maxDim && h <= maxDim) return { w, h };
  const scale = maxDim / Math.max(w, h);
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/**
 * Read just the natural dimensions of an image file cheaply, without
 * decoding full pixel data into a long-lived object. We create a bitmap
 * capped tiny, read dims proportionally back out is unreliable, so instead
 * we do a first pass with createImageBitmap at native size ONLY to read
 * width/height, then immediately close it. This is unavoidable because
 * dimensions aren't otherwise knowable without decoding, but the bitmap
 * is closed synchronously after, so it never lingers.
 */
async function probeDimensions(file) {
  const bmp = await createImageBitmap(file);
  const dims = { width: bmp.width, height: bmp.height };
  bmp.close();
  return dims;
}

/**
 * Decode a downscaled ImageBitmap directly from a File/Blob.
 * Uses the browser's native resize-during-decode when supported; degrades
 * gracefully (decode then canvas-resize) on older browsers.
 */
async function decodeScaled(file, nativeW, nativeH, maxDim) {
  const { w, h } = fitDims(nativeW, nativeH, maxDim);
  try {
    // Fast path: browser downsamples during decode (Chrome/Edge/most modern browsers)
    return await createImageBitmap(file, {
      resizeWidth: w,
      resizeHeight: h,
      resizeQuality: 'medium',
    });
  } catch {
    // Fallback: decode then draw-scaled into an OffscreenCanvas-like path
    const full = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(full, 0, 0, w, h);
    full.close();
    return await createImageBitmap(canvas);
  }
}

/**
 * Process one uploaded File into layer metadata + a thumbnail bitmap.
 * Does NOT decode the working (canvas-res) bitmap yet — that only happens
 * when the layer becomes active (see getWorkingBitmap below). This keeps
 * a 30-photo upload batch cheap: only 30 tiny thumbnails get decoded up
 * front, not 30 working-resolution images.
 */
export async function prepareUploadedFile(file) {
  const { width, height } = await probeDimensions(file);
  const thumbBitmap = await decodeScaled(file, width, height, THUMB_MAX_DIM);
  return {
    file, // original File handle - cheap to keep, holds no decoded pixels
    fileName: file.name,
    width,
    height,
    thumbBitmap,
  };
}

/**
 * A tiny sequential queue so we never kick off N simultaneous decodes.
 * Calls onProgress(doneCount, total) as each file finishes.
 */
export async function prepareUploadQueue(files, onProgress) {
  const results = [];
  for (let i = 0; i < files.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    const r = await prepareUploadedFile(files[i]);
    results.push(r);
    if (onProgress) onProgress(i + 1, files.length);
  }
  return results;
}

/**
 * LRU-ish working-bitmap cache. Only ever holds a small number of
 * decoded working bitmaps (default 1: just the active layer) so memory
 * stays flat no matter how many layers a project has.
 */
export class WorkingBitmapCache {
  constructor(maxResident = 1) {
    this.maxResident = maxResident;
    this.map = new Map(); // layerId -> { bitmap, file, w, h }
    this.order = []; // MRU at end
  }

  async get(layerId, file, nativeW, nativeH) {
    if (this.map.has(layerId)) {
      this._touch(layerId);
      return this.map.get(layerId).bitmap;
    }
    const bitmap = await decodeScaled(file, nativeW, nativeH, WORKING_MAX_DIM);
    this.map.set(layerId, { bitmap });
    this.order.push(layerId);
    this._evictIfNeeded();
    return bitmap;
  }

  _touch(layerId) {
    const idx = this.order.indexOf(layerId);
    if (idx !== -1) this.order.splice(idx, 1);
    this.order.push(layerId);
  }

  _evictIfNeeded() {
    while (this.order.length > this.maxResident) {
      const evictId = this.order.shift();
      const entry = this.map.get(evictId);
      if (entry) {
        entry.bitmap.close();
        this.map.delete(evictId);
      }
    }
  }

  evict(layerId) {
    const entry = this.map.get(layerId);
    if (entry) {
      entry.bitmap.close();
      this.map.delete(layerId);
      const idx = this.order.indexOf(layerId);
      if (idx !== -1) this.order.splice(idx, 1);
    }
  }

  clear() {
    this.map.forEach((entry) => entry.bitmap.close());
    this.map.clear();
    this.order = [];
  }
}

/** Free a thumbnail bitmap (call when a layer is deleted). */
export function closeThumb(thumbBitmap) {
  if (thumbBitmap && typeof thumbBitmap.close === 'function') thumbBitmap.close();
}
