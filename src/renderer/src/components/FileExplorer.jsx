import React, { useDeferredValue, useMemo, useState } from 'react';
import {
  Box, Typography, ButtonBase, InputBase, ToggleButton, ToggleButtonGroup, Tooltip, useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import FolderOffOutlinedIcon from '@mui/icons-material/FolderOffOutlined';
import IconButton from '@mui/material/IconButton';
import FileIcon from './folder/FileIcon';
import ExpressiveShape from './common/ExpressiveShape';
import { corner, motion } from '../theme/tokens';
import { stateLayer, STATE } from '../theme/theme';
import { formatBytes, extensionOf, joinPath, formatNumber } from '../utils/format';
import { truncateMiddle } from '../utils/truncateMiddle';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export default function FileExplorer({ files, rootPath }) {
  const { palette } = useTheme();
  const c = palette.m3;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const deferredQuery = useDeferredValue(query);

  const sorted = useMemo(() => [...files].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return collator.compare(a.name, b.name);
  }), [files]);

  const folderCount = sorted.filter((f) => f.type === 'folder').length;
  const fileCount = sorted.length - folderCount;

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return sorted.filter((f) => {
      if (filter === 'folders' && f.type !== 'folder') return false;
      if (filter === 'files' && f.type !== 'file') return false;
      return !q || f.name.toLowerCase().includes(q);
    });
  }, [sorted, filter, deferredQuery]);

  if (files.length === 0) {
    return (
      <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', py: 8 }}>
        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <ExpressiveShape shape="clover4" size={96} color={c.surfaceContainerHighest}>
            <FolderOffOutlinedIcon sx={{ fontSize: 36, color: c.onSurfaceVariant }} />
          </ExpressiveShape>
          <Typography variant="titleLarge">This folder is empty</Typography>
          <Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant }}>Nothing to organize here yet.</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      {/* Search + filter */}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
        <Box
          sx={{
            flex: '1 1 260px',
            maxWidth: 420,
            height: 48,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            pl: 2,
            pr: 0.5,
            borderRadius: corner.full,
            bgcolor: c.surfaceContainerHigh,
            transition: motion.effects(['background-color']),
            '&:focus-within': { bgcolor: c.surfaceContainerHighest, outline: `2px solid ${c.primary}`, outlineOffset: -2 },
          }}
        >
          <SearchIcon sx={{ color: c.onSurfaceVariant }} />
          <InputBase
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${formatNumber(files.length)} items`}
            inputProps={{ 'aria-label': 'Search items in this folder' }}
            sx={{ flex: 1, typography: 'bodyLarge', color: c.onSurface, '& input': { userSelect: 'text' } }}
          />
          {query && (
            <IconButton size="small" aria-label="Clear search" onClick={() => setQuery('')}>
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Box>

        <ToggleButtonGroup
          exclusive
          value={filter}
          onChange={(_e, v) => v && setFilter(v)}
          aria-label="Show"
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="folders" disabled={!folderCount}>Folders {folderCount}</ToggleButton>
          <ToggleButton value="files" disabled={!fileCount}>Files {fileCount}</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Items */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', mx: -1, px: 1, pb: 14 }}>
        {visible.length === 0 ? (
          <Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant, py: 6, textAlign: 'center' }}>
            No items match “{query}”.
          </Typography>
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))' }}>
            {visible.map((item) => (
              <li key={item.name}>
                <ItemTile item={item} fullPath={joinPath(rootPath, item.name)} />
              </li>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function ItemTile({ item, fullPath }) {
  const { palette } = useTheme();
  const c = palette.m3;
  const isFolder = item.type === 'folder';
  const ctx = item.context;

  const meta = isFolder
    ? [ctx ? `${formatNumber(ctx.fileCount)}${ctx.truncated ? '+' : ''} ${ctx.fileCount === 1 ? 'file' : 'files'}` : 'Folder', ...(ctx?.topExtensions || []).slice(0, 2)].join('  ')
    : [extensionOf(item.name).toUpperCase() || 'File', formatBytes(item.size)].join('  ');

  const open = () => {
    if (isFolder) window.electronAPI?.openPath(fullPath);
    else window.electronAPI?.showItemInFolder(fullPath);
  };

  return (
    <Tooltip title={isFolder ? `${item.name}. Double-click to open` : `${item.name}. Double-click to show in Explorer`} enterDelay={700} placement="top">
      <ButtonBase
        onDoubleClick={open}
        onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
        sx={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          p: 1.5,
          borderRadius: corner.lg,
          bgcolor: c.surfaceContainerLow,
          textAlign: 'left',
          opacity: item.hidden ? 0.6 : 1,
          outline: item.hidden ? `1px dashed ${c.outlineVariant}` : 'none',
          outlineOffset: -1,
          transition: motion.effects(['background-color']),
          '&:hover': { bgcolor: stateLayer(c.surfaceContainerLow, c.onSurface, STATE.hover) },
          '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: -2 },
        }}
      >
        <FileIcon item={item} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant={isFolder ? 'titleSmall' : 'bodyMedium'} component="p" noWrap sx={{ color: c.onSurface }}>
            {truncateMiddle(item.name, 30, 16, 11)}
          </Typography>
          <Typography variant="bodySmall" component="p" noWrap sx={{ color: c.onSurfaceVariant, whiteSpace: 'pre' }}>
            {item.hidden ? (
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <VisibilityOffOutlinedIcon sx={{ fontSize: 14 }} /> Hidden, AI skips it
              </Box>
            ) : meta}
          </Typography>
        </Box>
        {ctx?.markers?.length > 0 && (
          <Typography variant="labelSmall" sx={{ px: 1, py: 0.25, borderRadius: corner.sm, bgcolor: c.tertiaryContainer, color: c.onTertiaryContainer, flexShrink: 0 }}>
            Project
          </Typography>
        )}
      </ButtonBase>
    </Tooltip>
  );
}
