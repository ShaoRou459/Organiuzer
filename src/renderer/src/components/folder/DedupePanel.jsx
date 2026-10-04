import React from 'react';
import { Alert, Box, Typography, Button, Checkbox, ButtonBase, useTheme } from '@mui/material';
import { motion as m, useReducedMotion } from 'framer-motion';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckIcon from '@mui/icons-material/Check';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import FileIcon from './FileIcon';
import ExpressiveShape from '../common/ExpressiveShape';
import ProgressPanel from './ProgressPanel';
import FloatingToolbar from './FloatingToolbar';
import { corner, motion, springs } from '../../theme/tokens';
import { stateLayer, STATE } from '../../theme/theme';
import { formatBytes, pluralize } from '../../utils/format';

const baseName = (p) => String(p).split(/[\\/]/).pop();

export default function DedupePanel({ loading, duplicates, checked, onToggle, progress, stats, error, busy, onCancel, onConfirm, onRetry, rootPath }) {
  const { palette } = useTheme();
  const reducedMotion = useReducedMotion();
  const c = palette.m3;

  if (loading) {
    const stage = progress?.phase === 'scan' ? 'Reading folders' : progress?.totalCandidates > 0 ? `Comparing ${progress.processedCandidates || 0} of ${progress.totalCandidates} candidates` : 'Comparing contents';
    return <ProgressPanel title="Looking for duplicates" description="Scanning this folder and its subfolders for identical files." detail={progress ? `${pluralize(progress.scannedFiles || 0, 'file')} scanned · ${stage}` : 'Reading folders'} action={{ label: 'Cancel scan', onClick: onCancel }} />;
  }

  const skipped = (stats?.skippedFiles || 0) + (stats?.skippedDirectories || 0);
  const exclusions = 'Hidden files, generated folders and links are excluded.';
  const scanNote = stats ? `${pluralize(stats.scannedFiles || 0, 'file')} scanned. ${exclusions}` : exclusions;
  const notices = <>
    {error && <Alert severity="error" sx={{ mb: 2, whiteSpace: 'pre-line', overflowWrap: 'anywhere', maxHeight: 180, overflowY: 'auto', flexShrink: 0 }} action={<Button color="inherit" onClick={onRetry} disabled={busy}>Scan again</Button>}>{error}</Alert>}
    {skipped > 0 && <Alert severity="warning" sx={{ mb: 2 }}>{pluralize(skipped, 'item')} couldn’t be checked. Results cover the readable, unchanged files only.</Alert>}
  </>;

  const selected = Object.values(checked);
  const reclaim = duplicates.reduce((sum, g, gi) => sum + g.files.reduce((s, _f, fi) => s + (checked[`${gi}-${fi}`] ? g.size : 0), 0), 0);

  if (duplicates.length === 0) {
    return (
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {notices}
        <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', pb: 6 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 2 }}>
          <m.div
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, rotate: -8 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: 0 }}
            transition={{ scale: springs.defaultSpatial, rotate: springs.defaultSpatial, opacity: springs.defaultEffects }}
            style={{ display: 'grid', placeItems: 'center' }}
          >
            <ExpressiveShape shape="sunny" size={112} color={error ? c.errorContainer : skipped ? c.surfaceContainerHigh : c.successContainer}>
              {error ? <ErrorOutlineIcon sx={{ fontSize: 44, color: c.onErrorContainer }} /> : skipped ? <WarningAmberOutlinedIcon sx={{ fontSize: 44, color: c.onSurfaceVariant }} /> : <CheckIcon sx={{ fontSize: 44, color: c.onSuccessContainer }} />}
            </ExpressiveShape>
          </m.div>
          <Typography variant="headlineSmallEmphasized" component="h2">{error ? 'Scan needs another look' : skipped ? 'No duplicates in checked files' : 'No duplicates found'}</Typography>
          <Typography variant="bodyLarge" sx={{ color: c.onSurfaceVariant }}>
            {error ? 'Try scanning again, or return to your folder.' : scanNote}
          </Typography>
          <Button variant="tonal" onClick={onCancel} sx={{ mt: 1 }}>Back to folder</Button>
        </Box>
      </Box>
      </Box>
    );
  }

  const relative = (p) => {
    const root = String(rootPath).replace(/[\\/]+$/, '');
    const s = String(p);
    return s.toLowerCase().startsWith(root.toLowerCase()) ? `.${s.slice(root.length)}` : s;
  };

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {notices}
      <Box sx={{ mb: 2 }}>
        <Typography variant="titleLarge" component="h2">
          {pluralize(duplicates.length, 'set')} of duplicates
        </Typography>
        <Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant }}>
          One suggested copy stays in each set. Change the selection before sending copies to the Recycle Bin.
        </Typography>
        <Typography variant="bodySmall" sx={{ color: c.onSurfaceVariant, mt: 0.5 }}>{scanNote}</Typography>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pb: { xs: 22, sm: 14 }, display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', alignContent: 'start' }}>
        {duplicates.map((group, gi) => (
          <Box key={group.hash + gi} component="section" aria-labelledby={`duplicate-set-title-${gi}`} sx={{ bgcolor: c.surfaceContainer, borderRadius: corner.xl, p: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, pt: 1, pb: 1.5 }}>
              <FileIcon item={{ name: baseName(group.files[0]), type: 'file' }} size={36} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="titleSmall" noWrap component="h3" id={`duplicate-set-title-${gi}`}>{baseName(group.files[0])}</Typography>
                <Typography variant="bodySmall" sx={{ color: c.onSurfaceVariant }}>
                  {group.files.length} identical copies, {formatBytes(group.size)} each
                </Typography>
              </Box>
            </Box>
            <Box role="group" aria-label={`${group.files.length} identical copies of ${baseName(group.files[0])}`} sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {group.files.map((file, fi) => {
                const key = `${gi}-${fi}`;
                const isChecked = Boolean(checked[key]);
                // Softened error container so a selected row reads as "marked", not as an alarm.
                const rowBg = isChecked ? c.surfaceContainer : c.surfaceContainerLowest;
                return (
                  <ButtonBase
                    key={file}
                    onClick={() => onToggle(gi, fi, file)}
                    disabled={busy}
                    role="checkbox"
                    aria-checked={isChecked}
                    aria-label={`${isChecked ? 'Recycle' : 'Keep'} ${relative(file)}`}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      pl: 0.5,
                      pr: 1.5,
                      py: 0.5,
                      borderRadius: isChecked ? corner.xl : corner.lg,
                      borderLeft: `3px solid ${isChecked ? c.error : 'transparent'}`,
                      textAlign: 'left',
                      bgcolor: rowBg,
                      color: c.onSurface,
                      transition: [motion.spatial(['border-radius'], 'fast'), motion.effects(['background-color', 'color'])].join(', '),
                      '&:hover': { bgcolor: stateLayer(rowBg, c.onSurface, STATE.hover) },
                      '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: -2 },
                      '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                    }}
                  >
                    <Checkbox checked={isChecked} tabIndex={-1} disableRipple color="error" slotProps={{ input: { 'aria-hidden': true } }} sx={{ pointerEvents: 'none' }} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="bodyMedium" noWrap sx={{ textDecoration: isChecked ? 'line-through' : 'none', color: isChecked ? c.onSurfaceVariant : c.onSurface }}>{baseName(file)}</Typography>
                      <Typography variant="bodySmall" noWrap sx={{ color: c.onSurfaceVariant }} title={file}>{relative(file)}</Typography>
                    </Box>
                    {isChecked ? (
                      <Typography variant="labelMedium" sx={{ color: c.error, flexShrink: 0 }}>Recycle</Typography>
                    ) : (
                      <Typography variant="labelMediumEmphasized" sx={{ px: 1.25, py: 0.25, borderRadius: corner.full, bgcolor: c.primaryContainer, color: c.onPrimaryContainer, flexShrink: 0 }}>
                        Keep
                      </Typography>
                    )}
                  </ButtonBase>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>

      <FloatingToolbar sx={{ minWidth: 0, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Box sx={{ px: 1.5, minWidth: 0 }}>
          <Typography variant="titleSmall" noWrap>{pluralize(selected.length, 'copy', 'copies')} selected</Typography>
          <Typography variant="bodySmall" noWrap sx={{ color: c.onSurfaceVariant }}>{formatBytes(reclaim)} in selected copies</Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Button color="inherit" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          size="large"
          startIcon={<DeleteOutlineIcon />}
          onClick={onConfirm}
          disabled={busy || selected.length === 0}
        >
          {busy ? 'Checking and recycling…' : `Recycle ${pluralize(selected.length, 'copy', 'copies')}`}
        </Button>
      </FloatingToolbar>
    </Box>
  );
}
