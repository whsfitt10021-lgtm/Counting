/**
 * gasApi.js
 * ----------------------------------------------------------------------------
 * Thin promise wrapper around google.script.run.
 *
 * IMPORTANT: this app still needs to be SERVED by Apps Script (HtmlService)
 * for google.script.run to exist at all — that object is injected by the
 * Apps Script sandboxed iframe, it is not something you can call from an
 * externally-hosted React app over plain HTTPS. See README.md for the
 * "why not call the /exec URL with fetch()" explanation and deploy steps.
 *
 * In local dev (vite dev, no Apps Script iframe) we fall back to an
 * in-memory mock so you can develop/preview the UI without deploying.
 * ----------------------------------------------------------------------------
 */

function callReal(fnName, ...args) {
  return new Promise((resolve, reject) => {
    window.google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler((err) => reject(err instanceof Error ? err : new Error(err && err.message ? err.message : String(err))))
      [fnName](...args);
  });
}

// ---------------------------------------------------------------------------
// Dev mock (only used when window.google.script.run is not available)
// ---------------------------------------------------------------------------
const mockDb = { projects: {} };

function mockNewId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

const mock = {
  async createProject({ projectName, noMobil, kategori }) {
    if (!noMobil) throw new Error('No. Mobil wajib diisi.');
    if (!['Fitting Lokal', 'Lem Ruglue', 'DFR'].includes(kategori)) {
      throw new Error('Kategori wajib dipilih.');
    }
    const projectId = mockNewId('proj');
    const project = {
      projectId,
      projectName: projectName || `Project ${projectId}`,
      noMobil: String(noMobil).toUpperCase().trim(),
      kategori,
      tanggalHitung: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      layers: [],
    };
    mockDb.projects[projectId] = project;
    return JSON.parse(JSON.stringify(project));
  },

  async listProjects() {
    return Object.values(mockDb.projects).map((p) => ({
      projectId: p.projectId,
      projectName: p.projectName,
      noMobil: p.noMobil,
      kategori: p.kategori,
      tanggalHitung: p.tanggalHitung,
      totalLayers: p.layers.length,
      totalCount: p.layers.reduce((s, l) => s + (l.totalCount || 0), 0),
    }));
  },

  async getProject(projectId) {
    const p = mockDb.projects[projectId];
    if (!p) throw new Error('Project tidak ditemukan: ' + projectId);
    return JSON.parse(JSON.stringify(p));
  },

  async registerLayers(projectId, meta) {
    const p = mockDb.projects[projectId];
    if (!p) throw new Error('Project tidak ditemukan: ' + projectId);
    const startOrder = p.layers.length;
    const newLayers = meta.map((m, idx) => ({
      layerId: mockNewId('img'),
      fileName: m.name,
      width: m.width || 0,
      height: m.height || 0,
      order: startOrder + idx + 1,
      totalCount: 0,
      points: [],
    }));
    p.layers = p.layers.concat(newLayers);
    return JSON.parse(JSON.stringify(newLayers));
  },

  async deleteLayer(projectId, layerId) {
    const p = mockDb.projects[projectId];
    if (!p) throw new Error('Project tidak ditemukan: ' + projectId);
    p.layers = p.layers.filter((l) => l.layerId !== layerId);
    return JSON.parse(JSON.stringify(p));
  },

  async saveLayerPoints(projectId, layer) {
    const p = mockDb.projects[projectId];
    if (!p) throw new Error('Project tidak ditemukan: ' + projectId);
    const idx = p.layers.findIndex((l) => l.layerId === layer.layerId);
    if (idx === -1) throw new Error('Layer tidak ditemukan: ' + layer.layerId);
    p.layers[idx].points = layer.points;
    p.layers[idx].totalCount = layer.points.length;
    return JSON.parse(JSON.stringify(p.layers[idx]));
  },

  async exportToSheet() {
    await new Promise((r) => setTimeout(r, 300));
    return 'https://docs.google.com/spreadsheets/d/mock/edit';
  },

  async runCompare() {
    return 0;
  },

  async buildResumeHarian() {
    return 0;
  },

  async importSpmFile(_content, fileName) {
    return `(mock) Import "${fileName}" diproses.`;
  },
};

const isRealGas = () =>
  typeof window !== 'undefined' && window.google && window.google.script && window.google.script.run;

/**
 * gasApi.<fn>(...args) -> Promise
 * Routes to real google.script.run when running inside Apps Script,
 * otherwise to the in-memory dev mock.
 */
export const gasApi = new Proxy(
  {},
  {
    get(_target, fnName) {
      return (...args) => {
        if (isRealGas()) return callReal(fnName, ...args);
        if (typeof mock[fnName] !== 'function') {
          return Promise.reject(new Error(`Mock gasApi: "${String(fnName)}" not implemented`));
        }
        return mock[fnName](...args);
      };
    },
  }
);

export const isDevMode = !isRealGas();
