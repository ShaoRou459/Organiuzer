import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, IconButton, TextField, Typography, ToggleButton, ToggleButtonGroup, Accordion, AccordionSummary, AccordionDetails, useTheme } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import { motion as m, useReducedMotion } from 'framer-motion';
import { corner, springs } from '../../theme/tokens';
import { useSnackbar } from '../../context/SnackbarContext';

const toDraft = preset => ({ ...preset, rules: preset.rules.map(row => ({ ...row, extensionText: row.extensions.join(', ') })), exclusionText: (preset.excludedNames || []).join('\n') });
const toPreset = draft => ({ ...draft, rules: draft.rules.map(({ extensionText, destination }) => ({ extensions: extensionText.split(/[,\s]+/).filter(Boolean), destination })), excludedNames: draft.exclusionText.split('\n').map(name => name.trim()).filter(Boolean) });

export default function PresetPanel({ path, onCancel, onPreview, onBusyChange }) {
  const c = useTheme().palette.m3;
  const reduced = useReducedMotion();
  const { notify } = useSnackbar();
  const [presets, setPresets] = useState([]);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => {
    let active = true;
    window.electronAPI.getCleanupPresets(path).then(result => {
      if (!active) return;
      if (!result?.ok) throw new Error(result?.error || 'Couldn’t load presets.');
      setPresets(result.presets);
      setDraft(toDraft(result.presets.find(p => p.id === result.selectedId) || result.presets[0]));
    }).catch(e => active && setError(e.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [path]);
  const editRule = (index, patch) => setDraft(previous => ({ ...previous, rules: previous.rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule) }));
  const save = async () => {
    setError(''); setBusy(true);
    try {
      const result = await window.electronAPI.saveCleanupPreset(path, toPreset(draft));
      if (!result?.ok) throw new Error(result?.error || 'Couldn’t save this preset.');
      setPresets(result.presets); setDraft(toDraft(result.preset));
      notify('Preset saved. You can use it in other folders.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const preview = async () => {
    setError(''); setBusy(true);
    try {
      const result = await window.electronAPI.previewCleanupPreset(path, toPreset(draft));
      if (!result?.ok) throw new Error(result?.error || 'Couldn’t build this plan.');
      if (!Object.keys(result.plan).length) { notify('No files match these rules. Everything stays where it is.'); return; }
      onPreview(result);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2, '& .MuiButton-root': { minHeight: 48 }, '& .MuiIconButton-root': { width: 48, height: 48 } }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <IconButton aria-label="Back to folder" onClick={onCancel} disabled={busy}><ArrowBackIcon /></IconButton>
      <Box><Typography variant="headlineSmallEmphasized" component="h2">Organize with a preset</Typography><Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant }}>File rules run on your computer. Review every move before applying.</Typography></Box>
    </Box>
    {error && <Alert severity="error">{error}</Alert>}
    {loading && <Typography role="status">Loading your presets…</Typography>}
    {draft && <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pb: 2 }}>
      <ToggleButtonGroup exclusive value={draft.id} onChange={(_event, id) => id && setDraft(toDraft(presets.find(p => p.id === id)))} aria-label="Organization preset" disabled={busy} sx={{ flexWrap: 'wrap', mb: 3 }}>
        {presets.map(preset => <ToggleButton key={preset.id} value={preset.id} sx={{ minHeight: 48 }}>{preset.name}</ToggleButton>)}
      </ToggleButtonGroup>
      <Typography variant="bodyLarge" sx={{ mb: 2, color: c.onSurfaceVariant }}>{draft.description}</Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {draft.rules.map((row, index) => <Box key={index} component="li" sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1.5, bgcolor: c.surfaceContainerLow, borderRadius: corner.lg }}><FolderOutlinedIcon sx={{ color: c.primary }} /><Box sx={{ minWidth: 0, flex: 1 }}><Typography variant="titleMedium">{row.destination || 'Choose a folder'}</Typography><Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant, overflowWrap: 'anywhere' }}>{row.extensionText || 'Add file extensions'}</Typography></Box></Box>)}
      </Box>
      <Accordion disableGutters sx={{ mt: 3, borderRadius: `${corner.xl} !important`, bgcolor: c.surfaceContainer, '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 56 }}><Typography variant="titleMedium">Customize and save</Typography></AccordionSummary>
        <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="Preset name" value={draft.name} disabled={busy} onChange={e => setDraft({ ...draft, name: e.target.value })} helperText="Changing a starter preset saves your own reusable copy." />
          {draft.rules.map((row, index) => <Box key={index} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
            <TextField label={`Extensions for rule ${index + 1}`} value={row.extensionText} disabled={busy} onChange={e => editRule(index, { extensionText: e.target.value })} sx={{ flex: 1, minWidth: 140 }} />
            <TextField label={`Destination for rule ${index + 1}`} value={row.destination} disabled={busy} onChange={e => editRule(index, { destination: e.target.value })} sx={{ flex: 1, minWidth: 140 }} />
            <IconButton aria-label={`Remove rule ${index + 1}`} disabled={busy || draft.rules.length === 1} onClick={() => setDraft({ ...draft, rules: draft.rules.filter((_row, i) => i !== index) })}><CloseIcon /></IconButton>
          </Box>)}
          <Button variant="text" startIcon={<AddIcon />} disabled={busy || draft.rules.length >= 20} onClick={() => setDraft({ ...draft, rules: [...draft.rules, { extensionText: '', destination: '' }] })} sx={{ alignSelf: 'flex-start' }}>Add rule</Button>
          <TextField label="Keep these names in place" multiline minRows={2} value={draft.exclusionText} disabled={busy} onChange={e => setDraft({ ...draft, exclusionText: e.target.value })} helperText="One exact file name per line. Folders always stay in place." />
          <Button variant="tonal" onClick={save} disabled={busy} sx={{ alignSelf: 'flex-start' }}>Save preset</Button>
        </AccordionDetails>
      </Accordion>
    </Box>}
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, bgcolor: c.surface, pt: 1 }}>
      <Button onClick={onCancel} disabled={busy}>Back to folder</Button>
      <m.div whileTap={reduced ? {} : { scale: 0.97 }} transition={springs.fastSpatial}><Button variant="contained" size="large" onClick={preview} disabled={busy || !draft}>{busy ? 'Preparing…' : 'Preview moves'}</Button></m.div>
    </Box>
  </Box>;
}
