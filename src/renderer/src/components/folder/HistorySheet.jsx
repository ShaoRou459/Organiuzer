import React from 'react';
import { Drawer, Box, Typography, IconButton, Button, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HistoryIcon from '@mui/icons-material/History';
import UndoIcon from '@mui/icons-material/Undo';
import ExpressiveShape from '../common/ExpressiveShape';
import { corner } from '../../theme/tokens';
import { formatRelativeTime, pluralize } from '../../utils/format';

/** Modal side sheet listing runs for this folder. */
export default function HistorySheet({ open, onClose, runs, busy, onUndo }) {
  const { palette } = useTheme();
  const c = palette.m3;
  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 400, maxWidth: '90vw' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 3, pt: 3, pb: 2 }}>
        <Typography variant="headlineSmall" component="h2" sx={{ flex: 1 }}>History</Typography>
        <IconButton aria-label="Close history" onClick={onClose}><CloseIcon /></IconButton>
      </Box>

      {runs.length > 0 ? (
        <Box component="ol" sx={{ listStyle: 'none', m: 0, px: 2, pb: 3, display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' }}>
          {runs.slice(0, 30).map((run) => {
            const undone = Boolean(run?.revertedAt);
            return (
              <Box component="li" key={run.id} sx={{ p: 2, borderRadius: corner.lg, bgcolor: undone ? c.surfaceContainer : c.surfaceContainerHigh, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="titleSmall" component="p" sx={{ textDecoration: undone ? 'line-through' : 'none', color: undone ? c.onSurfaceVariant : c.onSurface }}>
                    {run?.kind === 'rename' ? `${pluralize(run?.moved ?? run?.moves?.length ?? 0, 'file')} renamed` : `${pluralize(run?.moved ?? run?.moves?.length ?? 0, 'item')} into ${pluralize(run?.categories?.length ?? 0, 'folder')}`}
                  </Typography>
                  <Typography variant="bodySmall" component="p" sx={{ color: c.onSurfaceVariant }} title={new Date(run.timestamp).toLocaleString()}>
                    {formatRelativeTime(run?.timestamp)}
                    {run?.warnings ? `, ${pluralize(run.warnings, 'note')}` : ''}
                    {undone ? `, undone ${formatRelativeTime(run.revertedAt).toLowerCase()}` : ''}
                  </Typography>
                </Box>
                {undone ? (
                  <Typography variant="labelMedium" sx={{ px: 1.25, py: 0.5, borderRadius: corner.sm, bgcolor: c.surfaceContainerHighest, color: c.onSurfaceVariant }}>Undone</Typography>
                ) : (
                  <Button variant="text" startIcon={<UndoIcon />} onClick={() => onUndo(run)} disabled={busy}>Undo</Button>
                )}
              </Box>
            );
          })}
        </Box>
      ) : (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, px: 4, pb: 8, textAlign: 'center' }}>
          <ExpressiveShape shape="cookie4" size={88} color={c.surfaceContainerHighest}>
            <HistoryIcon sx={{ fontSize: 36, color: c.onSurfaceVariant }} />
          </ExpressiveShape>
          <Typography variant="titleMedium">No runs yet</Typography>
          <Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant }}>Each time you apply a plan here it’s saved, so you can undo it later.</Typography>
        </Box>
      )}
    </Drawer>
  );
}
