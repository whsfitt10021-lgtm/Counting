/**
 * ============================================================================
 *  GAS Image Count Tool - Code.gs
 *  Backend: routing halaman, project, layer (DATA ONLY - foto TIDAK disimpan
 *  di server, hanya diproses di browser client), simpan/ambil data hitungan,
 *  export rekap, integrasi SPM/Surat Jalan.
 * ============================================================================
 */

// ---- Konfigurasi ----------------------------------------------------------
var ROOT_FOLDER_NAME = 'CountTool_Projects';
var SPREADSHEET_ID_PROP = 'REKAP_SPREADSHEET_ID'; // disimpan di Script Properties

var KATEGORI_LIST = ['Fitting Lokal', 'Lem Ruglue', 'DFR'];

// ---- Routing ----------------------------------------------------------------
//
// NOTE (React port): the frontend is now a single self-contained bundle
// (Stylesheet.html, LayerPanel.html, ToolbarCounting.html and JavaScript.html
// are superseded - delete them from the Apps Script project). The React app
// is built with Vite + vite-plugin-singlefile into one index.html with all
// JS/CSS inlined, since HtmlService has no equivalent of a static /assets
// folder to serve separate bundle files from. Because there's nothing left
// to evaluate as a template (no <?!= ... ?> scriptlets), createHtmlOutputFromFile
// is used instead of createTemplateFromFile. See README.md for build steps.

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Count Tool')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================================
// 1. PROJECT & FOLDER
//    Folder Drive per project HANYA berisi 1 file JSON kecil (data hitungan).
//    Tidak ada file gambar yang pernah dibuat/disimpan di sini.
// ============================================================================

function getRootFolder_() {
  var it = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(ROOT_FOLDER_NAME);
}

function getOrCreateProjectFolder_(projectId) {
  var root = getRootFolder_();
  var it = root.getFoldersByName(projectId);
  if (it.hasNext()) return it.next();
  return root.createFolder(projectId);
}

/**
 * Buat project baru.
 * @param {Object} params { projectName, noMobil, kategori }
 */
function createProject(params) {
  if (!params || !params.noMobil) {
    throw new Error('No. Mobil wajib diisi.');
  }
  if (!params || KATEGORI_LIST.indexOf(params.kategori) === -1) {
    throw new Error('Kategori wajib dipilih: Fitting Lokal / Lem Ruglue / DFR.');
  }

  var projectId = 'proj_' + new Date().getTime();
  getOrCreateProjectFolder_(projectId);

  var project = {
    projectId: projectId,
    projectName: params.projectName || ('Project ' + projectId),
    noMobil: normalizePlat_(params.noMobil),
    kategori: params.kategori,
    tanggalHitung: formatTanggalISO_(new Date()),
    createdAt: new Date().toISOString(),
    layers: []
  };

  withProjectLock_(function () {
    saveProjectData_(projectId, project);
  });
  return project;
}

/**
 * Daftar semua project tersimpan (dipakai fitur "Buka Project").
 */
function listProjects() {
  var root = getRootFolder_();
  var folders = root.getFolders();
  var result = [];
  while (folders.hasNext()) {
    var f = folders.next();
    var data = loadProjectData(f.getName());
    if (data) {
      result.push({
        projectId: data.projectId,
        projectName: data.projectName,
        noMobil: data.noMobil,
        kategori: data.kategori,
        tanggalHitung: data.tanggalHitung,
        totalLayers: data.layers.length,
        totalCount: data.layers.reduce(function (s, l) { return s + (l.totalCount || 0); }, 0)
      });
    }
  }
  result.sort(function (a, b) { return a.projectId < b.projectId ? 1 : -1; }); // terbaru dulu
  return result;
}

/**
 * Ambil 1 project lengkap (dipakai fitur "Buka Project").
 * Catatan: layer akan ikut ter-load lengkap dengan totalCount & points,
 * TAPI tanpa foto (foto memang tidak pernah disimpan di server).
 */
function getProject(projectId) {
  var data = loadProjectData(projectId);
  if (!data) throw new Error('Project tidak ditemukan: ' + projectId);
  return data;
}

// ============================================================================
// 2. LAYER - REGISTRASI DATA SAJA (TANPA FOTO)
// ============================================================================

/**
 * Daftarkan metadata layer baru ke project. TIDAK menerima/menyimpan byte
 * gambar apapun - hanya nama file & dimensi (dipakai untuk skala marker).
 * Foto tetap 100% di browser pengguna (lihat JavaScript.html).
 * @param {string} projectId
 * @param {Array} meta [{ name, width, height }]
 */
