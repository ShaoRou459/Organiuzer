const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, net, screen } = require('electron');
const path = require('path');
const { findDuplicates, recycleDuplicates } = require('./duplicates');
const fs = require('fs-extra');
const Store = require('electron-store').default;
const { analyzeFiles, testConnection, suggestFileName } = require('./ai');
const { listRenameCandidates, buildRenameSuggestions, finishRenameSuggestions, applyRenameSuggestions } = require('./renaming');
const { scanDocumentVersions, recycleDocumentVersions, compareDocumentVersions, releaseDocumentVersionScan } = require('./documentVersions');
const { searchDocuments, clearDocumentSearchCache } = require('./documentSearch');
const { BUILTIN_PRESETS, validatePreset, buildPresetPlan } = require('./cleanupPresets');

const store = new Store();
let mainWindow = null;

const MAX_RUN_HISTORY = 30;
const MAX_RECENT_FOLDERS = 8;
const CASE_INSENSITIVE_FS = process.platform === 'win32' || process.platform === 'darwin';
const GITHUB_REPO = 'ShaoRou459/Organiuzer';

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

/** Run an async mapper over a list with bounded concurrency, preserving order. */
async function mapLimit(list, limit, mapper) {
  const results = new Array(list.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (cursor < list.length) {
      const index = cursor++;
      results[index] = await mapper(list[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

const normalizeNameKey = (value) => {
  const trimmed = String(value || '').trim();
  return CASE_INSENSITIVE_FS ? trimmed.toLowerCase() : trimmed;
};

const normalizePathKey = (value) => {
  const resolved = path.resolve(String(value || ''));
  return CASE_INSENSITIVE_FS ? resolved.toLowerCase() : resolved;
};

const pathsEqual = (a, b) => normalizePathKey(a) === normalizePathKey(b);

const isSubPath = (parent, child) => {
  const parentKey = normalizePathKey(parent);
  const childKey = normalizePathKey(child);
  return childKey.startsWith(parentKey.endsWith(path.sep) ? parentKey : parentKey + path.sep);
};

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** A single path segment that is safe to create/move on every desktop OS. */
function isUnsafeName(name) {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 255) return true;
  if (trimmed === '.' || trimmed === '..') return true;
  if (/[\\/<>:"|?*\u0000-\u001f]/.test(trimmed)) return true;
  if (process.platform === 'win32') {
    if (WINDOWS_RESERVED.test(trimmed)) return true;
    if (/[. ]$/.test(name)) return true;
  }
  return false;
}

const safeSend = (sender, channel, payload) => {
  try {
    if (sender && !sender.isDestroyed()) sender.send(channel, payload);
  } catch {
    // Renderer went away; progress events are best-effort.
  }
};

// ---------------------------------------------------------------------------
// Settings (whitelisted) + encrypted API key
// ---------------------------------------------------------------------------

const PUBLIC_SETTING_KEYS = ['provider', 'baseUrl', 'model', 'renameModel', 'debugMode', 'themeMode', 'seedColor'];
const SETTING_VALIDATORS = {
  provider: (v) => (v === 'custom' ? 'custom' : 'openai'),
  baseUrl: (v) => {
    const s = String(v || '').trim();
    if (!s) return '';
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:' ? s : '';
    } catch {
      return '';
    }
  },
  model: (v) => String(v || '').trim().slice(0, 120) || 'gpt-4o',
  renameModel: (v) => String(v || '').trim().slice(0, 120),
  debugMode: (v) => v === true,
  themeMode: (v) => (['light', 'dark', 'system'].includes(v) ? v : 'system'),
  seedColor: (v) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v) : '#6750A4'),
};

function canEncrypt() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function getApiKey() {
  const enc = store.get('apiKeyEnc');
  if (enc) {
    try {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'));
    } catch {
      return '';
    }
  }
  const plain = store.get('apiKey');
  if (plain && canEncrypt()) {
    // One-time migration of a legacy plaintext key.
    setApiKey(plain);
  }
  return plain || '';
}

function setApiKey(value) {
  const key = String(value || '').trim();
  if (!key) {
    store.delete('apiKeyEnc');
    store.delete('apiKey');
    return;
  }
  if (canEncrypt()) {
    store.set('apiKeyEnc', safeStorage.encryptString(key).toString('base64'));
    store.delete('apiKey');
  } else {
    store.set('apiKey', key);
  }
}

function getPublicSettings() {
  const result = {};
  for (const key of PUBLIC_SETTING_KEYS) {
    const raw = store.get(key);
    result[key] = SETTING_VALIDATORS[key](raw);
  }
  if (store.get('themeMode') === undefined) result.themeMode = 'system';
  const apiKey = getApiKey();
  result.hasApiKey = Boolean(apiKey);
  result.apiKeyHint = apiKey ? `••••${apiKey.slice(-4)}` : '';
  return result;
}

/** Settings used by the AI layer (includes the decrypted key, never sent to the renderer). */
function getAiSettings(overrides = {}) {
  const base = getPublicSettings();
  const merged = { ...base, apiKey: getApiKey() };
  if (overrides && typeof overrides === 'object') {
    for (const key of ['provider', 'baseUrl', 'model']) {
      if (overrides[key] !== undefined) merged[key] = SETTING_VALIDATORS[key](overrides[key]);
    }
    if (typeof overrides.apiKey === 'string' && overrides.apiKey.trim()) merged.apiKey = overrides.apiKey.trim();
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Category folders, run history, recent folders
// ---------------------------------------------------------------------------

function getCategoryFoldersForPath(dirPath) {
  const map = store.get('categoryFoldersByPath', {}) || {};
  const list = map[dirPath];
  return Array.isArray(list) ? list.filter((v) => typeof v === 'string' && v.trim().length > 0) : [];
}

function setCategoryFoldersForPath(dirPath, folders) {
  const map = store.get('categoryFoldersByPath', {}) || {};
  const unique = Array.from(new Set((folders || []).map((v) => String(v).trim()).filter(Boolean))).slice(0, 200);
  map[dirPath] = unique;
  store.set('categoryFoldersByPath', map);
  return unique;
}

async function refreshCategoryFolders(dirPath) {
  if (!dirPath) return;
  const existing = getCategoryFoldersForPath(dirPath);
  const kept = [];
  for (const name of existing) {
    if (await fs.pathExists(path.join(dirPath, name)).catch(() => false)) kept.push(name);
  }
  setCategoryFoldersForPath(dirPath, kept);
}

function getRunHistory() {
  const runs = store.get('sortingRuns', []);
  return Array.isArray(runs) ? runs : [];
}

function addRunHistory(entry) {
  const updated = [entry, ...getRunHistory()].slice(0, MAX_RUN_HISTORY);
  store.set('sortingRuns', updated);
  return updated;
}

function getRecentFolders() {
  const list = store.get('recentFolders', []);
  return Array.isArray(list) ? list.filter((v) => typeof v === 'string') : [];
}

function addRecentFolder(dirPath) {
  if (!dirPath) return getRecentFolders();
  const key = normalizePathKey(dirPath);
  const updated = [dirPath, ...getRecentFolders().filter((p) => normalizePathKey(p) !== key)].slice(0, MAX_RECENT_FOLDERS);
  store.set('recentFolders', updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function getSavedBounds() {
  const saved = store.get('windowState');
  if (!saved || typeof saved !== 'object') return { width: 1240, height: 860 };
  const { width = 1240, height = 860, x, y } = saved;
  const bounds = { width: Math.max(900, width), height: Math.max(640, height) };
  if (Number.isFinite(x) && Number.isFinite(y)) {
    // Only restore the position if it is still on a connected display.
    const visible = screen.getAllDisplays().some(({ workArea: a }) =>
      x >= a.x - 50 && y >= a.y - 50 && x < a.x + a.width && y < a.y + a.height);
    if (visible) Object.assign(bounds, { x, y });
  }
  return bounds;
}

function initialBackground() {
  const mode = store.get('themeMode') || 'system';
  const { nativeTheme } = require('electron');
  const dark = mode === 'dark' || (mode === 'system' && nativeTheme.shouldUseDarkColors);
  return dark ? '#141218' : '#FEF7FF';
}

function createWindow() {
  const bounds = getSavedBounds();
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: initialBackground(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (store.get('windowState')?.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Persist size/position so the app reopens where the user left it.
  let saveTimer = null;
  const saveState = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const maximized = mainWindow.isMaximized();
      const b = maximized ? (store.get('windowState') || {}) : mainWindow.getBounds();
      store.set('windowState', { ...b, maximized });
    }, 300);
  };
  mainWindow.on('resize', saveState);
  mainWindow.on('move', saveState);

  const sendMaxState = () => safeSend(mainWindow?.webContents, 'window:maximized-changed', mainWindow?.isMaximized() || false);
  mainWindow.on('maximize', () => { sendMaxState(); saveState(); });
  mainWindow.on('unmaximize', () => { sendMaxState(); saveState(); });

  // Never open new Electron windows; send http(s) links to the default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL();
    if (url !== current) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url) && !url.startsWith('http://127.0.0.1:5173')) shell.openExternal(url);
    }
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    // Match Vite dev server host to avoid CSP + HMR hostname mismatches.
    mainWindow.loadURL('http://127.0.0.1:5173').catch((err) => console.error('Failed to load Vite dev server:', err));
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// IPC: window + shell
// ---------------------------------------------------------------------------

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() || false);

ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('fs:isDirectory', async (_event, target) => {
  if (typeof target !== 'string' || !path.isAbsolute(target)) return false;
  try {
    return (await fs.stat(target)).isDirectory();
  } catch {
    return false;
  }
});

ipcMain.handle('shell:openPath', async (_event, target) => {
  if (typeof target !== 'string' || !path.isAbsolute(target)) return false;
  if (!(await fs.pathExists(target))) return false;
  const error = await shell.openPath(target);
  return !error;
});

ipcMain.handle('shell:showItem', async (_event, target) => {
  if (typeof target !== 'string' || !path.isAbsolute(target)) return false;
  if (!(await fs.pathExists(target))) return false;
  shell.showItemInFolder(target);
  return true;
});

ipcMain.handle('shell:openExternal', async (_event, url) => {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return false;
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  name: app.getName(),
  repoUrl: `https://github.com/${GITHUB_REPO}`,
}));

ipcMain.handle('app:checkUpdate', async () => {
  try {
    const res = await net.fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Organiuzer' },
    });
    if (res.status === 404) return { status: 'unreleased' };
    if (!res.ok) return { status: 'error' };
    const data = await res.json();
    const latest = String(data?.tag_name || '').replace(/^v/, '');
    if (!latest) return { status: 'unreleased' };
    const newer = compareVersions(latest, app.getVersion()) > 0;
    return { status: newer ? 'available' : 'current', latest, url: data?.html_url || `https://github.com/${GITHUB_REPO}/releases/latest` };
  } catch {
    return { status: 'error' };
  }
});

