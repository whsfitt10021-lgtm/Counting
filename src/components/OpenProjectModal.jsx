export default function OpenProjectModal({ projects, onSelect, onClose }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h3>BUKA PROJECT</h3>
        {!projects.length ? (
          <div className="modal-empty">Belum ada project tersimpan.</div>
        ) : (
          projects.map((p) => (
            <div key={p.projectId} className="modal-project-item" onClick={() => onSelect(p.projectId)}>
              <span>
                {p.projectName} &mdash; {p.noMobil} ({p.kategori})
              </span>
              <span>
                {p.tanggalHitung} &middot; {p.totalCount} objek
              </span>
            </div>
          ))
        )}
        <button className="btn modal-close" onClick={onClose}>
          Tutup
        </button>
      </div>
    </div>
  );
}