function registerLayers(projectId, meta) {
  return withProjectLock_(function () {
    var project = loadProjectData(projectId);
    if (!project) throw new Error('Project tidak ditemukan: ' + projectId);

    var startOrder = project.layers.length;
    var newLayers = (meta || []).map(function (m, idx) {
      return {
        layerId: 'img_' + new Date().getTime() + '_' + idx,
        fileName: m.name,
        width: m.width || 0,
        height: m.height || 0,
        order: startOrder + idx + 1,
        totalCount: 0,
        points: []
      };
    });

    project.layers = project.layers.concat(newLayers);
    saveProjectData_(projectId, project);
    return newLayers;
  });
}

function deleteLayer(projectId, layerId) {
  return withProjectLock_(function () {
    var project = loadProjectData(projectId);
    if (!project) throw new Error('Project tidak ditemukan: ' + projectId);

    project.layers = project.layers.filter(function (l) { return l.layerId !== layerId; });
    saveProjectData_(projectId, project);
    return project;
  });
}

/**
 * Simpan progress hitung 1 layer (klik "Simpan", atau auto-save berkala).
 * @param {string} projectId
 * @param {Object} layer { layerId, points: [{id,label,x,y}] }
 */
function saveLayerPoints(projectId, layer) {
  return withProjectLock_(function () {
    var project = loadProjectData(projectId);
    if (!project) throw new Error('Project tidak ditemukan: ' + projectId);

    var idx = -1;
    for (var i = 0; i < project.layers.length; i++) {
      if (project.layers[i].layerId === layer.layerId) { idx = i; break; }
    }
    if (idx === -1) throw new Error('Layer tidak ditemukan: ' + layer.layerId);

    project.layers[idx].points = layer.points;
    project.layers[idx].totalCount = layer.points.length;
    saveProjectData_(projectId, project);
    return project.layers[idx];
  });
}

// ============================================================================
// 3. SAVE / LOAD PROJECT DATA (JSON kecil di Drive) + LOCKING
// ============================================================================

function getProjectJsonFile_(projectId, createIfMissing) {
  var folder = getOrCreateProjectFolder_(projectId);
  var fileName = '_project.json';
  var it = folder.getFilesByName(fileName);
  if (it.hasNext()) return it.next();
  if (!createIfMissing) return null;
  return folder.createFile(fileName, '{}', MimeType.PLAIN_TEXT);
}

/** Bungkus operasi baca-ubah-simpan project dengan lock supaya atomik. */
function withProjectLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function saveProjectData_(projectId, dataJson) {
  var file = getProjectJsonFile_(projectId, true);
  file.setContent(JSON.stringify(dataJson));
  return true;
}

function loadProjectData(projectId) {
  var file = getProjectJsonFile_(projectId, false);
  if (!file) return null;
  var raw = file.getBlob().getDataAsString();
  return raw ? JSON.parse(raw) : null;
}

// ============================================================================
// 4. EXPORT REKAP -> GOOGLE SHEETS
// ============================================================================

function getOrCreateRekapSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(SPREADSHEET_ID_PROP);
  var ss;

  if (id) {
    try {
      ss = SpreadsheetApp.openById(id);
    } catch (err) {
      ss = null;
    }
  }

  if (!ss) {
    ss = SpreadsheetApp.create('Rekap Count Tool');
    props.setProperty(SPREADSHEET_ID_PROP, ss.getId());
  }

  ensureSheetsExist_(ss); // selalu dipastikan lengkap, bukan cuma saat spreadsheet baru dibuat
  return ss;
}

function ensureSheetsExist_(ss) {
  var required = {
    'Count_Harian': ['Tanggal Hitung', 'No. Mobil', 'Kategori', 'Total Count', 'Project', 'Waktu Input'],
    'SPM_Summary': ['Tanggal SJ', 'No. Kendaraan', 'Kategori', 'Total Qty (BX)', 'Total Berat', 'Sumber File'],
    'Rekap_Compare': ['Tanggal CSV', 'No mobil', 'Kategori', 'Qty Counting', 'Total Qty QAD', 'Selisih', 'Tonase/ Berat', 'Keterangan'],
    'Resume_Harian': ['Tanggal', 'Rucika', 'DFR', 'Ruglue', 'Total', 'Rucika', 'DFR', 'Ruglue', 'Total', 'Rucika', 'Lonyx', 'Lem', 'Selisih', 'Rucika', 'LEM', 'Mobil']
  };

  Object.keys(required).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(required[name]);
      sheet.setFrozenRows(1);
    }
  });

  var def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
}

