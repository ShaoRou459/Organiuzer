import React from 'react';
import { Box, Typography, Button, useTheme } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import DifferenceOutlinedIcon from '@mui/icons-material/DifferenceOutlined';
import SearchIcon from '@mui/icons-material/Search';
import RuleFolderOutlinedIcon from '@mui/icons-material/RuleFolderOutlined';
import FileExplorer from '../FileExplorer';
import FloatingToolbar from './FloatingToolbar';
import { corner } from '../../theme/tokens';

export default function IdlePanel({
  files, path, hasAiConfig,
  onOrganize, onFindDuplicates, onSmartRename, onOpenSettings,
  onVersionGroups, onSearchDocuments, onPresets,
}) {
  const { palette } = useTheme();
  const c = palette.m3;
  const visibleCount = files.filter((f) => !f.hidden).length;
  const empty = visibleCount === 0;

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {!hasAiConfig && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1, pl: 2, mb: 2, borderRadius: corner.lg, bgcolor: c.tertiaryContainer, color: c.onTertiaryContainer }}>
          <KeyOutlinedIcon />
          <Typography variant="bodyMedium" sx={{ flex: 1 }}>
            AI organization is optional. Document tools and presets work on your computer.
          </Typography>
          <Button variant="text" onClick={(event) => onOpenSettings('ai', event.currentTarget)} sx={{ color: 'inherit' }}>Set up</Button>
        </Box>
      )}

      <Box role="toolbar" aria-label="Document tools" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2, flexShrink: 0, '& .MuiButton-root': { minHeight: 48 } }}>
        <Button variant="tonal" startIcon={<DifferenceOutlinedIcon />} onClick={onVersionGroups} disabled={empty}>Version groups</Button>
        <Button variant="text" startIcon={<SearchIcon />} onClick={onSearchDocuments} disabled={empty}>Search documents</Button>
        <Button variant="text" startIcon={<RuleFolderOutlinedIcon />} onClick={onPresets} disabled={empty}>Use a preset</Button>
      </Box>
      <FileExplorer files={files} rootPath={path} />

      <FloatingToolbar sx={{ minWidth: 0, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button variant={hasAiConfig ? 'tonal' : 'contained'} size="large" startIcon={<ContentCopyOutlinedIcon />} onClick={onFindDuplicates} disabled={empty} title="Scan this folder and its subfolders for identical files">
          Find duplicates
        </Button>
        <Button variant="tonal" size="large" startIcon={<DriveFileRenameOutlineIcon />} onClick={onSmartRename} disabled={empty || !files.some(file => file.type === 'file' && !file.hidden)}>
          Smart rename
        </Button>
        <Button
          variant={hasAiConfig ? 'contained' : 'tonal'}
          size="large"
          startIcon={<AutoAwesomeIcon />}
          onClick={hasAiConfig ? onOrganize : (event) => onOpenSettings('ai', event.currentTarget)}
          disabled={empty}
          sx={{ typography: 'titleMediumEmphasized', px: 3.5 }}
        >
          Organize with AI
        </Button>
      </FloatingToolbar>
    </Box>
  );
}
