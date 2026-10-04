import React, { useState } from 'react';
import { Box, Typography, IconButton, Tooltip, ButtonBase, useTheme } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import HistoryIcon from '@mui/icons-material/History';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import { corner, motion } from '../../theme/tokens';
import { stateLayer, STATE } from '../../theme/theme';
import { folderNameFromPath, pluralize } from '../../utils/format';

/** Top app bar for the folder screen: back, title + path, trailing actions. */
export default function FolderHeader({ path, folderCount, fileCount, busy, onBack, onRefresh, onHistory, onSettings, historyCount }) {
  const { palette } = useTheme();
  const c = palette.m3;
  const [copied, setCopied] = useState(false);

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { }
  };

  return (
    <Box component="nav" aria-label="Folder" sx={{ display: { xs: 'grid', sm: 'flex' }, gridTemplateColumns: '48px minmax(0, 1fr)', alignItems: 'center', gap: { xs: 1, sm: 2 }, minHeight: 64 }}>
      <Tooltip title="Back to home">
        <IconButton
          onClick={onBack}
          disabled={busy}
          aria-label="Back to home"
          sx={{ width: 48, height: 48, bgcolor: c.surfaceContainerHigh, color: c.onSurface, '&:hover': { bgcolor: stateLayer(c.surfaceContainerHigh, c.onSurface, STATE.hover) } }}
        >
          <ArrowBackIcon />
        </IconButton>
      </Tooltip>

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="headlineSmallEmphasized" component="h1" noWrap sx={{ fontStretch: '108%' }}>
          {folderNameFromPath(path)}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, color: c.onSurfaceVariant }}>
          <Tooltip title={copied ? 'Copied' : 'Copy path'}>
            <ButtonBase
              onClick={copyPath}
              aria-label={`Copy path ${path}`}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                minWidth: 0,
                px: 1,
                ml: -1,
                py: 0.25,
                borderRadius: corner.sm,
                color: copied ? c.primary : 'inherit',
                transition: motion.effects(['background-color', 'color']),
                '&:hover': { bgcolor: stateLayer(c.surface, c.onSurface, STATE.hover) },
                '&:hover .copy-ic': { opacity: 1 },
              }}
            >
              <Typography variant="bodySmall" noWrap sx={{ minWidth: 0, maxWidth: 520 }}>{path}</Typography>
              {copied ? <CheckIcon sx={{ fontSize: 14 }} /> : <ContentCopyIcon className="copy-ic" sx={{ fontSize: 14, opacity: 0.5 }} />}
            </ButtonBase>
          </Tooltip>
          <Typography variant="bodySmall" noWrap sx={{ flexShrink: 0 }}>
            {pluralize(folderCount, 'folder')}, {pluralize(fileCount, 'file')}
          </Typography>
        </Box>
      </Box>

      {/* Trailing actions grouped on one container so they read as a toolbar */}
      <Box sx={{ display: 'flex', gridColumn: '1 / -1', justifySelf: 'end', gap: 0.5, p: 0.5, borderRadius: corner.full, bgcolor: c.surfaceContainer, '& .MuiIconButton-root': { width: 48, height: 48 } }}>
        <Tooltip title="Open in File Explorer">
          <IconButton aria-label="Open in File Explorer" onClick={() => window.electronAPI?.openPath(path)}>
            <OpenInNewIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Rescan folder">
          <span>
            <IconButton aria-label="Rescan folder" onClick={onRefresh} disabled={busy}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={historyCount ? `History (${historyCount} runs)` : 'History'}>
          <IconButton aria-label="History" onClick={onHistory}>
            <HistoryIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Settings">
          <IconButton aria-label="Settings" onClick={onSettings}>
            <SettingsOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
