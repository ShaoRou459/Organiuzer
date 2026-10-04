import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { ThemeProvider, useTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AnimatePresence, MotionConfig, motion as m, useIsPresent, useReducedMotion } from 'framer-motion';
import DriveFolderUploadIcon from '@mui/icons-material/DriveFolderUpload';

import TitleBar from './components/TitleBar';
import HomeView from './components/HomeView';
import FolderManager from './components/FolderManager';
import SettingsPage from './components/SettingsPage';
import ExpressiveShape from './components/common/ExpressiveShape';
import { SnackbarProvider, useSnackbar } from './context/SnackbarContext';
import { getTheme, DEFAULT_SEED } from './theme/theme';
import { springs } from './theme/tokens';
import { folderNameFromPath } from './utils/format';

const api = () => window.electronAPI;

function useSystemDark() {
  const query = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => window.matchMedia?.(query).matches ?? true);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const onChange = (e) => setDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return dark;
}

export default function App() {
  const systemDark = useSystemDark();
  const [settings, setSettings] = useState({ themeMode: 'system', seedColor: DEFAULT_SEED, model: 'gpt-4o', hasApiKey: false, provider: 'openai' });
  // Appearance can be previewed live from Settings before it's saved.
  const [preview, setPreview] = useState(null);

  const loadSettings = useCallback(async () => {
    try {
      const all = await api().getAllSettings();
      if (all) setSettings((s) => ({ ...s, ...all }));
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const appearance = preview || settings;
  const mode = appearance.themeMode === 'system' ? (systemDark ? 'dark' : 'light') : appearance.themeMode;
  const theme = useMemo(() => getTheme({ mode, seed: appearance.seedColor }), [mode, appearance.seedColor]);

  return (
    <MotionConfig reducedMotion="user">
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SnackbarProvider>
        <Shell settings={settings} onSettingsSaved={(s) => { setSettings((prev) => ({ ...prev, ...s })); setPreview(null); }} onPreview={setPreview} reloadSettings={loadSettings} />
      </SnackbarProvider>
    </ThemeProvider>
    </MotionConfig>
  );
}

function Shell({ settings, onSettingsSaved, onPreview, reloadSettings }) {
  const { notify } = useSnackbar();
  const [currentPath, setCurrentPath] = useState(null);
  const [settingsTab, setSettingsTab] = useState(null); // null = closed
  const [settingsLeaving, setSettingsLeaving] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const settingsOrigin = useRef(null);
  const reduced = useReducedMotion();
  const [metrics, setMetrics] = useState({ totalFiles: 0, totalBytes: 0, totalTimeSaved: 0, history: [] });
  const [recentActivity, setRecentActivity] = useState([]);
  const [recentFolders, setRecentFolders] = useState([]);
  const [runs, setRuns] = useState([]);
  const [dragDepth, setDragDepth] = useState(0);

  const loadDashboard = useCallback(async () => {
    try {
      const [mtr, hist, recent, runList] = await Promise.all([
        api().getMetrics(), api().getHistory(), api().getRecentFolders(), api().getRunHistory(),
      ]);
      setMetrics(mtr || {});
      setRecentActivity(Array.isArray(hist) ? hist : []);
      setRecentFolders(Array.isArray(recent) ? recent : []);
      setRuns(Array.isArray(runList) ? runList : []);
    } catch (e) {
      console.error('Failed to load dashboard', e);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const openFolder = useCallback(async (dirPath) => {
    if (!dirPath) return;
    if (!(await api().isDirectory(dirPath))) {
      notify(`“${folderNameFromPath(dirPath)}” isn’t available anymore.`);
      loadDashboard();
      return;
    }
    api().addRecentFolder(dirPath).catch(() => { });
    setCurrentPath(dirPath);
  }, [notify, loadDashboard]);

  const chooseFolder = useCallback(async () => {
    try {
      const picked = await api().selectFolder();
      if (picked) openFolder(picked);
    } catch (e) {
      console.error('Error selecting folder:', e);
    }
  }, [openFolder]);

  const goHome = useCallback(() => {
    setCurrentPath(null);
    loadDashboard();
  }, [loadDashboard]);

  // Drag a folder from File Explorer onto the home screen to open it.
  const openSettings = useCallback((tab, trigger) => {
    settingsOrigin.current = trigger || document.activeElement;
    setDragDepth(0);
    setSettingsLeaving(false);
    setSettingsReady(false);
    setSettingsTab(tab || 'appearance');
  }, []);
  const closeSettings = useCallback(() => {
    setSettingsLeaving(true);
    setSettingsTab(null);
    onPreview(null);
  }, [onPreview]);

  const settingsVisible = settingsTab !== null || settingsLeaving;
  const dropEnabled = !currentPath && !settingsVisible;
  const dragHandlers = dropEnabled ? {
    onDragEnter: (e) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      setDragDepth((d) => d + 1);
    },
    onDragLeave: () => setDragDepth((d) => Math.max(0, d - 1)),
    onDragOver: (e) => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    },
    onDrop: async (e) => {
      e.preventDefault();
      setDragDepth(0);
      const file = e.dataTransfer?.files?.[0];
      const dropped = file ? api().getPathForFile(file) : '';
      if (dropped && (await api().isDirectory(dropped))) openFolder(dropped);
      else notify('Drop a folder, not a file.');
    },
  } : {};

  return (
    <Box
      {...dragHandlers}
      sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', color: 'text.primary', overflow: 'hidden', position: 'relative' }}
    >
      <TitleBar subtitle={settingsTab !== null ? 'Settings' : currentPath ? folderNameFromPath(currentPath) : null} />

      <Box component="main" sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Keep the working folder mounted while Settings is a separate page. */}
        <m.div aria-hidden={settingsVisible} inert={settingsVisible}
          animate={{ opacity: settingsVisible ? 0 : 1 }}
          transition={springs.defaultEffects}
          onAnimationComplete={(target) => { if (settingsTab !== null && target.opacity === 0) setSettingsReady(true); }}
          style={{ position: 'absolute', inset: 0, pointerEvents: settingsVisible ? 'none' : 'auto' }}>
        <AnimatePresence mode="wait" initial={false}>
          {currentPath ? (
            <m.div
              key={`folder:${currentPath}`}
              style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0, transition: { x: springs.defaultSpatial, opacity: springs.defaultEffects } }}
              exit={{ opacity: 0, x: reduced ? 0 : -16, transition: { x: springs.defaultSpatial, opacity: springs.fastEffects } }}
            >
              <FolderManager
                path={currentPath}
                onBack={goHome}
                onOpenSettings={openSettings}
                hasAiConfig={settings.hasApiKey || settings.provider === 'custom'}
              />
            </m.div>
          ) : (
            <m.div
              key="home"
              style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0, transition: { x: springs.defaultSpatial, opacity: springs.defaultEffects } }}
              exit={{ opacity: 0, x: reduced ? 0 : 16, transition: { x: springs.defaultSpatial, opacity: springs.fastEffects } }}
            >
              <HomeView
                onSelectFolder={chooseFolder}
                onOpenFolder={openFolder}
                onOpenSettings={openSettings}
                metrics={metrics}
                settings={settings}
                recentActivity={recentActivity}
                recentFolders={recentFolders}
                runs={runs}
              />
            </m.div>
          )}
        </AnimatePresence>
        </m.div>
        <AnimatePresence onExitComplete={() => {
          setSettingsLeaving(false);
          setSettingsReady(false);
          requestAnimationFrame(() => settingsOrigin.current?.focus?.({ preventScroll: true }));
        }}>
          {settingsTab !== null && settingsReady && <SettingsRoute key="settings-page">
            <SettingsPage initialTab={settingsTab} returnLabel={currentPath ? folderNameFromPath(currentPath) : 'Home'} onClose={closeSettings}
              onSaved={(saved) => { onSettingsSaved(saved); notify('Settings saved'); reloadSettings(); }} onPreview={onPreview} />
          </SettingsRoute>}
        </AnimatePresence>
      </Box>

      {/* Folder drop target overlay */}
      <AnimatePresence>
        {dragDepth > 0 && (
          <m.div
            key="drop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={springs.defaultEffects}
            style={{ position: 'absolute', inset: 0, top: 40, zIndex: 1500, pointerEvents: 'none' }}
          >
            <DropOverlay />
          </m.div>
        )}
      </AnimatePresence>

    </Box>
  );
}

