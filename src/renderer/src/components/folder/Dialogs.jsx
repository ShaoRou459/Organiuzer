import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, useTheme } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { corner } from '../../theme/tokens';

/** Shown when a plan fails validation or a move fails and is rolled back. */
export function PlanIssueDialog({ issue, onClose, onRetry }) {
  const { palette } = useTheme();
  const c = palette.m3;
  const details = Array.isArray(issue?.details) ? issue.details : [];
  return (
    <Dialog open={Boolean(issue?.open)} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="plan-issue-title">
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 3, color: c.error }}>
        <ErrorOutlineIcon />
      </Box>
      <DialogTitle id="plan-issue-title" sx={{ textAlign: 'center', pt: 2 }}>{issue?.title || 'Something went wrong'}</DialogTitle>
      <DialogContent>
        <Typography variant="bodyMedium" component="p" sx={{ mb: details.length ? 2 : 0 }}>{issue?.message}</Typography>
        {details.length > 0 && (
          <Box component="ul" sx={{ m: 0, p: 2, pl: 4, borderRadius: corner.lg, bgcolor: c.surfaceContainerHighest, color: c.onSurface, maxHeight: 220, overflowY: 'auto', userSelect: 'text' }}>
            {details.slice(0, 12).map((line, i) => (
              <Typography key={i} component="li" variant="bodySmall" sx={{ mb: 0.5 }}>{line}</Typography>
            ))}
            {details.length > 12 && (
              <Typography component="li" variant="bodySmall" sx={{ color: c.onSurfaceVariant, listStyle: 'none' }}>
                and {details.length - 12} more
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ '& .MuiButton-root': { minHeight: 48 } }}>
        <Button onClick={onClose}>Edit plan</Button>
        <Button variant="contained" onClick={onRetry} disabled={!issue?.retryContext}>Ask AI to fix it</Button>
      </DialogActions>
    </Dialog>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel = 'Confirm', destructive, onConfirm, onClose, icon }) {
  const { palette } = useTheme();
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="confirm-title">
      {icon && <Box sx={{ display: 'flex', justifyContent: 'center', pt: 3, color: palette.m3.secondary }}>{icon}</Box>}
      <DialogTitle id="confirm-title" sx={icon ? { textAlign: 'center', pt: 2 } : undefined}>{title}</DialogTitle>
      <DialogContent>
        <Typography variant="bodyMedium" component="div">{body}</Typography>
      </DialogContent>
      <DialogActions sx={{ '& .MuiButton-root': { minHeight: 48 } }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color={destructive ? 'error' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}
