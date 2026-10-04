import React, { forwardRef } from 'react';
import { Box, ButtonBase, Typography, useTheme } from '@mui/material';
import { corner, motion } from '../../theme/tokens';
import { stateLayer, STATE } from '../../theme/theme';

/**
 * Container used across the app. Hierarchy comes from surface tone + radius, not borders/shadows.
 * tone: lowest | low | default | high | highest | primary | secondary | tertiary
 */
const SurfaceCard = forwardRef(function SurfaceCard({
  tone = 'default',
  radius = 'xl',
  padding = 3,
  icon,
  title,
  subtitle,
  action,
  onClick,
  ariaLabel,
  children,
  sx,
  contentSx,
  ...rest
}, ref) {
  const { palette } = useTheme();
  const c = palette.m3;
  const tones = {
    lowest: [c.surfaceContainerLowest, c.onSurface],
    low: [c.surfaceContainerLow, c.onSurface],
    default: [c.surfaceContainer, c.onSurface],
    high: [c.surfaceContainerHigh, c.onSurface],
    highest: [c.surfaceContainerHighest, c.onSurface],
    primary: [c.primaryContainer, c.onPrimaryContainer],
    secondary: [c.secondaryContainer, c.onSecondaryContainer],
    tertiary: [c.tertiaryContainer, c.onTertiaryContainer],
  };
  const [bg, fg] = tones[tone] || tones.default;
  const interactive = typeof onClick === 'function';

  const header = (icon || title || action) && (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: children ? 2 : 0, minWidth: 0 }}>
      {icon && (
        <Box sx={{ display: 'grid', placeItems: 'center', color: tone === 'default' || tone.startsWith('l') || tone.startsWith('h') ? c.primary : 'inherit', '& svg': { fontSize: 24 } }}>
          {icon}
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {title && <Typography variant="titleMedium" component="h2" noWrap sx={{ display: 'block' }}>{title}</Typography>}
        {subtitle && <Typography variant="bodySmall" sx={{ display: 'block', color: tone === 'default' ? c.onSurfaceVariant : 'inherit', opacity: tone === 'default' ? 1 : 0.8 }} noWrap>{subtitle}</Typography>}
      </Box>
      {action}
    </Box>
  );

  const body = (
    <Box sx={{ p: padding, height: '100%', width: '100%', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, textAlign: 'left', ...contentSx }}>
      {header}
      {children}
    </Box>
  );

  return (
    <Box
      ref={ref}
      component={interactive ? ButtonBase : 'section'}
      onClick={onClick}
      aria-label={ariaLabel}
      sx={{
        bgcolor: bg,
        color: fg,
        borderRadius: corner[radius] || radius,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        minWidth: 0,
        minHeight: 0,
        alignItems: 'stretch',
        justifyContent: 'stretch',
        transition: [motion.effects(['background-color']), motion.spatial(['border-radius'])].join(', '),
        ...(interactive && {
          cursor: 'pointer',
          '&:hover': { bgcolor: stateLayer(bg, fg, STATE.hover) },
          '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
        }),
        ...sx,
      }}
      {...rest}
    >
      {body}
    </Box>
  );
});

export default SurfaceCard;