/**
 * Export rekap per-gambar untuk 1 project + catat/upsert ke Count_Harian.
 * Aman diklik berkali-kali - baris Count_Harian di-UPDATE (bukan ditumpuk).
 */
function exportToSheet(projectId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = loadProjectData(projectId);
    if (!data) throw new Error('Project tidak ditemukan: ' + projectId);

    var ss = getOrCreateRekapSpreadsheet_();

    // --- sheet detail khusus project ini (pakai projectId supaya tidak collision) ---
    var detailName = 'Detail_' + data.projectId;
    var detailSheet = ss.getSheetByName(detailName);
    if (detailSheet) ss.deleteSheet(detailSheet);
    detailSheet = ss.insertSheet(detailName);
    detailSheet.appendRow(['Nama File', 'Jumlah Objek', 'Tanggal']);

    var total = 0;
    data.layers.forEach(function (l) {
      detailSheet.appendRow([l.fileName, l.totalCount, data.tanggalHitung]);
      total += l.totalCount;
    });
    detailSheet.appendRow(['TOTAL', total, '']);
    detailSheet.setFrozenRows(1);

    // --- upsert ke Count_Harian (agregat harian, dipakai compare) ---
    var countSheet = ss.getSheetByName('Count_Harian');
    var values = countSheet.getDataRange().getValues();
    var rowIdx = -1; // 1-based row number di sheet
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === data.tanggalHitung &&
          values[i][1] === data.noMobil &&
          values[i][2] === data.kategori &&
          values[i][4] === data.projectName) {
        rowIdx = i + 1;
        break;
      }
    }
    var rowValues = [data.tanggalHitung, data.noMobil, data.kategori, total, data.projectName, new Date()];
    if (rowIdx === -1) {
      countSheet.appendRow(rowValues);
    } else {
      countSheet.getRange(rowIdx, 1, 1, rowValues.length).setValues([rowValues]);
    }

    return ss.getUrl();
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// 5. IMPORT SPM / SURAT JALAN
// ============================================================================

/**
 * Klasifikasi kategori dari baris file SPM.
 * Hanya UOM=BX yang dipakai; RUGLUE di nama barang -> Lem Ruglue,
 * sisanya diasumsikan Fitting Lokal.
 */
function classifyKategori_(namaBarang, uom) {
  if (uom !== 'BX') return null;
  var nama = String(namaBarang).toUpperCase();
  if (nama.indexOf('RUGLUE') !== -1) return 'Lem Ruglue';
  return 'Fitting Lokal';
}

/**
 * @return {{grouped:Array, matched:number, skipped:number}}
 */
function parseSpmFile_(fileContent) {
  var lines = String(fileContent || '').split('\n');
  var filtered = [];
  var skipped = 0;

  lines.forEach(function (line) {
    if (!line || line.indexOf('|') === -1) return;
    var cols = line.split('|').map(function (c) { return c.trim(); });
    if (cols.length < 21 || cols[0].indexOf('SJ') !== 0) { skipped++; return; }

    var tglSJ = cols[1];
    var namaBarang = cols[13];
    var qty = parseFloat(String(cols[14]).replace(/,/g, ''));
    var uom = cols[15];
    var berat = parseFloat(String(cols[16]).replace(/,/g, ''));
    var noKend = cols[20];

    var kategori = classifyKategori_(namaBarang, uom);
    if (kategori) {
      filtered.push({ tglSJ: tglSJ, noKend: noKend, kategori: kategori, qty: qty, berat: berat });
    } else {
      skipped++;
    }
  });

  return { grouped: groupByDateAndVehicle_(filtered), matched: filtered.length, skipped: skipped };
}

function groupByDateAndVehicle_(rows) {
  var map = {};
  rows.forEach(function (r) {
    var key = r.tglSJ + '|' + r.noKend + '|' + r.kategori;
    if (!map[key]) map[key] = { tglSJ: r.tglSJ, noKend: r.noKend, kategori: r.kategori, totalQty: 0, totalBerat: 0 };
    map[key].totalQty += r.qty;
    map[key].totalBerat += r.berat;
  });
  return Object.keys(map).map(function (k) { return map[k]; });
}

