import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Alert, Box, Button, Divider, IconButton, InputAdornment, Radio, RadioGroup,
  FormControlLabel, Switch, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup,
  Typography, useTheme,
} from '@mui/material';
import { AnimatePresence, LayoutGroup, motion as m, useIsPresent, useReducedMotion } from 'framer-motion';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import CheckIcon from '@mui/icons-material/Check';
import WifiTetheringIcon from '@mui/icons-material/WifiTethering';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import BrightnessAutoOutlinedIcon from '@mui/icons-material/BrightnessAutoOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import GitHubIcon from '@mui/icons-material/GitHub';
import PrivacyTipOutlinedIcon from '@mui/icons-material/PrivacyTipOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import ExpressiveShape from './common/ExpressiveShape';
import LoadingIndicator from './common/LoadingIndicator';
import { buildScheme } from '../theme/theme';
import { corner, motion, SEED_COLORS, springs } from '../theme/tokens';

const DEFAULTS = { provider: 'openai', baseUrl: '', model: 'gpt-4o', renameModel: '', debugMode: false, themeMode: 'system', seedColor: '#6750A4', hasApiKey: false, apiKeyHint: '' };
const FIELDS = ['provider', 'baseUrl', 'model', 'renameModel', 'debugMode', 'themeMode', 'seedColor'];
const SECTIONS = [
  { id: 'appearance', label: 'Appearance', title: 'Appearance', description: 'Choose your theme and accent color.', Icon: PaletteOutlinedIcon },
  { id: 'ai', label: 'AI & naming', title: 'AI & document naming', description: 'Connect a provider and choose the models for your files.', Icon: AutoAwesomeOutlinedIcon },
  { id: 'about', label: 'About', title: 'About Organiuzer', description: 'App information, updates, and how your files are handled.', Icon: InfoOutlinedIcon },
];
const sectionFor = value => value === 'general' ? 'appearance' : SECTIONS.some(s => s.id === value) ? value : 'appearance';
const patchFor = form => Object.fromEntries(FIELDS.map(key => [key, form[key]]));
const validServerUrl = value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname); }
  catch { return false; }
};

