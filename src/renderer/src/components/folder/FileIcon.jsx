import React from 'react';
import { Box, useTheme } from '@mui/material';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined';
import MusicNoteOutlinedIcon from '@mui/icons-material/MusicNoteOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import InstallDesktopOutlinedIcon from '@mui/icons-material/InstallDesktopOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import SlideshowOutlinedIcon from '@mui/icons-material/SlideshowOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import { corner } from '../../theme/tokens';
import { fileKind } from '../../utils/format';

const ICONS = {
  folder: FolderOutlinedIcon,
  image: ImageOutlinedIcon,
  video: MovieOutlinedIcon,
  audio: MusicNoteOutlinedIcon,
  archive: Inventory2OutlinedIcon,
  installer: InstallDesktopOutlinedIcon,
  document: DescriptionOutlinedIcon,
  sheet: TableChartOutlinedIcon,
  slides: SlideshowOutlinedIcon,
  code: CodeOutlinedIcon,
  file: InsertDriveFileOutlinedIcon,
};

/** Kind → container role. Only scheme roles, so every seed colour stays accessible. */
function tint(kind, c) {
  switch (kind) {
    case 'folder': return [c.primaryContainer, c.onPrimaryContainer];
    case 'image':
    case 'video':
    case 'audio': return [c.tertiaryContainer, c.onTertiaryContainer];
    case 'archive':
    case 'installer': return [c.secondaryContainer, c.onSecondaryContainer];
    default: return [c.surfaceContainerHighest, c.onSurfaceVariant];
  }
}

export default function FileIcon({ item, size = 40, radius }) {
  const { palette } = useTheme();
  const kind = item?.type === 'folder' ? 'folder' : fileKind(item?.name);
  const Icon = ICONS[kind] || ICONS.file;
  const [bg, fg] = tint(kind, palette.m3);
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        // Folders get a rounder container than files so the two read apart at a glance.
        borderRadius: radius || (kind === 'folder' ? corner.lg : corner.md),
        bgcolor: bg,
        color: fg,
        display: 'grid',
        placeItems: 'center',
        '& svg': { fontSize: Math.round(size * 0.5) },
      }}
    >
      <Icon />
    </Box>
  );
}
