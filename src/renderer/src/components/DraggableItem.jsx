import React, { memo } from 'react';
import { Paper, Typography } from '@mui/material';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import FolderIcon from '@mui/icons-material/Folder';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

// File type colors
const getFileColor = (filename) => {
  const ext = filename?.split('.').pop()?.toLowerCase();
  const colors = {
    js: '#F7DF1E',
    jsx: '#61DAFB',
    ts: '#3178C6',
    tsx: '#3178C6',
    py: '#3776AB',
    json: '#FFB13B',
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
  return colors[ext] || undefined;
};

const DraggableItem = memo(function DraggableItem({
  item,
  isDragging,
  onDragStart,
  onDragEnd,
}) {
  if (!item) return null;

  const isFolder = item.type === 'folder';
  const fileColor = getFileColor(item.name);

  return (
    <Paper
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      elevation={0}
      sx={{
        px: 1.5,
        py: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        bgcolor: 'background.surfaceContainerHigh',
        border: '1px solid',
        borderColor: 'divider',
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        userSelect: 'none',
        '&:hover': {
          bgcolor: 'action.hover',
          borderColor: 'primary.main',
        },
        '&:active': {
          cursor: 'grabbing',
        },
      }}
    >
      <DragIndicatorIcon
        sx={{
          fontSize: 16,
          color: 'text.disabled',
          flexShrink: 0,
        }}
      />

      {isFolder ? (
        <FolderIcon
          sx={{
            fontSize: 18,
            color: 'primary.main',
            flexShrink: 0,
          }}
        />
      ) : (
        <InsertDriveFileIcon
          sx={{
            fontSize: 18,
            color: fileColor || 'text.secondary',
            flexShrink: 0,
          }}
        />
      )}

      <Typography
        variant="body2"
        title={item.name}
        sx={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: isFolder ? 500 : 400,
          color: 'text.primary',
          maxWidth: 180,
        }}
      >
        {item.name}
      </Typography>
    </Paper>
  );
});

export default DraggableItem;
