const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const Store = require('electron-store').default;
const { analyzeFiles } = require('./ai');

const store = new Store();
let mainWindow;

const MAX_RUN_HISTORY = 30;

function getCategoryFoldersByPath() {
  return store.get('categoryFoldersByPath', {}) || {};
}

function getCategoryFoldersForPath(dirPath) {
  const map = getCategoryFoldersByPath();
  const list = map[dirPath];
  return Array.isArray(list) ? list.filter((v) => typeof v === 'string' && v.trim().length > 0) : [];
}

function setCategoryFoldersForPath(dirPath, folders) {
  const map = getCategoryFoldersByPath();
  const unique = Array.from(new Set((folders || []).map((v) => String(v).trim()).filter(Boolean))).slice(0, 200);
  map[dirPath] = unique;
  store.set('categoryFoldersByPath', map);
  return unique;
}

function getRunHistory() {
  const runs = store.get('sortingRuns', []);
  return Array.isArray(runs) ? runs : [];
}

function setRunHistory(runs) {
  const list = Array.isArray(runs) ? runs : [];
  store.set('sortingRuns', list);
  return list;
}

function addRunHistory(entry) {
  const runs = getRunHistory();
  const updated = [entry, ...runs].slice(0, MAX_RUN_HISTORY);
  setRunHistory(updated);
  return updated;
}

async function refreshCategoryFolders(dirPath) {
  if (!dirPath) return;
  const existing = getCategoryFoldersForPath(dirPath);
  const filtered = [];
  for (const name of existing) {
    if (!name) continue;
    const fullPath = path.join(dirPath, name);
    try {
      if (await fs.pathExists(fullPath)) {
        filtered.push(name);
      }
    } catch { }
  }
  setCategoryFoldersForPath(dirPath, filtered);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    backgroundColor: '#141218',
    frame: false,
    transparent: false,
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    // Match Vite dev server host to avoid CSP + HMR hostname mismatches.
    mainWindow.loadURL('http://127.0.0.1:5173').catch((err) => {
      console.error('Failed to load Vite dev server:', err);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---

// Window controls
ipcMain.on('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow?.isMaximized() || false;
});

ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

ipcMain.handle('settings:get', (event, key) => {
  return store.get(key);
});

ipcMain.handle('settings:set', (event, key, value) => {
  store.set(key, value);
});

ipcMain.handle('settings:getAll', () => {
  return store.store;
});

// Category folders (per directory)
ipcMain.handle('categories:get', (_event, dirPath) => {
  return getCategoryFoldersForPath(dirPath);
});

ipcMain.handle('categories:set', (_event, dirPath, folders) => {
  return setCategoryFoldersForPath(dirPath, folders);
});

// Project markers to detect project types
const PROJECT_MARKERS = [
  'package.json', 'Cargo.toml', 'pyproject.toml', 'setup.py', 'requirements.txt',
  'go.mod', 'Makefile', 'CMakeLists.txt', 'pom.xml', 'build.gradle',
  '.git', '.gitignore', 'README.md', 'README', 'LICENSE', 'Dockerfile',
  '.vscode', '.idea', 'tsconfig.json', 'vite.config.js', 'webpack.config.js'
];

const MAX_SCAN_DEPTH = 3;
const MAX_FILES_TO_SCAN = 500;

async function getFolderContext(folderPath, depth = 0, stats = null) {
  // Initialize stats object on first call
  if (!stats) {
    stats = {
      fileCount: 0,
      extensionCounts: {},
      foundMarkers: [],
      scannedFiles: 0
    };
  }

  // Stop if we've hit limits
  if (depth > MAX_SCAN_DEPTH || stats.scannedFiles >= MAX_FILES_TO_SCAN) {
    if (depth === 0) {
      return buildContextResult(stats);
    }
    return stats;
  }

  try {
    const items = await fs.readdir(folderPath);

    for (const item of items) {
      if (stats.scannedFiles >= MAX_FILES_TO_SCAN) break;

      // Skip hidden files unless they're project markers
      if (item.startsWith('.') && !PROJECT_MARKERS.includes(item)) continue;

      // Check for project markers (only at root level)
      if (depth === 0 && PROJECT_MARKERS.includes(item)) {
        stats.foundMarkers.push(item);
      }

      const fullPath = path.join(folderPath, item);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.isFile()) {
          stats.fileCount++;
          stats.scannedFiles++;
          const ext = path.extname(item).toLowerCase() || '(no ext)';
          stats.extensionCounts[ext] = (stats.extensionCounts[ext] || 0) + 1;
        } else if (stat.isDirectory()) {
          // Recursively scan subdirectories
          await getFolderContext(fullPath, depth + 1, stats);
        }
      } catch (e) {
        // Skip inaccessible files
      }
    }

    if (depth === 0) {
      return buildContextResult(stats);
    }
    return stats;
  } catch (e) {
    return depth === 0 ? null : stats;
  }
}

