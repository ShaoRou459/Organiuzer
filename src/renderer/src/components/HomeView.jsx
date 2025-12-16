import React, { useMemo } from 'react';
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
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell, RadialBarChart, RadialBar, PolarAngleAxis
} from 'recharts';
import pkg from '../../../../package.json';

export default function HomeView({ onSelectFolder, onOpenSettings, metrics, aiConfig, recentActivity = [] }) {
  const theme = useTheme();

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
      <Container maxWidth={false} sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 3 }}>

        {/* Main Grid Layout - Full Screen Cluster */}
        <Box sx={{
          display: 'grid',
          width: '100%',
          height: '100%',
          gridTemplateColumns: { xs: '1fr', md: '1fr 0.6fr 0.6fr 1fr' },
          gridTemplateRows: { xs: 'auto', md: '1fr 1.5fr 1fr' },
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
              "bot1 bot2 bot3 bot4"
            `
          }
        }}>

          {/* Title Card - With greeting, tagline and animated orbs */}
          <Box sx={{ gridArea: 'title' }}>
            <Card elevation={0} sx={{
              bgcolor: 'background.surfaceContainer',
              borderRadius: '16px',
              border: '1px solid',
              borderColor: 'divider',
              p: 2,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* Animated floating orbs - large movement across the card */}
              <Box sx={{
                position: 'absolute',
                top: '-20%',
                left: '-10%',
                width: 180,
                height: 180,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(208,188,255,0.5) 0%, transparent 70%)',
                animation: 'roam1 8s ease-in-out infinite',
                '@keyframes roam1': {
                  '0%': { transform: 'translate(0, 0) scale(1)' },
                  '25%': { transform: 'translate(150px, 60px) scale(1.2)' },
                  '50%': { transform: 'translate(250px, 30px) scale(0.9)' },
                  '75%': { transform: 'translate(100px, 80px) scale(1.1)' },
                  '100%': { transform: 'translate(0, 0) scale(1)' }
                }
              }} />
              <Box sx={{
                position: 'absolute',
                bottom: '-15%',
                right: '-5%',
                width: 200,
                height: 200,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(239,184,200,0.45) 0%, transparent 70%)',
                animation: 'roam2 10s ease-in-out infinite',
                '@keyframes roam2': {
                  '0%': { transform: 'translate(0, 0) scale(1)' },
                  '20%': { transform: 'translate(-180px, -50px) scale(1.15)' },
                  '40%': { transform: 'translate(-280px, -80px) scale(0.95)' },
                  '60%': { transform: 'translate(-150px, -100px) scale(1.1)' },
                  '80%': { transform: 'translate(-60px, -40px) scale(1.05)' },
                  '100%': { transform: 'translate(0, 0) scale(1)' }
                }
              }} />
              <Box sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                marginTop: '-60px',
                marginLeft: '-60px',
                width: 120,
                height: 120,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(147,112,219,0.4) 0%, transparent 70%)',
                animation: 'roam3 7s ease-in-out infinite',
                '@keyframes roam3': {
                  '0%': { transform: 'translate(0, 0) scale(1)' },
                  '25%': { transform: 'translate(-120px, -60px) scale(0.8)' },
                  '50%': { transform: 'translate(80px, -80px) scale(1.2)' },
                  '75%': { transform: 'translate(120px, 50px) scale(0.9)' },
                  '100%': { transform: 'translate(0, 0) scale(1)' }
                }
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

                {/* App name */}
                <Typography variant="h3" fontWeight={800} sx={{
                  background: 'linear-gradient(90deg, #D0BCFF 0%, #EFB8C8 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  mb: 0.5
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

          {/* Left Stats Card (Files) - With Smooth Sparkline */}
          <Box sx={{ gridArea: 'left' }}>
            <StatsCard
              title="Files Organized"
              value={metrics.filesOrganized?.toLocaleString() || '0'}
              icon={<AutoAwesomeIcon fontSize="large" />}
              color={theme.palette.primary.main}
              trend={trendData.trend}
              trendDirection={trendData.direction}
              fullHeight
            >
              {/* Smooth Sparkline for recent files */}
              {recentFilesData.length > 0 && (
                <Box sx={{ height: 50, width: '100%', mt: 1, opacity: 1, maskImage: 'linear-gradient(to right, transparent, black 10%)' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={recentFilesData}>
                      <defs>
                        <linearGradient id="colorFiles" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="files"
                        stroke={theme.palette.primary.main}
                        strokeWidth={3}
                        fill="url(#colorFiles)"
                        isAnimationActive={true}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </StatsCard>
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
            <StatsCard
              title="Space Processed"
              value={formattedBytes}
              icon={<StorageIcon />}
              color={theme.palette.secondary.main} // Changed to secondary for variety
            >
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
            </StatsCard>
          </Box>

          {/* Right Bottom Card (Time) - With Sleek Radial */}
          <Box sx={{ gridArea: 'right2' }}>
            <StatsCard
              title="Time Saved"
              value={formattedTime}
              icon={<AccessTimeIcon />}
              color={theme.palette.error.main}
              rowLayout
            >
              {/* Radial Chart for time */}
              <Box sx={{ height: 70, width: 70, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    innerRadius="75%"
                    outerRadius="100%"
                    barSize={6}
                    data={[{ name: 'bg', value: 100, fill: theme.palette.action.hover }, ...timeData]}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <RadialBar
                      background={false}
                      clockWise
                      dataKey="value"
                      cornerRadius={10}
                    />
                  </RadialBarChart>
                </ResponsiveContainer>
                {/* Center Icon */}
                <Box sx={{
                  position: 'absolute',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: theme.palette.error.main
                }}>
                  <TrendingUpIcon sx={{ fontSize: 20 }} />
                </Box>
              </Box>
            </StatsCard>
          </Box>

          {/* Bottom 1: Activity Graph */}
          <Box sx={{ gridArea: 'bot1' }}>
            <Card elevation={0} sx={{
              bgcolor: 'background.surfaceContainerLow',
              borderRadius: '16px',
              border: '1px solid',
              borderColor: 'divider',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              p: 3,
              position: 'relative',
              overflow: 'hidden'
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ShowChartIcon color="primary" sx={{ fontSize: 24 }} />
                  <Typography variant="h6" fontWeight={700}>
                    Activity Overview
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {/* Legend or filter could go here */}
                </Box>
              </Box>

              {activityData.length >= 1 ? (
                <Box sx={{ flex: 1, width: '100%', minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorFilesMain" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} opacity={0.5} />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: theme.palette.text.secondary, fontWeight: 500 }}
                        interval="preserveStartEnd"
                        dy={10}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: theme.palette.text.secondary, fontWeight: 500 }}
                        width={30}
                      />
                      <RechartsTooltip
                        content={<CustomTooltip />}
                        cursor={{ stroke: theme.palette.primary.main, strokeWidth: 1, strokeDasharray: '4 4' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="files"
                        stroke={theme.palette.primary.main}
                        strokeWidth={3}
                        fill="url(#colorFilesMain)"
                        dot={false}
                        activeDot={{ r: 6, fill: theme.palette.background.paper, stroke: theme.palette.primary.main, strokeWidth: 2 }}
                        animationDuration={1500}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              ) : (
                <Box sx={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.5,
                  gap: 1
                }}>
                  <ShowChartIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                  <Typography variant="body2" color="text.secondary">
                    No activity recorded yet
                  </Typography>
                </Box>
              )}
            </Card>
          </Box>

          {/* Bottom 2: AI Model */}
          <Box sx={{ gridArea: 'bot2' }}>
            <Card elevation={0} sx={{
              bgcolor: 'background.surfaceContainerLow',
              borderRadius: '16px',
              border: '1px solid',
              borderColor: 'divider',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              p: 2
            }}>
              <MemoryIcon color="action" sx={{ mb: 1, fontSize: 28 }} />
              <Typography variant="h6" fontWeight={700} sx={{ textAlign: 'center', wordBreak: 'break-word' }}>
                {aiConfig?.model || 'Unknown'}
              </Typography>
              <Typography variant="caption" color="text.secondary">Active Model</Typography>
            </Card>
          </Box>

          {/* Bottom 3: Settings */}
          <Box sx={{ gridArea: 'bot3' }}>
            <Card elevation={0} sx={{
              bgcolor: 'background.surfaceContainerLow',
              borderRadius: '16px',
              border: '1px solid',
              borderColor: 'divider',
              height: '100%',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <CardActionArea
                onClick={onOpenSettings}
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: 2
                }}
              >
                <SettingsIcon color="action" sx={{ mb: 1, fontSize: 28 }} />
                <Typography variant="h6" fontWeight={700}>Settings</Typography>
                <Typography variant="caption" color="text.secondary">Configure App</Typography>
              </CardActionArea>
            </Card>
          </Box>

          {/* Bottom 4: Recent Activity */}
          <Box sx={{ gridArea: 'bot4' }}>
            <Card elevation={0} sx={{
              bgcolor: 'background.surfaceContainerLow',
              borderRadius: '16px',
              border: '1px solid',
              borderColor: 'divider',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              p: 2,
              overflow: 'hidden'
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <HistoryIcon color="action" sx={{ fontSize: 20 }} />
                <Typography variant="subtitle2" fontWeight={700}>Recent Activity</Typography>
              </Box>

              {recentActivity.length > 0 ? (
                <Box sx={{
                  flex: 1,
                  overflow: 'auto',
                  minHeight: 0,
                  '&::-webkit-scrollbar': { width: 4 },
                  '&::-webkit-scrollbar-thumb': {
                    bgcolor: 'divider',
                    borderRadius: 2
                  }
                }}>
                  {recentActivity.slice(0, 8).map((item, index) => (
                    <Box
                      key={index}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        py: 0.5,
                        px: 0.5,
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
                      <Typography
                        variant="caption"
                        sx={{
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontWeight: 500
                        }}
                      >
                        {item.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          bgcolor: 'primary.main',
                          color: 'primary.contrastText',
                          px: 0.8,
                          py: 0.2,
                          borderRadius: 1,
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          flexShrink: 0
                        }}
                      >
                        {item.category}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Box sx={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.5
                }}>
                  <Typography variant="caption" color="text.secondary">
                    No activity yet
                  </Typography>
                </Box>
              )}
            </Card>
          </Box>

        </Box>
      </Container>
    </Fade>
  );
}

function StatsCard({ title, value, icon, color, trend, trendDirection, fullHeight, children, rowLayout }) {
  return (
    <Card
      elevation={0}
      sx={{
        bgcolor: 'background.surfaceContainer',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '24px', // More rounded
        height: '100%',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        '&:hover': {
          borderColor: color,
          transform: 'translateY(-4px)',
          boxShadow: `0 12px 30px -10px ${color}30`,
          '& .icon-box': {
            transform: 'scale(1.1)',
            bgcolor: color,
            color: '#fff'
          }
        }
      }}
    >
      <Box sx={{
        p: 2,
        height: '100%',
        display: 'flex',
        flexDirection: rowLayout ? 'row' : 'column',
        justifyContent: 'space-between',
        alignItems: rowLayout ? 'center' : 'stretch',
        gap: rowLayout ? 2 : 0,
        zIndex: 1
      }}>

        {/* Header / Icon Area */}
        <Box sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: rowLayout ? 0 : 1,
          flex: rowLayout ? 1 : 'initial'
        }}>
          {!rowLayout && (
            <Box className="icon-box" sx={{
              p: 1.2,
              borderRadius: '14px',
              bgcolor: `${color}15`,
              color: color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease'
            }}>
              {React.cloneElement(icon, { sx: { fontSize: 26 } })}
            </Box>
          )}

          {trend && (
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              bgcolor: trendDirection === 'up' ? 'success.light' : trendDirection === 'down' ? 'error.light' : 'grey.200',
              color: trendDirection === 'up' ? 'success.dark' : trendDirection === 'down' ? 'error.dark' : 'grey.700',
              px: 1.2,
              py: 0.5,
              borderRadius: 20,
            }}>
              {trendDirection === 'up' && <TrendingUpIcon sx={{ fontSize: 14 }} />}
              {trendDirection === 'down' && <TrendingDownIcon sx={{ fontSize: 14 }} />}
              <Typography variant="caption" sx={{
                fontWeight: 700,
                fontSize: '0.75rem'
              }}>
                {trend}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Value Area */}
        <Box sx={{ flex: rowLayout ? 2 : 'initial' }}>
          <Typography variant="h3" fontWeight={800} sx={{
            mb: 0.25,
            fontSize: rowLayout ? '1.8rem' : '2.5rem',
            letterSpacing: '-0.02em'
          }}>
            {value}
          </Typography>
          <Typography variant="body1" color="text.secondary" fontWeight={600}>
            {title}
          </Typography>
        </Box>

        {/* Custom Chart/Content Area */}
        {children && (
          <Box sx={{
            mt: rowLayout ? 0 : 'auto',
            flex: rowLayout ? 'initial' : 1,
            display: 'flex',
            alignItems: 'flex-end',
            minHeight: rowLayout ? 0 : 40
          }}>
            {children}
          </Box>
        )}

      </Box>

      {/* Background Gradient Blob */}
      <Box sx={{
        position: 'absolute',
        top: -40,
        right: -40,
        width: 150,
        height: 150,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${color}20 0%, transparent 70%)`,
        pointerEvents: 'none',
        zIndex: 0
      }} />
    </Card>
  );
}
