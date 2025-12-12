import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, CircularProgress,
  Paper, Alert, Snackbar, IconButton, Drawer, Divider,
  List, ListItem, ListItemIcon, ListItemText, Chip, Tooltip,
  LinearProgress, Grid
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
          else totalFiles++;
        });
      });

      await window.electronAPI.executeOrganization(path, plan);

      // Set completion stats
      setCompletionStats({
        categoriesCreated: categories.length,
        categories: itemsByCategory,
        filesMoved: totalFiles,
        foldersMoved: totalFolders,
        totalItems: totalFiles + totalFolders,
      });

      setStatus('complete');
      loadHistory();
    } catch (error) {
      setNotification({ open: true, message: 'Failed to apply changes.', severity: 'error' });
      setStatus('reviewing');
    }
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
    <Box sx={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      bgcolor: 'background.default'
    }}>
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          mx: 2,
          mt: 1,
          p: 2,
          bgcolor: 'background.surfaceContainer',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0, flex: 1 }}>
            {/* Back Button */}
            <Tooltip title="Back to Home">
              <IconButton
                onClick={onBack}
                sx={{
                  bgcolor: 'action.hover',
                  '&:hover': { bgcolor: 'action.selected' }
                }}
              >
                <ArrowBackIcon />
              </IconButton>
            </Tooltip>

            <Box sx={{
              p: 1.25,
              borderRadius: 2,
              bgcolor: 'primary.dark',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <FolderOpenIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h6" fontWeight={500} noWrap>
                {folderName}
              </Typography>
              <Tooltip title={pathCopied ? "Copied!" : "Click to copy path"} placement="bottom-start">
                <Typography
                  variant="body2"
                  color="text.secondary"
                  noWrap
                  onClick={handleCopyPath}
                  sx={{
                    maxWidth: '100%',
                    cursor: 'pointer',
                    '&:hover': {
                      textDecoration: 'underline',
                      color: 'primary.main',
                    },
                    transition: 'color 0.15s ease',
                  }}
                >
                  {path}
                </Typography>
              </Tooltip>
              <Box sx={{ display: 'flex', gap: 1, mt: 0.75 }}>
                <Chip
                  size="small"
                  label={`${folderCount} folders`}
                  variant="outlined"
                  sx={{ borderColor: 'outlineVariant', height: 22 }}
                />
                <Chip
                  size="small"
                  label={`${fileCount} files`}
                  variant="outlined"
                  sx={{ borderColor: 'outlineVariant', height: 22 }}
                />
              </Box>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, ml: 2 }}>
            <Tooltip title="Refresh">
              <IconButton
                onClick={scanFolder}
                disabled={status === 'scanning' || status === 'analyzing'}
                size="small"
                sx={{ bgcolor: 'action.hover' }}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="History">
              <IconButton
                onClick={() => setIsHistoryOpen(true)}
                size="small"
                sx={{ bgcolor: 'action.hover' }}
              >
                <HistoryIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Settings">
              <IconButton
                onClick={onOpenSettings}
                size="small"
                sx={{ bgcolor: 'action.hover' }}
              >
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Paper>

      {/* Main Content */}
      <Box sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        p: 2,
        pt: 1.5
      }}>
        {/* Scanning State */}
        {status === 'scanning' && (
          <Paper
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              bgcolor: 'background.surfaceContainer',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <CircularProgress size={48} sx={{ mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              Scanning folder contents...
            </Typography>
          </Paper>
        )}

        {/* Idle State - File Explorer */}
        {status === 'idle' && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
              <Button
                variant="contained"
                startIcon={<AutoAwesomeIcon />}
                onClick={handleAnalyze}
                disabled={files.length === 0}
                size="large"
              >
                Organize with AI
              </Button>
            </Box>

            <Paper
              sx={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                bgcolor: 'background.surfaceContainer',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
                <FileExplorer files={files} rootPath={path} />
              </Box>
            </Paper>
          </Box>
        )}

        {/* Analyzing State */}
        {status === 'analyzing' && (
          <Paper
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              bgcolor: 'background.surfaceContainer',
              border: '1px solid',
              borderColor: 'divider',
              gap: 2
            }}
          >
            <Box sx={{ position: 'relative', display: 'inline-flex' }}>
              <CircularProgress size={80} thickness={2} />
              <Box sx={{
                top: 0, left: 0, bottom: 0, right: 0,
                position: 'absolute',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <AutoAwesomeIcon sx={{ fontSize: 32, color: 'primary.main' }} />
              </Box>
            </Box>
            <Typography variant="h5">Analyzing your files...</Typography>
            <Typography variant="body1" color="text.secondary">
              AI is determining the best organization structure
            </Typography>
            <LinearProgress sx={{ width: 300, mt: 2, borderRadius: 1 }} />
          </Paper>
        )}

        {/* Reviewing State - Organization Plan */}
        {status === 'reviewing' && plan && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Box sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 1.5
            }}>
              <Box>
                <Typography variant="h5" fontWeight={500}>
                  Organization Plan
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Drag and drop items between categories to customize
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Button
                  onClick={handleCancelReview}
                  color="inherit"
                  variant="outlined"
                  sx={{ borderColor: 'outlineVariant' }}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircleIcon />}
                  onClick={handleApply}
                  size="large"
                >
                  Apply Changes
                </Button>
              </Box>
            </Box>

            <Paper
              sx={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                bgcolor: 'background.surfaceContainer',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                <DnDOrganizer plan={plan} setPlan={setPlan} />
              </Box>
            </Paper>
          </Box>
        )}

        {/* Executing State */}
        {status === 'executing' && (
          <Paper
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              bgcolor: 'background.surfaceContainer',
              border: '1px solid',
              borderColor: 'divider',
              gap: 2
            }}
          >
            <CircularProgress size={64} color="success" />
            <Typography variant="h5">Organizing files...</Typography>
            <Typography variant="body1" color="text.secondary">
              Moving files to their new locations
            </Typography>
          </Paper>
        )}

        {/* Complete State */}
        {status === 'complete' && completionStats && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
            {/* Success Header */}
            <Paper
              sx={{
                p: 4,
                mb: 2,
                bgcolor: 'background.surfaceContainer',
                border: '1px solid',
                borderColor: 'success.main',
                textAlign: 'center',
              }}
            >
              <Box sx={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                bgcolor: 'success.dark',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 2
              }}>
                <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main' }} />
              </Box>
              <Typography variant="h4" gutterBottom>
                Organization Complete!
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Successfully organized {completionStats.totalItems} items into {completionStats.categoriesCreated} categories
              </Typography>
            </Paper>

            {/* Stats Grid */}
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Paper sx={{
                  p: 3,
                  bgcolor: 'background.surfaceContainer',
                  border: '1px solid',
                  borderColor: 'divider',
                  textAlign: 'center'
                }}>
                  <FolderIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                  <Typography variant="h4" fontWeight={600}>
                    {completionStats.categoriesCreated}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Categories
                  </Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Paper sx={{
                  p: 3,
                  bgcolor: 'background.surfaceContainer',
                  border: '1px solid',
                  borderColor: 'divider',
                  textAlign: 'center'
                }}>
                  <InsertDriveFileIcon sx={{ fontSize: 40, color: 'secondary.main', mb: 1 }} />
                  <Typography variant="h4" fontWeight={600}>
                    {completionStats.filesMoved}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Files Moved
                  </Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Paper sx={{
                  p: 3,
                  bgcolor: 'background.surfaceContainer',
                  border: '1px solid',
                  borderColor: 'divider',
                  textAlign: 'center'
                }}>
                  <FolderOpenIcon sx={{ fontSize: 40, color: 'warning.main', mb: 1 }} />
                  <Typography variant="h4" fontWeight={600}>
                    {completionStats.foldersMoved}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Folders Moved
                  </Typography>
                </Paper>
              </Grid>
            </Grid>

            {/* Category Breakdown */}
            <Paper sx={{
              p: 3,
              mb: 2,
              bgcolor: 'background.surfaceContainer',
              border: '1px solid',
              borderColor: 'divider',
            }}>
              <Typography variant="h6" gutterBottom>
                Category Breakdown
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {Object.entries(completionStats.categories).map(([category, count]) => (
                  <Chip
                    key={category}
                    icon={<FolderIcon />}
                    label={`${category}: ${count} items`}
                    sx={{
                      bgcolor: 'background.paper',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  />
                ))}
              </Box>
            </Paper>

            {/* Tips */}
            <Paper sx={{
              p: 3,
              mb: 2,
              bgcolor: 'background.surfaceContainerHigh',
              border: '1px solid',
              borderColor: 'divider',
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <TipsAndUpdatesIcon sx={{ color: 'warning.main' }} />
                <Typography variant="h6">Tips</Typography>
              </Box>
              <List dense disablePadding>
                <ListItem sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircleIcon fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Run again anytime to organize new files"
                    secondary="The AI will recognize existing categories and add new files to them"
                  />
                </ListItem>
                <ListItem sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircleIcon fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Customize before applying"
                    secondary="Drag items between categories in the review screen to fine-tune organization"
                  />
                </ListItem>
                <ListItem sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircleIcon fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Check the history"
                    secondary="View all past file movements in the history panel"
                  />
                </ListItem>
              </List>
            </Paper>

            {/* Action Button */}
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 'auto', pt: 2 }}>
              <Button
                variant="outlined"
                onClick={() => setIsHistoryOpen(true)}
                startIcon={<HistoryIcon />}
              >
                View History
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  setCompletionStats(null);
                  setPlan(null);
                  scanFolder();
                }}
                size="large"
              >
                View Organized Folder
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      {/* History Drawer */}
      <Drawer
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
      </Drawer>

      {/* Notification */}
      <Snackbar
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
  );
}