function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// IPC: settings
// ---------------------------------------------------------------------------

ipcMain.handle('settings:get', (_event, key) => {
  if (!PUBLIC_SETTING_KEYS.includes(key)) return undefined;
  return getPublicSettings()[key];
});

ipcMain.handle('settings:getAll', () => getPublicSettings());

ipcMain.handle('settings:save', (_event, patch) => {
  if (!patch || typeof patch !== 'object') return getPublicSettings();
  for (const key of PUBLIC_SETTING_KEYS) {
    if (patch[key] !== undefined) store.set(key, SETTING_VALIDATORS[key](patch[key]));
  }
  if (patch.clearApiKey === true) setApiKey('');
  else if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) setApiKey(patch.apiKey);
  return getPublicSettings();
});

ipcMain.handle('ai:test', async (_event, overrides) => {
  try {
    return await testConnection(getAiSettings(overrides));
  } catch (e) {
    return { ok: false, error: e?.message || 'Connection failed.' };
  }
});

// Category folders (per directory)
ipcMain.handle('categories:get', (_event, dirPath) => getCategoryFoldersForPath(dirPath));
ipcMain.handle('categories:set', (_event, dirPath, folders) => setCategoryFoldersForPath(dirPath, folders));

// Recent folders
ipcMain.handle('folders:recent:get', async () => {
  const list = getRecentFolders();
  const existing = await mapLimit(list, 8, (p) => fs.pathExists(p).catch(() => false));
  return list.filter((_, i) => existing[i]);
});
ipcMain.handle('folders:recent:add', (_event, dirPath) => {
  if (typeof dirPath !== 'string' || !path.isAbsolute(dirPath)) return getRecentFolders();
  return addRecentFolder(dirPath);
});

