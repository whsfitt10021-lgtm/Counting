export const initialState = {
  project: null, // { projectId, projectName, noMobil, kategori, tanggalHitung, layers: [...] }
  activeLayerId: null,
  tool: 'count', // 'count' | 'move'
  zoom: 1,
  view: 'counting', // 'counting' | 'import'
  toast: null, // { id, msg, type }
  importLog: [], // [{ id, time, msg, isError }]
  uploadProgress: null, // { done, total } | null
};

let toastSeq = 0;
let logSeq = 0;

export function appReducer(state, action) {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, view: action.view };

    case 'SET_PROJECT':
      return { ...state, project: action.project, activeLayerId: null };

    case 'ADD_LAYERS': {
      if (!state.project) return state;
      return {
        ...state,
        project: { ...state.project, layers: [...state.project.layers, ...action.layers] },
        activeLayerId: state.activeLayerId || (action.layers[0] && action.layers[0].layerId) || null,
      };
    }

    case 'DELETE_LAYER': {
      if (!state.project) return state;
      const layers = state.project.layers.filter((l) => l.layerId !== action.layerId);
      const activeLayerId = state.activeLayerId === action.layerId ? null : state.activeLayerId;
      return { ...state, project: { ...state.project, layers }, activeLayerId };
    }

    case 'SET_ACTIVE_LAYER':
      return { ...state, activeLayerId: action.layerId };

    case 'UPDATE_LAYER_POINTS': {
      if (!state.project) return state;
      const layers = state.project.layers.map((l) =>
        l.layerId === action.layerId
          ? { ...l, points: action.points, totalCount: action.points.length }
          : l
      );
      return { ...state, project: { ...state.project, layers } };
    }

    case 'SET_TOOL':
      return { ...state, tool: action.tool };

    case 'SET_ZOOM':
      return { ...state, zoom: action.zoom };

    case 'TOAST':
      return { ...state, toast: { id: ++toastSeq, msg: action.msg, type: action.toastType || null } };

    case 'CLEAR_TOAST':
      return state.toast && state.toast.id === action.id ? { ...state, toast: null } : state;

    case 'LOG': {
      const entry = { id: ++logSeq, time: new Date().toLocaleTimeString(), msg: action.msg, isError: !!action.isError };
      return { ...state, importLog: [entry, ...state.importLog] };
    }

    case 'SET_UPLOAD_PROGRESS':
      return { ...state, uploadProgress: action.progress };

    default:
      return state;
  }
}

export function getActiveLayer(state) {
  if (!state.project || !state.activeLayerId) return null;
  return state.project.layers.find((l) => l.layerId === state.activeLayerId) || null;
}
