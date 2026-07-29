import { useEffect, useRef, useState, useCallback } from 'react';

const POINT_RADIUS = 11;

/**
 * Renders the active layer onto a canvas at a size capped by the viewport
 * (never native photo resolution) and lets the user click to add/remove
 * count points. The decoded working bitmap comes from useImageStore's
 * getWorkingBitmap(), which caches at most 1-2 bitmaps resident at once
 * regardless of how many layers the project has.
 */
export default function CanvasCounter({ layer, tool, zoom, getWorkingBitmap, onPointsChange }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const bitmapRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);

  const fitAndDraw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const bitmap = bitmapRef.current;
    if (!canvas || !wrap || !bitmap || !layer) return;

    const maxW = wrap.clientWidth - 60;
    const maxH = wrap.clientHeight - 60;
    const fitScale = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
    const scale = fitScale * zoom;

    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / layer.width;
    const scaleY = canvas.height / layer.height;

    ctx.font = 'bold 11px Segoe UI, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    layer.points.forEach((p) => {
      const dispX = p.x * scaleX;
      const dispY = p.y * scaleY;
      ctx.beginPath();
      ctx.arc(dispX, dispY, POINT_RADIUS, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255,122,26,0.9)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.fillStyle = '#1e2124';
      ctx.fillText(String(p.label), dispX, dispY);
    });
  }, [layer, zoom]);

  // Load working bitmap whenever the active layer changes
  useEffect(() => {
    let cancelled = false;
    bitmapRef.current = null;
    setMissing(false);

    if (!layer) return undefined;

    setLoading(true);
    getWorkingBitmap(layer.layerId, layer.width, layer.height)
      .then((bitmap) => {
        if (cancelled) return;
        if (!bitmap) {
          setMissing(true);
        } else {
          bitmapRef.current = bitmap;
          fitAndDraw();
        }
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer && layer.layerId]);

  // Redraw when points/zoom change (bitmap already resident)
  useEffect(() => {
    fitAndDraw();
  }, [fitAndDraw]);

  // Redraw on window resize
  useEffect(() => {
    const onResize = () => fitAndDraw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fitAndDraw]);

  const handleClick = useCallback(
    (e) => {
      if (tool !== 'count' || !layer || !bitmapRef.current) return;
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = layer.width / rect.width;
      const scaleY = layer.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      const nextLabel = layer.points.length + 1;
      const point = { id: 'p' + Date.now(), label: nextLabel, x, y };
      onPointsChange([...layer.points, point]);
    },
    [tool, layer, onPointsChange]
  );

  const handleContextMenu = useCallback(
    (e) => {
      if (tool !== 'count' || !layer) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = layer.width / rect.width;
      const scaleY = layer.height / rect.height;
      const clickX = (e.clientX - rect.left) * scaleX;
      const clickY = (e.clientY - rect.top) * scaleY;
      const radiusImg = POINT_RADIUS * (layer.width / canvas.width);

      let idx = -1;
      let minDist = Infinity;
      layer.points.forEach((p, i) => {
        const d = Math.hypot(p.x - clickX, p.y - clickY);
        if (d <= radiusImg * 1.5 && d < minDist) {
          minDist = d;
          idx = i;
        }
      });

      if (idx !== -1) {
        const next = layer.points.filter((_, i) => i !== idx).map((p, i) => ({ ...p, label: i + 1 }));
        onPointsChange(next);
      }
    },
    [tool, layer, onPointsChange]
  );

  if (!layer) {
    return (
      <div className="canvas-wrap" ref={wrapRef}>
        <div className="canvas-empty">
          <p>
            Belum ada gambar. Klik <strong>Upload Gambar</strong> untuk mulai.
          </p>
          <p className="text-muted small">
            Foto diproses langsung di browser ini dan tidak diunggah/disimpan ke server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      {(loading || missing) && (
        <div className="canvas-empty">
          <p>
            {loading
              ? 'Memuat foto...'
              : `Foto untuk layer ini tidak tersedia (tidak disimpan di server). Data jumlah tetap ada: ${layer.totalCount} objek.`}
          </p>
          <p className="text-muted small">Foto diproses langsung di browser ini dan tidak diunggah/disimpan ke server.</p>
        </div>
      )}
      <canvas
        ref={canvasRef}
        id="mainCanvas"
        className={tool === 'move' ? 'move-mode' : ''}
        style={{ display: loading || missing ? 'none' : 'block' }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      />
    </div>
  );
}
