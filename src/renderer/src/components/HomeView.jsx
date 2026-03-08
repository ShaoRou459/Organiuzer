import React, { useMemo, useState, useRef } from 'react';
import { Box, Typography, Button, Fade, useTheme, Card, CardActionArea, Container } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import StorageIcon from '@mui/icons-material/Storage';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SettingsIcon from '@mui/icons-material/Settings';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import MemoryIcon from '@mui/icons-material/Memory';
import HistoryIcon from '@mui/icons-material/History';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DonutLargeIcon from '@mui/icons-material/DonutLarge';
import { truncateMiddle } from '../utils/truncateMiddle';
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
          // Prevent long content (e.g. very long filenames) from forcing grid columns wider
          '& > *': { minWidth: 0, minHeight: 0 },
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
            >
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 1 }}>
                <Typography variant="h2" fontWeight={850} sx={{ letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {metrics.filesOrganized?.toLocaleString() || '0'}
                </Typography>
                <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Files Organized
                </Typography>
              </Box>
            </DashboardCard>

            {/* 2. New Widget: Composition (50%) */}
            <DashboardCard
              title="Composition"
              color={theme.palette.secondary.main}
              icon={<DonutLargeIcon />}
            >
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {categoryData.length > 0 ? (
                  <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {categoryData.slice(0, 3).map((cat, i) => (
                      <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: cat.color }} />
                          <Typography variant="body2" fontWeight={650} sx={{ opacity: 0.9 }}>
                            {cat.name}
                          </Typography>
                        </Box>
                        <Typography variant="body2" fontWeight={750} sx={{ opacity: 0.9 }}>
                          {cat.value}
                        </Typography>
                      </Box>
                    ))}
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, opacity: 0.7 }}>
                      Top categories (recent)
                    </Typography>
                  </Box>
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
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 1 }}>
                <Typography variant="h4" fontWeight={850} sx={{ letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                  {formattedBytes}
                </Typography>
                <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Space Organized
                </Typography>
              </Box>
            </DashboardCard>
          </Box>

          {/* Right Bottom Card: Recent Activity (taller slot) */}
          <Box sx={{ gridArea: 'right2' }}>
            <DashboardCard
              title="Recent Activity"
              color={theme.palette.success.main}
              icon={<HistoryIcon />}
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
                  {recentActivity.slice(0, 12).map((item, index) => (
                    <Box
                      key={index}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1, py: 0.8, px: 0.5, minWidth: 0,
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
                      <Typography variant="caption" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                        {truncateMiddle(item.name, 24, 10, 9)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 650, flexShrink: 0, opacity: 0.8 }}>
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



          {/* Bottom 2: AI Model */}
          <Box sx={{ gridArea: 'bot2' }}>
            <DashboardCard
              title="AI Model"
              color={theme.palette.info.main}
              icon={<MemoryIcon />}
            >
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 0.75 }}>
                <Typography variant="h5" fontWeight={800} sx={{ wordBreak: 'break-word', lineHeight: 1.15 }}>
                  {aiConfig?.model || 'Unknown'}
                </Typography>
                <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Active Model
                </Typography>
              </Box>
            </DashboardCard>
          </Box>

          {/* Bottom 3: Settings */}
          {/* Bottom 3: Settings */}
          <Box sx={{ gridArea: 'bot3' }}>
            <DashboardCard
              title=""
              color={theme.palette.action.active}
              icon={<SettingsIcon />}
              onClick={onOpenSettings}
              variant="iconOnly"
            >
            </DashboardCard>
          </Box>

          {/* Bottom 4: Time Saved */}
          <Box sx={{ gridArea: 'bot4' }}>
            <DashboardCard
              title="Time Saved"
              color={theme.palette.warning.main}
              icon={<AccessTimeIcon />}
            >
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 1 }}>
                <Typography variant="h3" fontWeight={850} sx={{ letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {formattedTime}
                </Typography>
                <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Time Saved
                </Typography>
              </Box>
            </DashboardCard>
          </Box>

        </Box>
      </Container>
    </Fade>
  );
}

// --- SUB-COMPONENTS --- //

function DashboardCard({ title, icon, color, children, headerAction, elevation = 0, onClick, variant = 'default' }) {
  // Common visual consistency
  const CardContentWrapper = onClick ? CardActionArea : Box;
  const isIconOnly = variant === 'iconOnly';
  const wrapperProps = onClick
    ? {
      onClick,
      sx: {
        height: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch',
        ...(isIconOnly && {
          '& .MuiCardActionArea-focusHighlight': { display: 'none' },
          '&:hover': { bgcolor: 'transparent' },
        }),
      },
    }
    : { sx: { height: '100%', minWidth: 0, display: 'flex', flexDirection: 'column' } };

  return (
    <Card
      elevation={elevation}
      sx={{
        bgcolor: 'background.surfaceContainer',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '24px',
        height: '100%',
        minWidth: 0,
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
            color: color,
          }
        }
      }}
    >
      <CardContentWrapper {...wrapperProps}>
        <Box sx={{ p: 2, height: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', zIndex: 1, flex: 1 }}>
          {isIconOnly ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Box
                className="icon-box-inner"
                sx={{

                  color: color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s ease'
                }}
              >
                {React.cloneElement(icon, { sx: { fontSize: 56 } })}
              </Box>
            </Box>
          ) : (
            <>
              {/* Unified Header: Icon (Left) + Title --- Action (Right) */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box className="icon-box-inner" sx={{
                    p: 1.2,
                    borderRadius: '16px',
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
            </>
          )}
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

