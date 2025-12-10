import React, { useState, memo } from 'react';
import {
  Paper, Typography, Box, Chip, IconButton, Collapse, Tooltip
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

const CategoryDropZone = memo(function CategoryDropZone({
  id,
  title,
  reason,
  items = [],
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  renderItem,
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  const safeItems = Array.isArray(items) ? items : [];

  return (
    <Paper
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        border: '2px solid',
        borderColor: isOver ? 'primary.main' : 'divider',
        boxShadow: isOver ? '0 0 0 3px rgba(208, 188, 255, 0.3)' : 'none',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      {/* Header */}
      <Box
        onClick={() => setIsExpanded(!isExpanded)}
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          cursor: 'pointer',
          borderBottom: isExpanded ? '1px solid' : 'none',
          borderColor: 'divider',
          '&:hover': {
            bgcolor: 'action.hover',
          },
        }}
      >
        {/* Folder Icon */}
        <Box sx={{
          p: 1,
          borderRadius: 1.5,
          bgcolor: 'primary.dark',
          display: 'flex',
        }}>
          <FolderIcon sx={{ color: 'primary.main', fontSize: 20 }} />
        </Box>

        {/* Title and Reason */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={600} noWrap>
              {title}
            </Typography>
            <Chip
              size="small"
              label={safeItems.length}
              sx={{
                height: 22,
                minWidth: 32,
                bgcolor: 'action.selected',
                fontWeight: 600,
              }}
            />
          </Box>
          {reason && (
            <Tooltip title={reason} placement="bottom-start">
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: 'block',
                  mt: 0.25,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {reason}
              </Typography>
            </Tooltip>
          )}
        </Box>

        {/* Expand/Collapse Button */}
        <IconButton size="small" sx={{ ml: 1 }}>
          {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      {/* Items Area - Drop Zone */}
      <Collapse in={isExpanded} timeout={150}>
        <Box
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          sx={{
            p: 2,
            minHeight: 70,
            bgcolor: isOver ? 'action.selected' : 'transparent',
            transition: 'background-color 0.15s ease',
          }}
        >
          {safeItems.length > 0 ? (
            <Box sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
              alignContent: 'flex-start',
            }}>
              {safeItems.map(renderItem)}
            </Box>
          ) : (
            <Box sx={{
              py: 3,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              border: '2px dashed',
              borderColor: isOver ? 'primary.main' : 'divider',
              borderRadius: 2,
              bgcolor: isOver ? 'action.hover' : 'transparent',
              transition: 'all 0.15s ease',
            }}>
              <Typography
                variant="body2"
                color={isOver ? 'primary.main' : 'text.disabled'}
                fontWeight={isOver ? 500 : 400}
              >
                {isOver ? 'Drop here' : 'Drag items here'}
              </Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
});

export default CategoryDropZone;
