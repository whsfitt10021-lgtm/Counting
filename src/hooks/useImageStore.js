import { useRef, useCallback, useEffect } from 'react';
import { prepareUploadQueue, WorkingBitmapCache, closeThumb } from '../lib/imageEngine';

/**
 * Owns everything that must NOT live in React state:
 *   - original File handles (per layerId)
 *   - thumbnail ImageBitmaps (per layerId, kept for the session - tiny)
 *   - the working-resolution bitmap LRU cache (only 1-2 resident at once)
 *
 * ImageBitmaps are not plain-old-data, cloning/diffing them through React
 * state on every render would be wasteful and they need explicit .close()
 * calls to free GPU/CPU memory - so they're managed imperatively in refs
 * and exposed via small getter functions instead.
 */
export function useImageStore() {
  const filesRef = useRef(new Map()); // layerId -> File
  const thumbsRef = useRef(new Map()); // layerId -> ImageBitmap
  const workingCacheRef = useRef(new WorkingBitmapCache(1)); // only active layer resident

  useEffect(() => {
    const files = filesRef.current;
    const thumbs = thumbsRef.current;
    const workingCache = workingCacheRef.current;
    return () => {
      thumbs.forEach((b) => closeThumb(b));
      workingCache.clear();
      files.clear();
    };
  }, []);

  /** Process a FileList/array of uploaded Files, sequentially (see imageEngine). */
  const processUpload = useCallback(async (files, onProgress) => {
    const prepared = await prepareUploadQueue(files, onProgress);
    return prepared; // [{file, fileName, width, height, thumbBitmap}]
  }, []);

  /** Register prepared upload results against their newly-created layerIds. */
  const commitUpload = useCallback((prepared, newLayers) => {
    prepared.forEach((p, i) => {
      const layer = newLayers[i];
      if (!layer) return;
      filesRef.current.set(layer.layerId, p.file);
      thumbsRef.current.set(layer.layerId, p.thumbBitmap);
    });
  }, []);

  const getThumb = useCallback((layerId) => thumbsRef.current.get(layerId) || null, []);

  const hasFile = useCallback((layerId) => filesRef.current.has(layerId), []);

  /** Get (decoding if needed) the working-resolution bitmap for a layer. */
  const getWorkingBitmap = useCallback(async (layerId, width, height) => {
    const file = filesRef.current.get(layerId);
    if (!file) return null;
    return workingCacheRef.current.get(layerId, file, width, height);
  }, []);

  const removeLayer = useCallback((layerId) => {
    const thumb = thumbsRef.current.get(layerId);
    if (thumb) closeThumb(thumb);
    thumbsRef.current.delete(layerId);
    filesRef.current.delete(layerId);
    workingCacheRef.current.evict(layerId);
  }, []);

  const resetAll = useCallback(() => {
    thumbsRef.current.forEach((b) => closeThumb(b));
    thumbsRef.current.clear();
    filesRef.current.clear();
    workingCacheRef.current.clear();
  }, []);

  return {
    processUpload,
    commitUpload,
    getThumb,
    hasFile,
    getWorkingBitmap,
    removeLayer,
    resetAll,
  };
}
