import React, { useState } from 'react';
import {
  Box, Typography, Collapse, IconButton, Chip, Tooltip, Grid
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CircularProgress from '@mui/material/CircularProgress';

// File type icon colors
const getFileColor = (filename) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const colors = {
    js: '#F7DF1E',
    jsx: '#61DAFB',
    ts: '#3178C6',
    tsx: '#3178C6',
    py: '#3776AB',
    json: '#292929',
    md: '#083FA1',
    html: '#E34F26',
    css: '#1572B6',
    scss: '#CC6699',
    png: '#89CFF0',
    jpg: '#89CFF0',
    jpeg: '#89CFF0',
    gif: '#89CFF0',
    svg: '#FFB13B',
    pdf: '#FF0000',
  };
  return colors[ext] || 'action';
};

// Single file/folder item with expandable children
function FileTreeItem({ item, fullPath, level = 0 }) {
  const [isOpen, setIsOpen] = useState(false);
  const [children, setChildren] = useState(null);
  const [loading, setLoading] = useState(false);

  const isFolder = item.type === 'folder';
  const indent = level * 24;

  const handleToggle = async () => {
    if (!isFolder) return;

    if (!isOpen && !children) {
      setLoading(true);
      try {
        const items = await window.electronAPI.scanFolder(fullPath);
        const sorted = items.sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === 'folder' ? -1 : 1;
        });
        setChildren(sorted);
      } catch (error) {
        console.error("Failed to load folder:", error);
      } finally {
        setLoading(false);
      }
    }
    setIsOpen(!isOpen);
  };

  return (
    <Box>
      {/* Item Row */}
      <Box
        onClick={handleToggle}
        sx={{
          display: 'flex',
          alignItems: 'center',
          py: 0.75,
          px: 1.5,
          pl: `${indent + 12}px`,
          cursor: isFolder ? 'pointer' : 'default',
          borderRadius: 1.5,
          transition: 'background-color 0.15s',
          '&:hover': {
            bgcolor: 'action.hover',
          },
        }}
      >
        {/* Expand/Collapse Icon */}
        <Box sx={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isFolder && (
            loading ? (
              <CircularProgress size={16} />
            ) : (
              isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />
            )
          )}
        </Box>

        {/* File/Folder Icon */}
        <Box sx={{ mr: 1.5, display: 'flex', alignItems: 'center' }}>
          {isFolder ? (
            isOpen ? (
              <FolderOpenIcon sx={{ color: 'primary.main' }} />
            ) : (
              <FolderIcon sx={{ color: 'primary.main' }} />
            )
          ) : (
            <InsertDriveFileIcon sx={{ color: getFileColor(item.name), fontSize: 20 }} />
          )}
        </Box>

        {/* Name */}
        <Tooltip title={item.name} placement="right" enterDelay={500}>
          <Typography
            variant="body2"
            sx={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: isFolder ? 500 : 400,
              color: isFolder ? 'text.primary' : 'text.secondary',
            }}
          >
            {item.name}
          </Typography>
        </Tooltip>

        {/* Folder context info */}
        {isFolder && item.context && (
          <Box sx={{ display: 'flex', gap: 0.5, ml: 1 }}>
            {item.context.fileCount > 0 && (
              <Chip
                size="small"
                label={item.context.fileCount}
                sx={{
                  height: 20,
                  fontSize: '0.7rem',
                  bgcolor: 'action.selected',
                  '& .MuiChip-label': { px: 1 }
                }}
              />
            )}
            {item.context.topExtensions?.slice(0, 2).map(ext => (
              <Chip
                key={ext}
                size="small"
                label={ext}
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
                  bgcolor: 'background.surfaceContainerHigh',
                  '& .MuiChip-label': { px: 0.75 }
                }}
              />
            ))}
          </Box>
        )}
      </Box>

      {/* Children */}
      {isFolder && (
        <Collapse in={isOpen} timeout="auto" unmountOnExit>
          <Box>
            {children && children.length > 0 ? (
              children.map((child) => (
                <FileTreeItem
                  key={child.name}
                  item={child}
                  fullPath={`${fullPath}/${child.name}`}
                  level={level + 1}
                />
              ))
            ) : children && children.length === 0 ? (
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ pl: `${indent + 60}px`, py: 1, display: 'block' }}
              >
                Empty folder
              </Typography>
            ) : null}
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

