import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Box, Typography, Button, Fade, useTheme, Card, CardActionArea, Container } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import StorageIcon from '@mui/icons-material/Storage';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SettingsIcon from '@mui/icons-material/Settings';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import InfoIcon from '@mui/icons-material/Info';
import MemoryIcon from '@mui/icons-material/Memory';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import HistoryIcon from '@mui/icons-material/History';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DonutLargeIcon from '@mui/icons-material/DonutLarge';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell, RadialBarChart, RadialBar, PolarAngleAxis, PieChart, Pie
} from 'recharts';
import pkg from '../../../../package.json';

export default function HomeView({ onSelectFolder, onOpenSettings, metrics, aiConfig, recentActivity = [] }) {
  const theme = useTheme();

  // Mouse tracking for interactive gradient effects
  const titleCardRef = useRef(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e) => {
    if (!titleCardRef.current) return;
    const rect = titleCardRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y });
  };

  // Calculate real trends from history data
  const trendData = useMemo(() => {
    const history = metrics.history || [];
    if (history.length < 2) {
      return { trend: null, percentage: 0, direction: 'neutral' };
    }

    // Get data from the last 7 days vs previous 7 days
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    const thisWeek = history.filter(h => now - h.timestamp < oneWeek);
    const lastWeek = history.filter(h => now - h.timestamp >= oneWeek && now - h.timestamp < oneWeek * 2);

    const thisWeekFiles = thisWeek.reduce((sum, h) => sum + (h.files || 0), 0);
    const lastWeekFiles = lastWeek.reduce((sum, h) => sum + (h.files || 0), 0);

    if (lastWeekFiles === 0 && thisWeekFiles > 0) {
      return { trend: `+${thisWeekFiles} this week`, percentage: 100, direction: 'up' };
    } else if (lastWeekFiles === 0) {
      return { trend: null, percentage: 0, direction: 'neutral' };
    }

    const percentChange = Math.round(((thisWeekFiles - lastWeekFiles) / lastWeekFiles) * 100);
    const direction = percentChange >= 0 ? 'up' : 'down';
    const sign = percentChange >= 0 ? '+' : '';

    return {
      trend: `${sign}${percentChange}% this week`,
      percentage: Math.abs(percentChange),
      direction
    };
  }, [metrics.history]);

  // Prepare main activity chart data
  const activityData = useMemo(() => {
    const history = metrics.history || [];
    if (history.length === 0) return [];

    const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);

    // Add an origin point at zero to show growth from start
    const firstTimestamp = sortedHistory[0]?.timestamp || Date.now();

    const dataPoints = [
      {
        name: 'Start',
        files: 0,
        bytes: 0,
        index: 0
      },
      ...sortedHistory.map((h, index) => ({
        name: new Date(h.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' }),
        files: h.totalFiles || 0,
        bytes: h.totalBytes || 0,
        index: index + 1
      }))
    ];

    return dataPoints;
  }, [metrics.history]);

  // Prepare recent files bar chart data (last 5 batches)
  const recentFilesData = useMemo(() => {
    const history = metrics.history || [];
    const data = [...history]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-7) // Last 7
      .map((h, i) => ({
        name: i,
        files: h.files || 0
      }));

    // Ensure we have at least 2 points for a line if we have data
    if (data.length === 1) {
      return [{ name: 'start', files: 0 }, ...data];
    }
    return data;
  }, [metrics.history]);

  // Prepare space area chart data
  const spaceData = useMemo(() => {
    const history = metrics.history || [];
    const data = [...history]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-10) // Last 10
      .map((h, i) => ({
        name: i,
        bytes: h.bytes || 0
      }));

    // Ensure we have at least 2 points for a line if we have data
    if (data.length === 1) {
      return [{ name: 'start', bytes: 0 }, ...data];
    }
    return data;
  }, [metrics.history]);

  // Prepare time radial data (seconds in current minute/hour context)
  const timeData = useMemo(() => {
    // Visualize minutes saved in a "clock" style (0-60)
    // If > 60m, it loops, but we show total text. 
    // This is just for the visual fill.
    const totalMinutes = Math.floor(metrics.timeSavedSeconds / 60);
    const displayValue = totalMinutes % 60;
    // If we have 0 saved, show 0. If we have some, ensure at least a small sliver is visible
    const value = metrics.timeSavedSeconds > 0 ? Math.max(displayValue, 2) : 0;

    return [{ name: 'Time', value: value, fill: theme.palette.error.main }];
  }, [metrics.timeSavedSeconds, theme.palette.error.main]);

  // CATEGORY BREAKDOWN DATA (New Widget)
  const categoryData = useMemo(() => {
    // If we have no recent activity, return empty
    if (!recentActivity || recentActivity.length === 0) return [];

    // Count frequencies
    const counts = {};
    recentActivity.forEach(item => {
      const cat = item.category || 'Other';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    const colors = [
      theme.palette.primary.main,
      theme.palette.secondary.main,
      theme.palette.error.main,
      theme.palette.warning.main,
      theme.palette.info.main,
      theme.palette.success.main
    ];

    return Object.entries(counts).map(([name, value], index) => ({
      name,
      value,
      color: colors[index % colors.length]
    })).sort((a, b) => b.value - a.value); // Sort max first
  }, [recentActivity, theme.palette]);

  // Format helpers
  const formattedBytes = useMemo(() => {
    if (!metrics.bytesOrganized) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = metrics.bytesOrganized;
    let i = 0;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return `${size.toFixed(1)} ${units[i]}`;
  }, [metrics.bytesOrganized]);

  const formattedTime = useMemo(() => {
    if (!metrics.timeSavedSeconds) return '0m';
    const mins = Math.floor(metrics.timeSavedSeconds / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = (mins / 60).toFixed(1);
    return `${hrs}h`;
  }, [metrics.timeSavedSeconds]);

  // Custom tooltip for chart
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <Box sx={{
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          p: 1.5,
          boxShadow: 3,
        }}>
          <Typography variant="caption" color="text.secondary" display="block">
            {label}
          </Typography>
          <Typography variant="body2" fontWeight={600} color="primary.main">
            {payload[0].value.toLocaleString()} files organized
          </Typography>
        </Box>
      );
    }
    return null;
  };

  return (
    <Fade in={true} timeout={600}>
      <Container maxWidth={false} sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 3, overflowY: 'auto' }}>

        {/* Main Grid Layout - Full Screen Cluster */}
        <Box sx={{
          display: 'grid',
          width: '100%',
          height: '100%',
          gridTemplateColumns: { xs: '1fr', md: '1fr 0.6fr 0.6fr 1fr' },
          gridTemplateRows: { xs: 'auto', md: 'minmax(0, 1fr) minmax(0, 1.5fr) minmax(0, 1fr)' },
          gap: 2,
          gridTemplateAreas: {
            xs: `
              "title"
              "left"
              "start"
              "right1"
              "right2"
              "bot1"
              "bot2"
              "bot3"
              "bot4"
            `,
            md: `
              "left title title right1"
              "left start start right2"
              "bot2 bot2 bot3 bot4"
            `
          }
        }}>

          {/* Title Card - With interactive gradient mesh and animated orbs */}
          <Box sx={{ gridArea: 'title' }}>
            <Card
              ref={titleCardRef}
              elevation={0}
              onMouseMove={handleMouseMove}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
              sx={{
                bgcolor: 'background.surfaceContainer',
                borderRadius: '16px',
                border: '1px solid',
                borderColor: isHovering ? 'primary.main' : 'divider',
                p: 2,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
                cursor: 'default',
                transition: 'border-color 0.4s ease',
              }}>

              {/* Base mesh gradient layer */}
              <Box sx={{
                position: 'absolute',
                inset: 0,
                background: `
                  radial-gradient(ellipse 80% 60% at 20% 30%, rgba(208,188,255,0.15) 0%, transparent 50%),
                  radial-gradient(ellipse 70% 50% at 80% 70%, rgba(239,184,200,0.12) 0%, transparent 50%),
                  radial-gradient(ellipse 60% 80% at 50% 50%, rgba(147,112,219,0.08) 0%, transparent 50%)
                `,
                opacity: 0.8,
              }} />

              {/* Mouse-following spotlight gradient */}
              <Box sx={{
                position: 'absolute',
                inset: 0,
                background: `radial-gradient(600px circle at ${mousePos.x}% ${mousePos.y}%, rgba(208,188,255,${isHovering ? 0.25 : 0.08}) 0%, transparent 40%)`,
                transition: isHovering ? 'none' : 'background 0.5s ease-out',
                pointerEvents: 'none',
              }} />

              {/* Animated floating orb 1 - Large Purple */}
              <Box sx={{
                position: 'absolute',
                top: '-30%',
                left: '-20%',
                width: 350,
                height: 350,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(208,188,255,0.6) 0%, rgba(208,188,255,0.2) 40%, transparent 70%)',
                filter: 'blur(40px)',
                animation: 'roam1 12s ease-in-out infinite',
                transform: isHovering
                  ? `translate(${(mousePos.x - 50) * 0.3}px, ${(mousePos.y - 50) * 0.3}px)`
                  : 'none',
                transition: isHovering ? 'transform 0.15s ease-out' : 'transform 0.5s ease-out',
                '@keyframes roam1': {
                  '0%': { transform: 'translate(0, 0) scale(1)' },
                  '25%': { transform: 'translate(180px, 80px) scale(1.3)' },
                  '50%': { transform: 'translate(320px, 40px) scale(0.85)' },
                  '75%': { transform: 'translate(120px, 100px) scale(1.15)' },
                  '100%': { transform: 'translate(0, 0) scale(1)' }
                }
              }} />

              {/* Animated floating orb 2 - Large Pink */}
              <Box sx={{
                position: 'absolute',
                bottom: '-25%',
                right: '-15%',
                width: 400,
                height: 400,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(239,184,200,0.55) 0%, rgba(239,184,200,0.2) 40%, transparent 70%)',
                filter: 'blur(50px)',
                animation: 'roam2 15s ease-in-out infinite',
                transform: isHovering
                  ? `translate(${(mousePos.x - 50) * -0.25}px, ${(mousePos.y - 50) * -0.25}px)`
                  : 'none',
                transition: isHovering ? 'transform 0.2s ease-out' : 'transform 0.5s ease-out',
                '@keyframes roam2': {
                  '0%': { transform: 'translate(0, 0) scale(1)' },
                  '20%': { transform: 'translate(-220px, -70px) scale(1.2)' },
                  '40%': { transform: 'translate(-350px, -100px) scale(0.9)' },
                  '60%': { transform: 'translate(-180px, -130px) scale(1.15)' },
                  '80%': { transform: 'translate(-80px, -50px) scale(1.05)' },
                  '100%': { transform: 'translate(0, 0) scale(1)' }
                }
              }} />

              {/* Animated floating orb 3 - Center Violet */}
              <Box sx={{
                position: 'absolute',
                top: '40%',
                left: '45%',
                marginTop: '-100px',
                marginLeft: '-100px',
                width: 200,
                height: 200,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(147,112,219,0.5) 0%, rgba(147,112,219,0.15) 50%, transparent 70%)',
                filter: 'blur(35px)',
                animation: 'roam3 10s ease-in-out infinite',
                transform: isHovering
                  ? `translate(${(mousePos.x - 50) * 0.5}px, ${(mousePos.y - 50) * 0.5}px) scale(1.2)`
                  : 'none',
                transition: isHovering ? 'transform 0.1s ease-out' : 'transform 0.5s ease-out',
                '@keyframes roam3': {
                  '0%': { transform: 'translate(0, 0) scale(1)' },
                  '25%': { transform: 'translate(-150px, -80px) scale(0.75)' },
                  '50%': { transform: 'translate(120px, -100px) scale(1.3)' },
                  '75%': { transform: 'translate(160px, 70px) scale(0.85)' },
                  '100%': { transform: 'translate(0, 0) scale(1)' }
                }
              }} />

              {/* Extra accent orb 4 - Small Cyan accent */}
              <Box sx={{
                position: 'absolute',
                top: '20%',
                right: '10%',
                width: 150,
                height: 150,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(100,200,255,0.4) 0%, transparent 60%)',
                filter: 'blur(25px)',
                animation: 'roam4 8s ease-in-out infinite',
                opacity: isHovering ? 0.9 : 0.5,
                transition: 'opacity 0.4s ease',
                '@keyframes roam4': {
                  '0%': { transform: 'translate(0, 0) scale(1)' },
                  '33%': { transform: 'translate(-80px, 60px) scale(1.2)' },
                  '66%': { transform: 'translate(-40px, -30px) scale(0.9)' },
                  '100%': { transform: 'translate(0, 0) scale(1)' }
                }
              }} />

              {/* Glow ring around cursor on hover */}
              <Box sx={{
                position: 'absolute',
                width: 120,
                height: 120,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(208,188,255,0.3) 0%, transparent 70%)',
                left: `calc(${mousePos.x}% - 60px)`,
                top: `calc(${mousePos.y}% - 60px)`,
                opacity: isHovering ? 1 : 0,
                transform: `scale(${isHovering ? 1.2 : 0.5})`,
                transition: 'opacity 0.3s ease, transform 0.3s ease',
                pointerEvents: 'none',
                filter: 'blur(10px)',
              }} />

              {/* Content */}
              <Box sx={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                {/* Time-based greeting */}
                <Typography variant="caption" sx={{
                  color: 'text.secondary',
                  fontWeight: 500,
                  letterSpacing: '0.5px',
                  mb: 0.5,
                  display: 'block'
                }}>
                  {(() => {
                    const hour = new Date().getHours();
                    if (hour < 12) return '☀️ Good morning';
                    if (hour < 17) return '🌤️ Good afternoon';
                    if (hour < 21) return '🌆 Good evening';
                    return '🌙 Good night';
                  })()}
                </Typography>

                {/* App name with enhanced gradient */}
                <Typography variant="h3" fontWeight={800} sx={{
                  background: isHovering
                    ? 'linear-gradient(135deg, #D0BCFF 0%, #64C8FF 50%, #EFB8C8 100%)'
                    : 'linear-gradient(90deg, #D0BCFF 0%, #EFB8C8 100%)',
                  backgroundSize: '200% 200%',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  mb: 0.5,
                  transition: 'background 0.5s ease',
                  animation: isHovering ? 'shimmer 2s ease-in-out infinite' : 'none',
                  '@keyframes shimmer': {
                    '0%': { backgroundPosition: '0% 50%' },
                    '50%': { backgroundPosition: '100% 50%' },
                    '100%': { backgroundPosition: '0% 50%' }
                  }
                }}>
                  Organiuzer
                </Typography>

                {/* Tagline */}
                <Typography variant="body2" sx={{
                  color: 'text.secondary',
                  fontWeight: 500,
                  opacity: 0.8
                }}>
                  Declutter • Organize • Automate
                </Typography>
              </Box>
            </Card>
          </Box>

          {/* Left Column: Split into Merged Analytics (Top) and New Composition (Bottom) */}
          <Box sx={{ gridArea: 'left', display: 'flex', flexDirection: 'column', gap: 2 }}>

            {/* 1. Merged Analytics Widget (50%) */}
            <DashboardCard
              title="Analytics"
              color={theme.palette.primary.main}
              icon={<AutoAwesomeIcon />}
              headerAction={
                trendData.trend && (
                  <TrendBadge direction={trendData.direction} label={trendData.trend} />
                )
              }
            >
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {/* Big Number */}
                <Typography variant="h3" fontWeight={800} sx={{ letterSpacing: '-0.02em', mb: 0.5 }}>
                  {metrics.filesOrganized?.toLocaleString() || '0'}
                </Typography>
                <Typography variant="body2" color="text.secondary" fontWeight={600} sx={{ mb: 2 }}>
                  Total Files Organized
                </Typography>

                {/* The Chart - Now embedded here */}
                <Box sx={{ flex: 1, width: '100%', minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activityData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorFilesLeft" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} opacity={0.3} />
                      <XAxis hide />
                      <YAxis hide />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="files"
                        stroke={theme.palette.primary.main}
                        strokeWidth={3}
                        fill="url(#colorFilesLeft)"
                        isAnimationActive={true}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
            </DashboardCard>

            {/* 2. New Widget: Composition (50%) */}
            <DashboardCard
              title="Composition"
              color={theme.palette.secondary.main}
              icon={<DonutLargeIcon />}
            >
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {categoryData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryData}
                          innerRadius={35}
                          outerRadius={55}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <Box sx={{ bgcolor: 'background.paper', p: 1, borderRadius: 1, boxShadow: 3, border: '1px solid', borderColor: 'divider' }}>
                                  <Typography variant="caption" fontWeight={700} color="text.primary">
                                    {payload[0].name}: {payload[0].value}
                                  </Typography>
                                </Box>
                              );
                            }
                            return null;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>

                    {/* Legend floating */}
                    <Box sx={{ position: 'absolute', bottom: 0, right: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      {categoryData.slice(0, 3).map((cat, i) => (
                        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: cat.color }} />
                          <Typography variant="caption" sx={{ fontSize: '0.65rem', opacity: 0.8 }}>
                            {cat.name}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </>
                ) : (
                  <Typography variant="caption" color="text.secondary">No data yet</Typography>
                )}
              </Box>
            </DashboardCard>

          </Box>

          {/* Center Start Button Area */}
          <Box sx={{
            gridArea: 'start',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative'
          }}>
            <Button
              variant="contained"
              onClick={onSelectFolder}
              endIcon={<ArrowForwardIcon />}
              sx={{
                width: '100%',
                height: '100%',
                minHeight: '120px',
                borderRadius: '24px',
                fontSize: '2rem',
                fontWeight: 700,
                textTransform: 'none',
                boxShadow: `0 8px 30px ${theme.palette.primary.main}40`,
                '&:hover': {
                  transform: 'scale(1.02)',
                  boxShadow: `0 12px 40px ${theme.palette.primary.main}60`,
                },
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            >
              Start
            </Button>
          </Box>

          {/* Right Top Card (Space) - With Smooth Sparkline */}
          <Box sx={{ gridArea: 'right1' }}>
            <DashboardCard
              title="Space Processed"
              color={theme.palette.secondary.main}
              icon={<StorageIcon />}
            >
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h3" fontWeight={800} sx={{ letterSpacing: '-0.02em', mb: 0.5 }}>
                    {formattedBytes}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" fontWeight={600}>
                    Recovered
                  </Typography>
                </Box>
                {/* Smooth Sparkline for space */}
                {spaceData.length > 0 && (
                  <Box sx={{ height: 50, width: '100%', mt: 1, opacity: 0.8 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={spaceData}>
                        <defs>
                          <linearGradient id="colorSpace" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={theme.palette.secondary.main} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={theme.palette.secondary.main} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey="bytes"
                          stroke={theme.palette.secondary.main}
                          fill="url(#colorSpace)"
                          strokeWidth={2}
                          isAnimationActive={true}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>
                )}
              </Box>
            </DashboardCard>
          </Box>

          {/* Right Bottom Card (Time) - Premium Clock Design */}
          <Box sx={{ gridArea: 'right2' }}>
            <DashboardCard
              title="Time Saved"
              color={theme.palette.warning.main}
              icon={<AccessTimeIcon />}
              headerAction={
                metrics.filesOrganized > 0 && (
                  <Typography variant="caption" sx={{
                    bgcolor: theme.palette.warning.main + '20',
                    color: theme.palette.warning.main,
                    px: 1, py: 0.5, borderRadius: 2, fontWeight: 700
                  }}>
                    ~5s / file
                  </Typography>
                )
              }
            >
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center', // Center the content cluster
                gap: 3, // More breathing room between ring and text
                height: '100%',
                width: '100%',
                mt: 1,
                pb: 1 // Visual balance
              }}>
                {/* Radial Progress - made larger */}
                <Box sx={{ position: 'relative', width: 100, height: 100, flexShrink: 0 }}>
                  <svg width="100" height="100" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="50" cy="50" r="42" fill="none" stroke={theme.palette.action.hover} strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="42"
                      fill="none"
                      stroke={theme.palette.warning.main}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${(timeData[0]?.value || 0) / 100 * 264} 264`}
                      style={{ transition: 'stroke-dasharray 1s ease-out' }}
                    />
                  </svg>
                  <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <AccessTimeIcon sx={{ fontSize: 32, color: theme.palette.warning.main, opacity: 0.8 }} />
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <Typography variant="h2" fontWeight={800} sx={{ lineHeight: 1, mb: 0.5 }}>
                    {formattedTime}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" fontWeight={600}>
                    Saved
                  </Typography>
                  {/* Subtle caption underneath */}
                  <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.6 }}>
                    Total Efficiency
                  </Typography>
                </Box>
              </Box>
            </DashboardCard>
          </Box>



          {/* Bottom 2: AI Model */}
          <Box sx={{ gridArea: 'bot2' }}>
            <DashboardCard
              title="AI Model"
              color={theme.palette.info.main}
              icon={<MemoryIcon />}
            >
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                <Typography variant="h5" fontWeight={700} sx={{ textAlign: 'center', wordBreak: 'break-word' }}>
                  {aiConfig?.model || 'Unknown'}
                </Typography>
                <Typography variant="caption" color="text.secondary">Active Model</Typography>
              </Box>
            </DashboardCard>
          </Box>

          {/* Bottom 3: Settings */}
          {/* Bottom 3: Settings */}
          <Box sx={{ gridArea: 'bot3' }}>
            <DashboardCard
              title="Settings"
              color={theme.palette.action.active}
              icon={<SettingsIcon />}
              onClick={onOpenSettings}
            >
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>

                <Typography variant="caption" color="text.secondary">Configure App</Typography>
              </Box>
            </DashboardCard>
          </Box>

          {/* Bottom 4: Recent Activity */}
          <Box sx={{ gridArea: 'bot4' }}>
            <DashboardCard
              title="Recent Activity"
              color={theme.palette.success.main}
              icon={<HistoryIcon />}
              headerAction={
                <Typography variant="caption" color="text.secondary" fontWeight={500}>Live</Typography>
              }
            >

              {recentActivity.length > 0 ? (
                <Box sx={{
                  flex: 1,
                  overflow: 'auto',
                  minHeight: 0,
                  mt: 1,
                  '&::-webkit-scrollbar': { width: 4 },
                  '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 2 }
                }}>
                  {recentActivity.slice(0, 8).map((item, index) => (
                    <Box
                      key={index}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1, py: 0.8, px: 0.5,
                        borderRadius: 1,
                        '&:hover': { bgcolor: 'action.hover' },
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      {item.type === 'folder' ? (
                        <FolderIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                      ) : (
                        <InsertDriveFileIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                      )}
                      <Typography variant="caption" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                        {item.name}
                      </Typography>
                      <Typography variant="caption" sx={{
                        bgcolor: 'primary.main', color: 'primary.contrastText', px: 0.8, py: 0.2, borderRadius: 1,
                        fontSize: '0.65rem', fontWeight: 600, flexShrink: 0
                      }}>
                        {item.category}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">No activity yet</Typography>
                </Box>
              )}
            </DashboardCard>
          </Box>

        </Box>
      </Container>
    </Fade>
  );
}

// --- SUB-COMPONENTS --- //

function DashboardCard({ title, icon, color, children, headerAction, elevation = 0, onClick }) {
  // Common visual consistency
  const CardContentWrapper = onClick ? CardActionArea : Box;
  const wrapperProps = onClick ? { onClick, sx: { height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' } } : { sx: { height: '100%', display: 'flex', flexDirection: 'column' } };

  return (
    <Card
      elevation={elevation}
      sx={{
        bgcolor: 'background.surfaceContainer',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '24px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          borderColor: color,
          transform: 'translateY(-4px)',
          boxShadow: `0 12px 30px -10px ${color}30`,
          cursor: onClick ? 'pointer' : 'default',
          '& .icon-box-inner': {
            transform: 'scale(1.1)',
            bgcolor: color,
            color: '#fff'
          }
        }
      }}
    >
      <CardContentWrapper {...wrapperProps}>
        <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', zIndex: 1, flex: 1 }}>
          {/* Unified Header: Icon (Left) + Title --- Action (Right) */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box className="icon-box-inner" sx={{
                p: 1.2,
                borderRadius: '16px',
                bgcolor: `${color}15`,
                color: color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.3s ease'
              }}>
                {React.cloneElement(icon, { sx: { fontSize: 26 } })}
              </Box>

              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                {title}
              </Typography>
            </Box>

            <Box>
              {headerAction}
            </Box>
          </Box>

          {/* Content */}
          {children}
        </Box>

        {/* Decorative Blob */}
        <Box sx={{
          position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%',
          background: `radial-gradient(circle, ${color}15 0%, transparent 70%)`,
          pointerEvents: 'none', zIndex: 0
        }} />
      </CardContentWrapper>
    </Card>
  );
}

function TrendBadge({ direction, label }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 0.5,
      bgcolor: direction === 'up' ? 'success.light' : direction === 'down' ? 'error.light' : 'grey.200',
      color: direction === 'up' ? 'success.dark' : direction === 'down' ? 'error.dark' : 'grey.700',
      px: 1.5, py: 0.5, borderRadius: 20
    }}>
      {direction === 'up' && <TrendingUpIcon sx={{ fontSize: 16 }} />}
      {direction === 'down' && <TrendingDownIcon sx={{ fontSize: 16 }} />}
      <Typography variant="caption" fontWeight={700}>
        {label}
      </Typography>
    </Box>
  );
}
