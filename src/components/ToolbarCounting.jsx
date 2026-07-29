const KATEGORI_LIST = ['Fitting Lokal', 'Lem Ruglue', 'DFR'];

export default function ToolbarCounting({
  projectName,
  noMobil,
  kategori,
  onFieldChange,
  onNewProject,
  onOpenProject,
  onUpload,
  tool,
  onToolChange,
  onUndo,
  zoom,
  onZoomIn,
  onZoomOut,
  total,
  onSave,
  uploadProgress,
}) {
  return (
    <div className="toolbar">
      <div className="toolbar-group project-group">
        <input
          type="text"
          placeholder="Nama Project"
          className="tb-input"
          style={{ width: 150 }}
          value={projectName}
          onChange={(e) => onFieldChange('projectName', e.target.value)}
        />
        <input
          type="text"
          placeholder="No. Mobil *"
          className="tb-input"
          style={{ width: 120 }}
          value={noMobil}
          onChange={(e) => onFieldChange('noMobil', e.target.value)}
          required
        />
        <select
          className="tb-input"
          value={kategori}
          onChange={(e) => onFieldChange('kategori', e.target.value)}
          required
        >
          <option value="" disabled>
            Kategori *
          </option>
          {KATEGORI_LIST.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={onNewProject}>
          Project Baru
        </button>
        <button className="btn" title="Buka project yang sudah tersimpan" onClick={onOpenProject}>
          Buka Project
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className="btn"
          title="Upload gambar (bisa banyak sekaligus, foto tidak diunggah ke server)"
          onClick={onUpload}
          disabled={!!uploadProgress}
        >
          {uploadProgress ? `Memproses ${uploadProgress.done}/${uploadProgress.total}...` : 'Upload Gambar'}
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className={'btn tool-btn' + (tool === 'count' ? ' active' : '')}
          title="Count Tool (I)"
          onClick={() => onToolChange('count')}
        >
          Count Tool <kbd>I</kbd>
        </button>
        <button
          className={'btn tool-btn' + (tool === 'move' ? ' active' : '')}
          title="Move/Select (V)"
          onClick={() => onToolChange('move')}
        >
          Move/Select <kbd>V</kbd>
        </button>
        <button className="btn" title="Undo titik terakhir (Ctrl+Z)" onClick={onUndo}>
          Undo
        </button>
        <button className="btn btn-icon" title="Zoom out" onClick={onZoomOut}>
          -
        </button>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <button className="btn btn-icon" title="Zoom in" onClick={onZoomIn}>
          +
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <span className="total-badge">
          Total: <strong>{total}</strong>
        </span>
      </div>

      <div className="toolbar-group toolbar-group-right">
        <button className="btn btn-secondary" onClick={onSave}>
          Simpan
        </button>
      </div>
    </div>
  );
}
