import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Box, Switch,
  FormControlLabel, MenuItem, Divider, Tabs, Tab
} from '@mui/material';
import { useLanguage } from '../contexts/LanguageContext';

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
  const { t, setLanguage: setGlobalLanguage } = useLanguage();
  const [tabIndex, setTabIndex] = useState(0);
  const [settings, setSettings] = useState({
    apiKey: '',
    baseUrl: '',
    model: 'gpt-4o',
    provider: 'openai',
    debugMode: false,
    themeMode: 'dark',
    language: 'en'
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
        // skip language as it's handled via context to update global state immediately
        if (key === 'language') continue;
        await window.electronAPI.setSettings(key, value);
      }

      // Update global language context
      if (settings.language) {
        await setGlobalLanguage(settings.language);
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
      <DialogTitle>{t('settings.title')}</DialogTitle>
      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabIndex} onChange={(e, v) => setTabIndex(v)} aria-label="settings tabs">
            <Tab label={t('settings.tabs.ai')} />
            <Tab label={t('settings.tabs.general')} />
          </Tabs>
        </Box>

        {/* AI Settings */}
        <TabPanel value={tabIndex} index={0}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              select
              label={t('settings.ai.provider')}
              value={settings.provider || 'openai'}
              onChange={(e) => handleChange('provider', e.target.value)}
              fullWidth
            >
              <MenuItem value="openai">{t('settings.ai.providerOptions.openai')}</MenuItem>
              <MenuItem value="custom">{t('settings.ai.providerOptions.custom')}</MenuItem>
            </TextField>

            <TextField
              label={t('settings.ai.apiKey')}
              type="password"
              fullWidth
              value={settings.apiKey || ''}
              onChange={(e) => handleChange('apiKey', e.target.value)}
              helperText={t('settings.ai.apiKeyHelper')}
            />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label={t('settings.ai.model')}
                fullWidth
                value={settings.model || 'gpt-4o'}
                onChange={(e) => handleChange('model', e.target.value)}
                helperText={t('settings.ai.modelHelper')}
              />
            </Box>

            <TextField
              label={t('settings.ai.baseUrl')}
              fullWidth
              value={settings.baseUrl || ''}
              onChange={(e) => handleChange('baseUrl', e.target.value)}
              placeholder={settings.provider === 'custom' ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1'}
              helperText={settings.provider === 'custom'
                ? t('settings.ai.baseUrlHelperCustom')
                : t('settings.ai.baseUrlHelperDefault')}
            />
          </Box>
        </TabPanel>

        {/* General Settings */}
        <TabPanel value={tabIndex} index={1}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              select
              label={t('settings.general.language')}
              value={settings.language || 'en'}
              onChange={(e) => handleChange('language', e.target.value)}
              fullWidth
            >
              <MenuItem value="en">English</MenuItem>
              <MenuItem value="zh">中文 (简体)</MenuItem>
            </TextField>

            <TextField
              select
              label={t('settings.general.theme')}
              value={settings.themeMode || 'dark'}
              onChange={(e) => handleChange('themeMode', e.target.value)}
              fullWidth
            >
              <MenuItem value="dark">{t('settings.general.themeOptions.dark')}</MenuItem>
              <MenuItem value="light">{t('settings.general.themeOptions.light')}</MenuItem>
            </TextField>

            <FormControlLabel
              control={
                <Switch
                  checked={settings.debugMode || false}
                  onChange={(e) => handleChange('debugMode', e.target.checked)}
                />
              }
              label={t('settings.general.debugMode')}
            />
            <Typography variant="caption" color="text.secondary">
              {t('settings.general.debugModeHelper')}
            </Typography>
          </Box>
        </TabPanel>

      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('settings.actions.cancel')}</Button>
        <Button onClick={handleSave} variant="contained">{t('settings.actions.save')}</Button>
      </DialogActions>
    </Dialog>
  );
}