import { useEffect, useRef } from 'react';

/** Renders an ImageBitmap (or nothing, if unavailable) into a small canvas. */
export default function BitmapThumb({ bitmap, size = 36 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bitmap) {
      // cover-fit crop
      const s = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
      const w = bitmap.width * s;
      const h = bitmap.height * s;
      const dx = (canvas.width - w) / 2;
      const dy = (canvas.height - h) / 2;
      ctx.drawImage(bitmap, dx, dy, w, h);
    }
  }, [bitmap]);

  if (!bitmap) {
    return (
      <div className="layer-thumb layer-thumb-empty" title="Foto tidak tersedia (tidak disimpan di server)">
        &ndash;
      </div>
    );
  }

  return <canvas ref={canvasRef} className="layer-thumb" width={size} height={size} />;
}
