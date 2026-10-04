import React, { useEffect } from 'react';
import { Box, useTheme } from '@mui/material';
import { motion as m } from 'framer-motion';
import { alpha } from '@mui/material/styles';
import { corner, springs } from '../../theme/tokens';

/**
 * M3 Expressive floating toolbar: a pill on surface container, docked over the bottom of the
 * content with elevation level 3. Holds the screen's primary actions.
 */
export default function FloatingToolbar({ children, sx }) {
  const { palette } = useTheme();
  const c = palette.m3;

  // Lets the snackbar position itself above the toolbar.
  useEffect(() => {
    document.body.dataset.floatingToolbar = '1';
    return () => { delete document.body.dataset.floatingToolbar; };
  }, []);
  return (
    <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 8, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 5 }}>
      <m.div
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ y: springs.defaultSpatial, opacity: springs.defaultEffects }}
        style={{ pointerEvents: 'auto', maxWidth: '100%' }}
      >
        <Box
          role="toolbar"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: 1,
            minHeight: 72,
            borderRadius: corner.full,
            bgcolor: c.surfaceContainerHigh,
            boxShadow: `0 6px 16px ${alpha(c.shadow, 0.18)}, 0 1px 3px ${alpha(c.shadow, 0.12)}`,
            minWidth: 560,
            maxWidth: 'min(980px, calc(100vw - 48px))',
            ...sx,
          }}
        >
          {children}
        </Box>
      </m.div>
    </Box>
  );
}
