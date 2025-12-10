const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const Store = require('electron-store').default;
const { analyzeFiles } = require('./ai');

const store = new Store();
let mainWindow;

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
    mainWindow.loadURL('http://localhost:5173').catch(() => {});
    mainWindow.webContents.openDevTools();
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
        // Include both files and folders (excluding hidden items)
        const results = [];
        for (const item of items) {
            if (item.startsWith('.')) continue;
            const fullPath = path.join(dirPath, item);
            try {
                const stat = await fs.stat(fullPath);
                if (stat.isFile()) {
                    results.push({ name: item, type: 'file' });
                } else if (stat.isDirectory()) {
                    const context = await getFolderContext(fullPath);
                    results.push({ name: item, type: 'folder', context });
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

ipcMain.handle('folder:analyze', async (event, dirPath, files) => {
    const settings = store.store;
    // Retrieve history (simplified for now)
    const history = store.get('sortingHistory', []);
    return await analyzeFiles(files, settings, history);
});

ipcMain.handle('folder:execute', async (event, dirPath, plan) => {
    const history = store.get('sortingHistory', []) || [];
    const newHistoryItems = [];

    for (const [category, data] of Object.entries(plan)) {
        const targetDir = path.join(dirPath, category);
        await fs.ensureDir(targetDir);

        // Handle new format with items array (objects with name and type)
        const items = data.items || data.files || [];

        for (const item of items) {
            // Support both old format (string) and new format (object)
            const itemName = typeof item === 'string' ? item : item.name;
            const itemType = typeof item === 'string' ? 'file' : item.type;

            const oldPath = path.join(dirPath, itemName);
            const newPath = path.join(targetDir, itemName);

            // Safety Checks:
            // 1. Prevent moving a folder into itself (e.g., category name same as folder name)
            if (oldPath === targetDir) {
                continue;
            }
            // 2. Prevent moving a folder into its own subdirectory
            if (targetDir.startsWith(oldPath + path.sep)) {
                continue;
            }

            if (await fs.pathExists(oldPath)) {
                try {
                    await fs.move(oldPath, newPath, { overwrite: false }); // Safety: don't overwrite
                    // Add to history context
                    newHistoryItems.push({ name: itemName, type: itemType, category });
                } catch (moveError) {
                    // Skip files that fail to move
                }
            }
        }
    }

    // Update history (keep last 100)
    const updatedHistory = [...newHistoryItems, ...history].slice(0, 100);
    store.set('sortingHistory', updatedHistory);

    return true;
});