// ---------------------------------------------------------------------------
// IPC: scanning
// ---------------------------------------------------------------------------

// Project markers to detect project types
const PROJECT_MARKERS = new Set([
  'package.json', 'Cargo.toml', 'pyproject.toml', 'setup.py', 'requirements.txt',
  'go.mod', 'Makefile', 'CMakeLists.txt', 'pom.xml', 'build.gradle',
  '.git', '.gitignore', 'README.md', 'README', 'LICENSE', 'Dockerfile',
  '.vscode', '.idea', 'tsconfig.json', 'vite.config.js', 'webpack.config.js',
]);
const HEAVY_DIRS = new Set(['node_modules', '.git', 'venv', '.venv', '__pycache__', 'target', 'dist', 'build']);

const MAX_SCAN_DEPTH = 3;
const MAX_FILES_TO_SCAN = 500;

/**
 * Lightweight summary of a folder's contents for the AI (file count, top extensions,
 * project markers). Uses Dirent types so no stat() call is needed per entry.
 */
async function getFolderContext(folderPath) {
  const stats = { fileCount: 0, extensionCounts: {}, markers: [], scanned: 0 };

  async function walk(dir, depth) {
    if (depth > MAX_SCAN_DEPTH || stats.scanned >= MAX_FILES_TO_SCAN) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (stats.scanned >= MAX_FILES_TO_SCAN) break;
      const name = entry.name;
      if (depth === 0 && PROJECT_MARKERS.has(name) && stats.markers.length < 5) stats.markers.push(name);
      if (name.startsWith('.')) continue;
      if (entry.isFile()) {
        stats.fileCount++;
        stats.scanned++;
        const ext = path.extname(name).toLowerCase() || '(no ext)';
        stats.extensionCounts[ext] = (stats.extensionCounts[ext] || 0) + 1;
      } else if (entry.isDirectory() && !HEAVY_DIRS.has(name)) {
        await walk(path.join(dir, name), depth + 1);
      }
    }
  }

  await walk(folderPath, 0);
  return {
    fileCount: stats.fileCount,
    topExtensions: Object.entries(stats.extensionCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([ext]) => ext),
    markers: stats.markers,
    truncated: stats.scanned >= MAX_FILES_TO_SCAN,
  };
}

ipcMain.handle('folder:scan', async (_event, dirPath, opts = {}) => {
  const withContext = opts?.context !== false;
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const results = await mapLimit(entries, 12, async (entry) => {
    const name = entry.name;
    const fullPath = path.join(dirPath, name);
    const hidden = name.startsWith('.');
    try {
      if (entry.isDirectory()) {
        const context = withContext ? await getFolderContext(fullPath) : null;
        return { name, type: 'folder', context, ...(hidden && { hidden: true }) };
      }
      if (entry.isFile() || entry.isSymbolicLink()) {
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) return { name, type: 'folder', context: null, ...(hidden && { hidden: true }) };
        return { name, type: 'file', size: stat.size, modified: stat.mtimeMs, ...(hidden && { hidden: true }) };
      }
    } catch {
      // Inaccessible entry; leave it out.
    }
    return null;
  });
  return results.filter(Boolean);
});

