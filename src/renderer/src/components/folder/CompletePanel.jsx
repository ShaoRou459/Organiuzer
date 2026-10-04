import React, { useMemo, useState } from 'react';
import { Box, Typography, Button, Collapse, useTheme } from '@mui/material';
import { motion as m } from 'framer-motion';
import CheckIcon from '@mui/icons-material/Check';
import UndoIcon from '@mui/icons-material/Undo';
import HistoryIcon from '@mui/icons-material/History';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SurfaceCard from '../common/SurfaceCard';
import ExpressiveShape from '../common/ExpressiveShape';
import FileIcon from './FileIcon';
import { corner, springs } from '../../theme/tokens';
import { formatBytes, formatNumber, pluralize } from '../../utils/format';
import { truncateMiddle } from '../../utils/truncateMiddle';

/** Hero moment: the run finished. Editorial number + celebratory shape, then the details. */
export default function CompletePanel({ stats, run, warnings = [], reverted, busy, onUndo, onHistory, onOpenFolder, onHome }) {
  const { palette } = useTheme();
  const c = palette.m3;
  const [showNotes, setShowNotes] = useState(false);

  const moved = useMemo(() => {
    const list = Array.isArray(run?.moves) ? run.moves : [];
    return list.map((rec) => {
      const parts = String(rec?.to || '').split(/[\\/]/).filter(Boolean);
      return { name: parts[parts.length - 1], category: parts[parts.length - 2], key: rec.to };
    }).filter((x) => x.name);
  }, [run]);

  const movedCount = run?.moved ?? stats.totalItems;
  const max = Math.max(1, ...stats.categories.map((x) => x.count));
  const fills = [c.primary, c.tertiary, c.secondary];

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'grid',
        gap: 1.5,
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1fr) minmax(260px, 0.75fr)' },
        gridTemplateRows: { xs: 'auto', md: 'auto minmax(260px, 1fr)' },
        gridTemplateAreas: { xs: '"hero" "actions" "cats" "moved"', md: '"hero hero actions" "cats moved actions"' },
        '& > *': { minWidth: 0, minHeight: 0 },
      }}
    >
      {/* Hero */}
      <Box sx={{ gridArea: 'hero', position: 'relative', overflow: 'hidden', borderRadius: corner.xlInc, bgcolor: reverted ? c.surfaceContainerHigh : c.primaryContainer, color: reverted ? c.onSurface : c.onPrimaryContainer, p: { xs: 3, md: 4 }, display: 'flex', alignItems: 'center', gap: 4 }}>
        <m.div initial={{ scale: 0.4, rotate: -60 }} animate={{ scale: 1, rotate: 0 }} transition={springs.slowSpatial} style={{ flexShrink: 0 }}>
          <ExpressiveShape shape={reverted ? 'circle' : 'cookie12'} size={120} color={reverted ? c.secondaryContainer : c.primary} spin={reverted ? 0 : 40}>
            {reverted
              ? <UndoIcon sx={{ fontSize: 48, color: c.onSecondaryContainer }} />
              : <CheckIcon sx={{ fontSize: 56, color: c.onPrimary }} />}
          </ExpressiveShape>
        </m.div>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="displayLargeEmphasized" component="p" sx={{ fontWeight: 720, fontStretch: '115%', letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {formatNumber(movedCount)}
            </Typography>
            <Typography variant="headlineMedium" component="p">
              {reverted ? `${movedCount === 1 ? 'item' : 'items'} put back` : `${movedCount === 1 ? 'item' : 'items'} organized`}
            </Typography>
          </Box>
          <Typography variant="bodyLarge" sx={{ mt: 1.5, opacity: 0.86 }}>
            {reverted
              ? 'This run was undone. Everything is back where it started.'
              : `Into ${pluralize(stats.categories.length, 'folder')}, ${pluralize(stats.filesMoved, 'file')} and ${pluralize(stats.foldersMoved, 'folder')}, ${formatBytes(stats.totalBytes)} of files.`}
          </Typography>
          {warnings.length > 0 && (
            <Button
              size="small"
              variant="text"
              startIcon={<InfoOutlinedIcon />}
              onClick={() => setShowNotes((v) => !v)}
              sx={{ mt: 1, ml: -1.5, color: 'inherit' }}
            >
              {showNotes ? 'Hide' : 'Show'} {pluralize(warnings.length, 'note')}
            </Button>
          )}
          <Collapse in={showNotes}>
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5, maxHeight: 140, overflowY: 'auto', userSelect: 'text' }}>
              {warnings.slice(0, 30).map((w, i) => (
                <Typography component="li" key={i} variant="bodySmall">{w.message}</Typography>
              ))}
            </Box>
          </Collapse>
        </Box>
      </Box>

      {/* Where things went */}
      <SurfaceCard sx={{ gridArea: 'cats' }} title="Where things went" subtitle={pluralize(stats.categories.length, 'folder')}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, overflowY: 'auto', minHeight: 0, pr: 0.5 }}>
          {stats.categories.map((cat, i) => (
            <Box key={cat.name}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
                <Typography variant="labelLarge" noWrap>{cat.name}</Typography>
                <Typography variant="labelLarge" sx={{ color: c.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>{cat.count}</Typography>
              </Box>
              <Box sx={{ height: 12, borderRadius: corner.full, bgcolor: c.surfaceContainerHighest, overflow: 'hidden' }}>
                <m.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(4, (cat.count / max) * 100)}%` }}
                  transition={{ ...springs.slowSpatial, delay: 0.04 * i }}
                  style={{ height: '100%', borderRadius: 9999, background: fills[i % fills.length] }}
                />
              </Box>
            </Box>
          ))}
        </Box>
      </SurfaceCard>

      {/* Moved items */}
      <SurfaceCard sx={{ gridArea: 'moved' }} title="Moved items" subtitle={moved.length ? pluralize(moved.length, 'item') : undefined}>
        {moved.length ? (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, mx: -1, overflowY: 'auto', minHeight: 0 }}>
            {moved.slice(0, 200).map((it) => (
              <Box component="li" key={it.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1, py: 0.75 }}>
                <FileIcon item={{ name: it.name }} size={32} />
                <Typography variant="bodyMedium" noWrap sx={{ flex: 1, minWidth: 0 }} title={it.name}>{truncateMiddle(it.name, 40, 22, 14)}</Typography>
                <Typography variant="labelMedium" noWrap sx={{ px: 1, py: 0.25, borderRadius: corner.sm, bgcolor: c.surfaceContainerHighest, color: c.onSurfaceVariant, maxWidth: 140 }}>
                  {it.category}
                </Typography>
              </Box>
            ))}
            {moved.length > 200 && (
              <Typography component="li" variant="bodySmall" sx={{ px: 1, py: 1, color: c.onSurfaceVariant }}>and {moved.length - 200} more</Typography>
            )}
          </Box>
        ) : (
          <Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant }}>No item details were recorded for this run.</Typography>
        )}
      </SurfaceCard>

      {/* Next steps */}
      <SurfaceCard sx={{ gridArea: 'actions' }} tone="low" title="What next">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
          <Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant, mb: 1 }}>
            {reverted ? 'You can organize this folder again whenever you like.' : 'Check the result in File Explorer. If anything looks off, undo restores every item.'}
          </Typography>
          <Button variant="tonal" startIcon={<OpenInNewIcon />} onClick={onOpenFolder} sx={{ justifyContent: 'flex-start' }}>Open in File Explorer</Button>
          {!reverted && run?.id && (
            <Button variant="outlined" startIcon={<UndoIcon />} onClick={onUndo} disabled={busy} sx={{ justifyContent: 'flex-start' }}>Undo this run</Button>
          )}
          <Button variant="outlined" startIcon={<HistoryIcon />} onClick={onHistory} sx={{ justifyContent: 'flex-start' }}>History</Button>
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" size="large" startIcon={<HomeOutlinedIcon />} onClick={onHome}>Back to home</Button>
        </Box>
      </SurfaceCard>
    </Box>
  );
}
