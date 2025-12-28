import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, CircularProgress,
  Paper, Alert, Snackbar, IconButton, Drawer, Divider,
  List, ListItem, ListItemIcon, ListItemText, Chip, Tooltip,
  LinearProgress, Grid, Card, CardActionArea, Fade, useTheme
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HistoryIcon from '@mui/icons-material/History';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import DnDOrganizer from './DnDOrganizer';
import FileExplorer from './FileExplorer';

export default function FolderManager({ path, onBack, onOpenSettings }) {
  const theme = useTheme();
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('scanning'); // scanning, idle, analyzing, reviewing, executing, complete
  const [plan, setPlan] = useState(null);
  const [completionStats, setCompletionStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'success' });
  const [pathCopied, setPathCopied] = useState(false);

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(path);
      setPathCopied(true);
      setTimeout(() => setPathCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy path:', err);
    }
  };

  useEffect(() => {
    scanFolder();
    loadHistory();
  }, [path]);

  const scanFolder = async () => {
    setStatus('scanning');
    try {
      const result = await window.electronAPI.scanFolder(path);
      setFiles(result);
      setStatus('idle');
    } catch (error) {
      console.error(error);
      setNotification({ open: true, message: 'Failed to scan folder.', severity: 'error' });
      setStatus('idle');
    }
  };

  const loadHistory = async () => {
    try {
      const settings = await window.electronAPI.getAllSettings();
      if (settings.sortingHistory) {
        setHistory(settings.sortingHistory);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAnalyze = async () => {
    setStatus('analyzing');
    try {
      let result = await window.electronAPI.analyzeFolder(path, files);

      if (result.plan && result.debug) {
        result = result.plan;
      }

      // Check if the plan is empty (nothing to organize)
      if (!result || Object.keys(result).length === 0) {
        setNotification({
          open: true,
          message: 'This folder is already well organized! No changes needed.',
          severity: 'info'
        });
        setStatus('idle');
        return;
      }

      const normalizedPlan = {};
      Object.keys(result).forEach(key => {
        const cat = result[key];
        normalizedPlan[key] = {
          ...cat,
          items: cat.items || cat.files || []
        };
      });

      // Check if there are actually items to move
      const totalItems = Object.values(normalizedPlan).reduce(
        (sum, cat) => sum + (cat.items?.length || 0), 0
      );

      if (totalItems === 0) {
        setNotification({
          open: true,
          message: 'This folder is already well organized! No changes needed.',
          severity: 'info'
        });
        setStatus('idle');
        return;
      }

      setPlan(normalizedPlan);
      setStatus('reviewing');
    } catch (error) {
      setNotification({ open: true, message: 'AI Analysis failed. Check API Key.', severity: 'error' });
      setStatus('idle');
    }
  };

  const handleApply = async () => {
    setStatus('executing');
    try {
      // Calculate stats before applying
      const categories = Object.keys(plan);
      const itemsByCategory = {};
      let totalFiles = 0;
      let totalFolders = 0;

      categories.forEach(cat => {
        const items = plan[cat].items || [];
        itemsByCategory[cat] = items.length;
        items.forEach(item => {
          if (item.type === 'folder') totalFolders++;
          else {
            totalFiles++;
            totalBytes += (item.stats?.size || item.size || 0);
          }
        });
      });

      // Find top category
      const topCategoryName = Object.entries(itemsByCategory).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

      await window.electronAPI.executeOrganization(path, plan);

      // Set completion stats
      setCompletionStats({
        categoriesCreated: categories.length,
        categories: itemsByCategory,
        filesMoved: totalFiles,
        foldersMoved: totalFolders,
        totalBytes,
        topCategoryName,
        totalItems: totalFiles + totalFolders,
      });

      setStatus('complete');
      loadHistory();
    } catch (error) {
      setNotification({ open: true, message: 'Failed to apply changes.', severity: 'error' });
      setStatus('reviewing');
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleCancelReview = () => {
    setPlan(null);
    setStatus('idle');
  };

  // Get folder name from path
  const folderName = path.split('/').filter(Boolean).pop() || path;

  // Count stats
  const folderCount = files.filter(f => f.type === 'folder').length;
  const fileCount = files.filter(f => f.type === 'file').length;

  return (
    <Fade in={true} timeout={400}>
      <Box sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        p: 3,
        gap: 3
      }}>
        {/* Header - Refined & Clean */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0, flex: 1 }}>
            {/* Back Button */}
            <Tooltip title="Back to Home">
              <IconButton
                onClick={onBack}
                sx={{
                  bgcolor: 'background.surfaceContainer',
                  border: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main' }
                }}
              >
                <ArrowBackIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {/* Folder Info */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="h4" fontWeight={700} noWrap>
                  {folderName}
                </Typography>
                <Tooltip title={pathCopied ? "Copied!" : "Click to copy path"}>
                  <Chip
                    size="small"
                    label={path}
                    onClick={handleCopyPath}
                    icon={<FolderOpenIcon sx={{ fontSize: 14 }} />}
                    sx={{
                      cursor: 'pointer',
                      bgcolor: 'background.surfaceContainer',
                      border: '1px solid',
                      borderColor: pathCopied ? 'success.main' : 'divider',
                      color: pathCopied ? 'success.main' : 'text.secondary',
                      transition: 'all 0.2s',
                      maxWidth: 400,
                      '&:hover': {
                        bgcolor: 'action.hover',
                        borderColor: 'primary.main',
                        color: 'primary.main'
                      }
                    }}
                  />
                </Tooltip>
              </Box>

              <Box sx={{ display: 'flex', gap: 2 }}>
                <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', fontWeight: 500 }}>
                  <FolderIcon sx={{ fontSize: 14 }} /> {folderCount} folders
                </Typography>
                <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', fontWeight: 500 }}>
                  <InsertDriveFileIcon sx={{ fontSize: 14 }} /> {fileCount} files
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* Actions Toolbar */}
          <Box sx={{ display: 'flex', gap: 1, bgcolor: 'background.surfaceContainer', p: 0.75, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
            <Tooltip title="Refresh">
              <IconButton
                onClick={scanFolder}
                disabled={status === 'scanning' || status === 'analyzing'}
                size="small"
                sx={{ '&:hover': { color: 'primary.main' } }}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="History">
              <IconButton onClick={() => setIsHistoryOpen(true)} size="small" sx={{ '&:hover': { color: 'primary.main' } }}>
                <HistoryIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Settings">
              <IconButton onClick={onOpenSettings} size="small" sx={{ '&:hover': { color: 'primary.main' } }}>
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Content Area */}
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>

          {/* Scanning State */}
          {status === 'scanning' && (
            <Fade in={true} timeout={500}>
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', pb: 8 }}>
                <DashboardCard sx={{ width: '100%', maxWidth: 600, height: 'auto', minHeight: 360, display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, py: 6 }}>
                    <Box sx={{ position: 'relative' }}>
                      <CircularProgress size={80} thickness={3} sx={{ color: 'primary.main' }} />
                      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FolderOpenIcon sx={{ fontSize: 32, color: 'primary.main' }} />
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h5" fontWeight={700} gutterBottom>Scanning Folder</Typography>
                      <Typography variant="body1" color="text.secondary">Reading file structure...</Typography>
                    </Box>
                  </Box>
                </DashboardCard>
              </Box>
            </Fade>
          )}

          {/* Idle State - File Explorer & Action */}
          {status === 'idle' && (
            <Fade in={true} timeout={500}>
              <Box sx={{ height: '100%', display: 'grid', gridTemplateRows: '1fr auto', gap: 3 }}>
                <DashboardCard title="Folder Contents" icon={<FolderIcon />} color={theme.palette.primary.main}>
                  <Box sx={{ flex: 1, overflow: 'auto', mt: 1 }}>
                    <FileExplorer files={files} rootPath={path} />
                  </Box>
                </DashboardCard>

                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    onClick={handleAnalyze}
                    disabled={files.length === 0}
                    startIcon={<AutoAwesomeIcon />}
                    sx={{
                      fontSize: '1.1rem',
                      py: 1.5,
                      px: 4,
                      borderRadius: 4,
                      textTransform: 'none',
                      fontWeight: 700,
                      boxShadow: `0 8px 25px ${theme.palette.primary.main}50`,
                      '&:hover': {
                        boxShadow: `0 12px 35px ${theme.palette.primary.main}70`,
                        transform: 'translateY(-2px)'
                      },
                      transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                    }}
                  >
                    Organize with AI
                  </Button>
                </Box>
              </Box>
            </Fade>
          )}

          {/* Analyzing State */}
          {status === 'analyzing' && (
            <Fade in={true} timeout={500}>
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', pb: 8 }}>
                <DashboardCard color={theme.palette.secondary.main} sx={{ width: '100%', maxWidth: 640, height: 'auto', minHeight: 400, display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, py: 6 }}>
                    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                      {/* Pulping Effect */}
                      <Box sx={{
                        position: 'absolute', inset: -24, borderRadius: '50%',
                        bgcolor: theme.palette.secondary.main + '20',
                        animation: 'pulse 2s infinite'
                      }} />
                      <CircularProgress size={90} thickness={3} sx={{ color: 'secondary.main' }} />
                      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <AutoAwesomeIcon sx={{ fontSize: 36, color: 'secondary.main' }} />
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'center', maxWidth: 460 }}>
                      <Typography variant="h4" fontWeight={800} gutterBottom>Analyzing Files</Typography>
                      <Typography variant="body1" color="text.secondary" paragraph sx={{ fontSize: '1.1rem' }}>
                        AI is determining the optimal structure based on file types, names, and content.
                      </Typography>
                      <LinearProgress sx={{ height: 6, borderRadius: 3, mt: 3, bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { bgcolor: 'secondary.main' } }} />
                    </Box>
                  </Box>
                </DashboardCard>
              </Box>
            </Fade>
          )}

          {/* Reviewing State - Organization Plan */}
          {status === 'reviewing' && plan && (
            <Fade in={true} timeout={500}>
              <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <DashboardCard title="Organization Plan" icon={<TipsAndUpdatesIcon />} color={theme.palette.info.main}
                  headerAction={
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button onClick={handleCancelReview} color="inherit" sx={{ color: 'text.secondary' }}>Cancel</Button>
                      <Button variant="contained" color="success" startIcon={<CheckCircleIcon />} onClick={handleApply} sx={{ borderRadius: 4, px: 3 }}>
                        Apply Changes
                      </Button>
                    </Box>
                  }
                >
                  <Box sx={{ flex: 1, overflow: 'auto', mt: 1 }}>
                    <DnDOrganizer plan={plan} setPlan={setPlan} />
                  </Box>
                </DashboardCard>
              </Box>
            </Fade>
          )}

          {/* Executing State */}
          {status === 'executing' && (
            <Fade in={true} timeout={500}>
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', pb: 8 }}>
                <DashboardCard color={theme.palette.success.main} sx={{ width: '100%', maxWidth: 600, height: 'auto', minHeight: 360, display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, py: 6 }}>
                    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                      <Box sx={{
                        position: 'absolute', inset: -16, borderRadius: '50%',
                        bgcolor: theme.palette.success.main + '20',
                        animation: 'pulse 1.5s infinite'
                      }} />
                      <CircularProgress size={80} thickness={3} sx={{ color: 'success.main' }} />
                      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CheckCircleIcon sx={{ fontSize: 32, color: 'success.main' }} />
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h5" fontWeight={700} gutterBottom>Moving Files</Typography>
                      <Typography variant="body1" color="text.secondary">
                        Applying your organization plan...
                      </Typography>
                    </Box>
                  </Box>
                </DashboardCard>
              </Box>
            </Fade>
          )}

          {/* Complete State - Dashboard Grid */}
          {status === 'complete' && completionStats && (
            <Fade in={true} timeout={500}>
              <Box sx={{ height: '100%', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gridTemplateRows: 'auto auto auto', gap: 3, overflow: 'auto' }}>

                {/* Header Banner - Spans all columns */}
                <Box sx={{ gridColumn: 'span 3' }}>
                  <DashboardCard color={theme.palette.success.main} sx={{ minHeight: 90, flexDirection: 'row', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, p: 0.5 }}>
                      <Box sx={{
                        width: 56, height: 56, borderRadius: '50%',
                        bgcolor: 'success.light', color: 'success.dark',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <CheckCircleIcon sx={{ fontSize: 32 }} />
                      </Box>
                      <Box>
                        <Typography variant="h5" fontWeight={800} gutterBottom sx={{ lineHeight: 1.1 }}>Organization Complete!</Typography>
                        <Typography variant="body2" color="text.secondary" fontWeight={500}>
                          Successfully processed {completionStats.totalItems} items.
                        </Typography>
                      </Box>
                    </Box>
                  </DashboardCard>
                </Box>

                {/* Stat Cards - Small & Compact - Grid Row 2 */}
                <DashboardCard title="Categories" icon={<FolderIcon />} color={theme.palette.primary.main} sx={{ minHeight: 160 }}>
                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', mt: 1 }}>
                    <Typography variant="h3" fontWeight={800}>{completionStats.categoriesCreated}</Typography>
                    <Box>
                      <Typography variant="body2" color="text.secondary" fontWeight={600}>Created</Typography>
                      <Typography variant="caption" color="primary.main" fontWeight={500} sx={{ display: 'block', mt: 0.5 }}>
                        Top: {completionStats.topCategoryName}
                      </Typography>
                    </Box>
                  </Box>
                </DashboardCard>

                <DashboardCard title="Files Moved" icon={<InsertDriveFileIcon />} color={theme.palette.secondary.main} sx={{ minHeight: 160 }}>
                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', mt: 1 }}>
                    <Typography variant="h3" fontWeight={800}>{completionStats.filesMoved}</Typography>
                    <Box>
                      <Typography variant="body2" color="text.secondary" fontWeight={600}>Total Files</Typography>
                      <Typography variant="caption" color="secondary.main" fontWeight={500} sx={{ display: 'block', mt: 0.5 }}>
                        {formatBytes(completionStats.totalBytes)} Processed
                      </Typography>
                    </Box>
                  </Box>
                </DashboardCard>

                <DashboardCard title="Folders Moved" icon={<FolderOpenIcon />} color={theme.palette.warning.main} sx={{ minHeight: 160 }}>
                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', mt: 1 }}>
                    <Typography variant="h3" fontWeight={800}>{completionStats.foldersMoved}</Typography>
                    <Box>
                      <Typography variant="body2" color="text.secondary" fontWeight={600}>Folders</Typography>
                      <Typography variant="caption" color="warning.main" fontWeight={500} sx={{ display: 'block', mt: 0.5 }}>
                        Structure Cleaned
                      </Typography>
                    </Box>
                  </Box>
                </DashboardCard>

                {/* Details & Actions - Grid Row 3 (Spans all) */}
                <Box sx={{ gridColumn: 'span 3', display: 'flex', gap: 2, minHeight: 0 }}>
                  {/* Category List */}
                  <Box sx={{ flex: 2, minHeight: 0 }}>
                    <DashboardCard title="Breakdown" icon={<TipsAndUpdatesIcon />} color={theme.palette.info.main}>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1, overflow: 'auto', alignContent: 'flex-start' }}>
                        {Object.entries(completionStats.categories).map(([category, count]) => (
                          <Chip key={category} label={`${category} (${count})`}
                            sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}
                          />
                        ))}
                      </Box>
                    </DashboardCard>
                  </Box>

                  {/* Next Actions */}
                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Button
                      variant="outlined" fullWidth
                      startIcon={<HistoryIcon />}
                      onClick={() => setIsHistoryOpen(true)}
                      sx={{ borderRadius: 4, border: '1px solid', borderColor: 'divider', py: 2 }}
                    >
                      History
                    </Button>
                    <Button
                      variant="contained" fullWidth
                      onClick={onBack}
                      sx={{ borderRadius: 4, bgcolor: 'primary.main', fontSize: '1.1rem', fontWeight: 700, py: 2 }}
                    >
                      Done
                    </Button>
                  </Box>
                </Box>
              </Box>
            </Fade>
          )}

          {/* History Drawer */}
          < Drawer
            anchor="right"
            open={isHistoryOpen}
            onClose={() => setIsHistoryOpen(false)}
            PaperProps={{
              sx: {
                width: 380,
                bgcolor: 'background.surfaceContainer',
              }
            }}
          >
            <Box sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Action History</Typography>
                <IconButton onClick={() => setIsHistoryOpen(false)} size="small">
                  <CloseIcon />
                </IconButton>
              </Box>
              <Divider sx={{ mb: 2 }} />

              {history.length > 0 ? (
                <List disablePadding>
                  {history.slice(0, 50).map((item, index) => (
                    <ListItem
                      key={index}
                      sx={{
                        px: 2,
                        py: 1.5,
                        mb: 1,
                        bgcolor: 'background.paper',
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider'
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        <HistoryIcon fontSize="small" color="action" />
                      </ListItemIcon>
                      <ListItemText
                        primary={item.name}
                        secondary={`Moved to ${item.category}`}
                        primaryTypographyProps={{
                          variant: 'body2',
                          fontWeight: 500,
                          noWrap: true
                        }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Box sx={{
                  py: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  color: 'text.disabled'
                }}>
                  <HistoryIcon sx={{ fontSize: 48, mb: 2 }} />
                  <Typography variant="body2">No history yet</Typography>
                </Box>
              )}
            </Box>
          </Drawer >

          {/* Notification */}
          < Snackbar
            open={notification.open}
            autoHideDuration={6000}
            onClose={() => setNotification({ ...notification, open: false })}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          >
            <Alert
              severity={notification.severity}
              onClose={() => setNotification({ ...notification, open: false })}
              sx={{ borderRadius: 2 }}
            >
              {notification.message}
            </Alert>
          </Snackbar>
        </Box>
      </Box>
    </Fade>
  );
}

function DashboardCard({ title, icon, color, children, headerAction, elevation = 0, onClick, sx = {} }) {
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
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          borderColor: color ? color : 'divider',
          boxShadow: color ? `0 12px 30px -10px ${color}30` : undefined,
          cursor: onClick ? 'pointer' : 'default',
          '& .icon-box-inner': {
            transform: 'scale(1.1)',
            bgcolor: color,
            color: '#fff'
          }
        },
        ...sx
      }}
    >
      <CardContentWrapper {...wrapperProps}>
        <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', zIndex: 1, flex: 1 }}>
          {/* Unified Header: Icon (Left) --- Action (Right) */}
          {(icon || title || headerAction) && (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: children ? 2 : 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                {icon && (
                  <Box className="icon-box-inner" sx={{
                    p: 1.2,
                    borderRadius: '16px',
                    bgcolor: color ? `${color}15` : 'action.hover',
                    color: color || 'text.primary',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.3s ease'
                  }}>
                    {React.cloneElement(icon, { sx: { fontSize: 26 } })}
                  </Box>
                )}
                {title && (
                  <Typography variant="h6" fontWeight={700}>
                    {title}
                  </Typography>
                )}
              </Box>
              <Box>
                {headerAction}
              </Box>
            </Box>
          )}

          {/* Content */}
          {children}
        </Box>

        {/* Decorative Blob */}
        {color && (
          <Box sx={{
            position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%',
            background: `radial-gradient(circle, ${color}15 0%, transparent 70%)`,
            pointerEvents: 'none', zIndex: 0
          }} />
        )}
      </CardContentWrapper>
    </Card>
  );
}