/**
 * Dipanggil dari toolbar "Import Data SPM - Fitting/Lem (TXT)".
 */
function importSpmFile(fileContent, fileName) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var parsed = parseSpmFile_(fileContent);
    var ss = getOrCreateRekapSpreadsheet_();
    var sheet = ss.getSheetByName('SPM_Summary');

    parsed.grouped.forEach(function (g) {
      sheet.appendRow([g.tglSJ, g.noKend, g.kategori, g.totalQty, g.totalBerat, fileName]);
    });

    runCompare_();
    buildResumeHarian_();

    var msg = parsed.grouped.length + ' baris SPM_Summary berhasil diimport dari ' + fileName;
    if (parsed.skipped > 0) {
      msg += ' (' + parsed.skipped + ' baris dilewati - format/kategori tidak cocok, cek file sumber)';
    }
    return msg;
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// 6. COMPARE: Count_Harian vs SPM_Summary -> Rekap_Compare
// ============================================================================

function normalizePlat_(plat) {
  return String(plat).toUpperCase().replace(/\s+/g, ' ').trim();
}

function parseTanggal_(v) {
  if (v instanceof Date) return v;
  var p = String(v).split('/');
  return new Date(p[2], p[0] - 1, p[1]);
}

function formatTanggal_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'MM/dd/yyyy');
}

function formatTanggalISO_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function buildKeterangan_(kategori, totalQtyQad, selisih, noMobil) {
  if (selisih === 0) return '';

  if (kategori === 'DFR') {
    return 'Selisih ' + selisih + ' - Blm Release / Ada DFR (cek manual)';
  }

  if (totalQtyQad === 0) {
    return noMobil; // tidak ketemu di SPM_Summary -> perlu dicek manual
  }

  return 'Selisih ' + selisih + ' pcs - cek ulang';
}

/** Wrapper terkunci - dipanggil langsung dari tombol UI. */
function runCompare() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return runCompare_();
  } finally {
    lock.releaseLock();
  }
}

/** Versi internal TANPA lock sendiri - dipakai saat sudah dipanggil dari fungsi yang sudah lock (mis. importSpmFile). */
function runCompare_() {
  var ss = getOrCreateRekapSpreadsheet_();
  var countData = ss.getSheetByName('Count_Harian').getDataRange().getValues().slice(1);
  var spmData = ss.getSheetByName('SPM_Summary').getDataRange().getValues().slice(1);
  var compareSheet = ss.getSheetByName('Rekap_Compare');

  var spmMap = {};
  spmData.forEach(function (r) {
    if (!r[0]) return;
    var key = String(r[0]).trim() + '|' + normalizePlat_(r[1]) + '|' + r[2];
    if (!spmMap[key]) spmMap[key] = { qty: 0, berat: 0 };
    spmMap[key].qty += Number(r[3]);
    spmMap[key].berat += Number(r[4]);
  });

  compareSheet.clear();
  compareSheet.appendRow(['Tanggal CSV', 'No mobil', 'Kategori', 'Qty Counting', 'Total Qty QAD', 'Selisih', 'Tonase/ Berat', 'Keterangan']);

  countData.forEach(function (row) {
    if (!row[0]) return;
    var tglHitung = parseTanggal_(row[0]);
    var noMobil = normalizePlat_(row[1]);
    var kategori = row[2];
    var qtyCounting = Number(row[3]);

    var tglCsv = new Date(tglHitung);
    tglCsv.setDate(tglCsv.getDate() + 1); // H+1
    var tglCsvStr = formatTanggal_(tglCsv);

    var key = tglCsvStr + '|' + noMobil + '|' + kategori;
    var spm = spmMap[key] || { qty: 0, berat: 0 };
    var totalQtyQad = kategori === 'DFR' ? 0 : spm.qty;
    var tonase = spm.berat;
    var selisih = qtyCounting - totalQtyQad;

    var keterangan = buildKeterangan_(kategori, totalQtyQad, selisih, noMobil);

    compareSheet.appendRow([tglCsvStr, noMobil, kategori, qtyCounting, totalQtyQad, selisih, tonase, keterangan]);
  });

  compareSheet.setFrozenRows(1);
  return compareSheet.getDataRange().getValues().length - 1;
}

// ============================================================================
// 7. RESUME HARIAN - rekap ringkas 1 baris per tanggal
// ============================================================================

function buildResumeHarian() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return buildResumeHarian_();
  } finally {
    lock.releaseLock();
  }
}

