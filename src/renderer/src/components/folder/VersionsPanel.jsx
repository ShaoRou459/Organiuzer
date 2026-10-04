import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, ButtonBase, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, TextField, Typography, useTheme } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DifferenceOutlinedIcon from '@mui/icons-material/DifferenceOutlined';
import { motion as m, useReducedMotion } from 'framer-motion';
import { ConfirmDialog } from './Dialogs';
import ProgressPanel from './ProgressPanel';
import FileIcon from './FileIcon';
import { corner, springs } from '../../theme/tokens';
import { formatBytes, pluralize } from '../../utils/format';
import { useSnackbar } from '../../context/SnackbarContext';

const modified = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const reasonLabel = reason => ({ filename: 'Related download names', content: 'Similar document text', 'filename+content': 'Related names and similar text' }[reason] || reason);
const errorLabel = error => typeof error === 'string' ? error : `${error.name || 'Document'}: ${error.reason || error.message || 'Couldn’t recycle this file.'}`;

function ComparedText({ text, otherText, side, colors }) {
  const otherLines = new Set(String(otherText || '').split(/\r?\n/).map(line => line.trim()));
  return String(text || 'No readable text available.').split(/\r?\n/).map((line, index) => {
    const changed = line.trim() && !otherLines.has(line.trim());
    return <Box component="span" key={index} sx={{ display: 'block', minHeight: '1em', bgcolor: changed ? side ? colors.tertiaryContainer : colors.errorContainer : 'transparent', color: changed ? side ? colors.onTertiaryContainer : colors.onErrorContainer : 'inherit', borderRadius: corner.xs, px: 0.5 }}>{line || '\u00a0'}</Box>;
  });
}

