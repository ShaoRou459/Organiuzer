import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { motion as m, useReducedMotion } from 'framer-motion';
import { sampleShape, pathFromRadii } from './shapes';
import { springs } from '../../theme/tokens';

/**
 * Decorative M3 library shape. Decorative/image use only, never as a text container.
 * `spin` slowly rotates it (disabled under reduced motion by the global CSS rule).
 */
export default function ExpressiveShape({ shape = 'cookie9', size = 96, color = 'currentColor', spin = 0, sx, children }) {
  const d = useMemo(() => pathFromRadii(sampleShape(shape), 100), [shape]);
  const reduced = useReducedMotion();
  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0, display: 'grid', placeItems: 'center', ...sx }} aria-hidden={!children}>
      <Box
        component="svg"
        viewBox="0 0 100 100"
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          ...(spin > 0 && !reduced && {
            animation: `shapeSpin ${spin}s linear infinite`,
            '@keyframes shapeSpin': { to: { transform: 'rotate(360deg)' } },
          }),
        }}
      >
        <m.path initial={false} animate={{ d, fill: color }} transition={reduced ? { duration: 0 } : { d: springs.fastSpatial, fill: springs.fastEffects }} />
      </Box>
      {children && <Box sx={{ position: 'relative', display: 'grid', placeItems: 'center' }}>{children}</Box>}
    </Box>
  );
}
