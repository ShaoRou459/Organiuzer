import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Box, Switch,
  FormControlLabel, MenuItem, Divider, Tabs, Tab, Link, Chip
} from '@mui/material';
import packageJson from '../../../../package.json';

function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ pt: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

export default function SettingsDialog({ open, onClose, onThemeChange }) {
  const [tabIndex, setTabIndex] = useState(0);
  const [settings, setSettings] = useState({
    apiKey: '',
    baseUrl: '',
    model: 'gpt-4o',
    provider: 'openai',
    debugMode: false,
    themeMode: 'dark'
  });
  const [latestVersion, setLatestVersion] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  useEffect(() => {
    if (open && tabIndex === 2 && !latestVersion) {
      setCheckingUpdate(true);
      fetch('https://api.github.com/repos/ShaoRou459/Organiuzer/releases/latest')
        .then(res => res.json())
        .then(data => {
          if (data && data.tag_name) {
            setLatestVersion(data.tag_name.replace(/^v/, ''));
          } else {
            // Either no releases yet, or API rate limit exceeded
            setLatestVersion('unreleased');
          }
        })
        .catch(err => {
          console.error("Failed to fetch latest version:", err);
          setLatestVersion('error');
        })
        .finally(() => setCheckingUpdate(false));
    }
  }, [open, tabIndex, latestVersion]);

  const loadSettings = async () => {
    try {
      const allSettings = await window.electronAPI.getAllSettings();
      setSettings(prev => ({ ...prev, ...allSettings }));
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      // Save all settings individually or we could add a bulk set method
      for (const [key, value] of Object.entries(settings)) {
        await window.electronAPI.setSettings(key, value);
      }

      // Notify parent about theme change immediately
      if (onThemeChange) {
        onThemeChange(settings.themeMode);
      }

      onClose();
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Settings</DialogTitle>
      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabIndex} onChange={(e, v) => setTabIndex(v)} aria-label="settings tabs">
            <Tab label="AI Configuration" />
            <Tab label="General" />
            <Tab label="About" />
          </Tabs>
        </Box>

        {/* AI Settings */}
        <TabPanel value={tabIndex} index={0}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              select
              label="AI Provider"
              value={settings.provider || 'openai'}
              onChange={(e) => handleChange('provider', e.target.value)}
              fullWidth
            >
              <MenuItem value="openai">OpenAI</MenuItem>
              <MenuItem value="custom">Custom / Local (OpenAI Compatible)</MenuItem>
            </TextField>

            <TextField
              label="API Key"
              type="password"
              fullWidth
              value={settings.apiKey || ''}
              onChange={(e) => handleChange('apiKey', e.target.value)}
              helperText="Your OpenAI API Key or equivalent."
            />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Model Name"
                fullWidth
                value={settings.model || 'gpt-4o'}
                onChange={(e) => handleChange('model', e.target.value)}
                helperText="e.g., gpt-4o, gpt-3.5-turbo, or local model name"
              />
            </Box>

            <TextField
              label="Base URL (Optional)"
              fullWidth
              value={settings.baseUrl || ''}
              onChange={(e) => handleChange('baseUrl', e.target.value)}
              placeholder={settings.provider === 'custom' ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1'}
              helperText={settings.provider === 'custom'
                ? "Required for local LLMs (Ollama, LM Studio, etc.)"
                : "Leave empty to use default OpenAI endpoint, or enter a custom URL"}
            />
          </Box>
        </TabPanel>

        {/* General Settings */}
        <TabPanel value={tabIndex} index={1}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              select
              label="Theme"
              value={settings.themeMode || 'dark'}
              onChange={(e) => handleChange('themeMode', e.target.value)}
              fullWidth
            >
              <MenuItem value="dark">Dark</MenuItem>
              <MenuItem value="light">Light</MenuItem>
            </TextField>

            <FormControlLabel
              control={
                <Switch
                  checked={settings.debugMode || false}
                  onChange={(e) => handleChange('debugMode', e.target.checked)}
                />
              }
              label="Debug Mode"
            />
            <Typography variant="caption" color="text.secondary">
              Enables detailed logging and shows raw AI responses in the console.
            </Typography>
          </Box>
        </TabPanel>

        {/* About Settings */}
        <TabPanel value={tabIndex} index={2}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', textAlign: 'center', py: 4 }}>
            <Typography variant="h5" fontWeight="bold">
              {packageJson.build?.productName || 'Organiuzer'}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
              <Typography variant="subtitle1" color="text.secondary">
                Version {packageJson.version}
              </Typography>
              {checkingUpdate && <Chip size="small" label="Checking..." variant="outlined" />}
              {!checkingUpdate && latestVersion && latestVersion !== 'unreleased' && latestVersion !== 'error' && latestVersion !== packageJson.version && (
                <Chip size="small" color="primary" label={`Update: v${latestVersion}`} component="a" href="https://github.com/ShaoRou459/Organiuzer/releases/latest" target="_blank" clickable />
              )}
              {!checkingUpdate && latestVersion && (latestVersion === packageJson.version || latestVersion === 'unreleased') && (
                <Chip size="small" color="success" label="Up to date" variant="outlined" />
              )}
              {!checkingUpdate && latestVersion === 'error' && (
                <Chip size="small" color="default" label="Update check failed" variant="outlined" />
              )}
            </Box>
            <Typography variant="body1" sx={{ mt: 2, maxWidth: 400 }}>
              {packageJson.description}
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mt: 4 }}>
              Created by <Link href="https://github.com/ShaoRou459/Organiuzer" target="_blank" rel="noreferrer" color="inherit" underline="hover">ShaoRou459</Link>
            </Typography>
          </Box>
        </TabPanel>

      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">Save Changes</Button>
      </DialogActions>
    </Dialog>
  );
}