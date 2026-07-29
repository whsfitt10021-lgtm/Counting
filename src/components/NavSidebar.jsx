export default function NavSidebar({ view, onChange }) {
  return (
    <div className="nav-sidebar">
      <button
        className={'nav-btn' + (view === 'counting' ? ' active' : '')}
        onClick={() => onChange('counting')}
        title="Counting"
      >
        <span className="nav-icon">&#128394;</span>
        <span className="nav-label">Counting</span>
      </button>
      <button
        className={'nav-btn' + (view === 'import' ? ' active' : '')}
        onClick={() => onChange('import')}
        title="Import Data"
      >
        <span className="nav-icon">&#128202;</span>
        <span className="nav-label">
          Import
          <br />
          Data
        </span>
      </button>
    </div>
  );
}
