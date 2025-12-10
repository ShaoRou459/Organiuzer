import React, { useState, useEffect, useMemo } from 'react';
import { Box } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

// Components
import TitleBar from './components/TitleBar';
import HomeView from './components/HomeView';
import FolderManager from './components/FolderManager';
import SettingsDialog from './components/SettingsDialog';
import { getTheme } from './theme/theme';

export default function App() {
  const [currentView, setCurrentView] = useState('home'); // 'home' | 'folder'
  const [currentPath, setCurrentPath] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [themeMode, setThemeMode] = useState('dark');

  // State for metrics (mocked or loaded from settings/history)
  const [metrics, setMetrics] = useState({
    filesOrganized: 0,
    spaceSaved: '0 MB',
    timeSaved: '0 hrs'
  });

  useEffect(() => {
    // Load initial theme setting
    const loadTheme = async () => {
      try {
        const storedMode = await window.electronAPI.getSettings('themeMode');
        if (storedMode) setThemeMode(storedMode);
      } catch (e) {
        console.error(e);
      }
    };
    loadTheme();
  }, []);

  const theme = useMemo(() => getTheme(themeMode), [themeMode]);

  const handleSelectFolder = async () => {
    try {
      const path = await window.electronAPI.selectFolder();
      if (path) {
        setCurrentPath(path);
        setCurrentView('folder');
      }
    } catch (error) {
      console.error("Error selecting folder:", error);
    }
  };

  const handleBackHome = () => {
    setCurrentView('home');
    setCurrentPath(null);
  };

  const handleOpenSettings = () => {
    setIsSettingsOpen(true);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        color: 'text.primary',
        overflow: 'hidden',
      }}>
        {/* Custom Title Bar */}
        <TitleBar />

        {/* Main Content Area */}
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {currentView === 'home' && (
            <HomeView
              onSelectFolder={handleSelectFolder}
              onOpenSettings={handleOpenSettings}
              metrics={metrics}
            />
          )}

          {currentView === 'folder' && currentPath && (
            <FolderManager
              path={currentPath}
              onBack={handleBackHome}
              onOpenSettings={handleOpenSettings}
            />
          )}
        </Box>

        <SettingsDialog
          open={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onThemeChange={setThemeMode}
        />
      </Box>
    </ThemeProvider>
  );
}
