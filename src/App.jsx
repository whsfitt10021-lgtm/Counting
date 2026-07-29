import { useReducer, useRef, useState, useCallback, useEffect } from 'react';
import { appReducer, initialState, getActiveLayer } from './state/appReducer';
import { gasApi, getBackendMode } from './lib/gasApi';
import { useImageStore } from './hooks/useImageStore';

import NavSidebar from './components/NavSidebar';
import ToolbarCounting from './components/ToolbarCounting';
import LayerPanel from './components/LayerPanel';
import CanvasCounter from './components/CanvasCounter';
import ImportView from './components/ImportView';
import Toast from './components/Toast';
import OpenProjectModal from './components/OpenProjectModal';

const AUTOSAVE_INTERVAL_MS = 60000;

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const imageStore = useImageStore();

  const [projectName, setProjectName] = useState('');
  const [noMobil, setNoMobil] = useState('');
  const [kategori, setKategori] = useState('');
  const [modalProjects, setModalProjects] = useState(null); // null = closed
  const [backendMode, setBackendMode] = useState(getBackendMode);

  const fileInputImagesRef = useRef(null);
  const fileInputSpmRef = useRef(null);

  const activeLayer = getActiveLayer(state);

  useEffect(() => {
    if (backendMode !== 'connecting') return undefined;

    const intervalId = window.setInterval(() => {
      const nextMode = getBackendMode();
      if (nextMode !== 'connecting') {
        setBackendMode(nextMode);
        window.clearInterval(intervalId);
      }
    }, 100);

    return () => window.clearInterval(intervalId);
  }, [backendMode]);

  const toast = useCallback((msg, type) => dispatch({ type: 'TOAST', msg, toastType: type }), []);
  const log = useCallback((msg, isError) => dispatch({ type: 'LOG', msg, isError }), []);

  const requireProject = useCallback(() => {
    if (!state.project) {
      toast('Buat / pilih project dulu sebelum upload', 'error');
      return false;
    }
    return true;
  }, [state.project, toast]);

  // ---------------------------------------------------------------------
  // Project lifecycle
  // ---------------------------------------------------------------------
  const handleFieldChange = useCallback((field, value) => {
    if (field === 'projectName') setProjectName(value);
    if (field === 'noMobil') setNoMobil(value);
    if (field === 'kategori') setKategori(value);
  }, []);

  const handleNewProject = useCallback(async () => {
    if (!noMobil.trim()) return toast('No. Mobil wajib diisi', 'error');
    if (!kategori) return toast('Kategori wajib dipilih', 'error');
    try {
      const project = await gasApi.createProject({ projectName: projectName.trim(), noMobil: noMobil.trim(), kategori });
      imageStore.resetAll();
      dispatch({ type: 'SET_PROJECT', project });
      toast(`Project "${project.projectName}" dibuat`, 'success');
    } catch (err) {
      toast(err.message || String(err), 'error');
    }
  }, [projectName, noMobil, kategori, imageStore, toast]);

  const handleOpenProject = useCallback(async () => {
    toast('Memuat daftar project...', null);
    try {
      const projects = await gasApi.listProjects();
      setModalProjects(projects);
    } catch (err) {
      toast(err.message || String(err), 'error');
    }
  }, [toast]);

  const handleSelectProject = useCallback(
    async (projectId) => {
      setModalProjects(null);
      try {
        const project = await gasApi.getProject(projectId);
        imageStore.resetAll();
        dispatch({ type: 'SET_PROJECT', project });
        toast(`Project "${project.projectName}" dibuka`, 'success');
        toast(
          'Project dibuka. Foto sebelumnya tidak tersimpan di server — upload ulang foto per gambar kalau perlu ubah titik.',
          null
        );
      } catch (err) {
        toast(err.message || String(err), 'error');
      }
    },
    [imageStore, toast]
  );

  // ---------------------------------------------------------------------
  // Upload (sequential decode queue -> registerLayers -> commit thumbs)
  // ---------------------------------------------------------------------
  const handleUploadClick = useCallback(() => {
    if (!requireProject()) return;
    fileInputImagesRef.current?.click();
  }, [requireProject]);

  const handleFilesSelected = useCallback(
    async (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (!files.length) return;

      dispatch({ type: 'SET_UPLOAD_PROGRESS', progress: { done: 0, total: files.length } });
      toast(`Memproses ${files.length} foto (foto tetap di perangkat ini, tidak diunggah)...`, null);

      try {
        const prepared = await imageStore.processUpload(files, (done, total) =>
          dispatch({ type: 'SET_UPLOAD_PROGRESS', progress: { done, total } })
        );
        const meta = prepared.map((p) => ({ name: p.fileName, width: p.width, height: p.height }));
        const newLayers = await gasApi.registerLayers(state.project.projectId, meta);
        imageStore.commitUpload(prepared, newLayers);
        dispatch({ type: 'ADD_LAYERS', layers: newLayers });
        toast(`Data ${newLayers.length} foto tersimpan (foto tidak diunggah ke server)`, 'success');
      } catch (err) {
        toast('Gagal memproses foto: ' + (err.message || err), 'error');
      } finally {
        dispatch({ type: 'SET_UPLOAD_PROGRESS', progress: null });
      }
    },
    [imageStore, state.project, toast]
  );

  const handleAddLayer = handleUploadClick;

  // ---------------------------------------------------------------------
  // Layer selection / deletion
  // ---------------------------------------------------------------------
  const handleSelectLayer = useCallback((layerId) => {
    dispatch({ type: 'SET_ACTIVE_LAYER', layerId });
  }, []);

  const handleDeleteLayer = useCallback(
    async (layer) => {
      if (!window.confirm(`Hapus data "${layer.fileName}" dari project?`)) return;
      try {
        await gasApi.deleteLayer(state.project.projectId, layer.layerId);
        imageStore.removeLayer(layer.layerId);
        dispatch({ type: 'DELETE_LAYER', layerId: layer.layerId });
        toast('Data layer dihapus', 'success');
      } catch (err) {
        toast(err.message || String(err), 'error');
      }
    },
    [state.project, imageStore, toast]
  );

  // ---------------------------------------------------------------------
  // Counting: points, tool, zoom, undo
  // ---------------------------------------------------------------------
  const handlePointsChange = useCallback(
    (points) => {
      if (!activeLayer) return;
      dispatch({ type: 'UPDATE_LAYER_POINTS', layerId: activeLayer.layerId, points });
    },
    [activeLayer]
  );

  const handleUndo = useCallback(() => {
    if (!activeLayer || !activeLayer.points.length) return;
    const next = activeLayer.points.slice(0, -1).map((p, i) => ({ ...p, label: i + 1 }));
    handlePointsChange(next);
  }, [activeLayer, handlePointsChange]);

  const handleToolChange = useCallback((tool) => dispatch({ type: 'SET_TOOL', tool }), []);
  const handleZoomIn = useCallback(() => dispatch({ type: 'SET_ZOOM', zoom: Math.min(state.zoom * 1.2, 4) }), [state.zoom]);
  const handleZoomOut = useCallback(() => dispatch({ type: 'SET_ZOOM', zoom: Math.max(state.zoom / 1.2, 0.25) }), [state.zoom]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (e.key === 'i' || e.key === 'I') handleToolChange('count');
      if (e.key === 'v' || e.key === 'V') handleToolChange('move');
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleToolChange, handleUndo]);

  // ---------------------------------------------------------------------
  // Save (manual + autosave)
  // ---------------------------------------------------------------------
  const saveActiveLayer = useCallback(
    async (silent) => {
      if (!state.project || !activeLayer) return;
      try {
        await gasApi.saveLayerPoints(state.project.projectId, {
          layerId: activeLayer.layerId,
          points: activeLayer.points,
        });
        if (!silent) toast('Tersimpan', 'success');
      } catch (err) {
        toast((silent ? 'Auto-save gagal: ' : '') + (err.message || err), 'error');
      }
    },
    [state.project, activeLayer, toast]
  );

  const handleSave = useCallback(() => {
    if (!requireProject()) return;
    if (!activeLayer) return toast('Tidak ada layer aktif', 'error');
    saveActiveLayer(false);
  }, [requireProject, activeLayer, saveActiveLayer, toast]);

  useEffect(() => {
    const id = setInterval(() => {
      if (state.project && activeLayer) saveActiveLayer(true);
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.project, activeLayer]);

  // ---------------------------------------------------------------------
  // Import Data tab actions
  // ---------------------------------------------------------------------
  const handleExport = useCallback(async () => {
    if (!requireProject()) return;
    toast('Meng-export rekap...', null);
    try {
      const url = await gasApi.exportToSheet(state.project.projectId);
      toast('Export selesai', 'success');
      log(`Export Rekap berhasil untuk project "${state.project.projectName}"`);
      window.open(url, '_blank');
    } catch (err) {
      toast(err.message || String(err), 'error');
      log('Export Rekap gagal: ' + (err.message || err), true);
    }
  }, [requireProject, state.project, toast, log]);

  const handleViewCompare = useCallback(async () => {
    toast('Membuka Rekap_Compare...', null);
    try {
      await gasApi.runCompare();
      toast('Rekap_Compare diperbarui, cek spreadsheet', 'success');
      log('Rekap_Compare diperbarui');
    } catch (err) {
      toast(err.message || String(err), 'error');
      log('Update Rekap_Compare gagal: ' + (err.message || err), true);
    }
  }, [toast, log]);

  const handleViewResume = useCallback(async () => {
    toast('Membangun Resume_Harian...', null);
    try {
      await gasApi.buildResumeHarian();
      toast('Resume_Harian diperbarui, cek spreadsheet', 'success');
      log('Resume_Harian diperbarui');
    } catch (err) {
      toast(err.message || String(err), 'error');
      log('Update Resume_Harian gagal: ' + (err.message || err), true);
    }
  }, [toast, log]);

  const handleImportSpmClick = useCallback(() => fileInputSpmRef.current?.click(), []);

  const handleSpmFileSelected = useCallback(
    (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        toast(`Mengimport ${file.name}...`, null);
        try {
          const msg = await gasApi.importSpmFile(ev.target.result, file.name);
          toast(msg, 'success');
          log(msg);
        } catch (err) {
          toast(err.message || String(err), 'error');
          log(`Import "${file.name}" gagal: ` + (err.message || err), true);
        }
      };
      reader.readAsText(file);
    },
    [toast, log]
  );

  return (
    <div id="app">
      <NavSidebar view={state.view} onChange={(view) => dispatch({ type: 'SET_VIEW', view })} />

      <div className="app-content">
        {state.view === 'counting' ? (
          <div className="app-view active">
            <ToolbarCounting
              projectName={projectName}
              noMobil={noMobil}
              kategori={kategori}
              onFieldChange={handleFieldChange}
              onNewProject={handleNewProject}
              onOpenProject={handleOpenProject}
              onUpload={handleUploadClick}
              tool={state.tool}
              onToolChange={handleToolChange}
              onUndo={handleUndo}
              zoom={state.zoom}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              total={activeLayer ? activeLayer.totalCount : 0}
              onSave={handleSave}
              uploadProgress={state.uploadProgress}
            />
            <div className="main-layout">
              <CanvasCounter
                layer={activeLayer}
                tool={state.tool}
                zoom={state.zoom}
                getWorkingBitmap={imageStore.getWorkingBitmap}
                onPointsChange={handlePointsChange}
              />
              <LayerPanel
                layers={(state.project && state.project.layers) || []}
                activeLayerId={state.activeLayerId}
                getThumb={imageStore.getThumb}
                onSelect={handleSelectLayer}
                onDelete={handleDeleteLayer}
                onAdd={handleAddLayer}
              />
            </div>
          </div>
        ) : (
          <ImportView
            project={state.project}
            importLog={state.importLog}
            onExport={handleExport}
            onViewCompare={handleViewCompare}
            onViewResume={handleViewResume}
            onImportSpm={handleImportSpmClick}
          />
        )}
      </div>

      <input
        type="file"
        ref={fileInputImagesRef}
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFilesSelected}
      />
      <input
        type="file"
        ref={fileInputSpmRef}
        accept=".txt"
        style={{ display: 'none' }}
        onChange={handleSpmFileSelected}
      />

      <Toast toast={state.toast} />

      {modalProjects && (
        <OpenProjectModal
          projects={modalProjects}
          onSelect={handleSelectProject}
          onClose={() => setModalProjects(null)}
        />
      )}

      {backendMode === 'mock' && (
        <div className="dev-badge">DEV MODE (mock backend, not connected to Apps Script)</div>
      )}
    </div>
  );
}
