import { memo } from 'react';
import BitmapThumb from './BitmapThumb';

const LayerItem = memo(function LayerItem({ layer, active, thumb, onSelect, onDelete }) {
  return (
    <div className={'layer-item' + (active ? ' active' : '')} onClick={() => onSelect(layer.layerId)}>
      <BitmapThumb bitmap={thumb} />
      <div className="layer-info">
        <div className="layer-name">{layer.fileName}</div>
        <div className="layer-count">{layer.totalCount} objek</div>
      </div>
      <button
        className="layer-delete"
        title="Hapus data gambar ini"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(layer);
        }}
      >
        &times;
      </button>
    </div>
  );
});

/**
 * Only re-renders items whose own props changed (React.memo above) -
 * clicking through 30+ layers doesn't re-render every thumbnail canvas.
 */
export default function LayerPanel({ layers, activeLayerId, getThumb, onSelect, onDelete, onAdd }) {
  return (
    <div className="layer-panel">
      <div className="layer-panel-header">
        <span>LAYERS</span>
        <span className="layer-count-badge">{layers.length}</span>
      </div>
      <div className="layer-list">
        {layers.map((layer) => (
          <LayerItem
            key={layer.layerId}
            layer={layer}
            active={layer.layerId === activeLayerId}
            thumb={getThumb(layer.layerId)}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ))}
      </div>
      <button className="btn btn-block" onClick={onAdd}>
        + Tambah Gambar
      </button>
    </div>
  );
}