function buildContextResult(stats) {
  // Get top 3 extensions
  const topExtensions = Object.entries(stats.extensionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([ext, count]) => ext);

  return {
    fileCount: stats.fileCount,
    topExtensions,
    markers: stats.foundMarkers.slice(0, 5),
    truncated: stats.scannedFiles >= MAX_FILES_TO_SCAN
  };
}

ipcMain.handle('folder:scan', async (event, dirPath) => {
  try {
    const items = await fs.readdir(dirPath);
    // Include all files and folders; hidden items are flagged for the UI
    const results = [];
    for (const item of items) {
      const isHidden = item.startsWith('.');
      const fullPath = path.join(dirPath, item);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.isFile()) {
          results.push({ name: item, type: 'file', size: stat.size, ...(isHidden && { hidden: true }) });
        } else if (stat.isDirectory()) {
          const context = await getFolderContext(fullPath);
          results.push({ name: item, type: 'folder', context, ...(isHidden && { hidden: true }) });
        }
      } catch (statError) {
        // Skip files we can't access
      }
    }
    return results;
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('folder:analyze', async (event, dirPath, files, context = {}) => {
  const settings = store.store;
  // Retrieve history (simplified for now)
  const history = store.get('sortingHistory', []);
  const categoryFolders = Array.isArray(context?.categoryFolders) ? context.categoryFolders : getCategoryFoldersForPath(dirPath);
  const retryReason = context?.retryReason || null;
  const previousPlan = context?.previousPlan || null;

  try {
    const result = await analyzeFiles(files, settings, history, {
      context: { categoryFolders, retryReason, previousPlan },
      onToken: (delta) => {
        try {
          event.sender.send('folder:analyze:stream', delta);
        } catch {
          // Best-effort streaming
        }
      }
    });
    try {
      event.sender.send('folder:analyze:done');
    } catch { }
    return result;
  } catch (e) {
    try {
      event.sender.send('folder:analyze:done');
    } catch { }
    throw e;
  }
});

ipcMain.handle('folder:execute', async (event, dirPath, plan) => {
  const history = store.get('sortingHistory', []) || [];
  const newHistoryItems = [];
  const warnings = [];
  const moveRecords = [];
  const createdDirs = new Set();
  const runTimestamp = Date.now();

  const existingCategoryFolders = getCategoryFoldersForPath(dirPath);
  const protectedCategories = new Set([
    ...existingCategoryFolders,
    ...Object.keys(plan || {}),
  ]);
  const normalizeNameKey = (value) => {
    const trimmed = String(value || '').trim();
    return (process.platform === 'win32' || process.platform === 'darwin') ? trimmed.toLowerCase() : trimmed;
  };
  const protectedCategoryKeys = new Set(Array.from(protectedCategories, normalizeNameKey));

  const isUnsafeName = (name) => {
    if (!name || typeof name !== 'string') return true;
    const trimmed = name.trim();
    if (!trimmed) return true;
    if (trimmed === '.' || trimmed === '..') return true;
    if (trimmed.includes('..')) return true;
    if (trimmed.includes('/') || trimmed.includes('\\')) return true;
    return false;
  };

  const normalizePathKey = (value) => {
    const resolved = path.resolve(value);
    return (process.platform === 'win32' || process.platform === 'darwin') ? resolved.toLowerCase() : resolved;
  };

  const pathsEqual = (a, b) => normalizePathKey(a) === normalizePathKey(b);

  const isSubPath = (parent, child) => {
    const parentKey = normalizePathKey(parent);
    const childKey = normalizePathKey(child);
    return childKey.startsWith(parentKey + path.sep);
  };

  const isFatalMoveError = (err) => {
    const code = err?.code;
    if (!code) return true;
    // Treat destination collisions as non-fatal (we'll resolve by renaming).
    if (code === 'EEXIST') return false;
    // Most other errors are not safely recoverable without user intervention.
    return true;
  };

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

  const total = Object.values(plan || {}).reduce((sum, data) => {
    const items = data?.items || data?.files || [];
    return sum + items.length;
  }, 0);
  let processed = 0;
  let moved = 0;
  let fatalError = null;

  const logPrefix = `[execute:${new Date().toISOString()}]`;
  const log = (...args) => console.log(logPrefix, ...args);

  try {
    log('start', { dirPath, categories: Object.keys(plan || {}).length, total });
    log('protectedCategories', Array.from(protectedCategories));
  } catch { }

  try {
    event.sender.send('folder:execute:progress', { total, processed, moved });
  } catch { }

  for (const [category, data] of Object.entries(plan)) {
    if (isUnsafeName(category)) {
      fatalError = { code: 'EINVAL', message: `Unsafe category name "${category}".` };
      break;
    }

    const targetDir = path.join(dirPath, category);
    try {
      const existed = await fs.pathExists(targetDir);
      await fs.ensureDir(targetDir);
      if (!existed) createdDirs.add(targetDir);
      log('ensureDir', { category, targetDir, existed });
    } catch (e) {
      fatalError = { code: e?.code || 'E_DIR', message: e?.message || String(e), category };
      log('fatal ensureDir', fatalError);
      break;
    }

    // Handle new format with items array (objects with name and type)
    const items = data.items || data.files || [];

    for (const item of items) {
      // Support both old format (string) and new format (object)
      const itemName = typeof item === 'string' ? item : item.name;
      const itemType = typeof item === 'string' ? 'file' : (item.type === 'folder' ? 'folder' : 'file');

      if (isUnsafeName(itemName)) {
        fatalError = { code: 'EINVAL', message: `Unsafe item name "${itemName}".`, category };
        log('fatal unsafe itemName', fatalError);
        break;
      }

      const oldPath = path.join(dirPath, itemName);
      let newPath = path.join(targetDir, itemName);

      // Safety Checks:
      // 1. Prevent moving a folder into itself (e.g., category name same as folder name)
      const warnAndSkip = (type, message) => {
        warnings.push({ type, name: itemName, category, message });
        log('warn skip', { type, category, itemName, message });
        processed++;
        try {
          event.sender.send('folder:execute:progress', { total, processed, moved, current: { name: itemName, type: itemType, category } });
        } catch { }
      };

      if (pathsEqual(oldPath, targetDir)) {
        warnAndSkip('loop_self', `Skipped moving "${itemName}" into itself.`);
        continue;
      }
      // 2. Prevent moving a folder into its own subdirectory
      if (isSubPath(oldPath, targetDir)) {
        warnAndSkip('loop_subdir', `Skipped moving "${itemName}" into its own subdirectory.`);
        continue;
      }

      // Never move protected category folders into other folders (prevents loops/nesting).
      const itemKey = normalizeNameKey(itemName);
      const categoryKey = normalizeNameKey(category);
      if (itemType === 'folder' && protectedCategoryKeys.has(itemKey) && itemKey !== categoryKey) {
        fatalError = {
          code: 'E_PROTECTED_CATEGORY',
          message: `Refusing to move protected category folder "${itemName}" into "${category}".`,
          name: itemName,
          category
        };
        log('fatal protected category folder', fatalError);
        break;
      }

      const exists = await fs.pathExists(oldPath);
      if (!exists) {
        warnings.push({ type: 'missing_source', name: itemName, category, message: `Source missing: "${itemName}".` });
        log('warn missing source', { category, itemName, oldPath });
        processed++;
        try {
          event.sender.send('folder:execute:progress', { total, processed, moved, current: { name: itemName, type: itemType, category } });
        } catch { }
        continue;
      }

      // Resolve destination collisions by renaming the moved item.
      const unique = await getUniqueDestPath(newPath);
      if (!unique) {
        fatalError = { code: 'EEXIST', message: `Too many destination collisions for "${itemName}" in "${category}".`, name: itemName, category };
        log('fatal too many collisions', { ...fatalError, desiredDest: newPath });
        break;
      }
      if (unique !== newPath) {
        warnings.push({
          type: 'renamed',
          name: itemName,
          category,
          message: `Renamed "${itemName}" to "${path.basename(unique)}" (destination already existed).`
        });
        log('warn rename due to collision', { category, itemName, from: newPath, to: unique });
        newPath = unique;
      }

      try {
        log('move', { category, itemName, from: oldPath, to: newPath });
        await fs.move(oldPath, newPath, { overwrite: false });
        moveRecords.push({ from: oldPath, to: newPath });

        const movedName = path.basename(newPath);
        newHistoryItems.push({ name: movedName, type: itemType, category });
        moved++;
      } catch (moveError) {
        log('move error', {
          category,
          itemName,
          from: oldPath,
          to: newPath,
          code: moveError?.code,
          message: moveError?.message || String(moveError)
        });
        if (moveError?.code === 'EEXIST') {
          // Extremely rare race: try one more time with a new unique path
          const retry = await getUniqueDestPath(newPath);
          if (!retry) {
            fatalError = { code: 'EEXIST', message: `Destination collision for "${itemName}" in "${category}".`, name: itemName, category };
            log('fatal collision retry failed', { ...fatalError, desiredDest: newPath });
            break;
          }
          try {
            log('move retry', { category, itemName, from: oldPath, to: retry });
            await fs.move(oldPath, retry, { overwrite: false });
            moveRecords.push({ from: oldPath, to: retry });
            const movedName = path.basename(retry);
            newHistoryItems.push({ name: movedName, type: itemType, category });
            moved++;
          } catch (moveError2) {
            fatalError = { code: moveError2?.code || 'E_MOVE', message: moveError2?.message || String(moveError2), name: itemName, category };
            log('fatal move retry error', fatalError);
            break;
          }
        } else if (isFatalMoveError(moveError)) {
          fatalError = { code: moveError?.code || 'E_MOVE', message: moveError?.message || String(moveError), name: itemName, category };
          log('fatal move error', fatalError);
          break;
        } else {
          warnings.push({ type: 'move_failed', name: itemName, category, message: moveError?.message || String(moveError) });
          log('warn non-fatal move error', { category, itemName, code: moveError?.code, message: moveError?.message || String(moveError) });
        }
      }

      processed++;
      try {
        event.sender.send('folder:execute:progress', { total, processed, moved, current: { name: itemName, type: itemType, category } });
      } catch { }
    }

    if (fatalError) break;
  }

  // If we hit a fatal error, rollback all changes we made in this run.
  if (fatalError) {
    log('rollback start', { movedCount: moveRecords.length, createdDirs: createdDirs.size });
    for (let i = moveRecords.length - 1; i >= 0; i--) {
      const rec = moveRecords[i];
      try {
        if (await fs.pathExists(rec.to)) {
          // Best-effort rollback. If original exists, don't clobber it.
          if (!(await fs.pathExists(rec.from))) {
            log('rollback move', { from: rec.to, to: rec.from });
            await fs.move(rec.to, rec.from, { overwrite: false });
          } else {
            warnings.push({ type: 'rollback_skipped', message: `Rollback skipped for "${rec.to}" (source path exists).` });
            log('rollback skipped (source exists)', { rec });
          }
        }
      } catch (e) {
        warnings.push({ type: 'rollback_failed', message: e?.message || String(e) });
        log('rollback failed', { rec, code: e?.code, message: e?.message || String(e) });
      }
    }

    for (const dir of createdDirs) {
      try {
        const entries = await fs.readdir(dir);
        if (!entries || entries.length === 0) {
          log('rollback remove empty dir', { dir });
          await fs.remove(dir);
        }
      } catch { }
    }

    log('rollback complete', { fatalError });
    try {
      event.sender.send('folder:execute:progress', { total, processed, moved, done: true, ok: false, fatalError: fatalError.message });
    } catch { }

    return { ok: false, fatalError, warnings };
  }

  // Update history (keep last 100)
  const updatedHistory = [...newHistoryItems, ...history].slice(0, 100);
  store.set('sortingHistory', updatedHistory);

  // Persist / refresh category folder list for this directory.
  // Keys of the plan are category folder names (created/used).
  setCategoryFoldersForPath(dirPath, [...protectedCategories]);

  // --- Metrics Updates ---
  const currentMetrics = store.get('metrics', {
    totalFiles: 0,
    totalBytes: 0,
    totalTimeSaved: 0,
    history: []
  });

  let validMovesCount = 0;
  let bytesMoved = 0;

  // Helper function to get size of file or directory recursively
  async function getItemSize(itemPath) {
    try {
      const stat = await fs.stat(itemPath);
      if (stat.isFile()) {
        return stat.size;
      } else if (stat.isDirectory()) {
        // Recursively calculate directory size
        let totalSize = 0;
        const items = await fs.readdir(itemPath);
        for (const item of items) {
          totalSize += await getItemSize(path.join(itemPath, item));
        }
        return totalSize;
      }
    } catch {
      return 0;
    }
    return 0;
  }

  for (const item of newHistoryItems) {
    validMovesCount++;
    const destPath = path.join(dirPath, item.category, item.name);
    bytesMoved += await getItemSize(destPath);
  }

  // Update totals
  currentMetrics.totalFiles += validMovesCount;
  currentMetrics.totalBytes += bytesMoved;
  // Heuristic: 5 seconds saved per file
  currentMetrics.totalTimeSaved += (validMovesCount * 5);

  // Update history (each operation is a separate point for graphing)
  // This allows the graph to show progress even within a single day
  currentMetrics.history.push({
    timestamp: Date.now(),
    files: validMovesCount,
    bytes: bytesMoved,
    // Store cumulative totals for easier graphing
    totalFiles: currentMetrics.totalFiles,
    totalBytes: currentMetrics.totalBytes
  });

  // Keep last 50 operations for the graph
  if (currentMetrics.history.length > 50) {
    currentMetrics.history.shift();
  }

  store.set('metrics', currentMetrics);

  const runRecord = {
    id: `run_${runTimestamp}_${Math.random().toString(36).slice(2, 8)}`,
    dirPath,
    timestamp: runTimestamp,
    categories: Object.keys(plan || {}),
    moved,
    total,
    warnings: warnings.length,
    moves: moveRecords,
    createdDirs: Array.from(createdDirs)
  };
  addRunHistory(runRecord);

  try {
    event.sender.send('folder:execute:progress', { total, processed: total, moved, done: true, ok: true, warnings: warnings.length });
  } catch { }

  log('complete', { ok: true, moved, warnings: warnings.length });
  return { ok: true, total, processed, moved, warnings, runId: runRecord.id };
});

ipcMain.handle('metrics:get', () => {
  return store.get('metrics', {
    totalFiles: 0,
    totalBytes: 0,
    totalTimeSaved: 0,
    history: []
  });
});

ipcMain.handle('history:get', () => {
  return store.get('sortingHistory', []);
});

ipcMain.handle('history:runs:get', () => {
  return getRunHistory();
});

ipcMain.handle('folder:revert', async (_event, runId) => {
  const runs = getRunHistory();
  const index = runs.findIndex((run) => run?.id === runId);
  if (index === -1) {
    return { ok: false, error: 'Run not found.' };
  }

  const run = runs[index];
  if (run?.revertedAt) {
    return { ok: false, error: 'Run already reverted.', run };
  }

  const warnings = [];
  let reverted = 0;
  const moves = Array.isArray(run?.moves) ? run.moves : [];

  for (let i = moves.length - 1; i >= 0; i--) {
    const rec = moves[i];
    if (!rec?.from || !rec?.to) continue;
    try {
      const destExists = await fs.pathExists(rec.to);
      if (!destExists) {
        warnings.push({ type: 'missing_dest', message: `Missing: "${rec.to}".` });
        continue;
      }
      const sourceExists = await fs.pathExists(rec.from);
      if (sourceExists) {
        warnings.push({ type: 'conflict', message: `Skip revert for "${rec.to}" (source exists).` });
        continue;
      }
      await fs.move(rec.to, rec.from, { overwrite: false });
      reverted++;
    } catch (e) {
      warnings.push({ type: 'revert_failed', message: e?.message || String(e) });
    }
  }

  const createdDirs = Array.isArray(run?.createdDirs) ? run.createdDirs : [];
  for (const dir of createdDirs) {
    try {
      const entries = await fs.readdir(dir);
      if (!entries || entries.length === 0) {
        await fs.remove(dir);
      }
    } catch { }
  }

  try {
    await refreshCategoryFolders(run?.dirPath);
  } catch { }

  const updatedRun = {
    ...run,
    revertedAt: Date.now(),
    revertedCount: reverted,
    revertWarnings: warnings.length
  };
  runs[index] = updatedRun;
  setRunHistory(runs);

  return { ok: true, run: updatedRun, reverted, warnings };
});
