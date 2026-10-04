import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Box, Typography, Button, IconButton, Menu, MenuItem, ListItemIcon, ListSubheader, Divider, InputBase,
  Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, ButtonBase, ToggleButton, ToggleButtonGroup, useTheme,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DriveFileMoveOutlinedIcon from '@mui/icons-material/DriveFileMoveOutlined';
import BlockIcon from '@mui/icons-material/Block';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RefreshIcon from '@mui/icons-material/Refresh';
import NotesIcon from '@mui/icons-material/Notes';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import FileIcon from './FileIcon';
import BeforeAfterView from './BeforeAfterView';
import FloatingToolbar from './FloatingToolbar';
import { useSnackbar } from '../../context/SnackbarContext';
import { corner, motion } from '../../theme/tokens';
import { stateLayer, STATE } from '../../theme/theme';
import { countPlanItems, invalidNameReason, normalizeKey } from '../../utils/plan';
import { pluralize } from '../../utils/format';
import { truncateMiddle } from '../../utils/truncateMiddle';

const EXCLUDED = '__excluded__';

export default function ReviewPanel({ plan, setPlan, excluded, setExcluded, aiStream, source = 'ai', files = [], rootPath = '', onCancel, onApply, onRetry }) {
  const { palette } = useTheme();
  const c = palette.m3;
  const { notify } = useSnackbar();
  const [drag, setDrag] = useState(null); // { item, from }
  const [over, setOver] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showResponse, setShowResponse] = useState(false);
  const [reviewView, setReviewView] = useState('categories');

  const categories = Object.keys(plan);
  const total = countPlanItems(plan);
  const nonEmpty = categories.filter((k) => plan[k].items.length > 0).length;

  const moveItem = useCallback((item, from, to) => {
    if (!item || from === to) return;
    const key = normalizeKey(item.name);
    if (from === EXCLUDED || to === EXCLUDED) {
      setExcluded((prev) => (to === EXCLUDED ? [...prev, item] : prev.filter((i) => normalizeKey(i.name) !== key)));
    }
    setPlan((prev) => {
      const next = { ...prev };
      if (from !== EXCLUDED && next[from]) {
        next[from] = { ...next[from], items: next[from].items.filter((i) => normalizeKey(i.name) !== key) };
      }
      if (to !== EXCLUDED && next[to]) next[to] = { ...next[to], items: [...next[to].items, item] };
      return next;
    });
  }, [setPlan, setExcluded]);

  const renameCategory = (oldName, rawNew) => {
    const newName = String(rawNew || '').trim();
    setEditing(null);
    if (!newName || newName === oldName) return;
    const reason = invalidNameReason(newName);
    if (reason) {
      notify(reason);
      return;
    }
    if (categories.some((k) => k !== oldName && normalizeKey(k) === normalizeKey(newName))) {
      notify(`There's already a folder named “${newName}”.`);
      return;
    }
    // Rebuild to keep the category order stable.
    setPlan((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => (k === oldName ? [newName, v] : [k, v]))));
  };

  const addCategory = () => {
    let name = 'New folder';
    let n = 2;
    const taken = new Set(categories.map(normalizeKey));
    while (taken.has(normalizeKey(name))) name = `New folder ${n++}`;
    setPlan((prev) => ({ ...prev, [name]: { reason: 'Added by you', items: [] } }));
    setEditing(name);
  };

  const removeCategory = (name) => {
    const items = plan[name]?.items || [];
    setExcluded((prev) => [...prev, ...items]);
    setPlan((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    notify(items.length ? `Removed “${name}”. Its items will stay where they are.` : `Removed “${name}”.`);
  };

  const dropProps = (target) => ({
    onDragOver: (e) => {
      if (!drag) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (over !== target) setOver(target);
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setOver((o) => (o === target ? null : o));
    },
    onDrop: (e) => {
      e.preventDefault();
      if (drag) moveItem(drag.item, drag.from, target);
      setDrag(null);
      setOver(null);
    },
  });

  const chipProps = (item, from) => ({
    item,
    from,
    categories,
    onMove: (to) => moveItem(item, from, to),
    dragging: drag?.item?.name === item.name,
    onDragStart: (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.name);
      setDrag({ item, from });
    },
    onDragEnd: () => { setDrag(null); setOver(null); },
  });

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="titleLarge" component="h2">Review the plan</Typography>
          <Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant }}>
            Drag items between folders, or use an item’s menu. Rename a folder by clicking its name. Nothing moves until you apply.
          </Typography>
        </Box>
        {source === 'ai' && <Button variant="text" startIcon={<NotesIcon />} onClick={() => setShowResponse(true)} sx={{ flexShrink: 0 }}>
          AI response
        </Button>}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={reviewView}
          onChange={(_event, next) => next && setReviewView(next)}
          aria-label="Review view"
        >
          <ToggleButton value="categories">Categories</ToggleButton>
          <ToggleButton value="before-after">Before &amp; after</ToggleButton>
        </ToggleButtonGroup>
        {reviewView === 'before-after' && (
          <Typography variant="bodySmall" sx={{ color: c.onSurfaceVariant }}>Preview updates as you edit</Typography>
        )}
      </Box>

      {reviewView === 'before-after' ? (
        <BeforeAfterView files={files} rootPath={rootPath} plan={plan} excluded={excluded} />
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pb: 14, mx: -0.5, px: 0.5 }}>
          <Box sx={{ columnWidth: 300, columnGap: '12px' }}>
            {categories.map((name) => (
              <CategoryCard
                key={name}
                name={name}
                data={plan[name]}
                isOver={over === name && drag?.from !== name}
                dragActive={Boolean(drag)}
                editing={editing === name}
                onStartEdit={() => setEditing(name)}
                onRename={(v) => renameCategory(name, v)}
                onRemove={() => removeCategory(name)}
                dropProps={dropProps(name)}
                renderChip={(item) => <ItemChip key={item.name} {...chipProps(item, name)} />}
              />
            ))}

            <ButtonBase
              onClick={addCategory}
              sx={{
                width: '100%',
                breakInside: 'avoid',
                mb: 1.5,
                minHeight: 96,
                borderRadius: corner.xl,
                border: `2px dashed ${c.outlineVariant}`,
                color: c.onSurfaceVariant,
                display: 'flex',
                gap: 1,
                transition: motion.effects(['background-color', 'border-color']),
                '&:hover': { bgcolor: stateLayer(c.surface, c.onSurface, STATE.hover), borderColor: c.outline },
              }}
            >
              <CreateNewFolderOutlinedIcon />
              <Typography variant="labelLarge">Add folder</Typography>
            </ButtonBase>
          </Box>

          {/* Items the user chose to leave in place */}
          <Box
            {...dropProps(EXCLUDED)}
            sx={{
              mt: 1,
              p: 2,
              borderRadius: corner.xl,
              bgcolor: over === EXCLUDED ? c.secondaryContainer : c.surfaceContainerLow,
              outline: drag && drag.from !== EXCLUDED ? `2px dashed ${c.outline}` : 'none',
              outlineOffset: -2,
              transition: motion.effects(['background-color']),
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: excluded.length ? 1.5 : 0, color: c.onSurfaceVariant }}>
              <PushPinOutlinedIcon fontSize="small" />
              <Typography variant="titleSmall" sx={{ color: c.onSurface }}>Staying put</Typography>
              <Typography variant="bodySmall">
                {excluded.length ? `${pluralize(excluded.length, 'item')} won’t be moved` : 'Drop items here to leave them where they are'}
              </Typography>
            </Box>
            {excluded.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {excluded.map((item) => <ItemChip key={item.name} {...chipProps(item, EXCLUDED)} />)}
              </Box>
            )}
          </Box>
        </Box>
      )}

      <FloatingToolbar>
        <Box sx={{ px: 1.5, minWidth: 0 }}>
          <Typography variant="titleSmall" noWrap>{pluralize(total, 'item')} into {pluralize(nonEmpty, 'folder')}</Typography>
          <Typography variant="bodySmall" noWrap sx={{ color: c.onSurfaceVariant }}>
            {excluded.length ? `${excluded.length} staying put` : 'Review, then apply'}
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Button color="inherit" onClick={onCancel}>Discard</Button>
        <Tooltip title={source === 'preset' ? 'Change your file rules' : 'Ask for a different plan'}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={onRetry}>{source === 'preset' ? 'Edit preset' : 'Try again'}</Button>
        </Tooltip>
        <Button variant="contained" size="large" startIcon={<DriveFileMoveOutlinedIcon />} onClick={onApply} disabled={total === 0} sx={{ typography: 'titleMediumEmphasized', px: 3.5 }}>
          Move {pluralize(total, 'item')}
        </Button>
      </FloatingToolbar>

      <Dialog open={showResponse} onClose={() => setShowResponse(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <AutoAwesomeIcon sx={{ color: c.primary }} /> AI response
        </DialogTitle>
        <DialogContent>
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 2,
              borderRadius: corner.lg,
              bgcolor: c.surfaceContainerHighest,
              color: c.onSurface,
              maxHeight: '55vh',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
              fontSize: '0.8125rem',
              lineHeight: 1.55,
              userSelect: 'text',
            }}
          >
            {aiStream?.trim() || 'No response text was captured for this plan.'}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowResponse(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function CategoryCard({ name, data, isOver, dragActive, editing, onStartEdit, onRename, onRemove, dropProps, renderChip }) {
  const { palette } = useTheme();
  const c = palette.m3;
  const [menuAnchor, setMenuAnchor] = useState(null);
  const inputRef = useRef(null);
  const items = data.items || [];

  return (
    <Box
      component="section"
      aria-label={`${name}, ${items.length} items`}
      {...dropProps}
      sx={{
        breakInside: 'avoid',
        mb: 1.5,
        p: 1.5,
        borderRadius: isOver ? corner.xxl : corner.xl,
        bgcolor: isOver ? c.primaryContainer : c.surfaceContainer,
        color: isOver ? c.onPrimaryContainer : c.onSurface,
        outline: dragActive && !isOver ? `1px dashed ${c.outlineVariant}` : 'none',
        outlineOffset: -1,
        transition: [motion.spatial(['border-radius']), motion.effects(['background-color', 'color'])].join(', '),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, pl: 0.5 }}>
        <FileIcon item={{ type: 'folder' }} size={40} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          {editing ? (
            <InputBase
              inputRef={inputRef}
              autoFocus
              defaultValue={name}
              onFocus={(e) => e.target.select()}
              onBlur={(e) => onRename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.querySelector('input')?.blur();
                if (e.key === 'Escape') onRename(name);
              }}
              inputProps={{ 'aria-label': 'Folder name', maxLength: 120 }}
              sx={{ typography: 'titleMedium', width: '100%', px: 1, borderRadius: corner.xs, bgcolor: c.surfaceContainerHighest, outline: `2px solid ${c.primary}`, '& input': { userSelect: 'text', py: 0.25 } }}
            />
          ) : (
            <ButtonBase onClick={onStartEdit} title="Rename" sx={{ borderRadius: corner.xs, px: 0.5, ml: -0.5, maxWidth: '100%', '&:hover': { bgcolor: stateLayer(c.surfaceContainer, c.onSurface, STATE.hover) } }}>
              <Typography variant="titleMediumEmphasized" component="h3" noWrap>{name}</Typography>
            </ButtonBase>
          )}
          {data.reason && (
            <Typography variant="bodySmall" component="p" sx={{ color: isOver ? 'inherit' : c.onSurfaceVariant, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {data.reason}
            </Typography>
          )}
        </Box>
        <Typography variant="labelLargeEmphasized" sx={{ minWidth: 28, height: 28, px: 1, borderRadius: corner.full, display: 'grid', placeItems: 'center', bgcolor: c.secondaryContainer, color: c.onSecondaryContainer, fontVariantNumeric: 'tabular-nums' }}>
          {items.length}
        </Typography>
        <IconButton size="small" aria-label={`Options for ${name}`} onClick={(e) => setMenuAnchor(e.currentTarget)}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
        <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
          <MenuItem onClick={() => { setMenuAnchor(null); onStartEdit(); }}>
            <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>Rename
          </MenuItem>
          <MenuItem onClick={() => { setMenuAnchor(null); onRemove(); }}>
            <ListItemIcon><DeleteOutlineIcon fontSize="small" /></ListItemIcon>Remove from plan
          </MenuItem>
        </Menu>
      </Box>

      {items.length > 0 ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>{items.map(renderChip)}</Box>
      ) : (
        <Box sx={{ py: 2.5, borderRadius: corner.lg, border: `2px dashed ${isOver ? c.onPrimaryContainer : c.outlineVariant}`, textAlign: 'center' }}>
          <Typography variant="bodySmall" sx={{ color: isOver ? 'inherit' : c.onSurfaceVariant }}>
            {isOver ? 'Drop to add' : 'Empty. Drag items here, or it will be skipped'}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function ItemChip({ item, from, categories, onMove, dragging, onDragStart, onDragEnd }) {
  const { palette } = useTheme();
  const c = palette.m3;
  const [anchor, setAnchor] = useState(null);
  const targets = useMemo(() => categories.filter((k) => k !== from), [categories, from]);

  return (
    <>
      <ButtonBase
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
        aria-label={`${item.name}. Open move options`}
        title={item.name}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          minHeight: 48,
          pl: 0.5,
          pr: 1.25,
          maxWidth: '100%',
          borderRadius: corner.md,
          bgcolor: c.surfaceContainerLowest,
          color: c.onSurface,
          cursor: 'grab',
          opacity: dragging ? 0.4 : 1,
          transform: dragging ? 'scale(0.96)' : 'none',
          transition: [motion.spatial(['transform', 'border-radius'], 'fast'), motion.effects(['background-color', 'opacity'])].join(', '),
          '&:hover': { bgcolor: stateLayer(c.surfaceContainerLowest, c.onSurface, STATE.hover) },
          '&:hover .drag-handle': { opacity: 1 },
          '&:active': { cursor: 'grabbing', borderRadius: corner.sm },
          '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 1 },
        }}
      >
        <DragIndicatorIcon className="drag-handle" sx={{ fontSize: 16, color: c.onSurfaceVariant, opacity: 0.5 }} />
        <FileIcon item={item} size={24} radius={corner.sm} />
        <Typography variant="labelLarge" noWrap sx={{ minWidth: 0, fontWeight: item.type === 'folder' ? 600 : 500 }}>
          {truncateMiddle(item.name, 28, 14, 10)}
        </Typography>
      </ButtonBase>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} MenuListProps={{ dense: true }}>
        <ListSubheader>Move to</ListSubheader>
        {targets.length === 0 && <MenuItem disabled>No other folders</MenuItem>}
        {targets.map((k) => (
          <MenuItem key={k} onClick={() => { setAnchor(null); onMove(k); }}>
            <ListItemIcon><DriveFileMoveOutlinedIcon fontSize="small" /></ListItemIcon>
            {truncateMiddle(k, 32, 18, 10)}
          </MenuItem>
        ))}
        {from !== EXCLUDED && <Divider sx={{ my: 0.5 }} />}
        {from !== EXCLUDED && (
          <MenuItem onClick={() => { setAnchor(null); onMove(EXCLUDED); }}>
            <ListItemIcon><BlockIcon fontSize="small" /></ListItemIcon>
            Leave it where it is
          </MenuItem>
        )}
      </Menu>
    </>
  );
}