export default function VersionsPanel({ path, onCancel, onChanged, onBusyChange }) {
  const c = useTheme().palette.m3;
  const reduced = useReducedMotion();
  const { notify } = useSnackbar();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState({});
  const [confirm, setConfirm] = useState(false);
  const [comparison, setComparison] = useState(null);
  const [compareIds, setCompareIds] = useState([]);
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareError, setCompareError] = useState('');
  const request = useRef(0);
  const alive = useRef(true);
  const api = window.electronAPI;
  const scan = useCallback(async () => {
    const id = ++request.current;
    setLoading(true); setError(''); setSelected({}); setResult(null); setProgress(null);
    try {
      const response = await window.electronAPI.findDocumentVersions(path, id);
      if (!alive.current || request.current !== id) return;
      if (response?.cancelled) { setLoading(false); return; }
      if (!response?.ok) throw new Error(response?.error || 'Couldn’t check document versions.');
      setResult(response);
    } catch (e) { if (alive.current && id === request.current) setError(e.message); }
    finally { if (alive.current && id === request.current) setLoading(false); }
  }, [path]);
  useEffect(() => {
    alive.current = true;
    const off = api.onDocumentVersionProgress?.(p => { if (p.rootPath === path && p.requestId === request.current) setProgress(p); });
    scan();
    return () => { alive.current = false; request.current++; off?.(); api.cancelDocumentVersions?.(); };
  }, [path, scan]);
  useEffect(() => { onBusyChange?.(loading || busy || compareBusy); return () => onBusyChange?.(false); }, [loading, busy, compareBusy, onBusyChange]);
  const back = () => { api.cancelDocumentVersions?.(); request.current++; onCancel(); };
  const choose = (group, id) => setSelected(previous => {
    const next = { ...previous };
    if (next[id]) { delete next[id]; return next; }
    if (group.files.filter(file => !next[file.id]).length <= 1) { notify('Keep at least one version in this group.'); return previous; }
    return { ...previous, [id]: true };
  });
  const keepAll = group => setSelected(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !group.files.some(file => file.id === id))));
  const keepRecent = group => setSelected(previous => {
    const next = { ...previous };
    for (const file of group.files) { if (file.id === group.suggestedKeeperId) delete next[file.id]; else next[file.id] = true; }
    return next;
  });
  const recycle = async () => {
    setConfirm(false); setBusy(true); setError('');
    try {
      const response = await api.recycleDocumentVersions(path, result.scanId, Object.keys(selected));
      if (!alive.current) return;
      if (response?.ok === false && !response.success) throw new Error(response.error || response.errors?.map(errorLabel).join('\n') || 'Couldn’t recycle selected versions.');
      const removed = new Set(response.recycledIds || response.successIds || []);
      const removedPaths = new Set(response.recycledPaths || []);
      setResult(previous => ({ ...previous, groups: previous.groups.map(group => {
        const files = group.files.filter(file => !removed.has(file.id) && !removedPaths.has(file.path));
        return { ...group, files, suggestedKeeperId: files.some(file => file.id === group.suggestedKeeperId) ? group.suggestedKeeperId : files[0]?.id };
      }).filter(group => group.files.length > 1) }));
      setSelected({});
      if (response.failed) setError(`${response.failed} selected files could not be recycled. ${response.errors?.slice(0, 3).map(errorLabel).join('\n') || 'Scan again to refresh the results.'}`);
      if (response.success) {
        notify(`Moved ${pluralize(response.success, 'version')} to the Recycle Bin`);
        onChanged?.();
      }
    } catch (e) { if (alive.current) setError(e.message); }
    finally { if (alive.current) setBusy(false); }
  };
  const compare = async (group, ids = [group.files[0].id, group.files[1].id]) => {
    setComparison({ group }); setCompareIds(ids); setCompareBusy(true); setCompareError('');
    try {
      const response = await api.compareDocumentVersions(path, result.scanId, ids[0], ids[1]);
      if (!alive.current) return;
      if (!response?.ok) throw new Error(response?.error || 'Couldn’t compare these documents.');
      setComparison({ group, ...response });
    } catch (e) { if (alive.current) setCompareError(e.message); }
    finally { if (alive.current) setCompareBusy(false); }
  };
  if (loading) return <ProgressPanel title="Finding document versions" description="Comparing downloaded names and readable document text on your computer." detail={progress ? `${progress.processedFiles || progress.scannedFiles || 0} documents checked` : 'Reading documents'} action={{ label: 'Cancel scan', onClick: back }} />;
  const groups = result?.groups || [];
  const count = Object.keys(selected).length;
  const bytes = groups.reduce((total, group) => total + group.files.reduce((sum, file) => sum + (selected[file.id] ? file.size : 0), 0), 0);
  return <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2, '& .MuiButton-root': { minHeight: 48 }, '& .MuiIconButton-root': { width: 48, height: 48 } }}>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '48px minmax(0, 1fr)', sm: '48px minmax(0, 1fr) auto' }, alignItems: 'center', gap: 1.5 }}>
      <IconButton aria-label="Back to folder" onClick={back} disabled={busy}><ArrowBackIcon /></IconButton>
      <Box sx={{ minWidth: 0, flex: 1 }}><Typography variant="headlineSmallEmphasized" component="h2">Document versions</Typography><Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant }}>Keep the drafts you need. Choose any versions you’d like to clean up.</Typography></Box>
      <Button onClick={scan} disabled={busy} sx={{ gridColumn: { xs: 2, sm: 'auto' }, justifySelf: { xs: 'start', sm: 'end' } }}>Scan again</Button>
    </Box>
    {error && <Alert severity="error" sx={{ whiteSpace: 'pre-line', flexShrink: 0 }}>{error}</Alert>}
    <Typography variant="bodySmall" sx={{ color: c.onSurfaceVariant }}>{result ? `${result.stats?.scannedFiles ?? result.stats?.scanned ?? 0} documents checked locally. ` : ''}Related files may contain different edits. No documents are sent to AI.</Typography>
    {(result?.skipped?.length > 0 || result?.stats?.contentLimitReached || result?.stats?.fileLimitReached || result?.stats?.comparisonLimitReached) && <Alert severity="warning">Some documents could only be checked by name or were outside the scan limits. Text comparisons show readable excerpts.</Alert>}
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, pb: 1 }}>
      {groups.length === 0 && <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', py: 5 }}><Box sx={{ textAlign: 'center', maxWidth: 450 }}><DifferenceOutlinedIcon sx={{ fontSize: 48, color: c.primary, mb: 2 }} /><Typography variant="titleLarge" component="h3">{error ? 'Try checking again' : 'No related versions found'}</Typography><Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant, mt: 1 }}>Checks cover supported documents directly in this folder, including names such as memo (1) and memo (2).</Typography></Box></Box>}
      {groups.map((group, index) => <Box component="section" key={group.id} aria-labelledby={`version-title-${index}`} sx={{ bgcolor: c.surfaceContainerLow, borderRadius: corner.xl, px: { xs: 1, sm: 2 }, py: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', px: 1, mb: 1.5, flexWrap: 'wrap' }}>
          <FileIcon item={{ name: group.files[0].name, type: 'file' }} size={40} />
          <Box sx={{ flex: 1, minWidth: 150 }}><Typography variant="titleLarge" component="h3" id={`version-title-${index}`} sx={{ overflowWrap: 'anywhere' }}>{group.title}</Typography><Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant }}>{group.files.length} versions. {reasonLabel(group.reason)}</Typography></Box>
          <Button startIcon={<DifferenceOutlinedIcon />} onClick={() => compare(group)} disabled={busy}>Compare text</Button>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pb: 1.5, flexWrap: 'wrap' }}><Button onClick={() => keepAll(group)} disabled={busy}>Keep all</Button><Button variant="tonal" onClick={() => keepRecent(group)} disabled={busy || !group.suggestedKeeperId}>Select older versions</Button></Box>
        <Box role="group" aria-label={`Choose versions of ${group.title} to recycle`} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {group.files.map(file => <Box key={file.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <ButtonBase role="checkbox" aria-checked={Boolean(selected[file.id])} aria-label={`${selected[file.id] ? 'Recycle' : 'Keep'} ${file.name}`} disabled={busy} onClick={() => choose(group, file.id)} sx={{ flex: 1, minWidth: 0, textAlign: 'left', px: 0.5, py: 1, borderRadius: corner.lg, bgcolor: selected[file.id] ? c.errorContainer : c.surfaceContainerLowest, color: selected[file.id] ? c.onErrorContainer : c.onSurface, '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 } }}>
              <Checkbox checked={Boolean(selected[file.id])} tabIndex={-1} color="error" slotProps={{ input: { 'aria-hidden': true } }} sx={{ pointerEvents: 'none' }} />
              <Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="bodyLarge" sx={{ overflowWrap: 'anywhere' }}>{file.name}</Typography><Typography variant="bodySmall" sx={{ color: 'inherit', opacity: 0.8 }}>{modified(file.mtimeMs)} · {formatBytes(file.size)}</Typography><Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>{file.id === group.suggestedKeeperId && <Chip size="small" label="Most recently modified" sx={{ bgcolor: c.secondaryContainer, color: c.onSecondaryContainer }} />}<Typography variant="labelMediumEmphasized" sx={{ alignSelf: 'center' }}>{selected[file.id] ? 'Selected for recycling' : 'Keep'}</Typography></Box></Box>
            </ButtonBase>
            <IconButton aria-label={`Open ${file.name}`} onClick={() => api.openPath(file.path)} disabled={busy}><OpenInNewIcon fontSize="small" /></IconButton>
          </Box>)}
        </Box>
      </Box>)}
    </Box>
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, p: 1.5, borderRadius: corner.xl, bgcolor: c.surfaceContainerHigh }}>
      <Box sx={{ flex: 1, minWidth: 140 }}><Typography variant="titleSmallEmphasized">{count ? `${pluralize(count, 'version')} selected` : 'Every version is kept'}</Typography><Typography variant="bodySmall" sx={{ color: c.onSurfaceVariant }}>{count ? `${formatBytes(bytes)} in selected files` : 'Nothing changes until you choose and confirm.'}</Typography></Box>
      <Button onClick={back} disabled={busy}>Done</Button>
      <m.div whileTap={reduced ? {} : { scale: 0.97 }} transition={springs.fastSpatial}><Button variant="contained" color={count ? 'error' : 'primary'} startIcon={<DeleteOutlineIcon />} onClick={() => setConfirm(true)} disabled={busy || !count}>{busy ? 'Recycling…' : 'Recycle selected'}</Button></m.div>
    </Box>
    <ConfirmDialog open={confirm} destructive icon={<DeleteOutlineIcon />} title={`Recycle ${pluralize(count, 'version')}?`} body="These files may contain different edits. Only the versions you selected will go to the Recycle Bin. You can restore them there." confirmLabel="Recycle selected" onClose={() => setConfirm(false)} onConfirm={recycle} />
    <Dialog open={Boolean(comparison)} onClose={() => !compareBusy && setComparison(null)} maxWidth="lg" fullWidth aria-labelledby="version-comparison-title">
      <DialogTitle id="version-comparison-title">Compare document text</DialogTitle>
      <DialogContent>
        <Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant, mb: 2 }}>Highlighted lines appear only in that excerpt. Formatting, images, and content beyond the reading limits may differ.</Typography>
        {compareError && <Alert severity="error" sx={{ mb: 2 }}>{compareError}</Alert>}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          {[0, 1].map(side => <Box key={side} sx={{ minWidth: 0 }}>
            <TextField select label={side ? 'Second version' : 'First version'} value={compareIds[side] || ''} disabled={compareBusy} fullWidth onChange={event => { const next = [...compareIds]; next[side] = event.target.value; compare(comparison.group, next); }} sx={{ mb: 2 }}>{comparison?.group.files.filter(file => file.id !== compareIds[1 - side]).map(file => <MenuItem key={file.id} value={file.id}>{file.name}</MenuItem>)}</TextField>
            <Box component="pre" sx={{ m: 0, minHeight: 160, maxHeight: '45vh', overflowY: 'auto', p: 2, borderRadius: corner.lg, bgcolor: c.surfaceContainerLow, fontFamily: 'inherit', typography: 'bodyMedium', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'text' }}>{compareBusy ? 'Reading text…' : <ComparedText text={comparison?.[side ? 'right' : 'left']?.text} otherText={comparison?.[side ? 'left' : 'right']?.text} side={side} colors={c} />}</Box>
          </Box>)}
        </Box>
        {comparison?.summary && <Typography role="status" variant="bodyMedium" sx={{ mt: 2 }}>{comparison.summary}</Typography>}
      </DialogContent>
      <DialogActions><Button onClick={() => setComparison(null)} disabled={compareBusy} sx={{ minHeight: 48 }}>Close</Button></DialogActions>
    </Dialog>
  </Box>;
}
