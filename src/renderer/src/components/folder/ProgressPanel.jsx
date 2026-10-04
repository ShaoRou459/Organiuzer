import React from 'react';
import { Box, Typography, Button, useTheme } from '@mui/material';
import { motion as m } from 'framer-motion';
import LoadingIndicator from '../common/LoadingIndicator';
import WavyProgress from '../common/WavyProgress';
import { corner, springs } from '../../theme/tokens';

/**
 * Centered status for scanning / analysing / moving / undoing.
 * Short waits show only the loading indicator; long ones add a determinate wavy progress bar.
 */
export default function ProgressPanel({ title, description, progress = null, detail, stream, action }) {
  const { palette } = useTheme();
  const c = palette.m3;
  const tail = stream ? stream.replace(/\s+/g, ' ').slice(-160) : '';

  return (
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', pb: 6 }}>
      <m.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ scale: springs.defaultSpatial, opacity: springs.defaultEffects }}
        style={{ width: '100%', maxWidth: 520 }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 3, px: 3 }}>
          <LoadingIndicator size={96} contained label={title} />
          <Box>
            <Typography variant="headlineSmallEmphasized" component="h2">{title}</Typography>
            {description && (
              <Typography variant="bodyLarge" sx={{ color: c.onSurfaceVariant, mt: 1 }}>{description}</Typography>
            )}
          </Box>

          {progress !== null && (
            <Box sx={{ width: '100%', maxWidth: 400 }}>
              <WavyProgress value={progress} label={title} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, gap: 2 }}>
                <Typography variant="labelMedium" noWrap sx={{ color: c.onSurfaceVariant, minWidth: 0 }}>{detail}</Typography>
                <Typography variant="labelMedium" sx={{ color: c.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(progress)}%
                </Typography>
              </Box>
            </Box>
          )}
          {progress === null && detail && (
            <Typography variant="labelMedium" sx={{ color: c.onSurfaceVariant }}>{detail}</Typography>
          )}

          {tail && (
            <Box
              aria-hidden
              sx={{
                width: '100%',
                px: 2,
                py: 1.25,
                borderRadius: corner.lg,
                bgcolor: c.surfaceContainerLow,
                color: c.onSurfaceVariant,
                fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
                fontSize: '0.75rem',
                lineHeight: 1.5,
                textAlign: 'left',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                direction: 'rtl',
                maskImage: 'linear-gradient(90deg, transparent, #000 30%)',
              }}
            >
              <bdi>{tail}</bdi>
            </Box>
          )}

          {action && <Button variant="text" color="inherit" onClick={action.onClick}>{action.label}</Button>}
        </Box>
      </m.div>
    </Box>
  );
}