// Presets contain local file rules. A preview uses fresh filesystem entries,
// then shares the existing reviewed, validated move/rollback flow.
function getCleanupPresets() {
  const saved = store.get('cleanupPresets', []);
  const valid = [];
  for (const item of Array.isArray(saved) ? saved : []) {
    try { valid.push(validatePreset(item)); } catch { /* Ignore malformed legacy entries. */ }
  }
  return [...BUILTIN_PRESETS, ...valid.slice(0, 12)];
}
ipcMain.handle('presets:get', (_event, dirPath) => ({ ok: true, presets: getCleanupPresets(), selectedId: store.get('cleanupPresetByPath', {})?.[normalizePathKey(dirPath)] || 'downloads' }));
ipcMain.handle('presets:save', (_event, dirPath, raw) => {
  try {
    if (typeof dirPath !== 'string' || !path.isAbsolute(dirPath)) throw new Error('Choose a valid folder.');
    const preset = validatePreset(raw);
    const saved = getCleanupPresets().filter(item => !BUILTIN_PRESETS.some(b => b.id === item.id));
    if (BUILTIN_PRESETS.some(item => item.id === preset.id) || !preset.id) preset.id = `saved_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const index = saved.findIndex(item => item.id === preset.id);
    if (index < 0 && saved.length >= 12) throw new Error('You can save up to 12 presets. Edit an existing saved preset.');
    if (index < 0) saved.push(preset); else saved[index] = preset;
    store.set('cleanupPresets', saved);
    const byPath = store.get('cleanupPresetByPath', {});
    byPath[normalizePathKey(dirPath)] = preset.id;
    store.set('cleanupPresetByPath', byPath);
    return { ok: true, preset, presets: getCleanupPresets() };
  } catch (error) { return { ok: false, error: error.message }; }
});
ipcMain.handle('presets:preview', async (_event, dirPath, raw) => {
  try {
    if (typeof dirPath !== 'string' || !path.isAbsolute(dirPath)) throw new Error('Choose a valid folder.');
    const rootStat = await fs.lstat(dirPath);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Choose a regular folder.');
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = await mapLimit(entries, 12, async entry => {
      const stat = await fs.lstat(path.join(dirPath, entry.name)).catch(() => null);
      return stat && { name: entry.name, type: stat.isDirectory() ? 'folder' : 'file', link: stat.isSymbolicLink(), hidden: entry.name.startsWith('.') };
    });
    return { ok: true, ...buildPresetPlan(files.filter(Boolean), raw) };
  } catch (error) { return { ok: false, error: error.message }; }
});

// Each renderer owns its cancellable document scans and trusted cleanup token.
const documentOperations = new Map();
const documentSessions = new Map();
const documentRecycling = new Set();
const documentSenders = new Set();
function trackDocumentSender(sender) {
  if (documentSenders.has(sender.id)) return;
  documentSenders.add(sender.id);
  sender.once('destroyed', () => {
    documentOperations.get(`versions:${sender.id}`)?.abort();
    documentOperations.get(`search:${sender.id}`)?.abort();
    documentOperations.delete(`versions:${sender.id}`);
    documentOperations.delete(`search:${sender.id}`);
    releaseDocumentVersionScan?.(documentSessions.get(sender.id)?.scanId);
    clearDocumentSearchCache?.();
    documentSessions.delete(sender.id);
    documentSenders.delete(sender.id);
  });
}
async function runDocumentOperation(event, kind, dirPath, requestId, operation) {
  if (typeof dirPath !== 'string' || !path.isAbsolute(dirPath)) return { ok: false, error: 'Choose a valid folder.' };
  const key = `${kind}:${event.sender.id}`;
  documentOperations.get(key)?.abort();
  trackDocumentSender(event.sender);
  const controller = new AbortController();
  documentOperations.set(key, controller);
  let lastProgress = 0;
  try {
    const response = await operation(controller.signal, progress => {
      if (controller.signal.aborted || Date.now() - lastProgress < 100) return;
      lastProgress = Date.now();
      safeSend(event.sender, `documents:${kind}:progress`, { ...progress, rootPath: dirPath, requestId });
    });
    if (controller.signal.aborted) { if (kind === 'versions') releaseDocumentVersionScan?.(response.scanId); return { ok: false, cancelled: true }; }
    return { ok: true, ...response };
  } catch (error) {
    return controller.signal.aborted || error?.name === 'AbortError' ? { ok: false, cancelled: true } : { ok: false, error: error?.message || 'Couldn’t read documents.' };
  } finally { if (documentOperations.get(key) === controller) documentOperations.delete(key); }
}
ipcMain.handle('documents:versions:scan', async (event, dirPath, requestId) => {
  if (documentRecycling.has(event.sender.id)) return { ok: false, error: 'Wait for recycling to finish.' };
  releaseDocumentVersionScan?.(documentSessions.get(event.sender.id)?.scanId);
  documentSessions.delete(event.sender.id);
  const result = await runDocumentOperation(event, 'versions', dirPath, requestId, (signal, onProgress) => scanDocumentVersions(dirPath, { signal, onProgress }));
  if (result.ok) documentSessions.set(event.sender.id, { rootPath: path.resolve(dirPath), scanId: result.scanId });
  return result;
});
ipcMain.handle('documents:versions:cancel', event => {
  documentOperations.get(`versions:${event.sender.id}`)?.abort();
  releaseDocumentVersionScan?.(documentSessions.get(event.sender.id)?.scanId);
  documentSessions.delete(event.sender.id);
  return { ok: true };
});
function documentSessionMatches(senderId, dirPath, scanId) {
  const session = documentSessions.get(senderId);
  return typeof dirPath === 'string' && session && pathsEqual(session.rootPath, dirPath) && session.scanId === scanId;
}
ipcMain.handle('documents:versions:recycle', async (event, dirPath, scanId, selectedIds) => {
  if (!documentSessionMatches(event.sender.id, dirPath, scanId)) return { ok: false, error: 'Scan this folder again before recycling versions.' };
  if (documentOperations.has(`versions:${event.sender.id}`) || documentRecycling.has(event.sender.id)) return { ok: false, error: 'Wait for the current operation to finish.' };
  documentRecycling.add(event.sender.id);
  try { return { ok: true, ...await recycleDocumentVersions({ rootPath: dirPath, scanId, selectedIds, trashItem: file => shell.trashItem(file) }) }; }
  catch (error) { return { ok: false, error: error.message }; }
  finally { documentRecycling.delete(event.sender.id); }
});
ipcMain.handle('documents:versions:compare', async (event, dirPath, scanId, leftId, rightId) => {
  if (!documentSessionMatches(event.sender.id, dirPath, scanId)) return { ok: false, error: 'Scan this folder again before comparing versions.' };
  if (documentRecycling.has(event.sender.id)) return { ok: false, error: 'Wait for recycling to finish.' };
  try { return { ok: true, ...await compareDocumentVersions({ rootPath: dirPath, scanId, leftId, rightId }) }; }
  catch (error) { return { ok: false, error: error.message }; }
});
ipcMain.handle('documents:search', (event, dirPath, query, requestId) => runDocumentOperation(event, 'search', dirPath, requestId, (signal, onProgress) => searchDocuments(dirPath, query, { signal, onProgress })));
ipcMain.handle('documents:search:cancel', event => { documentOperations.get(`search:${event.sender.id}`)?.abort(); clearDocumentSearchCache?.(); return { ok: true }; });

// ---------------------------------------------------------------------------
// IPC: duplicates
// ---------------------------------------------------------------------------

const activeDuplicateScans = new Map();
const duplicateSessions = new Map();
const activeDuplicateRecycling = new Set();
const duplicateSenders = new Set();

function trackDuplicateSender(sender) {
  if (duplicateSenders.has(sender.id)) return;
  duplicateSenders.add(sender.id);
  sender.once('destroyed', () => {
    activeDuplicateScans.get(sender.id)?.abort();
    activeDuplicateScans.delete(sender.id);
    duplicateSessions.delete(sender.id);
    duplicateSenders.delete(sender.id);
  });
}

ipcMain.handle('folder:findDuplicates', async (event, dirPath, recursive = true, requestId) => {
  const senderId = event.sender.id;
  if (activeDuplicateRecycling.has(senderId)) return { ok: false, error: 'Wait for recycling to finish before scanning again.' };
  activeDuplicateScans.get(senderId)?.abort();
  duplicateSessions.delete(senderId);
  if (typeof dirPath !== 'string' || !path.isAbsolute(dirPath)) return { ok: false, error: 'Choose a valid folder first.' };
  trackDuplicateSender(event.sender);
  const controller = new AbortController();
  activeDuplicateScans.set(senderId, controller);
  let lastProgressAt = 0;
  try {
    const result = await findDuplicates(dirPath, {
      recursive: recursive !== false,
      signal: controller.signal,
      onProgress: (progress) => {
        const now = Date.now();
        if (now - lastProgressAt < 100 && progress.phase !== 'complete') return;
        lastProgressAt = now;
        if (!controller.signal.aborted) safeSend(event.sender, 'folder:findDuplicates:progress', { ...progress, rootPath: dirPath, requestId });
      },
    });
    if (controller.signal.aborted) return { ok: false, cancelled: true };
    duplicateSessions.set(senderId, { rootPath: path.resolve(dirPath), groups: result.groups });
    return { ok: true, ...result };
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') return { ok: false, cancelled: true };
    return { ok: false, error: error?.message || 'Couldn’t scan this folder.' };
  } finally {
    if (activeDuplicateScans.get(senderId) === controller) activeDuplicateScans.delete(senderId);
  }
});

ipcMain.handle('folder:findDuplicates:cancel', (event) => {
  activeDuplicateScans.get(event.sender.id)?.abort();
  duplicateSessions.delete(event.sender.id);
  return { ok: true };
});

// Only recycle files in a trusted scan, rechecking contents and the retained copy.
ipcMain.handle('folder:deleteFiles', async (event, dirPath, filesToDelete) => {
  const senderId = event.sender.id;
  const refused = (message) => ({ success: 0, failed: Array.isArray(filesToDelete) ? filesToDelete.length : 0, recycledPaths: [], errors: [message] });
  const session = duplicateSessions.get(senderId);
  if (typeof dirPath !== 'string' || !Array.isArray(filesToDelete)) return refused('Invalid request.');
  if (!session || !pathsEqual(session.rootPath, dirPath)) return refused('Scan this folder for duplicates before recycling copies.');
  if (activeDuplicateScans.has(senderId) || activeDuplicateRecycling.has(senderId)) return refused('Wait for the current operation to finish.');
  activeDuplicateRecycling.add(senderId);
  try {
    return await recycleDuplicates({ rootPath: session.rootPath, groups: session.groups, selectedPaths: filesToDelete, trashItem: (file) => shell.trashItem(file) });
  } finally {
    activeDuplicateRecycling.delete(senderId);
  }
});

// ---------------------------------------------------------------------------
// IPC: AI analysis (cancellable)
// ---------------------------------------------------------------------------

const activeRenames = new Map();
const renameSessions = new Map();
const renameApplying = new Set();
const renameSenders = new Set();

function trackRenameSender(sender) {
  if (renameSenders.has(sender.id)) return;
  renameSenders.add(sender.id);
  sender.once('destroyed', () => {
    activeRenames.get(sender.id)?.abort();
    activeRenames.delete(sender.id);
    renameSessions.delete(sender.id);
    renameSenders.delete(sender.id);
  });
}

ipcMain.handle('folder:rename:candidates', async (event, dirPath) => {
  const senderId = event.sender.id;
  if (renameApplying.has(senderId)) return { ok: false, error: 'Wait for renaming to finish.' };
  activeRenames.get(senderId)?.abort();
  renameSessions.delete(senderId);
  if (typeof dirPath !== 'string' || !path.isAbsolute(dirPath)) return { ok: false, error: 'Choose a valid folder.' };
  trackRenameSender(event.sender);
  const controller = new AbortController();
  activeRenames.set(senderId, controller);
  try {
    const result = await listRenameCandidates(dirPath, { signal: controller.signal });
    if (controller.signal.aborted) return { ok: false, cancelled: true };
    renameSessions.set(senderId, { rootPath: path.resolve(dirPath), ...result });
    return { ok: true, candidates: result.candidates, skipped: result.skipped };
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') return { ok: false, cancelled: true };
    return { ok: false, error: error?.message || 'Couldn’t check filenames.' };
  } finally {
    if (activeRenames.get(senderId) === controller) activeRenames.delete(senderId);
  }
});

ipcMain.handle('folder:rename:suggest', async (event, dirPath, selectedIds, requestId, options = {}) => {
  const senderId = event.sender.id;
  const session = renameSessions.get(senderId);
  if (typeof dirPath !== 'string' || !session || !pathsEqual(dirPath, session.rootPath) || !Array.isArray(selectedIds)) return { ok: false, error: 'Check filenames in this folder first.' };
  if (renameApplying.has(senderId) || activeRenames.has(senderId)) return { ok: false, error: 'Wait for the current operation to finish.' };
  const selected = new Set(selectedIds);
  const candidates = session.candidates.filter(row => selected.has(row.id));
  if (!candidates.length || candidates.length !== selected.size) return { ok: false, error: 'Select files from the current list.' };
  const controller = new AbortController();
  activeRenames.set(senderId, controller);
  delete session.suggestions;
  try {
    const result = await buildRenameSuggestions(session.rootPath, {
      candidates, trustSnapshot: session.trustSnapshot, signal: controller.signal,
      deferAi: true, localOnly: options?.localOnly === true,
      onProgress: progress => {
        if (!controller.signal.aborted) safeSend(event.sender, 'folder:rename:progress', { phase: progress.phase, total: progress.total, completed: progress.completed ?? progress.processed ?? 0, rootPath: dirPath, requestId });
      },
    });
    if (controller.signal.aborted) return { ok: false, cancelled: true };
    const settings = getPublicSettings();
    const aiModel = settings.renameModel || (settings.provider === 'openai' && !settings.baseUrl ? 'gpt-4o-mini' : settings.model);
    const aiProvider = settings.baseUrl || (settings.provider === 'openai' ? 'OpenAI' : 'your configured provider');
    renameSessions.set(senderId, { ...session, suggestions: result.suggestions, prepared: result, aiModel, aiProvider, trustSnapshot: result.trustSnapshot });
    return { ok: true, suggestions: result.suggestions, pendingAi: result.pendingAi, skipped: result.skipped, aiProvider, aiModel };
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') return { ok: false, cancelled: true };
    return { ok: false, error: error?.message || 'Couldn’t suggest filenames.' };
  } finally {
    if (activeRenames.get(senderId) === controller) activeRenames.delete(senderId);
  }
});

ipcMain.handle('folder:rename:ai', async (event, dirPath, selectedIds, requestId) => {
  const senderId = event.sender.id;
  const session = renameSessions.get(senderId);
  if (typeof dirPath !== 'string' || !session?.prepared || !pathsEqual(dirPath, session.rootPath) || !Array.isArray(selectedIds)) return { ok: false, error: 'Prepare document excerpts first.' };
  if (session.prepared.localOnly) return { ok: false, error: 'Local-only mode does not send content to AI.' };
  if (renameApplying.has(senderId) || activeRenames.has(senderId)) return { ok: false, error: 'Wait for the current operation to finish.' };
  const settings = getAiSettings();
  const currentModel = settings.renameModel || (settings.provider === 'openai' && !settings.baseUrl ? 'gpt-4o-mini' : settings.model);
  const currentProvider = settings.baseUrl || (settings.provider === 'openai' ? 'OpenAI' : 'your configured provider');
  if (currentModel !== session.aiModel || currentProvider !== session.aiProvider) return { ok: false, error: 'AI settings changed. Start over to preview the new destination.' };
  settings.model = session.aiModel;
  const controller = new AbortController();
  activeRenames.set(senderId, controller);
  try {
    const result = await finishRenameSuggestions(session.rootPath, {
      prepared: session.prepared, selectedIds, signal: controller.signal,
      suggestName: file => suggestFileName(file, settings, { signal: controller.signal }),
      onProgress: progress => { if (!controller.signal.aborted) safeSend(event.sender, 'folder:rename:progress', { phase: 'ai', total: progress.total, completed: progress.processed, rootPath: dirPath, requestId }); },
    });
    if (controller.signal.aborted) return { ok: false, cancelled: true };
    renameSessions.set(senderId, { ...session, suggestions: result.suggestions, prepared: null });
    return { ok: true, suggestions: result.suggestions, skipped: result.skipped };
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') return { ok: false, cancelled: true };
    return { ok: false, error: error?.message || 'Couldn’t suggest filenames.' };
  } finally {
    if (activeRenames.get(senderId) === controller) activeRenames.delete(senderId);
  }
});

ipcMain.handle('folder:rename:cancel', (event) => {
  activeRenames.get(event.sender.id)?.abort();
  renameSessions.delete(event.sender.id);
  return { ok: true };
});

ipcMain.handle('folder:rename:apply', async (event, dirPath, selected) => {
  const senderId = event.sender.id;
  const session = renameSessions.get(senderId);
  if (typeof dirPath !== 'string' || !session?.suggestions || !pathsEqual(dirPath, session.rootPath) || !Array.isArray(selected)) return { ok: false, error: 'Generate filename suggestions for this folder first.' };
  if (renameApplying.has(senderId) || activeRenames.has(senderId)) return { ok: false, error: 'Wait for the current operation to finish.' };
  renameApplying.add(senderId);
  try {
    const result = await applyRenameSuggestions(session.rootPath, { suggestions: session.suggestions, trustSnapshot: session.trustSnapshot, selected });
    let run;
    if (result.moves?.length) {
      const timestamp = Date.now();
      run = { id: `rename_${timestamp}_${Math.random().toString(36).slice(2, 8)}`, kind: 'rename', dirPath: session.rootPath, timestamp, categories: [], moved: result.moves.length, total: selected.length, warnings: result.errors?.length || 0, moves: result.moves, createdDirs: [] };
      addRunHistory(run);
      addRecentFolder(session.rootPath);
      renameSessions.delete(senderId);
    }
    return { ...result, renamed: result.moves?.length || 0, run };
  } catch (error) {
    return { ok: false, error: error?.message || 'Couldn’t rename files.' };
  } finally {
    renameApplying.delete(senderId);
  }
});

const activeAnalyses = new Map(); // webContents.id -> AbortController

ipcMain.handle('folder:analyze', async (event, dirPath, files, context = {}) => {
  const senderId = event.sender.id;
  activeAnalyses.get(senderId)?.abort();
  const controller = new AbortController();
  activeAnalyses.set(senderId, controller);

  const history = store.get('sortingHistory', []);
  const categoryFolders = Array.isArray(context?.categoryFolders) ? context.categoryFolders : getCategoryFoldersForPath(dirPath);

  try {
    const result = await analyzeFiles(files, getAiSettings(), history, {
      signal: controller.signal,
      context: {
        categoryFolders,
        retryReason: context?.retryReason || null,
        previousPlan: context?.previousPlan || null,
      },
      onToken: (delta) => safeSend(event.sender, 'folder:analyze:stream', delta),
    });
    const plan = result && result.plan && result.debug ? result.plan : result;
    if (result?.debug) console.log('[analyze:debug]', JSON.stringify(result.debug, null, 2));
    return { ok: true, plan: plan || {} };
  } catch (e) {
    if (controller.signal.aborted) return { ok: false, cancelled: true };
    return { ok: false, error: e?.message || 'AI analysis failed.' };
  } finally {
    if (activeAnalyses.get(senderId) === controller) activeAnalyses.delete(senderId);
    safeSend(event.sender, 'folder:analyze:done');
  }
});

ipcMain.handle('folder:analyze:cancel', (event) => {
  const controller = activeAnalyses.get(event.sender.id);
  if (controller) controller.abort();
  return Boolean(controller);
});

// ---------------------------------------------------------------------------
// IPC: execute plan (with rollback on fatal errors)
// ---------------------------------------------------------------------------

async function getItemSize(itemPath, maxDepth = 5) {
  if (maxDepth <= 0) return 0;
  try {
    const stat = await fs.lstat(itemPath);
    if (stat.isFile()) return stat.size;
    if (!stat.isDirectory()) return 0;
    const items = await fs.readdir(itemPath);
    const sizes = await mapLimit(items, 16, (item) => getItemSize(path.join(itemPath, item), maxDepth - 1));
    return sizes.reduce((sum, s) => sum + s, 0);
  } catch {
    return 0;
  }
}

async function updateMetrics(dirPath, movedItems) {
  const metrics = store.get('metrics', { totalFiles: 0, totalBytes: 0, totalTimeSaved: 0, history: [] });
  const sizes = await mapLimit(movedItems, 8, (item) => getItemSize(path.join(dirPath, item.category, item.name)));
  const bytes = sizes.reduce((sum, s) => sum + s, 0);
  const count = movedItems.length;

  metrics.totalFiles += count;
  metrics.totalBytes += bytes;
  metrics.totalTimeSaved += count * 5; // Heuristic: ~5 seconds of manual work per item.
  metrics.history = [...(metrics.history || []), {
    timestamp: Date.now(),
    files: count,
    bytes,
    totalFiles: metrics.totalFiles,
    totalBytes: metrics.totalBytes,
  }].slice(-50);
  store.set('metrics', metrics);
}

ipcMain.handle('folder:execute', async (event, dirPath, rawPlan) => {
  if (typeof dirPath !== 'string' || !path.isAbsolute(dirPath)) return { ok: false, fatalError: { message: 'Choose a valid folder.' } };
  const rootStat = await fs.lstat(dirPath).catch(() => null);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) return { ok: false, fatalError: { message: 'Choose a regular folder before moving files.' } };
  const rootRealPath = await fs.realpath(dirPath);
  const sender = event.sender;
  const history = store.get('sortingHistory', []) || [];
  const newHistoryItems = [];
  const warnings = [];
  const moveRecords = [];
  const createdDirs = new Set();
  const runTimestamp = Date.now();

  // Ignore categories that ended up empty during review so we don't create empty folders.
  const plan = Object.fromEntries(Object.entries(rawPlan || {}).filter(([, data]) => (data?.items || data?.files || []).length > 0));

  const protectedCategories = new Set([...getCategoryFoldersForPath(dirPath), ...Object.keys(plan)]);
  const protectedKeys = new Set(Array.from(protectedCategories, normalizeNameKey));

  const getUniqueDestPath = async (destPath) => {
    if (!(await fs.pathExists(destPath))) return destPath;
    const dir = path.dirname(destPath);
    const ext = path.extname(destPath);
    const base = path.basename(destPath, ext);
    for (let i = 1; i <= 999; i++) {
      const candidate = path.join(dir, `${base} (${i})${ext}`);
      if (!(await fs.pathExists(candidate))) return candidate;
    }
    return null;
  };

  const total = Object.values(plan).reduce((sum, data) => sum + (data?.items || data?.files || []).length, 0);
  let processed = 0;
  let moved = 0;
  let fatalError = null;

  const log = (...args) => console.log(`[execute:${new Date().toISOString()}]`, ...args);
  const progress = (extra = {}) => safeSend(sender, 'folder:execute:progress', { total, processed, moved, ...extra });

  log('start', { dirPath, categories: Object.keys(plan).length, total });
  progress();

  outer:
  for (const [category, data] of Object.entries(plan)) {
    if (isUnsafeName(category)) {
      fatalError = { code: 'EINVAL', message: `"${category}" is not a valid folder name.`, category };
      break;
    }

    const targetDir = path.join(dirPath, category);
    try {
      const stat = await fs.lstat(targetDir).catch(() => null);
      if (stat?.isSymbolicLink()) {
        fatalError = { code: 'E_LINK', message: `“${category}” is a link. Choose a regular destination folder.`, category };
        break;
      }
      if (stat && !stat.isDirectory()) {
        fatalError = { code: 'ENOTDIR', message: `A file named "${category}" already exists here.`, category };
        break;
      }
      await fs.ensureDir(targetDir);
      if (!stat) createdDirs.add(targetDir);
    } catch (e) {
      fatalError = { code: e?.code || 'E_DIR', message: e?.message || String(e), category };
      break;
    }

    for (const item of data.items || data.files || []) {
      const itemName = typeof item === 'string' ? item : item?.name;
      const itemType = typeof item === 'string' ? 'file' : (item?.type === 'folder' ? 'folder' : 'file');

      if (isUnsafeName(itemName)) {
        fatalError = { code: 'EINVAL', message: `"${itemName}" is not a valid item name.`, category };
        break outer;
      }

      const oldPath = path.join(dirPath, itemName);
      let newPath = path.join(targetDir, itemName);
      const current = { name: itemName, type: itemType, category };

      const skip = (type, message) => {
        warnings.push({ type, name: itemName, category, message });
        processed++;
        progress({ current });
      };

      if (pathsEqual(oldPath, targetDir)) { skip('loop_self', `Skipped moving "${itemName}" into itself.`); continue; }
      if (isSubPath(oldPath, targetDir)) { skip('loop_subdir', `Skipped moving "${itemName}" into its own subfolder.`); continue; }

      // Never move protected category folders into other folders (prevents loops/nesting).
      const itemKey = normalizeNameKey(itemName);
      if (itemType === 'folder' && protectedKeys.has(itemKey) && itemKey !== normalizeNameKey(category)) {
        fatalError = { code: 'E_PROTECTED_CATEGORY', message: `"${itemName}" is a category folder and can't be moved into "${category}".`, name: itemName, category };
        break outer;
      }

      if (!(await fs.pathExists(oldPath))) { skip('missing_source', `"${itemName}" no longer exists.`); continue; }

      // Recheck destination links when applying a plan, since review may have
      // been open while another application changed the selected folder.
      const currentRoot = await fs.lstat(dirPath).catch(() => null);
      const currentTarget = await fs.lstat(targetDir).catch(() => null);
      const currentSource = await fs.lstat(oldPath).catch(() => null);
      const targetRealPath = await fs.realpath(targetDir).catch(() => '');
      if (!currentRoot?.isDirectory() || currentRoot.isSymbolicLink() || currentRoot.dev !== rootStat.dev || currentRoot.ino !== rootStat.ino ||
          !currentTarget?.isDirectory() || currentTarget.isSymbolicLink() || !targetRealPath || !isSubPath(rootRealPath, targetRealPath) || currentSource?.isSymbolicLink()) {
        fatalError = { code: 'E_CHANGED_PATH', message: 'A source or destination changed to a link or moved outside this folder. Review the plan again.', name: itemName, category };
        break outer;
      }

      // Resolve destination collisions by renaming the moved item.
      const unique = await getUniqueDestPath(newPath);
      if (!unique) {
        fatalError = { code: 'EEXIST', message: `Too many name collisions for "${itemName}" in "${category}".`, name: itemName, category };
        break outer;
      }
      if (unique !== newPath) {
        warnings.push({ type: 'renamed', name: itemName, category, message: `Renamed "${itemName}" to "${path.basename(unique)}" because the name was taken.` });
        newPath = unique;
      }

      try {
        await fs.move(oldPath, newPath, { overwrite: false });
      } catch (moveError) {
        if (moveError?.code !== 'EEXIST') {
          fatalError = { code: moveError?.code || 'E_MOVE', message: moveError?.message || String(moveError), name: itemName, category };
          log('fatal move error', fatalError);
          break outer;
        }
        // Rare race: destination appeared between the check and the move. Try once more.
        const retry = await getUniqueDestPath(newPath);
        try {
          if (!retry) throw moveError;
          await fs.move(oldPath, retry, { overwrite: false });
          newPath = retry;
        } catch (moveError2) {
          fatalError = { code: moveError2?.code || 'E_MOVE', message: moveError2?.message || String(moveError2), name: itemName, category };
          break outer;
        }
      }

      moveRecords.push({ from: oldPath, to: newPath });
      newHistoryItems.push({ name: path.basename(newPath), type: itemType, category });
      moved++;
      processed++;
      progress({ current });
    }
  }

  // Fatal error: roll back everything this run did.
  if (fatalError) {
    log('rollback', { fatalError, moves: moveRecords.length });
    for (let i = moveRecords.length - 1; i >= 0; i--) {
      const rec = moveRecords[i];
      try {
        if (!(await fs.pathExists(rec.to))) continue;
        if (await fs.pathExists(rec.from)) {
          warnings.push({ type: 'rollback_skipped', message: `Couldn't restore "${rec.to}" because the original path is taken.` });
          continue;
        }
        await fs.move(rec.to, rec.from, { overwrite: false });
      } catch (e) {
        warnings.push({ type: 'rollback_failed', message: e?.message || String(e) });
      }
    }
    for (const dir of createdDirs) {
      try {
        if ((await fs.readdir(dir)).length === 0) await fs.remove(dir);
      } catch { }
    }
    progress({ done: true, ok: false, fatalError: fatalError.message });
    return { ok: false, fatalError, warnings };
  }

  store.set('sortingHistory', [...newHistoryItems, ...history].slice(0, 100));
  setCategoryFoldersForPath(dirPath, [...protectedCategories]);
  addRecentFolder(dirPath);

  // Size accounting can be slow on huge folders; don't block the result on it.
  updateMetrics(dirPath, newHistoryItems).catch((err) => console.error('Metrics update failed:', err));

  const runRecord = {
    id: `run_${runTimestamp}_${Math.random().toString(36).slice(2, 8)}`,
    dirPath,
    timestamp: runTimestamp,
    categories: Object.keys(plan),
    moved,
    total,
    warnings: warnings.length,
    moves: moveRecords,
    createdDirs: Array.from(createdDirs),
  };
  addRunHistory(runRecord);

  progress({ processed: total, done: true, ok: true, warnings: warnings.length });
  log('complete', { moved, warnings: warnings.length });
  return { ok: true, total, processed, moved, warnings, runId: runRecord.id, run: runRecord };
});