function SettingsRoute({ children }) {
  const present = useIsPresent();
  const reduced = useReducedMotion();
  const surface = useTheme().palette.m3.surface;
  return <m.div aria-hidden={!present} inert={!present}
    initial={{ opacity: 0, x: reduced ? 0 : 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
    transition={{ x: springs.slowSpatial, opacity: springs.defaultEffects }}
    style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', backgroundColor: surface, zIndex: 1, pointerEvents: present ? 'auto' : 'none' }}>
    {children}
  </m.div>;
}

function DropOverlay() {
  return (
    <Box sx={(t) => ({
      position: 'absolute',
      inset: 12,
      borderRadius: '32px',
      bgcolor: `color-mix(in srgb, ${t.palette.m3.primaryContainer} 88%, transparent)`,
      color: t.palette.m3.onPrimaryContainer,
      outline: `2px dashed ${t.palette.m3.primary}`,
      outlineOffset: -10,
      display: 'grid',
      placeItems: 'center',
      backdropFilter: 'blur(6px)',
      '--drop-shape': t.palette.m3.primary,
      '--drop-icon': t.palette.m3.onPrimary,
    })}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <ExpressiveShape shape="sunny" size={120} color="var(--drop-shape)" spin={14}>
          <DriveFolderUploadIcon sx={{ fontSize: 48, color: 'var(--drop-icon)' }} />
        </ExpressiveShape>
        <Typography variant="headlineSmallEmphasized">Drop to open this folder</Typography>
      </Box>
    </Box>
  );
}
