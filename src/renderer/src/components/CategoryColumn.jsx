import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Paper, Typography, Box, Chip } from '@mui/material';
import { SortableItem } from './SortableItem';

export default function CategoryColumn({ id, title, reason, items = [] }) {
  const { setNodeRef } = useDroppable({ id });
  
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <Paper 
      sx={{ 
        width: 280, 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        bgcolor: 'background.default',
        border: '1px solid',
        borderColor: 'divider'
      }}
    >
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="subtitle1" fontWeight="bold">
          {title}
        </Typography>
        {reason && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {reason}
          </Typography>
        )}
        <Chip size="small" label={`${safeItems.length} items`} />
      </Box>

      <Box 
        ref={setNodeRef} 
        sx={{ 
          p: 1, 
          flexGrow: 1, 
          overflowY: 'auto',
          minHeight: 100 
        }}
      >
        <SortableContext 
          id={id} 
          items={safeItems.map(i => i.name)} // SortableContext needs stable IDs
          strategy={verticalListSortingStrategy}
        >
          {safeItems.map((item) => (
            <SortableItem key={item.name} id={item.name} item={item} />
          ))}
        </SortableContext>
      </Box>
    </Paper>
  );
}