function buildResumeHarian_() {
  var ss = getOrCreateRekapSpreadsheet_();
  var countData = ss.getSheetByName('Count_Harian').getDataRange().getValues().slice(1);
  var spmData = ss.getSheetByName('SPM_Summary').getDataRange().getValues().slice(1);
  var resumeSheet = ss.getSheetByName('Resume_Harian');

  var daily = {};
  countData.forEach(function (row) {
    if (!row[0]) return;
    var tglD = formatTanggal_(parseTanggal_(row[0]));
    var noMobil = normalizePlat_(row[1]);
    var kategori = row[2];
    var qty = Number(row[3]);

    if (!daily[tglD]) daily[tglD] = { rucikaCount: 0, dfrCount: 0, ruglueCount: 0, mobilSet: {} };
    if (kategori === 'Fitting Lokal') daily[tglD].rucikaCount += qty;
    if (kategori === 'DFR') daily[tglD].dfrCount += qty;
    if (kategori === 'Lem Ruglue') daily[tglD].ruglueCount += qty;
    daily[tglD].mobilSet[noMobil] = true;
  });

  var qad = {};
  spmData.forEach(function (r) {
    if (!r[0]) return;
    var tglCsv = parseTanggal_(r[0]);
    var tglD = new Date(tglCsv);
    tglD.setDate(tglD.getDate() - 1);
    var tglDStr = formatTanggal_(tglD);
    var kategori = r[2];
    var qty = Number(r[3]);
    var berat = Number(r[4]);

    if (!qad[tglDStr]) qad[tglDStr] = { rucikaQad: 0, ruglueQad: 0, rucikaBerat: 0, ruglueBerat: 0 };
    if (kategori === 'Fitting Lokal') { qad[tglDStr].rucikaQad += qty; qad[tglDStr].rucikaBerat += berat; }
    if (kategori === 'Lem Ruglue') { qad[tglDStr].ruglueQad += qty; qad[tglDStr].ruglueBerat += berat; }
  });

  resumeSheet.clear();
  resumeSheet.appendRow([
    'Tanggal',
    'Rucika', 'DFR', 'Ruglue', 'Total',
    'Rucika', 'DFR', 'Ruglue', 'Total',
    'Rucika', 'Lonyx', 'Lem',
    'Selisih',
    'Rucika', 'LEM',
    'Mobil'
  ]);

  Object.keys(daily).sort().forEach(function (tgl) {
    var d = daily[tgl];
    var q = qad[tgl] || { rucikaQad: 0, ruglueQad: 0, rucikaBerat: 0, ruglueBerat: 0 };

    var checkerTotal = d.rucikaCount + d.dfrCount + d.ruglueCount;
    var qadDfr = 0;
    var qadTotal = q.rucikaQad + qadDfr + q.ruglueQad;

    var selisihRucika = d.rucikaCount - q.rucikaQad;
    var selisihLonyx = d.dfrCount - qadDfr;
    var selisihLem = d.ruglueCount - q.ruglueQad;
    var totalSelisih = selisihRucika + selisihLonyx + selisihLem;

    resumeSheet.appendRow([
      tgl,
      d.rucikaCount, d.dfrCount, d.ruglueCount, checkerTotal,
      q.rucikaQad, qadDfr, q.ruglueQad, qadTotal,
      selisihRucika, selisihLonyx, selisihLem,
      totalSelisih,
      q.rucikaBerat, q.ruglueBerat,
      Object.keys(d.mobilSet).length
    ]);
  });

  resumeSheet.setFrozenRows(1);
  return resumeSheet.getDataRange().getValues().length - 1;
}

// ============================================================================
// 8. FOLDER WATCHER (opsional, tidak berubah)
// ============================================================================

var SPM_WATCH_FOLDER_PROP = 'SPM_WATCH_FOLDER_ID';
var SPM_PROCESSED_PREFIX = 'spm_processed_';

function setupSpmTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkNewSpmFile') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkNewSpmFile')
    .timeBased()
    .everyMinutes(30)
    .create();
}

function checkNewSpmFile() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty(SPM_WATCH_FOLDER_PROP);
  if (!folderId) return;

  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFiles();

  while (files.hasNext()) {
    var file = files.next();
    var flagKey = SPM_PROCESSED_PREFIX + file.getId();
    if (props.getProperty(flagKey)) continue;

    var content = file.getBlob().getDataAsString();
    importSpmFile(content, file.getName());
    props.setProperty(flagKey, 'true');
  }
}
