import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Box, Switch,
  FormControlLabel, MenuItem, Divider, Tabs, Tab
} from '@mui/material';

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

  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

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

              {settings.provider === 'custom' && (
                <TextField
                  label="Base URL"
                  fullWidth
                  value={settings.baseUrl || ''}
                  onChange={(e) => handleChange('baseUrl', e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  helperText="For local LLMs (Ollama, LM Studio)"
                />
              )}
            </Box>
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

      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">Save Changes</Button>
      </DialogActions>
    </Dialog>
  );
}