export default function SettingsPage({ initialTab = 'appearance', onClose, onSaved, onPreview, returnLabel = 'Home' }) {
  const theme = useTheme();
  const c = theme.palette.m3;
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const navId = useId();
  const heading = useRef(null);
  const content = useRef(null);
  const testRequest = useRef(0);
  const loadRequest = useRef(0);
  const alive = useRef(false);
  const [section, setSection] = useState(() => sectionFor(initialTab));
  const [form, setForm] = useState(DEFAULTS);
  const [baseline, setBaseline] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedMessage, setSavedMessage] = useState(false);
  const [appInfo, setAppInfo] = useState(null);
  const [infoError, setInfoError] = useState('');
  const [update, setUpdate] = useState(null);
  const dirty = FIELDS.some(key => form[key] !== baseline[key]) || Boolean(apiKey.trim()) || clearKey;
  const isCustom = form.provider === 'custom';
  const baseUrlMissing = isCustom && !String(form.baseUrl || '').trim();
  const invalidUrl = Boolean(form.baseUrl.trim()) && !validServerUrl(form.baseUrl.trim());
  const invalidModel = !form.model.trim();
  const invalid = baseUrlMissing || invalidUrl || invalidModel;
  const selectedSection = SECTIONS.find(s => s.id === section);

  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    setLoadError('');
    try {
      const settings = await window.electronAPI.getAllSettings();
      if (!alive.current || request !== loadRequest.current) return;
      const next = { ...DEFAULTS, ...settings };
      setForm(next);
      setBaseline(next);
    } catch {
      if (alive.current && request === loadRequest.current) setLoadError('Couldn’t load your settings. Try again before making changes.');
    } finally {
      if (alive.current && request === loadRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let current = true;
    alive.current = true;
    load();
    window.electronAPI.getAppInfo().then(info => { if (current) setAppInfo(info); })
      .catch(() => { if (current) setInfoError('App information is unavailable.'); });
    heading.current?.focus({ preventScroll: true });
    return () => { current = false; alive.current = false; testRequest.current++; loadRequest.current++; };
  }, [load]);

  const requestLeave = useCallback(() => {
    if (saving) return;
    onPreview?.(null);
    onClose();
  }, [saving, onClose, onPreview]);

  useEffect(() => {
    const onKey = event => {
      if (!present || event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      if (showKey) { setShowKey(false); return; }
      requestLeave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestLeave, showKey, present]);

  const edit = (key, value) => {
    const next = { ...form, [key]: value };
    setForm(next);
    setSaveError('');
    setSavedMessage(false);
    if (key === 'themeMode' || key === 'seedColor') onPreview?.({ themeMode: next.themeMode, seedColor: next.seedColor });
    if (['provider', 'baseUrl', 'model'].includes(key)) { testRequest.current++; setTest(null); }
  };

  const reset = () => {
    setForm(baseline);
    setApiKey('');
    setClearKey(false);
    setShowKey(false);
    testRequest.current++;
    setTest(null);
    setSaveError('');
    setSavedMessage(false);
    onPreview?.(null);
  };

  const runTest = async () => {
    const request = ++testRequest.current;
    setTest({ state: 'running' });
    try {
      const result = await window.electronAPI.testAiConnection({
        provider: form.provider, baseUrl: form.baseUrl, model: form.model,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      if (!alive.current || request !== testRequest.current) return;
      setTest(result?.ok ? { state: result.modelFound ? 'ok' : 'warn', message: result.message || 'Connected.' } : { state: 'error', message: result?.error || 'Connection failed.' });
    } catch (error) {
      if (alive.current && request === testRequest.current) setTest({ state: 'error', message: error?.message || 'Couldn’t test the connection. Try again.' });
    }
  };

  const save = async () => {
    if (!dirty || saving || invalid || loading || loadError) return;
    setSaving(true);
    setSaveError('');
    testRequest.current++;
    setTest(null);
    try {
      const saved = await window.electronAPI.saveSettings({ ...patchFor(form),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(clearKey && !apiKey.trim() ? { clearApiKey: true } : {}),
      });
      if (!alive.current) return;
      const next = { ...DEFAULTS, ...saved };
      setForm(next);
      setBaseline(next);
      setApiKey('');
      setClearKey(false);
      setShowKey(false);
      setSavedMessage(true);
      onSaved?.(saved);
    } catch (error) {
      if (alive.current) setSaveError(error?.message || 'Couldn’t save your settings. Your changes are still here.');
    } finally {
      if (alive.current) setSaving(false);
    }
  };

  const checkUpdate = async () => {
    setUpdate({ status: 'checking' });
    try {
      const result = await window.electronAPI.checkForUpdate();
      if (alive.current) setUpdate(result || { status: 'error' });
    } catch {
      if (alive.current) setUpdate({ status: 'error' });
    }
  };
  const openLink = async url => {
    try { await window.electronAPI.openExternal(url); }
    catch { if (alive.current) setInfoError('Couldn’t open the link. Try again.'); }
  };

  const switchSection = (_event, next) => {
    setSection(next);
    setShowKey(false);
  };
  const keyHelper = clearKey ? 'The saved key will be removed when you save.'
    : form.hasApiKey ? `Saved key ${form.apiKeyHint}. Leave blank to keep it.`
      : isCustom ? 'Optional for most local servers.' : 'Saved on this device. The stored key is never displayed.';

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: c.surface, p: 2, pt: 1, gap: 1.5,
      '& .MuiButton-root': { minHeight: 48 }, '& .MuiIconButton-root': { minWidth: 48, minHeight: 48 } }}>
      <Box component="header" sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1, flexShrink: 0 }}>
        <IconButton aria-label={`Back to ${returnLabel}`} onClick={requestLeave} disabled={saving} sx={{ width: 48, height: 48, bgcolor: c.surfaceContainerHigh, color: c.onSurface }}><ArrowBackIcon /></IconButton>
        <Box sx={{ minWidth: 0 }}>
          <Typography ref={heading} tabIndex={-1} variant="headlineLargeEmphasized" component="h1" sx={{ outline: 'none' }}>Settings</Typography>
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 1.5 }}>
        <Box component="nav" aria-label="Settings" sx={{ width: 208, flexShrink: 0, bgcolor: c.surfaceContainer, borderRadius: corner.xlInc, p: 1.5, overflow: 'hidden' }}>
          <LayoutGroup id={navId}>
            <Tabs value={section} onChange={switchSection} orientation="vertical" aria-label="Settings sections"
              sx={{ minHeight: 48, borderBottom: 0, '& .MuiTabs-indicator': { display: 'none' }, '& .MuiTabs-list': { gap: 1 } }}>
              {SECTIONS.map(({ id, label, Icon }) => <Tab key={id} value={id} id={`${navId}-${id}-tab`} aria-controls={`${navId}-panel`} icon={<Icon sx={{ position: 'relative', zIndex: 1 }} />} iconPosition="start"
                label={<><span style={{ position: 'relative', zIndex: 1 }}>{label}</span>{section === id && <m.span layoutId="settings-indicator" transition={reduced ? { duration: 0 } : springs.fastSpatial} style={{ position: 'absolute', inset: 0, borderRadius: corner.lgInc, background: c.secondaryContainer }} />}</>}
                sx={{ borderRadius: corner.lgInc, minHeight: 56, minWidth: 0, px: 2, maxWidth: 'none', justifyContent: 'flex-start', gap: 1.5, position: 'relative', color: c.onSurfaceVariant, '&.Mui-selected': { color: c.onSecondaryContainer, typography: 'labelLargeEmphasized' }, '&:hover': { bgcolor: `color-mix(in srgb, ${c.onSurface} 8%, transparent)` }, '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: -2 } }} />)}
            </Tabs>
          </LayoutGroup>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', bgcolor: c.surfaceContainerLow, borderRadius: corner.xlInc, overflow: 'hidden' }}>
        <Box ref={content} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 4, scrollbarGutter: 'stable' }}>
          <AnimatePresence mode="wait" initial={false}>
            <SettingsSection key={section} role="tabpanel" id={`${navId}-panel`} aria-labelledby={`${navId}-${section}-tab`} tabIndex={0}
              initial={{ opacity: 0, y: reduced ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ y: springs.defaultSpatial, opacity: springs.defaultEffects }}
              onAnimationStart={() => { if (content.current) content.current.scrollTop = 0; }}
              style={{ maxWidth: 880 }}>
              <Typography variant="headlineMediumEmphasized" component="h2" sx={{ mb: 0.5 }}>{selectedSection.title}</Typography>
              <Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant, mb: 4, maxWidth: 640 }}>{selectedSection.description}</Typography>
              {section === 'about' && loadError && <Alert severity="error" sx={{ mb: 3 }} action={<Button onClick={load} disabled={loading}>Try again</Button>}>{loadError}</Alert>}

              {section !== 'about' && loading ? <Box sx={{ py: 5, display: 'flex', alignItems: 'center', gap: 2 }}><LoadingIndicator size={40} label="Loading settings" /><Typography>Loading your preferences…</Typography></Box>
                : section !== 'about' && loadError ? <Alert severity="error" action={<Button onClick={load}>Try again</Button>}>{loadError}</Alert>
                  : section === 'appearance' ? (
                    <Box component="fieldset" disabled={saving} sx={{ m: 0, p: 0, border: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <Field label="Theme" hint="Follow your system or choose a fixed appearance.">
                        <ToggleButtonGroup exclusive fullWidth value={form.themeMode} onChange={(_e, value) => value && edit('themeMode', value)} aria-label="Theme" sx={{ height: 'auto', minHeight: 56, '& button': { minHeight: 56, gap: 1 } }}>
                          <ToggleButton value="system"><BrightnessAutoOutlinedIcon />System</ToggleButton><ToggleButton value="light"><LightModeOutlinedIcon />Light</ToggleButton><ToggleButton value="dark"><DarkModeOutlinedIcon />Dark</ToggleButton>
                        </ToggleButtonGroup>
                      </Field>
                      <Field label="Accent color" hint="Preview a Material color palette across the whole app.">
                        <RadioGroup row value={form.seedColor.toLowerCase()} onChange={event => edit('seedColor', event.target.value)} aria-label="Accent color" sx={{ gap: 2 }}>
                          {SEED_COLORS.map(seed => <ColorChoice key={seed.value} seed={seed} selected={form.seedColor.toLowerCase() === seed.value.toLowerCase()} />)}
                        </RadioGroup>
                      </Field>
                    </Box>
                  ) : section === 'ai' ? (
                    <Box component="fieldset" disabled={saving} sx={{ m: 0, p: 0, border: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <Field label="Provider" hint="Use OpenAI or connect an OpenAI-compatible service or local server.">
                        <ToggleButtonGroup exclusive fullWidth value={form.provider} onChange={(_e, value) => value && edit('provider', value)} aria-label="AI provider" sx={{ height: 'auto', minHeight: 48, '& button': { minHeight: 48 } }}>
                          <ToggleButton value="openai">{!isCustom && <CheckIcon fontSize="small" />}OpenAI</ToggleButton><ToggleButton value="custom">{isCustom && <CheckIcon fontSize="small" />}Compatible server</ToggleButton>
                        </ToggleButtonGroup>
                      </Field>
                      <TextField label="API key" type={showKey ? 'text' : 'password'} value={apiKey} autoComplete="off" fullWidth
                        onChange={event => { setApiKey(event.target.value); setClearKey(false); testRequest.current++; setTest(null); setSavedMessage(false); setSaveError(''); }}
                        placeholder={form.hasApiKey && !clearKey ? form.apiKeyHint : ''} helperText={keyHelper}
                        slotProps={{ inputLabel: { shrink: form.hasApiKey && !clearKey ? true : undefined }, input: { endAdornment: <InputAdornment position="end">
                          {form.hasApiKey && !apiKey && !clearKey && <Button size="small" onClick={() => { setClearKey(true); testRequest.current++; setTest(null); setSavedMessage(false); }}>Remove</Button>}
                          <IconButton aria-label={showKey ? 'Hide key' : 'Show key'} onClick={() => setShowKey(!showKey)} edge="end">{showKey ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}</IconButton>
                        </InputAdornment> } }} />
                      <TextField label={isCustom ? 'Server URL' : 'Server URL (optional)'} value={form.baseUrl} onChange={event => edit('baseUrl', event.target.value)} fullWidth
                        placeholder={isCustom ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1'} error={baseUrlMissing || invalidUrl} slotProps={{ inputLabel: { shrink: true } }}
                        helperText={baseUrlMissing ? 'Required for a compatible server.' : invalidUrl ? 'Enter a URL starting with http:// or https://.' : isCustom ? 'For example Ollama, LM Studio, or OpenRouter.' : 'Leave blank to use OpenAI directly.'} />
                      <TextField label="Organization model" value={form.model} onChange={event => edit('model', event.target.value)} error={invalidModel} helperText={invalidModel ? 'Enter a model name.' : 'Used when planning how to organize a folder.'} fullWidth />
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
                        <Button variant="tonal" startIcon={<WifiTetheringIcon />} onClick={runTest} disabled={test?.state === 'running' || invalid || clearKey}>Test connection</Button>
                        {test?.state === 'running' && <LoadingIndicator size={28} label="Testing connection" />}
                        {clearKey && <Typography variant="bodySmall" sx={{ color: c.onSurfaceVariant }}>Save the key removal before testing.</Typography>}
                      </Box>
                      {test && test.state !== 'running' && <Alert severity={test.state === 'ok' ? 'success' : test.state === 'warn' ? 'warning' : 'error'} role="status">{test.message}</Alert>}
                      <Divider />
                      <Field label="Document naming" hint="Clear document headings are named locally for free. AI handles only the excerpts you choose to send.">
                        <TextField label="Naming model (optional)" value={form.renameModel} onChange={event => edit('renameModel', event.target.value)} placeholder={isCustom || form.baseUrl ? form.model : 'gpt-4o-mini'} fullWidth
                          helperText={isCustom || form.baseUrl ? 'Leave blank to use your organization model.' : 'Leave blank for gpt-4o-mini, the fast, lower-cost default.'} />
                      </Field>
                      <Box sx={{ display: 'flex', gap: 1.5, color: c.onSurfaceVariant }}><PrivacyTipOutlinedIcon sx={{ fontSize: 20, flexShrink: 0 }} /><Typography variant="bodySmall">Smart rename sends selected cleaned excerpts, never document attachments. Images are excluded. Review excerpts for private details, or choose local-only mode.</Typography></Box>
                      <Divider />
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ flex: 1 }}><Typography component="label" htmlFor="debug-switch" variant="titleSmall">Debug logging</Typography><Typography id="debug-hint" variant="bodySmall" sx={{ color: c.onSurfaceVariant }}>Writes organization prompts and AI responses to the developer console. Keep off for private files.</Typography></Box>
                        <Switch id="debug-switch" checked={Boolean(form.debugMode)} onChange={event => edit('debugMode', event.target.checked)} slotProps={{ input: { 'aria-describedby': 'debug-hint' } }} />
                      </Box>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, py: 1 }}>
                        <ExpressiveShape shape="cookie9" size={72} color={c.primaryContainer}><FolderOutlinedIcon sx={{ fontSize: 32, color: c.onPrimaryContainer }} /></ExpressiveShape>
                        <Box><Typography variant="titleLargeEmphasized" component="p">Organiuzer</Typography><Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant }}>{appInfo?.version ? `Version ${appInfo.version}` : infoError ? 'Version unavailable' : 'Loading version…'}</Typography></Box>
                      </Box>
                      <Typography variant="bodyLarge" sx={{ maxWidth: 640 }}>A calmer home for your files. Find duplicates, organize folders, and give unclear documents useful names.</Typography>
                      <Divider />
                      <AboutRow Icon={FolderOutlinedIcon} title="Review before applying" description="Check the proposed names and folder layout before making changes." />
                      <AboutRow Icon={PrivacyTipOutlinedIcon} title="Local when possible" description="Duplicate checks and clear document headings work on your device. AI naming uses only the cleaned excerpts you select." />
                      <AboutRow Icon={UndoIcon} title="Changes you can undo" description="Renames and organization runs appear in History. Duplicate cleanup moves files to your system trash." />
                      <Divider />
                      <Field label="Updates">
                        <Typography role="status" variant="bodyMedium" sx={{ color: c.onSurfaceVariant, mb: 1.5 }}>{update?.status === 'checking' ? 'Checking for updates…' : update?.status === 'current' ? 'You’re up to date.' : update?.status === 'available' ? `Version ${update.latest} is available.` : update?.status === 'unreleased' ? 'No public release is available yet.' : update?.status === 'error' ? 'Couldn’t check for updates. Try again.' : 'Check for a newer release on GitHub.'}</Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}><Button variant="tonal" disabled={update?.status === 'checking'} onClick={checkUpdate}>Check for updates</Button>{update?.status === 'available' && <Button variant="contained" endIcon={<OpenInNewIcon />} onClick={() => openLink(update.url)}>Download update</Button>}</Box>
                      </Field>
                      {infoError && <Alert severity="error">{infoError}</Alert>}
                      <Box><Button variant="text" startIcon={<GitHubIcon />} endIcon={<OpenInNewIcon />} disabled={!appInfo?.repoUrl} onClick={() => openLink(appInfo.repoUrl)}>View project on GitHub</Button></Box>
                    </Box>
                  )}
            </SettingsSection>
          </AnimatePresence>
        </Box>
      <Box component="footer" sx={{ flexShrink: 0, display: section === 'about' && !dirty && !saving && !saveError && !loadError ? 'none' : 'flex', flexDirection: 'column', gap: 1, px: 4, py: 2, borderTop: `1px solid ${c.outlineVariant}` }}>
        {saveError && <Alert severity="error">{saveError}</Alert>}
        {dirty && invalid && section !== 'ai' && <Alert severity="warning" action={<Button onClick={() => setSection('ai')}>Review AI settings</Button>}>Complete the AI settings before saving.</Alert>}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, minHeight: 48 }}>
          <Box role="status" aria-live="polite" sx={{ display: 'flex', gap: 1, alignItems: 'center', color: c.onSurfaceVariant }}>
            {savedMessage && !dirty && <CheckIcon sx={{ fontSize: 18, color: c.success }} />}
            <Typography variant="bodyMedium">{loading ? 'Loading preferences…' : loadError ? 'Settings unavailable' : saving ? 'Saving preferences…' : savedMessage && !dirty ? 'Settings saved' : ''}</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}><Button onClick={reset} disabled={!dirty || saving}>Reset changes</Button><Button variant="contained" startIcon={<SaveOutlinedIcon />} onClick={save} disabled={!dirty || saving || invalid || loading || Boolean(loadError)}>Save changes</Button></Box>
        </Box>
      </Box>
      </Box>
      </Box>
    </Box>
  );
}

