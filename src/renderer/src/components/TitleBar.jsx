import React, { useEffect, useState } from 'react';
import { Box, ButtonBase, Typography, useTheme } from '@mui/material';
import RemoveIcon from '@mui/icons-material/Remove';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import FilterNoneIcon from '@mui/icons-material/FilterNone';
import CloseIcon from '@mui/icons-material/Close';
import ExpressiveShape from './common/ExpressiveShape';
import { motion } from '../theme/tokens';

// Windows caption-button geometry and the system close-hover red (OS convention, not an M3 role).
const CAPTION_WIDTH = 46;
const CLOSE_HOVER = '#C42B1C';

function CaptionButton({ label, onClick, danger, children }) {
  const { palette } = useTheme();
  const c = palette.m3;
  return (
    <ButtonBase
      aria-label={label}
      title={label}
      onClick={onClick}
      sx={{
        width: CAPTION_WIDTH,
        height: '100%',
        color: c.onSurfaceVariant,
        transition: motion.effects(['background-color', 'color'], 'fast'),
        '& svg': { fontSize: 16 },
        '&:hover': danger ? { bgcolor: CLOSE_HOVER, color: '#FFFFFF' } : { bgcolor: `color-mix(in srgb, ${c.onSurface} 8%, transparent)` },
        '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: -2 },
      }}
    >
      {children}
    </ButtonBase>
  );
}

export default function TitleBar({ subtitle }) {
  const { palette } = useTheme();
  const c = palette.m3;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    window.electronAPI?.isMaximized?.().then(setMaximized).catch(() => { });
    return window.electronAPI?.onMaximizedChange?.(setMaximized);
  }, []);

  return (
    <Box
      component="header"
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget || e.target.dataset?.drag) window.electronAPI?.maximizeWindow();
      }}
      sx={{
        height: 40,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        bgcolor: c.surface,
        WebkitAppRegion: 'drag',
        userSelect: 'none',
      }}
    >
      <Box data-drag="1" sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 2, minWidth: 0 }}>
        <ExpressiveShape shape="cookie9" size={16} color={c.primary} />
        <Typography variant="labelLarge" sx={{ color: c.onSurface }}>
          Organiuzer
        </Typography>
        {subtitle && (
          <Typography variant="labelLarge" noWrap sx={{ color: c.onSurfaceVariant, fontWeight: 400, minWidth: 0 }}>
            <Box component="span" aria-hidden sx={{ mx: 1, opacity: 0.6 }}>/</Box>
            {subtitle}
          </Typography>
        )}
      </Box>

      <Box sx={{ display: 'flex', height: '100%', WebkitAppRegion: 'no-drag' }}>
        <CaptionButton label="Minimize" onClick={() => window.electronAPI?.minimizeWindow()}>
          <RemoveIcon />
        </CaptionButton>
        <CaptionButton label={maximized ? 'Restore' : 'Maximize'} onClick={() => window.electronAPI?.maximizeWindow()}>
          {maximized ? <FilterNoneIcon sx={{ fontSize: '13px !important', transform: 'scaleX(-1)' }} /> : <CropSquareIcon />}
        </CaptionButton>
        <CaptionButton label="Close" danger onClick={() => window.electronAPI?.closeWindow()}>
          <CloseIcon />
        </CaptionButton>
      </Box>
    </Box>
  );
}