// Main grid view of root items
function RootItemCard({ item, fullPath, onClick }) {
  const isFolder = item.type === 'folder';

  return (
    <Box
      onClick={onClick}
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        cursor: 'pointer',
        transition: 'all 0.2s',
        '&:hover': {
          bgcolor: 'action.hover',
          borderColor: 'primary.main',
          transform: 'translateY(-2px)',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        {isFolder ? (
          <FolderIcon sx={{ color: 'primary.main', fontSize: 32 }} />
        ) : (
          <InsertDriveFileIcon sx={{ color: getFileColor(item.name), fontSize: 32 }} />
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Tooltip title={item.name} placement="top" enterDelay={500}>
            <Typography
              variant="subtitle2"
              fontWeight={500}
              noWrap
              sx={{ mb: 0.5 }}
            >
              {item.name}
            </Typography>
          </Tooltip>

          {isFolder && item.context && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              <Chip
                size="small"
                label={`${item.context.fileCount} files`}
                sx={{
                  height: 20,
                  fontSize: '0.7rem',
                  bgcolor: 'action.selected',
                  '& .MuiChip-label': { px: 1 }
                }}
              />
              {item.context.topExtensions?.slice(0, 2).map(ext => (
                <Chip
                  key={ext}
                  size="small"
                  label={ext}
                  variant="outlined"
                  sx={{
                    height: 20,
                    fontSize: '0.65rem',
                    borderColor: 'outlineVariant',
                    '& .MuiChip-label': { px: 0.75 }
                  }}
                />
              ))}
              {item.context.truncated && (
                <Chip
                  size="small"
                  label="500+"
                  sx={{
                    height: 20,
                    fontSize: '0.65rem',
                    bgcolor: 'warning.dark',
                    color: 'warning.main',
                    '& .MuiChip-label': { px: 0.75 }
                  }}
                />
              )}
            </Box>
          )}

          {!isFolder && (
            <Typography variant="caption" color="text.disabled">
              {item.name.split('.').pop()?.toUpperCase() || 'FILE'}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default function FileExplorer({ files, rootPath }) {
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'tree'
  const [expandedItems, setExpandedItems] = useState(new Set());

  // Sort files: folders first, then alphabetically
  const sortedFiles = [...files].sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'folder' ? -1 : 1;
  });

  const folders = sortedFiles.filter(f => f.type === 'folder');
  const filesOnly = sortedFiles.filter(f => f.type === 'file');

  if (files.length === 0) {
    return (
      <Box sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'text.disabled',
        py: 8
      }}>
        <FolderOpenIcon sx={{ fontSize: 64, mb: 2, opacity: 0.5 }} />
        <Typography variant="h6">This folder is empty</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%' }}>
      {/* Grid View for root items */}
      {folders.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="overline" color="text.secondary" sx={{ px: 1, mb: 1, display: 'block' }}>
            Folders ({folders.length})
          </Typography>
          <Grid container spacing={1.5}>
            {folders.map((item) => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={item.name}>
                <RootItemCard
                  item={item}
                  fullPath={`${rootPath}/${item.name}`}
                />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {filesOnly.length > 0 && (
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ px: 1, mb: 1, display: 'block' }}>
            Files ({filesOnly.length})
          </Typography>
          <Grid container spacing={1.5}>
            {filesOnly.map((item) => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={item.name}>
                <RootItemCard
                  item={item}
                  fullPath={`${rootPath}/${item.name}`}
                />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
    </Box>
  );
}
