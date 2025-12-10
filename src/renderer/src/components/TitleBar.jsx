import React from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import MinimizeIcon from '@mui/icons-material/Remove';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

export default function TitleBar() {
  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximizeWindow();
  };

  const handleClose = () => {
    window.electronAPI?.closeWindow();
  };

  return (
    <Box
      sx={{
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        bgcolor: 'background.surfaceContainer',
        borderBottom: '1px solid',
        borderColor: 'divider',
        // This makes the title bar draggable
        WebkitAppRegion: 'drag',
        userSelect: 'none',
      }}
    >
      {/* App Title */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        pl: 2,
      }}>
        <AutoAwesomeIcon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography
          variant="body2"
          fontWeight={600}
          sx={{ color: 'text.primary', letterSpacing: '0.5px' }}
        >
          Organiuzer
        </Typography>
      </Box>

      {/* Window Controls */}
      <Box
        sx={{
          display: 'flex',
          height: '100%',
          // Make buttons NOT draggable
          WebkitAppRegion: 'no-drag',
        }}
      >
        <IconButton
          onClick={handleMinimize}
          size="small"
          sx={{
            borderRadius: 0,
            width: 46,
            height: '100%',
            color: 'text.secondary',
            '&:hover': {
              bgcolor: 'action.hover',
            },
          }}
        >
          <MinimizeIcon sx={{ fontSize: 18 }} />
        </IconButton>
        <IconButton
          onClick={handleMaximize}
          size="small"
          sx={{
            borderRadius: 0,
            width: 46,
            height: '100%',
            color: 'text.secondary',
            '&:hover': {
              bgcolor: 'action.hover',
            },
          }}
        >
          <CropSquareIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <IconButton
          onClick={handleClose}
          size="small"
          sx={{
            borderRadius: 0,
            width: 46,
            height: '100%',
            color: 'text.secondary',
            '&:hover': {
              bgcolor: 'error.main',
              color: 'white',
            },
          }}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
    </Box>
  );
}
