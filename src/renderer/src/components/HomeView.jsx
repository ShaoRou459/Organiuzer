import React, { useMemo } from 'react';
import { Box, Typography, Button, Fade, IconButton, Tooltip, useTheme, Card, CardActionArea, Container, Stack } from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import StorageIcon from '@mui/icons-material/Storage';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SettingsIcon from '@mui/icons-material/Settings';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import InfoIcon from '@mui/icons-material/Info';
import MemoryIcon from '@mui/icons-material/Memory';
import pkg from '../../../../package.json';

export default function HomeView({ onSelectFolder, onOpenSettings, metrics, aiConfig }) {
  const theme = useTheme();

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

  return (
    <Fade in={true} timeout={600}>
      <Container maxWidth={false} sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 3 }}>

        {/* Main Grid Layout - Full Screen Cluster */}
        <Box sx={{
          display: 'grid',
          width: '100%',
          height: '100%',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1.2fr 1fr' }, // Wider center column
          gridTemplateRows: { xs: 'auto', md: 'auto 1fr 140px' }, // Explicit taller bottom row
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
            `,
            md: `
              "left title right1"
              "left start right2"
              "bot1 bot2 bot3"
            `
          }
        }}>

          {/* Title Card */}
          <Box sx={{ gridArea: 'title' }}>
            <Card elevation={0} sx={{
              bgcolor: 'background.surfaceContainer',
              borderRadius: '16px',
              border: '1px solid',
              borderColor: 'divider',
              p: 2,
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Typography variant="h3" fontWeight={800} sx={{
                background: 'linear-gradient(90deg, #D0BCFF 0%, #EFB8C8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                Organiuzer
              </Typography>
            </Card>
          </Box>

          {/* Left Stats Card (Tall) */}
          <Box sx={{ gridArea: 'left' }}>
            <StatsCard
              title="Files Organized"
              value={metrics.filesOrganized?.toLocaleString() || '0'}
              icon={<AutoAwesomeIcon fontSize="large" />}
              color={theme.palette.primary.main}
              trend="+12% this week"
              fullHeight
            />
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
                height: '100%', // Fill the grid cell
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

          {/* Right Top Card */}
          <Box sx={{ gridArea: 'right1' }}>
            <StatsCard
              title="Space Processed"
              value={formattedBytes}
              icon={<StorageIcon />}
              color={theme.palette.tertiary.main}
            />
          </Box>

          {/* Right Bottom Card */}
          <Box sx={{ gridArea: 'right2' }}>
            <StatsCard
              title="Time Saved"
              value={formattedTime}
              icon={<AccessTimeIcon />}
              color={theme.palette.error.main}
            />
          </Box>

          {/* Bottom 1: Version */}
          <Box sx={{ gridArea: 'bot1' }}>
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
              <InfoIcon color="action" sx={{ mb: 1, fontSize: 28 }} />
              <Typography variant="h6" fontWeight={700}>v{pkg.version}</Typography>
              <Typography variant="caption" color="text.secondary">Version</Typography>
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

        </Box>
      </Container>
    </Fade>
  );
}

function StatsCard({ title, value, icon, color, trend, fullHeight }) {
  const theme = useTheme();

  return (
    <Card
      elevation={0}
      sx={{
        bgcolor: 'background.surfaceContainer',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '16px',
        height: '100%',
        transition: 'all 0.2s',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        '&:hover': {
          borderColor: color,
          transform: 'translateY(-2px)',
          boxShadow: `0 8px 20px -8px ${color}40`,
          '& .icon-bg': {
            transform: 'scale(1.1) rotate(5deg)',
          }
        }
      }}
    >
      <Box sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box className="icon-bg" sx={{
            p: 1.5,
            borderRadius: 3,
            bgcolor: `${color}15`,
            color: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.3s ease'
          }}>
            {React.cloneElement(icon, { sx: { fontSize: 24 } })}
          </Box>
          {trend && (
            <Typography variant="caption" sx={{
              bgcolor: 'success.dark',
              color: '#fff',
              px: 1,
              py: 0.5,
              borderRadius: 20,
              fontWeight: 700,
              fontSize: '0.7rem'
            }}>
              {trend}
            </Typography>
          )}
        </Box>

        <Box>
          <Typography variant="h3" fontWeight={700} sx={{ mb: 0.5 }}>
            {value}
          </Typography>
          <Typography variant="body2" color="text.secondary" fontWeight={500}>
            {title}
          </Typography>
        </Box>

        {/* Subtle background decoration */}
        <Box sx={{
          position: 'absolute',
          bottom: -20,
          right: -20,
          width: 100,
          height: 100,
          borderRadius: '50%',
          bgcolor: color,
          opacity: 0.05,
          pointerEvents: 'none'
        }} />

      </Box>
    </Card>
  );
}
