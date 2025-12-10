import React, { useState, useRef, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import CategoryDropZone from './CategoryDropZone';
import DraggableItem from './DraggableItem';

export default function DnDOrganizer({ plan, setPlan }) {
  const [draggedItem, setDraggedItem] = useState(null);
  const [draggedFromCategory, setDraggedFromCategory] = useState(null);
  const [dragOverCategory, setDragOverCategory] = useState(null);
  const dragImageRef = useRef(null);

  const handleDragStart = useCallback((e, item, categoryId) => {
    setDraggedItem(item);
    setDraggedFromCategory(categoryId);

    // Set drag data
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.name);

    // Create custom drag image
    if (dragImageRef.current) {
      e.dataTransfer.setDragImage(dragImageRef.current, 0, 0);
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDraggedFromCategory(null);
    setDragOverCategory(null);
  }, []);

  const handleDragOver = useCallback((e, categoryId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCategory(categoryId);
  }, []);

  const handleDragLeave = useCallback((e, categoryId) => {
    // Only clear if we're actually leaving the category
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      if (dragOverCategory === categoryId) {
        setDragOverCategory(null);
      }
    }
  }, [dragOverCategory]);

  const handleDrop = useCallback((e, targetCategoryId) => {
    e.preventDefault();

    if (!draggedItem || !draggedFromCategory) return;
    if (draggedFromCategory === targetCategoryId) {
      handleDragEnd();
      return;
    }

    setPlan((prev) => {
      const sourceItems = prev[draggedFromCategory].items.filter(
        (i) => i.name !== draggedItem.name
      );
      const targetItems = [...prev[targetCategoryId].items, draggedItem];

      return {
        ...prev,
        [draggedFromCategory]: {
          ...prev[draggedFromCategory],
          items: sourceItems,
        },
        [targetCategoryId]: {
          ...prev[targetCategoryId],
          items: targetItems,
        },
      };
    });

    handleDragEnd();
  }, [draggedItem, draggedFromCategory, setPlan, handleDragEnd]);

  // Calculate totals
  const totalItems = Object.values(plan).reduce((sum, cat) => sum + cat.items.length, 0);
  const categoryCount = Object.keys(plan).length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Hidden drag image */}
      <div
        ref={dragImageRef}
        style={{
          position: 'absolute',
          top: -1000,
          left: -1000,
          width: 1,
          height: 1,
        }}
      />

      {/* Summary */}
      <Box sx={{
        display: 'flex',
        gap: 3,
        px: 2,
        py: 1.5,
        borderRadius: 2,
        bgcolor: 'background.surfaceContainerHigh',
      }}>
        <Typography variant="body2" color="text.secondary">
          <strong>{categoryCount}</strong> categories
        </Typography>
        <Typography variant="body2" color="text.secondary">
          <strong>{totalItems}</strong> items to organize
        </Typography>
      </Box>

      {/* Category List */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Object.entries(plan).map(([categoryId, data]) => (
          <CategoryDropZone
            key={categoryId}
            id={categoryId}
            title={categoryId}
            reason={data.reason}
            items={data.items}
            isOver={dragOverCategory === categoryId && draggedFromCategory !== categoryId}
            onDragOver={(e) => handleDragOver(e, categoryId)}
            onDragLeave={(e) => handleDragLeave(e, categoryId)}
            onDrop={(e) => handleDrop(e, categoryId)}
            renderItem={(item) => (
              <DraggableItem
                key={item.name}
                item={item}
                isDragging={draggedItem?.name === item.name}
                onDragStart={(e) => handleDragStart(e, item, categoryId)}
                onDragEnd={handleDragEnd}
              />
            )}
          />
        ))}
      </Box>
    </Box>
  );
}
