import ToolbarImport from './ToolbarImport';

export default function ImportView({ project, importLog, onExport, onViewCompare, onViewResume, onImportSpm }) {
  return (
    <div className="app-view active">
      <ToolbarImport
        onExport={onExport}
        onViewCompare={onViewCompare}
        onViewResume={onViewResume}
        onImportSpm={onImportSpm}
      />
      <div className="import-content">
        <div className="import-project-info">
          {project ? (
            <>
              Project aktif: <strong>{project.projectName}</strong> &mdash; {project.noMobil} ({project.kategori}),{' '}
              {project.tanggalHitung}
            </>
          ) : (
            <span className="text-muted">Belum ada project aktif. Buat / buka project dulu di tab Counting.</span>
          )}
        </div>

        <div className="import-section-title">Riwayat Aksi</div>
        <div className="import-log">
          {importLog.length === 0 ? (
            <div className="import-log-empty text-muted">Belum ada aktivitas import/export pada sesi ini.</div>
          ) : (
            importLog.map((entry) => (
              <div key={entry.id} className={'import-log-item' + (entry.isError ? ' error' : '')}>
                <span className="log-time">{entry.time}</span>
                {entry.msg}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
