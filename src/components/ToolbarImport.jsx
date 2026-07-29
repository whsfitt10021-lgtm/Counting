export default function ToolbarImport({ onExport, onViewCompare, onViewResume, onImportSpm }) {
  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button className="btn btn-primary" onClick={onExport}>
          Export Rekap
        </button>
        <button className="btn" onClick={onImportSpm}>
          Import Data SPM (TXT)
        </button>
      </div>
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        <button className="btn" onClick={onViewCompare}>
          Update Rekap Compare
        </button>
        <button className="btn" onClick={onViewResume}>
          Update Resume Harian
        </button>
      </div>
    </div>
  );
}