function SettingsSection({ children, onAnimationStart, ...props }) {
  const present = useIsPresent();
  return <m.section {...props} inert={!present} aria-hidden={!present}
    onAnimationStart={(...args) => { if (present) onAnimationStart?.(...args); }}>{children}</m.section>;
}

function Field({ label, hint, children }) {
  return <Box><Typography variant="titleMediumEmphasized" component="h3" sx={{ mb: hint ? 0.5 : 1.5 }}>{label}</Typography>{hint && <Typography variant="bodyMedium" sx={{ color: 'text.secondary', mb: 2 }}>{hint}</Typography>}{children}</Box>;
}

function ColorChoice({ seed, selected }) {
  const { palette } = useTheme();
  const scheme = buildScheme(seed.value, palette.mode === 'dark');
  const reduced = useReducedMotion();
  const icon = active => <m.div animate={{ rotate: !reduced && active ? 30 : 0 }} transition={springs.fastSpatial}><ExpressiveShape shape={active ? 'cookie9' : 'circle'} size={36} color={scheme.primary}>{active && <CheckIcon sx={{ fontSize: 20, color: scheme.onPrimary, transform: reduced ? 'none' : 'rotate(-30deg)' }} />}</ExpressiveShape></m.div>;
  return <FormControlLabel value={seed.value.toLowerCase()} label={seed.name} control={<Radio icon={icon(false)} checkedIcon={icon(true)} sx={{ p: 1.25, bgcolor: selected ? palette.m3.surfaceContainerHighest : 'transparent', transition: motion.effects(['background-color']), '&:hover': { bgcolor: palette.m3.surfaceContainerHighest } }} />}
    sx={{ m: 0, flexDirection: 'column', gap: 0.5, '& .MuiFormControlLabel-label': { typography: selected ? 'labelMediumEmphasized' : 'labelMedium', color: selected ? palette.m3.onSurface : palette.m3.onSurfaceVariant } }} />;
}

function AboutRow({ Icon, title, description }) {
  const { palette } = useTheme();
  return <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}><Icon sx={{ color: palette.m3.secondary, mt: 0.25 }} /><Box sx={{ maxWidth: 640 }}><Typography variant="titleSmallEmphasized" component="h3">{title}</Typography><Typography variant="bodyMedium" sx={{ color: palette.m3.onSurfaceVariant, mt: 0.5 }}>{description}</Typography></Box></Box>;
}
