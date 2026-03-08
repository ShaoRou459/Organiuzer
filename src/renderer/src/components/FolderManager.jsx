import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, CircularProgress,
  Paper, Alert, Snackbar, IconButton, Drawer, Divider,
  List, ListItem, ListItemIcon, Chip, Tooltip,
  LinearProgress, Grid, Card, CardActionArea, Fade, useTheme,
  Dialog, DialogTitle, DialogContent, DialogActions
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
import { truncateMiddle } from '../utils/truncateMiddle';

export default function FolderManager({ path, onBack, onOpenSettings }) {
  const theme = useTheme();
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('scanning'); // scanning, idle, analyzing, reviewing, executing, reverting, complete
  const [plan, setPlan] = useState(null);
  const [completionStats, setCompletionStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [lastRunId, setLastRunId] = useState(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [showAiOutput, setShowAiOutput] = useState(false);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'success' });
  const [pathCopied, setPathCopied] = useState(false);
  const [aiStream, setAiStream] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [executeProgress, setExecuteProgress] = useState({ total: 0, processed: 0, moved: 0, current: null });
  const [categoryFolders, setCategoryFolders] = useState([]);
  const [planIssue, setPlanIssue] = useState({ open: false, title: '', message: '', details: [], retryContext: null });

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

  useEffect(() => {
    (async () => {
      try {
        const pinned = await window.electronAPI?.getCategoryFolders?.(path);
        setCategoryFolders(Array.isArray(pinned) ? pinned : []);
      } catch {
        setCategoryFolders([]);
      }
    })();
  }, [path]);

  useEffect(() => {
    const offAnalyzeStream = window.electronAPI?.onAnalyzeStream?.((chunk) => {
      if (!chunk) return;
      setAiStream((prev) => {
        const next = prev + chunk;
        // Keep UI responsive if the model returns a lot of text
        return next.length > 8000 ? next.slice(-8000) : next;
      });
    });

    const offExecuteProgress = window.electronAPI?.onExecuteProgress?.((progress) => {
      if (!progress) return;
      setExecuteProgress((prev) => ({ ...prev, ...progress }));
    });

    return () => {
      try { offAnalyzeStream?.(); } catch { }
      try { offExecuteProgress?.(); } catch { }
    };
  }, []);

  useEffect(() => {
    if (status !== 'analyzing') return;

    const timer = setInterval(() => {
      setAnalysisProgress((prev) => {
        if (prev >= 95) return prev;
        if (prev < 55) return Math.min(95, prev + 6);
        if (prev < 82) return Math.min(95, prev + 3);
        return Math.min(95, prev + 1);
      });
    }, 220);

    return () => clearInterval(timer);
  }, [status]);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const finalizeAnalyzeProgress = async () => {
    setAnalysisProgress(100);
    await sleep(450);
  };

  const scanFolder = async () => {
    setStatus('scanning');
    try {
      const result = await window.electronAPI.scanFolder(path);
      setFiles(result);

      // Best-effort: infer and persist "pinned category folders" so we don't accidentally nest/move them.
      try {
        const pinned = await window.electronAPI?.getCategoryFolders?.(path);
        const existingPinned = Array.isArray(pinned) ? pinned : [];

        const normalize = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '_');
        const KNOWN_CATEGORY_NAMES = [
          'images', 'pictures', 'photos', 'videos', 'audio', 'music', 'documents', 'docs',
          'archives', 'installers', 'downloads', 'projects', 'code_projects', 'misc', 'screenshots'
        ];
        const knownSet = new Set(KNOWN_CATEGORY_NAMES);

        const inferred = (result || [])
          .filter((it) => it?.type === 'folder')
          .filter((it) => {
            const nameNorm = normalize(it.name);
            if (!knownSet.has(nameNorm)) return false;
            const markers = it?.context?.markers || [];
            if (Array.isArray(markers) && markers.length > 0) return false;
            const fileCount = it?.context?.fileCount || 0;
            return fileCount > 0;
          })
          .map((it) => it.name);

        const merged = Array.from(new Set([...(existingPinned || []), ...inferred]));
        if (merged.length !== existingPinned.length) {
          const saved = await window.electronAPI?.setCategoryFolders?.(path, merged);
          setCategoryFolders(Array.isArray(saved) ? saved : merged);
        } else {
          setCategoryFolders(existingPinned);
        }
      } catch { }

      setStatus('idle');
    } catch (error) {
      console.error(error);
      setNotification({ open: true, message: 'Failed to scan folder.', severity: 'error' });
      setStatus('idle');
    }
  };

  const loadHistory = async () => {
    try {
      const runs = await window.electronAPI.getRunHistory();
      const list = Array.isArray(runs) ? runs : [];
      const currentKey = String(path || '').trim().toLowerCase();
      const filtered = list.filter((run) => String(run?.dirPath || '').trim().toLowerCase() === currentKey);
      setHistory(filtered);
    } catch (e) {
      console.error(e);
    }
  };

  const normalizePlan = (rawPlan) => {
    if (!rawPlan || typeof rawPlan !== 'object') return null;
    const normalized = {};
    Object.keys(rawPlan).forEach((key) => {
      const cat = rawPlan[key] || {};
      const items = Array.isArray(cat.items)
        ? cat.items
        : Array.isArray(cat.files)
          ? cat.files
          : [];
      normalized[key] = {
        ...cat,
        items: items
          .map((item) => {
            if (typeof item === 'string') {
              return { name: item, type: 'file' };
            }
            if (!item || typeof item !== 'object') return null;
            const name = typeof item.name === 'string' ? item.name : '';
            if (!name) return null;
            const type = item.type === 'folder' ? 'folder' : 'file';
            return { ...item, name, type };
          })
          .filter(Boolean)
      };
    });
    return normalized;
  };

  const handleAnalyze = async () => {
    setStatus('analyzing');
    setAiStream('');
    setAnalysisProgress(8);
    setShowAiOutput(false);
    try {
      // Exclude hidden items from AI analysis — they should never be reorganized
      const visibleFiles = files.filter((f) => !f.hidden);
      let result = await window.electronAPI.analyzeFolder(path, visibleFiles, { categoryFolders });

      if (result.plan && result.debug) {
        result = result.plan;
      }

      // Check if the plan is empty (nothing to organize)
      if (!result || Object.keys(result).length === 0) {
        await finalizeAnalyzeProgress();
        setNotification({
          open: true,
          message: 'This folder is already well organized! No changes needed.',
          severity: 'info'
        });
        setStatus('idle');
        return;
      }

      const normalizedPlan = normalizePlan(result);
      if (!normalizedPlan) {
        throw new Error('Invalid plan returned by AI.');
      }

      // Check if there are actually items to move
      const totalItems = Object.values(normalizedPlan).reduce(
        (sum, cat) => sum + (cat.items?.length || 0), 0
      );

      if (totalItems === 0) {
        await finalizeAnalyzeProgress();
        setNotification({
          open: true,
          message: 'This folder is already well organized! No changes needed.',
          severity: 'info'
        });
        setStatus('idle');
        return;
      }

      await finalizeAnalyzeProgress();
      setPlan(normalizedPlan);
      setStatus('reviewing');
    } catch (error) {
      setNotification({ open: true, message: 'AI Analysis failed. Check API Key.', severity: 'error' });
      setStatus('idle');
    }
  };

  const validatePlan = (candidatePlan) => {
    const errors = [];
    if (!candidatePlan || typeof candidatePlan !== 'object') {
      errors.push('Plan is empty or invalid.');
      return errors;
    }

    const planCategories = Object.keys(candidatePlan);
    const platformSource = typeof navigator === 'undefined' ? '' : (navigator.platform || navigator.userAgent || '');
    const platform = platformSource.toLowerCase();
    const caseFold = platform.includes('win') || platform.includes('mac');
    const normalizeKey = (value) => {
      const trimmed = String(value || '').trim();
      return caseFold ? trimmed.toLowerCase() : trimmed;
    };
    const protectedSet = new Set([...(categoryFolders || []), ...planCategories].map(normalizeKey));

    const invalidName = (name) => {
      if (!name || typeof name !== 'string') return true;
      const trimmed = name.trim();
      if (trimmed.length === 0) return true;
      if (trimmed === '.' || trimmed === '..') return true;
      if (trimmed.includes('/') || trimmed.includes('\\')) return true;
      if (trimmed.includes('..')) return true;
      if (/[<>:"|?*]/.test(trimmed)) return true;
      return false;
    };

    const rootItemByName = new Map(files.map((f) => [normalizeKey(f.name), f]));
    const categoryKeys = new Set();

    for (const category of planCategories) {
      if (invalidName(category)) {
        errors.push(`Invalid category name "${category}".`);
      }
      const categoryKey = normalizeKey(category);
      if (categoryKeys.has(categoryKey)) {
        errors.push(`Duplicate category name detected: "${category}".`);
      }
      categoryKeys.add(categoryKey);
      const existing = rootItemByName.get(categoryKey);
      if (existing?.type === 'file') {
        errors.push(`Category "${category}" conflicts with an existing file of the same name.`);
      }
    }

    const seen = new Set();
    for (const [category, data] of Object.entries(candidatePlan)) {
      const items = data?.items || data?.files || [];
      for (const item of items) {
        const name = typeof item === 'string' ? item : item?.name;
        const type = typeof item === 'string' ? 'file' : item?.type;
        if (!name) {
          errors.push(`Category "${category}" contains an item without a name.`);
          continue;
        }
        if (invalidName(name)) {
          errors.push(`Category "${category}" contains an invalid item name "${name}".`);
          continue;
        }
        const nameKey = normalizeKey(name);
        const categoryKey = normalizeKey(category);
        if (nameKey === categoryKey) {
          errors.push(`Category "${category}" cannot include itself as an item.`);
          continue;
        }
        if (seen.has(nameKey)) {
          errors.push(`Item "${name}" appears in more than one category.`);
        }
        seen.add(nameKey);

        if (type === 'folder' && protectedSet.has(nameKey) && nameKey !== categoryKey) {
          errors.push(`Protected category folder "${name}" cannot be moved into "${category}".`);
        }
      }
    }

    return errors;
  };

  const retryAnalyze = async (retryReason, previousPlan) => {
    setPlanIssue({ open: false, title: '', message: '', details: [], retryContext: null });
    setAiStream('');
    setAnalysisProgress(8);
    setShowAiOutput(false);
    setStatus('analyzing');

    try {
      // Refresh pinned categories (they may have been updated by previous runs)
      const pinned = await window.electronAPI?.getCategoryFolders?.(path);
      const pinnedList = Array.isArray(pinned) ? pinned : categoryFolders;
      setCategoryFolders(pinnedList);

      let result = await window.electronAPI.analyzeFolder(path, files.filter((f) => !f.hidden), {
        categoryFolders: pinnedList,
        retryReason,
        previousPlan
      });

      if (result.plan && result.debug) {
        result = result.plan;
      }

      if (!result || Object.keys(result).length === 0) {
        await finalizeAnalyzeProgress();
        setNotification({
          open: true,
          message: 'AI returned an empty plan. Nothing to organize.',
          severity: 'info'
        });
        setStatus('idle');
        return;
      }

      const normalizedPlan = normalizePlan(result);
      if (!normalizedPlan) {
        throw new Error('Invalid plan returned by AI.');
      }

      const totalItems = Object.values(normalizedPlan).reduce(
        (sum, cat) => sum + (cat.items?.length || 0), 0
      );

      if (totalItems === 0) {
        await finalizeAnalyzeProgress();
        setNotification({
          open: true,
          message: 'This folder is already well organized! No changes needed.',
          severity: 'info'
        });
        setStatus('idle');
        return;
      }

      await finalizeAnalyzeProgress();
      setPlan(normalizedPlan);
      setStatus('reviewing');
    } catch (e) {
      setNotification({ open: true, message: 'AI retry failed. Check settings / API key.', severity: 'error' });
      setStatus('idle');
    }
  };

  const handleApply = async () => {
    try {
      const planValidationErrors = validatePlan(plan);
      if (planValidationErrors.length > 0) {
        setPlanIssue({
          open: true,
          title: 'Plan Validation Failed',
          message: 'This plan would create unsafe or invalid moves. You can cancel and edit the plan, or ask the AI to retry with these errors.',
          details: planValidationErrors,
          retryContext: { retryReason: planValidationErrors.join('\n'), previousPlan: plan }
        });
        setStatus('reviewing');
        return;
      }

      setStatus('executing');

      // Calculate stats before applying
      const categories = Object.keys(plan);
      const itemsByCategory = {};
      let totalFiles = 0;
      let totalFolders = 0;
      let totalBytes = 0;

      const platformSource = typeof navigator === 'undefined' ? '' : (navigator.platform || navigator.userAgent || '');
      const platform = platformSource.toLowerCase();
      const caseFold = platform.includes('win') || platform.includes('mac');
      const normalizeKey = (value) => {
        const trimmed = String(value || '').trim();
        return caseFold ? trimmed.toLowerCase() : trimmed;
      };
      const rootItemByName = new Map(files.map((f) => [normalizeKey(f.name), f]));

      categories.forEach(cat => {
        const items = plan[cat].items || [];
        itemsByCategory[cat] = items.length;
        items.forEach(item => {
          if (item.type === 'folder') totalFolders++;
          else {
            totalFiles++;
            const nameKey = normalizeKey(item.name);
            const actualFile = rootItemByName.get(nameKey);
            totalBytes += (actualFile?.size || item.stats?.size || item.size || 0);
          }
        });
      });

      // Find top category
      const topCategoryName = Object.entries(itemsByCategory).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

      const totalPlanned = categories.reduce((sum, cat) => sum + (plan[cat].items?.length || 0), 0);
      setExecuteProgress({ total: totalPlanned, processed: 0, moved: 0, current: null });

      const execResult = await window.electronAPI.executeOrganization(path, plan);

      if (!execResult || execResult.ok !== true) {
        const fatal = execResult?.fatalError;
        const fatalMsg = fatal?.message || execResult?.fatalError || 'Unknown error';
        const detailLines = [];
        if (fatal?.code) detailLines.push(`code: ${fatal.code}`);
        if (fatal?.category) detailLines.push(`category: ${fatal.category}`);
        if (fatal?.name) detailLines.push(`item: ${fatal.name}`);
        detailLines.push(fatalMsg);

        setPlanIssue({
          open: true,
          title: 'Move Failed (Changes Reverted)',
          message: 'A file move could not be executed, so changes were rolled back. You can cancel and edit the plan, or ask the AI to retry using this error.',
          details: detailLines,
          retryContext: { retryReason: detailLines.join('\n'), previousPlan: plan }
        });
        setStatus('reviewing');
        return;
      }

      setLastRunId(execResult?.runId || null);

      if (Array.isArray(execResult.warnings) && execResult.warnings.length > 0) {
        setNotification({
          open: true,
          message: `Completed with ${execResult.warnings.length} note(s) (some items may have been renamed or skipped).`,
          severity: 'info'
        });
      }

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

  const formatRunTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown time';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return 'Unknown time';
    }
  };

  const formatRunFolder = (dirPath) => {
    if (!dirPath) return 'Unknown folder';
    const parts = String(dirPath).split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || dirPath;
  };

  const handleRevertRun = async (runId) => {
    if (!runId) return;
    const previousStatus = status;
    setStatus('reverting');
    try {
      const result = await window.electronAPI.revertRun(runId);
      if (!result || result.ok !== true) {
        setNotification({
          open: true,
          message: result?.error || 'Revert failed.',
          severity: 'error'
        });
        setStatus(previousStatus === 'reverting' ? 'idle' : previousStatus);
        return;
      }

      const warningsCount = Array.isArray(result.warnings) ? result.warnings.length : 0;
      setNotification({
        open: true,
        message: warningsCount > 0
          ? `Revert complete with ${warningsCount} warning(s).`
          : 'Revert complete.',
        severity: warningsCount > 0 ? 'info' : 'success'
      });

      setPlan(null);
      setCompletionStats(null);
      setExecuteProgress({ total: 0, processed: 0, moved: 0, current: null });

      await scanFolder();
      await loadHistory();
      setStatus('idle');
    } catch (err) {
      setNotification({ open: true, message: 'Revert failed.', severity: 'error' });
      setStatus(previousStatus === 'reverting' ? 'idle' : previousStatus);
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
  const lastRun = history.find((run) => run?.id === lastRunId) || null;
  const moveRecapItems = (() => {
    const fromRun = Array.isArray(lastRun?.moves)
      ? lastRun.moves
        .map((rec, index) => {
          const toPath = String(rec?.to || '');
          const parts = toPath.split(/[\\/]/).filter(Boolean);
          const name = parts[parts.length - 1] || '';
          const category = parts[parts.length - 2] || 'Unknown';
          if (!name) return null;
          return { id: `run-${index}-${toPath}`, name, category };
        })
        .filter(Boolean)
      : [];

    if (fromRun.length > 0) {
      return fromRun.reverse();
    }

    if (!plan || typeof plan !== 'object') return [];
    const fromPlan = [];
    Object.entries(plan).forEach(([category, data]) => {
      const items = Array.isArray(data?.items) ? data.items : [];
      items.forEach((item, index) => {
        const name = typeof item === 'string' ? item : item?.name;
        if (!name) return;
        fromPlan.push({ id: `plan-${category}-${index}-${name}`, name, category });
      });
    });
    return fromPlan;
  })();
  const displayedMoveRecap = moveRecapItems.slice(0, 60);
  const remainingMoveRecap = Math.max(0, moveRecapItems.length - displayedMoveRecap.length);
  const isBusy = status === 'executing' || status === 'reverting' || status === 'analyzing' || status === 'scanning';
  const streamProgress = Math.min(92, Math.round((aiStream.length / 8000) * 92));
  const analyzeProgress = status === 'analyzing'
    ? Math.max(analysisProgress, streamProgress)
    : analysisProgress;

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
                disabled={isBusy}
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
                <DashboardCard
                  color={theme.palette.secondary.main}
                  sx={{
                    width: '100%',
                    maxWidth: 640,
                    height: 'auto',
                    minHeight: 400,
                    display: 'flex',
                    flexDirection: 'column',
                    border: 'none',
                    boxShadow: 'none',
                    bgcolor: 'transparent',
                    '&:hover': {
                      borderColor: 'transparent',
                      boxShadow: 'none',
                      cursor: 'default'
                    }
                  }}
                >
                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, py: 6 }}>
                    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                      {/* Pulping Effect */}
                      <Box sx={{
                        position: 'absolute', inset: -24, borderRadius: '50%',
                        bgcolor: theme.palette.secondary.main + '20',
                        animation: 'pulse 2s infinite'
                      }} />
                      <CircularProgress
                        size={90}
                        thickness={3}
                        variant="indeterminate"
                        sx={{ color: 'secondary.main' }}
                      />
                      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <AutoAwesomeIcon sx={{ fontSize: 36, color: 'secondary.main' }} />
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'center', width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <Typography variant="h4" fontWeight={800} gutterBottom>Analyzing Files</Typography>
                      <Typography variant="body1" color="text.secondary" paragraph sx={{ fontSize: '1.1rem' }}>
                        AI is determining the optimal structure based on file types, names, and content.
                      </Typography>
                      <Box sx={{ mt: 2.5, width: '100%', maxWidth: 420, mx: 'auto' }}>
                        <LinearProgress
                          variant="determinate"
                          value={analyzeProgress}
                          sx={{
                            height: 10,
                            borderRadius: 6,
                            bgcolor: 'action.hover',
                            '& .MuiLinearProgress-bar': {
                              bgcolor: 'secondary.main'
                            }
                          }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                          {analyzeProgress}% complete
                        </Typography>
                      </Box>
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
                  <Box sx={{ mt: 2 }}>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<AutoAwesomeIcon />}
                      onClick={() => setShowAiOutput((prev) => !prev)}
                      sx={{ borderRadius: 3, textTransform: 'none', fontWeight: 600 }}
                    >
                      {showAiOutput ? 'Hide AI Output' : 'Show AI Output'}
                    </Button>
                    {showAiOutput && (
                      <Paper elevation={0} sx={{
                        mt: 2,
                        bgcolor: 'background.surfaceContainer',
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 3,
                        p: 2,
                        maxHeight: 220,
                        overflow: 'auto'
                      }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: 'block', mb: 1 }}>
                          AI output
                        </Typography>
                        {aiStream.trim().length > 0 ? (
                          <Typography
                            component="pre"
                            variant="caption"
                            sx={{
                              m: 0,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                              fontSize: '0.75rem',
                              lineHeight: 1.4,
                              color: 'text.primary',
                              opacity: 0.9
                            }}
                          >
                            {aiStream}
                          </Typography>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            No AI output captured for this run.
                          </Typography>
                        )}
                      </Paper>
                    )}
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
                      <Box sx={{ mt: 3, width: '100%', maxWidth: 420 }}>
                        <LinearProgress
                          variant={executeProgress.total > 0 ? 'determinate' : 'indeterminate'}
                          value={executeProgress.total > 0 ? (executeProgress.processed / executeProgress.total) * 100 : 0}
                          sx={{
                            height: 8,
                            borderRadius: 4,
                            bgcolor: 'action.hover',
                            '& .MuiLinearProgress-bar': { bgcolor: 'success.main' }
                          }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                          {executeProgress.moved} moved / {executeProgress.total} planned
                        </Typography>
                        {executeProgress.current?.name && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, opacity: 0.75 }}>
                            Current: {truncateMiddle(executeProgress.current.name, 40, 16, 16)}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </Box>
                </DashboardCard>
              </Box>
            </Fade>
          )}

          {/* Reverting State */}
          {status === 'reverting' && (
            <Fade in={true} timeout={500}>
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', pb: 8 }}>
                <DashboardCard color={theme.palette.warning.main} sx={{ width: '100%', maxWidth: 600, height: 'auto', minHeight: 360, display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, py: 6 }}>
                    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                      <Box sx={{
                        position: 'absolute', inset: -16, borderRadius: '50%',
                        bgcolor: theme.palette.warning.main + '20',
                        animation: 'pulse 1.5s infinite'
                      }} />
                      <CircularProgress size={80} thickness={3} sx={{ color: 'warning.main' }} />
                      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <RefreshIcon sx={{ fontSize: 32, color: 'warning.main' }} />
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h5" fontWeight={700} gutterBottom>Reverting Changes</Typography>
                      <Typography variant="body1" color="text.secondary">
                        Restoring files from the last run...
                      </Typography>
                      <Box sx={{ mt: 3, width: '100%', maxWidth: 420 }}>
                        <LinearProgress
                          variant="indeterminate"
                          sx={{
                            height: 8,
                            borderRadius: 4,
                            bgcolor: 'action.hover',
                            '& .MuiLinearProgress-bar': { bgcolor: 'warning.main' }
                          }}
                        />
                      </Box>
                    </Box>
                  </Box>
                </DashboardCard>
              </Box>
            </Fade>
          )}

          {/* Complete State - Dashboard Grid */}
          {status === 'complete' && completionStats && (
            <Fade in={true} timeout={500}>
              <Box sx={{
                height: '100%',
                display: 'grid',
                overflow: 'auto',
                gap: { xs: 2, md: 2.5 },
                gridTemplateColumns: {
                  xs: 'minmax(0, 1fr)',
                  sm: 'minmax(0, 1fr) minmax(0, 1fr)',
                  lg: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
                },
                gridTemplateRows: {
                  xs: 'auto',
                  lg: 'auto auto minmax(0, 1fr)',
                },
                gridTemplateAreas: {
                  xs: `
                    "hero"
                    "statCategories"
                    "statFiles"
                    "statFolders"
                    "breakdown"
                    "actions"
                  `,
                  sm: `
                    "hero hero"
                    "statCategories statFiles"
                    "statFolders statFolders"
                    "breakdown breakdown"
                    "actions actions"
                  `,
                  lg: `
                    "hero hero hero"
                    "statCategories statFiles statFolders"
                    "breakdown breakdown actions"
                  `,
                },
                alignContent: 'start',
                '& > *': { minWidth: 0, minHeight: 0 },
              }}>

                {/* Header Banner */}
                <DashboardCard
                  color={theme.palette.success.main}
                  sx={{ gridArea: 'hero', minHeight: { xs: 110, md: 96 } }}
                >
                  <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2.5,
                    flexWrap: 'wrap',
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, minWidth: 0 }}>
                      <Box sx={{
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        bgcolor: 'success.light',
                        color: 'success.dark',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <CheckCircleIcon sx={{ fontSize: 32 }} />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="h5" fontWeight={800} gutterBottom sx={{ lineHeight: 1.1 }}>
                          Organization complete
                        </Typography>
                        <Typography variant="body2" color="text.secondary" fontWeight={500}>
                          Successfully processed {completionStats.totalItems} items.
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{
                      display: 'flex',
                      gap: 1,
                      flexWrap: 'wrap',
                      justifyContent: { xs: 'flex-start', sm: 'flex-end' },
                      flex: 1,
                    }}>
                      <Chip
                        size="small"
                        label={`${completionStats.totalItems} items`}
                        sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', fontWeight: 700 }}
                      />
                      <Chip
                        size="small"
                        label={`${formatBytes(completionStats.totalBytes)} processed`}
                        sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', fontWeight: 700 }}
                      />
                      <Chip
                        size="small"
                        label={`${completionStats.categoriesCreated} categories`}
                        sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', fontWeight: 700 }}
                      />
                    </Box>
                  </Box>
                </DashboardCard>

                {/* Stat Cards */}
                <DashboardCard
                  title="Categories"
                  icon={<FolderIcon />}
                  color={theme.palette.primary.main}
                  sx={{ gridArea: 'statCategories', minHeight: 160 }}
                >
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

                <DashboardCard
                  title="Files Moved"
                  icon={<InsertDriveFileIcon />}
                  color={theme.palette.secondary.main}
                  sx={{ gridArea: 'statFiles', minHeight: 160 }}
                >
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

                <DashboardCard
                  title="Folders Moved"
                  icon={<FolderOpenIcon />}
                  color={theme.palette.warning.main}
                  sx={{ gridArea: 'statFolders', minHeight: 160 }}
                >
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

                {/* Details */}
                <DashboardCard
                  title="Breakdown"
                  icon={<TipsAndUpdatesIcon />}
                  color={theme.palette.info.main}
                  sx={{
                    gridArea: 'breakdown',
                    minHeight: { xs: 240, lg: 0 },
                    height: { lg: '100%' },
                  }}
                >
                  <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>
                      Recollection of moved items
                    </Typography>
                    <Box sx={{
                      flex: 1,
                      mt: 1.5,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                      overflow: 'auto',
                      pr: 0.5,
                    }}>
                      {displayedMoveRecap.length > 0 ? displayedMoveRecap.map((entry) => (
                        <Box
                          key={entry.id}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1,
                            p: 1,
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                            bgcolor: 'background.paper',
                            minWidth: 0,
                          }}
                        >
                          <Typography variant="body2" fontWeight={600} sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {truncateMiddle(entry.name, 44, 18, 18)}
                          </Typography>
                          <Chip
                            size="small"
                            label={entry.category}
                            variant="outlined"
                            sx={{ flexShrink: 0, borderColor: 'divider' }}
                          />
                        </Box>
                      )) : (
                        <Typography variant="caption" color="text.secondary">
                          No moved-item details available.
                        </Typography>
                      )}
                      {remainingMoveRecap > 0 && (
                        <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.8 }}>
                          +{remainingMoveRecap} more moved items
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </DashboardCard>

                {/* Actions */}
                <DashboardCard
                  title="Next steps"
                  icon={<CheckCircleIcon />}
                  color={theme.palette.success.main}
                  sx={{
                    gridArea: 'actions',
                    minHeight: { xs: 220, lg: 0 },
                    height: { lg: '100%' },
                  }}
                >
                  <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>
                      Review your results, or undo this run if something looks off.
                    </Typography>

                    {lastRunId && (
                      <Button
                        variant="outlined"
                        fullWidth
                        startIcon={<RefreshIcon />}
                        onClick={() => handleRevertRun(lastRunId)}
                        disabled={!lastRunId || lastRun?.revertedAt || isBusy}
                        sx={{ borderRadius: 4, border: '1px solid', borderColor: 'divider', py: 1.5 }}
                      >
                        {lastRun?.revertedAt ? 'Already Reverted' : 'Revert Last Run'}
                      </Button>
                    )}

                    <Button
                      variant="outlined"
                      fullWidth
                      startIcon={<HistoryIcon />}
                      onClick={() => setIsHistoryOpen(true)}
                      sx={{ borderRadius: 4, border: '1px solid', borderColor: 'divider', py: 1.5 }}
                    >
                      History
                    </Button>

                    <Button
                      variant="contained"
                      fullWidth
                      onClick={onBack}
                      sx={{
                        mt: 'auto',
                        borderRadius: 4,
                        bgcolor: 'primary.main',
                        fontSize: '1.05rem',
                        fontWeight: 800,
                        py: 1.7,
                      }}
                    >
                      Back to Home
                    </Button>
                  </Box>
                </DashboardCard>
              </Box>
            </Fade>
          )}

          {/* Plan Validation / Execution Errors */}
          <Dialog
            open={planIssue.open}
            onClose={() => setPlanIssue({ open: false, title: '', message: '', details: [], retryContext: null })}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle sx={{ fontWeight: 800 }}>{planIssue.title || 'Issue'}</DialogTitle>
            <DialogContent dividers>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {planIssue.message}
              </Typography>
              {Array.isArray(planIssue.details) && planIssue.details.length > 0 && (
                <Box sx={{
                  bgcolor: 'background.surfaceContainer',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  p: 2
                }}>
                  {planIssue.details.slice(0, 8).map((line, idx) => (
                    <Typography key={idx} variant="caption" sx={{ display: 'block', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace' }}>
                      {line}
                    </Typography>
                  ))}
                  {planIssue.details.length > 8 && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                      +{planIssue.details.length - 8} more
                    </Typography>
                  )}
                </Box>
              )}
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button
                onClick={() => setPlanIssue({ open: false, title: '', message: '', details: [], retryContext: null })}
                color="inherit"
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  const ctx = planIssue.retryContext;
                  retryAnalyze(ctx?.retryReason || 'Unknown issue', ctx?.previousPlan || plan);
                }}
                disabled={!planIssue.retryContext}
                sx={{ fontWeight: 800 }}
              >
                Retry With AI
              </Button>
            </DialogActions>
          </Dialog>

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
                <Typography variant="h6">Recent Runs</Typography>
                <IconButton onClick={() => setIsHistoryOpen(false)} size="small">
                  <CloseIcon />
                </IconButton>
              </Box>
              <Divider sx={{ mb: 2 }} />

              {history.length > 0 ? (
                <List disablePadding>
                  {history.slice(0, 20).map((run, index) => (
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
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <HistoryIcon fontSize="small" color="action" />
                        </ListItemIcon>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {formatRunFolder(run?.dirPath)} • {formatRunTimestamp(run?.timestamp)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {(run?.moved ?? run?.moves?.length ?? 0)} items • {(run?.categories?.length ?? 0)} categories
                            {run?.warnings ? ` • ${run.warnings} warnings` : ''}
                          </Typography>
                        </Box>
                        {run?.revertedAt ? (
                          <Chip label="Reverted" size="small" color="default" />
                        ) : (
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => handleRevertRun(run?.id)}
                            disabled={!run?.id || isBusy}
                            sx={{ borderRadius: 3 }}
                          >
                            Revert
                          </Button>
                        )}
                      </Box>
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
                  <Typography variant="body2">No runs yet</Typography>
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
            color: color || 'text.primary'
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