// ---------------------------------------------------------------------------
// IPC: metrics, history, revert
// ---------------------------------------------------------------------------

ipcMain.handle('metrics:get', () => store.get('metrics', { totalFiles: 0, totalBytes: 0, totalTimeSaved: 0, history: [] }));
ipcMain.handle('history:get', () => store.get('sortingHistory', []));
ipcMain.handle('history:runs:get', () => getRunHistory());

ipcMain.handle('folder:revert', async (_event, runId) => {
  const runs = getRunHistory();
  const index = runs.findIndex((run) => run?.id === runId);
  if (index === -1) return { ok: false, error: "That run couldn't be found." };

  const run = runs[index];
  if (run?.revertedAt) return { ok: false, error: 'This run was already undone.', run };

  const warnings = [];
  let reverted = 0;
  const moves = Array.isArray(run?.moves) ? run.moves : [];

  for (let i = moves.length - 1; i >= 0; i--) {
    const rec = moves[i];
    if (!rec?.from || !rec?.to) continue;
    try {
      if (!(await fs.pathExists(rec.to))) {
        warnings.push({ type: 'missing_dest', message: `"${path.basename(rec.to)}" is no longer in "${path.basename(path.dirname(rec.to))}".` });
        continue;
      }
      if (await fs.pathExists(rec.from)) {
        warnings.push({ type: 'conflict', message: `Left "${path.basename(rec.to)}" in place because "${path.basename(rec.from)}" exists again.` });
        continue;
      }
      await fs.move(rec.to, rec.from, { overwrite: false });
      reverted++;
    } catch (e) {
      warnings.push({ type: 'revert_failed', message: e?.message || String(e) });
    }
  }

  for (const dir of Array.isArray(run?.createdDirs) ? run.createdDirs : []) {
    try {
      if ((await fs.readdir(dir)).length === 0) await fs.remove(dir);
    } catch { }
  }

  await refreshCategoryFolders(run?.dirPath).catch(() => { });

  const updatedRun = { ...run, revertedAt: Date.now(), revertedCount: reverted, revertWarnings: warnings.length };
  runs[index] = updatedRun;
  store.set('sortingRuns', runs);

  return { ok: true, run: updatedRun, reverted, warnings };
});
