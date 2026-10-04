import React, { useMemo, useRef } from 'react';
import { Box, Typography, ButtonBase, useTheme, Tooltip } from '@mui/material';
import { motion as m } from 'framer-motion';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import MemoryOutlinedIcon from '@mui/icons-material/MemoryOutlined';
import DonutLargeOutlinedIcon from '@mui/icons-material/DonutLargeOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import HistoryIcon from '@mui/icons-material/History';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import SurfaceCard from './common/SurfaceCard';
import ExpressiveShape from './common/ExpressiveShape';
import { corner, motion, springs } from '../theme/tokens';
import { stateLayer, STATE } from '../theme/theme';
import {
  formatNumber, splitBytes, formatDuration, greeting, folderNameFromPath, parentPath, formatRelativeTime, normalizeKeyPath,
} from '../utils/format';

export default function HomeView({ onSelectFolder, onOpenFolder, onOpenSettings, metrics, settings, recentActivity = [], recentFolders = [], runs = [] }) {
  const { palette } = useTheme();
  const c = palette.m3;

  const topCategories = useMemo(() => {
    const counts = {};
    recentActivity.forEach((item) => {
      const cat = item?.category || 'Other';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 4);
  }, [recentActivity]);

  const lastRunByPath = useMemo(() => {
    const map = new Map();
    runs.forEach((run) => {
      const key = normalizeKeyPath(run?.dirPath);
      if (key && !map.has(key)) map.set(key, run);
    });
    return map;
  }, [runs]);

  const bytes = splitBytes(metrics?.totalBytes);
  const time = formatDuration(metrics?.totalTimeSaved);
  const aiReady = settings?.hasApiKey || settings?.provider === 'custom';

  return (
    <Box sx={{ height: '100%', overflowY: 'auto', p: 2, pt: 1 }}>
      <Box
        sx={{
          display: 'grid',
          minHeight: '100%',
          gap: 1.5,
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 0.62fr) minmax(0, 0.62fr) minmax(0, 1fr)' },
          gridTemplateRows: { xs: 'auto', md: 'minmax(150px, 1fr) minmax(200px, 1.45fr) minmax(140px, 0.9fr)' },
          gridTemplateAreas: {
            xs: '"title" "start" "left" "right1" "right2" "bot2" "bot3" "bot4"',
            md: `
              "left title title right1"
              "left start start right2"
              "bot2 bot2 bot3 bot4"
            `,
          },
          '& > *': { minWidth: 0, minHeight: 0 },
        }}
      >
        <HeroCard sx={{ gridArea: 'title' }} />

        {/* Left column: totals + where things went */}
        <Box sx={{ gridArea: 'left', display: 'grid', gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 1.5 }}>
          <SurfaceCard icon={<InsertDriveFileOutlinedIcon />} title="Files organized">
            <BigNumber value={formatNumber(metrics?.totalFiles)} caption={metrics?.totalFiles ? 'across every run' : 'Your first run will count here'} />
          </SurfaceCard>

          <SurfaceCard icon={<DonutLargeOutlinedIcon />} title="Top categories">
            {topCategories.length > 0 ? (
              <CategoryBars data={topCategories} />
            ) : (
              <EmptyNote>Categories you use most will appear after a run.</EmptyNote>
            )}
          </SurfaceCard>
        </Box>

        <StartButton sx={{ gridArea: 'start' }} onClick={onSelectFolder} />

        <SurfaceCard sx={{ gridArea: 'right1' }} icon={<StorageOutlinedIcon />} title="Space organized">
          <BigNumber value={bytes.num} unit={bytes.unit} caption="sorted into folders" />
        </SurfaceCard>

        <SurfaceCard sx={{ gridArea: 'right2' }} icon={<HistoryIcon />} title="Recent folders">
          {recentFolders.length > 0 ? (
            <Box component="ul" sx={{ listStyle: 'none', m: 0, mx: -2, mb: -2, mt: -1, p: 0, overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {recentFolders.slice(0, 6).map((dir) => {
                const run = lastRunByPath.get(normalizeKeyPath(dir));
                return (
                  <li key={dir}>
                    <RecentFolderRow
                      name={folderNameFromPath(dir)}
                      detail={run ? `Organized ${formatRelativeTime(run.timestamp).toLowerCase()}` : parentPath(dir)}
                      title={dir}
                      onClick={() => onOpenFolder(dir)}
                    />
                  </li>
                );
              })}
            </Box>
          ) : (
            <EmptyNote>Folders you open show up here for one-click access.</EmptyNote>
          )}
        </SurfaceCard>

        <AiModelCard sx={{ gridArea: 'bot2' }} settings={settings} ready={aiReady} onClick={(event) => onOpenSettings('ai', event.currentTarget)} />

        <SettingsTile sx={{ gridArea: 'bot3' }} onClick={(event) => onOpenSettings('general', event.currentTarget)} />

        <SurfaceCard sx={{ gridArea: 'bot4' }} icon={<ScheduleOutlinedIcon />} title="Time saved">
          <BigNumber value={time.num} unit={time.unit} caption="estimated, ~5 s per item" />
        </SurfaceCard>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------

function BigNumber({ value, unit, caption }) {
  const { palette } = useTheme();
  return (
    <Box sx={{ mt: 'auto', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }}>
        <Typography
          variant="displayMediumEmphasized"
          component="p"
          noWrap
          sx={{ fontVariantNumeric: 'tabular-nums', fontStretch: '112%', lineHeight: 1, letterSpacing: '-0.02em' }}
        >
          {value}
        </Typography>
        {unit && <Typography variant="titleLarge" component="span" sx={{ color: palette.m3.onSurfaceVariant }}>{unit}</Typography>}
      </Box>
      {caption && (
        <Typography variant="bodySmall" component="p" sx={{ color: palette.m3.onSurfaceVariant, mt: 1 }} noWrap>
          {caption}
        </Typography>
      )}
    </Box>
  );
}

function EmptyNote({ children }) {
  const { palette } = useTheme();
  return (
    <Typography variant="bodyMedium" sx={{ color: palette.m3.onSurfaceVariant, mt: 'auto', maxWidth: 260 }}>
      {children}
    </Typography>
  );
}

function CategoryBars({ data }) {
  const { palette } = useTheme();
  const c = palette.m3;
  const max = Math.max(...data.map((d) => d.value), 1);
  const fills = [c.primary, c.tertiary, c.secondary, c.outline];
  return (
    <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {data.map((d, i) => (
        <Box key={d.name} sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
            <Typography variant="labelLarge" noWrap sx={{ minWidth: 0 }}>{d.name}</Typography>
            <Typography variant="labelLarge" sx={{ color: c.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>{d.value}</Typography>
          </Box>
          <Box sx={{ height: 8, borderRadius: corner.full, bgcolor: c.surfaceContainerHighest, overflow: 'hidden' }}>
            <m.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(6, (d.value / max) * 100)}%` }}
              transition={{ ...springs.slowSpatial, delay: 0.05 * i }}
              style={{ height: '100%', borderRadius: 9999, background: fills[i % fills.length] }}
            />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function RecentFolderRow({ name, detail, title, onClick }) {
  const { palette } = useTheme();
  const c = palette.m3;
  return (
    <ButtonBase
      onClick={onClick}
      title={title}
      sx={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.25,
        borderRadius: corner.lg,
        textAlign: 'left',
        transition: motion.effects(['background-color']),
        '&:hover': { bgcolor: stateLayer(c.surfaceContainer, c.onSurface, STATE.hover) },
        '&:hover .recent-go': { opacity: 1, transform: 'translateX(0)' },
        '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: -2 },
      }}
    >
      <Box sx={{ width: 40, height: 40, borderRadius: corner.md, bgcolor: c.secondaryContainer, color: c.onSecondaryContainer, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <FolderOutlinedIcon fontSize="small" />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="titleSmall" component="p" noWrap>{name}</Typography>
        <Typography variant="bodySmall" component="p" noWrap sx={{ color: c.onSurfaceVariant }}>{detail}</Typography>
      </Box>
      <ArrowForwardIcon
        className="recent-go"
        fontSize="small"
        sx={{ color: c.onSurfaceVariant, opacity: 0, transform: 'translateX(-4px)', transition: [motion.effects(['opacity']), motion.spatial(['transform'], 'fast')].join(', ') }}
      />
    </ButtonBase>
  );
}

/**
 * Hero moment #1. The original orb mesh, now driven by scheme colours and CSS variables
 * (pointer tracking writes custom properties instead of re-rendering React on every move).
 */
function HeroCard({ sx }) {
  const { palette } = useTheme();
  const c = palette.m3;
  const ref = useRef(null);

  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
    el.style.setProperty('--dx', `${((e.clientX - r.left) / r.width - 0.5) * 2}`);
    el.style.setProperty('--dy', `${((e.clientY - r.top) / r.height - 0.5) * 2}`);
  };

  const orb = (color, size, blur, anim, extra) => ({
    position: 'absolute',
    width: size,
    height: size,
    borderRadius: '50%',
    background: `radial-gradient(circle, color-mix(in srgb, ${color} 70%, transparent) 0%, color-mix(in srgb, ${color} 22%, transparent) 45%, transparent 70%)`,
    filter: `blur(${blur}px)`,
    animation: `${anim} ease-in-out infinite`,
    willChange: 'transform',
    pointerEvents: 'none',
    ...extra,
  });

  return (
    <Box
      ref={ref}
      onPointerMove={onMove}
      sx={{
        ...sx,
        '--mx': '50%',
        '--my': '50%',
        '--dx': 0,
        '--dy': 0,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: corner.xlInc,
        bgcolor: c.surfaceContainerLow,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        isolation: 'isolate',
        '&:hover .hero-spot': { opacity: 1 },
        '@keyframes roam1': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(160px, 60px) scale(1.25)' },
          '66%': { transform: 'translate(300px, 20px) scale(0.9)' },
        },
        '@keyframes roam2': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '30%': { transform: 'translate(-220px, -60px) scale(1.15)' },
          '60%': { transform: 'translate(-340px, -110px) scale(0.92)' },
        },
        '@keyframes roam3': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '25%': { transform: 'translate(-140px, -60px) scale(0.8)' },
          '50%': { transform: 'translate(120px, -80px) scale(1.25)' },
          '75%': { transform: 'translate(150px, 60px) scale(0.9)' },
        },
      }}
    >
      {/* Orbs (parallax with the pointer via --dx/--dy) */}
      <Box sx={{ position: 'absolute', inset: 0, zIndex: -1, transform: 'translate(calc(var(--dx) * 14px), calc(var(--dy) * 10px))', transition: motion.spatial(['transform'], 'slow') }}>
        {/* Light mode uses the fixed-dim tones; dark accent roles turn muddy on a light surface. */}
        <Box sx={orb(palette.mode === 'light' ? c.primaryFixedDim : c.primary, 340, 44, 'roam1 14s', { top: '-45%', left: '-12%' })} />
        <Box sx={orb(palette.mode === 'light' ? c.tertiaryFixedDim : c.tertiary, 380, 54, 'roam2 17s', { bottom: '-55%', right: '-10%' })} />
        <Box sx={orb(palette.mode === 'light' ? c.primaryFixed : c.secondary, 200, 36, 'roam3 11s', { top: '25%', left: '42%' })} />
      </Box>
      {/* Pointer spotlight */}
      <Box
        className="hero-spot"
        sx={{
          position: 'absolute',
          inset: 0,
          zIndex: -1,
          opacity: 0,
          background: `radial-gradient(420px circle at var(--mx) var(--my), color-mix(in srgb, ${c.primary} 22%, transparent), transparent 45%)`,
          transition: motion.effects(['opacity'], 'slow'),
          pointerEvents: 'none',
        }}
      />

      <Box sx={{ textAlign: 'center', px: 3, py: 2 }}>
        <Typography variant="labelLarge" component="p" sx={{ color: c.onSurfaceVariant, mb: 0.5 }}>
          {greeting()}
        </Typography>
        <Typography
          variant="displayMediumEmphasized"
          component="h1"
          sx={{
            fontWeight: 760,
            fontStretch: '118%',
            letterSpacing: '-0.035em',
            lineHeight: 1,
            background: `linear-gradient(100deg, ${c.primary} 10%, ${c.tertiary} 90%)`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            pb: 0.5,
          }}
        >
          Organiuzer
        </Typography>
        <Typography variant="bodyMedium" component="p" sx={{ color: c.onSurfaceVariant, mt: 1 }}>
          Pick a folder, review the plan, apply it.
        </Typography>
      </Box>
    </Box>
  );
}

/** Hero moment #2: the primary action. Large container that squares up on press (shape morph). */
function StartButton({ sx, onClick }) {
  const { palette } = useTheme();
  const c = palette.m3;
  return (
    <ButtonBase
      onClick={onClick}
      aria-label="Choose a folder to organize"
      sx={{
        ...sx,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: corner.xxl,
        bgcolor: c.primary,
        color: c.onPrimary,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'stretch',
        textAlign: 'left',
        transition: [motion.spatial(['border-radius', 'transform']), motion.effects(['background-color'])].join(', '),
        '&:hover': { bgcolor: stateLayer(c.primary, c.onPrimary, STATE.hover) },
        '&:hover .start-shape': { transform: 'rotate(40deg) scale(1.06)' },
        '&:hover .start-arrow': { transform: 'translateX(6px)' },
        '&:active': { borderRadius: corner.xl, transform: 'scale(0.985)' },
        '&.Mui-focusVisible': { outline: `3px solid ${c.primary}`, outlineOffset: 3 },
      }}
    >
      {/* Decorative cookie shape bleeding off the corner */}
      <Box
        className="start-shape"
        aria-hidden
        sx={{ position: 'absolute', right: -60, bottom: -80, transition: motion.spatial(['transform'], 'slow') }}
      >
        <ExpressiveShape shape="cookie9" size={300} color={`color-mix(in srgb, ${c.onPrimary} 12%, transparent)`} />
      </Box>

      <Box sx={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: { xs: 3, md: 4 }, gap: 2, minHeight: 180 }}>
        <Box sx={{ width: 56, height: 56, borderRadius: corner.lg, bgcolor: c.onPrimary, color: c.primary, display: 'grid', placeItems: 'center' }}>
          <CreateNewFolderOutlinedIcon />
        </Box>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="displaySmallEmphasized" component="span" sx={{ fontWeight: 700, fontStretch: '110%', letterSpacing: '-0.02em', lineHeight: 1.05 }}>
              Start
            </Typography>
            <ArrowForwardIcon className="start-arrow" sx={{ fontSize: 36, transition: motion.spatial(['transform'], 'fast') }} />
          </Box>
          <Typography variant="bodyLarge" component="span" sx={{ display: 'block', mt: 0.5, opacity: 0.86 }}>
            Choose a folder, or drop one anywhere on this window
          </Typography>
        </Box>
      </Box>
    </ButtonBase>
  );
}

function AiModelCard({ sx, settings, ready, onClick }) {
  const { palette } = useTheme();
  const c = palette.m3;
  return (
    <SurfaceCard
      sx={sx}
      tone={ready ? 'default' : 'tertiary'}
      onClick={onClick}
      ariaLabel="AI model settings"
      icon={ready ? <MemoryOutlinedIcon /> : <KeyOutlinedIcon />}
      title={ready ? 'AI model' : 'Connect an AI provider'}
      action={
        <Typography variant="labelMedium" sx={{ px: 1.5, py: 0.5, borderRadius: corner.full, bgcolor: ready ? c.secondaryContainer : c.onTertiaryContainer, color: ready ? c.onSecondaryContainer : c.tertiaryContainer }}>
          {ready ? (settings?.provider === 'custom' ? 'Custom endpoint' : 'OpenAI') : 'Setup needed'}
        </Typography>
      }
    >
      <Box sx={{ mt: 'auto', minWidth: 0 }}>
        {ready ? (
          <Typography variant="headlineMediumEmphasized" component="p" noWrap sx={{ fontStretch: '108%' }}>
            {settings?.model || 'gpt-4o'}
          </Typography>
        ) : (
          <Typography variant="bodyLarge" component="p" sx={{ maxWidth: 420 }}>
            Add an API key or a local endpoint so Organiuzer can plan your folders.
          </Typography>
        )}
      </Box>
    </SurfaceCard>
  );
}

function SettingsTile({ sx, onClick }) {
  const { palette } = useTheme();
  const c = palette.m3;
  return (
    <Tooltip title="Settings">
      <ButtonBase
        onClick={onClick}
        aria-label="Open settings"
        sx={{
          ...sx,
          borderRadius: corner.xl,
          bgcolor: c.secondaryContainer,
          color: c.onSecondaryContainer,
          display: 'grid',
          placeItems: 'center',
          transition: [motion.spatial(['border-radius']), motion.effects(['background-color'])].join(', '),
          '&:hover': { bgcolor: stateLayer(c.secondaryContainer, c.onSecondaryContainer, STATE.hover), borderRadius: corner.xxl },
          '&:hover svg': { transform: 'rotate(90deg)' },
          '&:active': { borderRadius: corner.lg },
          '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
        }}
      >
        <SettingsOutlinedIcon sx={{ fontSize: 56, transition: motion.spatial(['transform'], 'slow') }} />
      </ButtonBase>
    </Tooltip>
  );
}
