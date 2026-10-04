import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Divider, IconButton, InputAdornment,
  LinearProgress, List, ListItem, TextField, Typography, useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import FileIcon from './FileIcon';
import { corner, motion } from '../../theme/tokens';

const API = () => (typeof window !== 'undefined' ? window.electronAPI : null);
let requestSequence = 0;

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count || 0} ${count === 1 ? singular : pluralForm}`;
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; }
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
}

function coverageMessage(stats) {
  const parts = [
    `Searched names in ${plural(stats?.scannedFiles || 0, 'file')}`,
    `and text in ${plural(stats?.searchedContentFiles || 0, 'readable document')}.`,
  ];
  if (stats?.fileLimitReached) parts.push(`The scan stopped at ${stats.maxFiles.toLocaleString()} files.`);
  if (stats?.directoryLimitReached) parts.push(`The scan stopped at ${stats.maxDirectories.toLocaleString()} folders.`);
  if (stats?.depthLimitReached) parts.push(`Folders deeper than ${stats.maxDepth || 32} levels were skipped.`);
  if (stats?.extractionLimited) parts.push(`${plural(stats.extractionLimited, 'document')} could not be searched within the text budget.`);
  if (stats?.unreadableFiles) parts.push(`${plural(stats.unreadableFiles, 'document')} could not be read.`);
  if (stats?.limitedPdfFiles) parts.push('PDF text covers the first two pages only.');
  if (stats?.limitedTextFiles) parts.push('Long text files were read only up to the local size limit.');
  if ((stats?.skippedFiles || 0) + (stats?.skippedDirectories || 0) > 0) {
    parts.push('Hidden, generated, linked, and unreadable paths may be excluded.');
  } else {
    parts.push('Hidden, generated, and linked paths are excluded.');
  }
  if (stats?.resultsTruncated) parts.push('More matches exist than are shown here.');
  return parts.join(' ');
}

function HighlightedSnippet({ text, query, colors }) {
  const terms = String(query).trim().split(/\s+/).filter(Boolean).slice(0, 16);
  if (!terms.length) return text;
  const pattern = new RegExp(`(${terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return String(text).split(pattern).map((part, index) => index % 2 ? <Box component="mark" key={index} sx={{ bgcolor: colors.primaryContainer, color: colors.onPrimaryContainer, borderRadius: corner.xs, px: 0.25 }}>{part}</Box> : part);
}

export default function SearchPanel({ rootPath: rootPathProp, path: selectedPath, openPath, showItemInFolder, onCancel, onBusyChange }) {
  const rootPath = rootPathProp || selectedPath || '';
  const { palette } = useTheme();
  const c = palette.m3;
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState(null);
  const [skipped, setSkipped] = useState([]);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const [actionError, setActionError] = useState('');
  const mounted = useRef(false);
  const activeRequest = useRef(null);
  const activeRoot = useRef(rootPath);

  useEffect(() => {
    mounted.current = true;
    const api = API();
    let unsubscribe;
    if (typeof api?.onDocumentSearchProgress === 'function') {
      const result = api.onDocumentSearchProgress((event) => {
        if (!mounted.current || event?.requestId !== activeRequest.current) return;
        setProgress(event);
      });
      if (typeof result === 'function') unsubscribe = result;
      else if (typeof result?.unsubscribe === 'function') unsubscribe = () => result.unsubscribe();
    }
    return () => {
      mounted.current = false;
      const requestId = activeRequest.current;
      activeRequest.current = null;
      if (typeof api?.cancelDocumentSearch === 'function') {
        Promise.resolve(api.cancelDocumentSearch(requestId)).catch(() => {});
      }
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    onBusyChange?.(loading);
    return () => { if (loading) onBusyChange?.(false); };
  }, [loading, onBusyChange]);

  useEffect(() => {
    if (activeRoot.current === rootPath) return;
    activeRoot.current = rootPath;
    const api = API();
    const requestId = activeRequest.current;
    activeRequest.current = null;
    if (requestId !== null && typeof api?.cancelDocumentSearch === 'function') {
      Promise.resolve(api.cancelDocumentSearch(requestId)).catch(() => {});
    }
    setLoading(false);
    setProgress(null);
    setResults([]);
    setStats(null);
    setSkipped([]);
    setError('');
    setCancelled(false);
    setSubmittedQuery('');
  }, [rootPath]);

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    const trimmed = query.trim();
    if (!trimmed || !rootPath) return;
    const api = API();
    if (typeof api?.searchDocuments !== 'function') {
      setError('Local search is unavailable in this build.');
      return;
    }
    const previous = activeRequest.current;
    if (previous !== null && typeof api.cancelDocumentSearch === 'function') {
      Promise.resolve(api.cancelDocumentSearch(previous)).catch(() => {});
    }
    const requestId = ++requestSequence;
    activeRequest.current = requestId;
    setSubmittedQuery(trimmed);
    setLoading(true);
    setCancelled(false);
    setError('');
    setActionError('');
    setStats(null);
    setSkipped([]);
    setResults([]);
    setProgress({ requestId, phase: 'scan', scannedFiles: 0, searchedContentFiles: 0 });
    try {
      const result = await api.searchDocuments(rootPath, trimmed, requestId);
      if (!mounted.current || activeRequest.current !== requestId) return;
      setResults(Array.isArray(result?.results) ? result.results : []);
      setStats(result?.stats || null);
      setSkipped(Array.isArray(result?.skipped) ? result.skipped : []);
    } catch (searchError) {
      if (!mounted.current || activeRequest.current !== requestId) return;
      if (searchError?.name === 'AbortError' || searchError?.code === 'ABORT_ERR') setCancelled(true);
      else setError(searchError?.message || 'The folder could not be searched. Try again.');
    } finally {
      if (mounted.current && activeRequest.current === requestId) {
        activeRequest.current = null;
        setLoading(false);
        setProgress(null);
      }
    }
  };

  const cancelSearch = () => {
    const api = API();
    const requestId = activeRequest.current;
    if (requestId === null) return;
    activeRequest.current = null;
    if (typeof api?.cancelDocumentSearch === 'function') {
      Promise.resolve(api.cancelDocumentSearch(requestId)).catch(() => {});
    }
    setLoading(false);
    setProgress(null);
    setCancelled(true);
  };

  const leavePanel = () => {
    if (activeRequest.current !== null) cancelSearch();
    onCancel?.();
  };

  const openResult = async (method, targetPath) => {
    setActionError('');
    const api = API();
    try {
      const action = method === 'open' ? (openPath || api?.openPath) : (showItemInFolder || api?.showItemInFolder);
      if (typeof action !== 'function') throw new Error(method === 'open' ? 'Opening files is unavailable.' : 'Showing files in the folder is unavailable.');
      await action(targetPath);
    } catch (actionFailure) {
      setActionError(actionFailure?.message || 'That file could not be opened.');
    }
  };

  const canSearch = Boolean(rootPath && query.trim() && !loading);
  const progressTotal = Number(progress?.totalFiles) || 0;
  const progressValue = progressTotal > 0 ? Math.min(100, ((Number(progress.searchedContentFiles) || 0) / progressTotal) * 100) : null;

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', color: c.onSurface }}>
      <Box component="form" onSubmit={handleSubmit} sx={{ mb: 1.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography component="label" htmlFor="folder-document-search" variant="titleLarge" sx={{ flex: 1 }}>
            Search this folder
          </Typography>
          {typeof onCancel === 'function' && (
            <Button type="button" color="inherit" onClick={leavePanel} sx={{ minHeight: 48, borderRadius: corner.md, flexShrink: 0 }}>
              Back to folder
            </Button>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 1, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
          <TextField
            id="folder-document-search"
            fullWidth
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="A filename or words in a document"
            inputProps={{ maxLength: 256, 'aria-describedby': 'folder-search-guidance' }}
            disabled={!rootPath || loading}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon aria-hidden="true" /></InputAdornment>,
              endAdornment: query ? <InputAdornment position="end">
                <IconButton aria-label="Clear search" onClick={() => { setQuery(''); setSubmittedQuery(''); setResults([]); setStats(null); setSkipped([]); setError(''); }} edge="end" disabled={loading} sx={{ minWidth: 48, minHeight: 48 }}>
                  <CloseIcon />
                </IconButton>
              </InputAdornment> : null,
            }}
            sx={{
              minWidth: 0,
              '& .MuiOutlinedInput-root': {
                minHeight: 56,
                borderRadius: corner.full,
                bgcolor: c.surfaceContainerHigh,
                '& fieldset': { borderColor: 'transparent' },
                '&:hover fieldset': { borderColor: c.outlineVariant },
                '&.Mui-focused fieldset': { borderColor: c.primary, borderWidth: 2 },
              },
            }}
          />
          {loading ? (
            <Button type="button" variant="outlined" onClick={cancelSearch} sx={{ minWidth: 112, minHeight: 56, borderRadius: corner.full, flexShrink: 0 }}>
              Cancel
            </Button>
          ) : (
            <Button type="submit" variant="contained" startIcon={<SearchIcon />} disabled={!canSearch} sx={{ minWidth: 112, minHeight: 56, borderRadius: corner.full, flexShrink: 0, transition: motion.effects(['background-color', 'color', 'opacity']) }}>
              Search
            </Button>
          )}
        </Box>
        <Typography id="folder-search-guidance" variant="bodySmall" sx={{ mt: 0.75, color: c.onSurfaceVariant }}>
          Searches names and supported text files on this device. Hidden, generated, and linked paths are skipped.
        </Typography>
      </Box>

      {loading && (
        <Box role="status" aria-live="polite" sx={{ mb: 1.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
            <CircularProgress size={16} aria-hidden="true" />
            <Typography variant="bodyMedium">
              {progress?.phase === 'search' ? `Searching ${progress.searchedContentFiles || 0} readable documents` : `Scanning ${progress?.scannedFiles || 0} files`}
            </Typography>
          </Box>
          <LinearProgress variant={progressValue === null ? 'indeterminate' : 'determinate'} value={progressValue ?? undefined} sx={{ borderRadius: corner.full, height: 3 }} />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 1.25, overflowWrap: 'anywhere' }}>{error}</Alert>}
      {actionError && <Alert severity="error" sx={{ mb: 1.25, overflowWrap: 'anywhere' }}>{actionError}</Alert>}
      {cancelled && <Typography role="status" variant="bodyMedium" sx={{ mb: 1.25, color: c.onSurfaceVariant }}>Search cancelled. Enter a phrase to search again.</Typography>}
      {!rootPath && <Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant }}>Choose a folder to search its files.</Typography>}

      {stats && (
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <Typography variant="titleSmall" aria-live="polite" sx={{ mb: 0.25 }}>
            {stats.matchedFiles > results.length
              ? `Showing ${results.length} of ${stats.matchedFiles} matches`
              : `${plural(results.length, 'match', 'matches')} for “${submittedQuery}”`}
          </Typography>
          <Typography variant="bodySmall" sx={{ color: c.onSurfaceVariant, mb: 1.25 }}>
            {coverageMessage(stats)}
          </Typography>
          {skipped.length > 0 && stats.unreadableFiles > 0 && (
            <Box component="details" sx={{ mb: 1.25, color: c.onSurfaceVariant, '& summary': { cursor: 'pointer', minHeight: 48, display: 'flex', alignItems: 'center' } }}>
              <summary>Why some documents were skipped</summary>
              <Box component="ul" sx={{ mt: 0.25, mb: 0, pl: 3, maxHeight: 100, overflowY: 'auto' }}>
                {skipped.filter((item) => item.kind === 'file').slice(0, 8).map((item, index) => (
                  <Typography component="li" variant="bodySmall" key={`${item.name}-${index}`} sx={{ overflowWrap: 'anywhere' }}>
                    {item.name}: {item.reason}
                  </Typography>
                ))}
              </Box>
            </Box>
          )}
          {results.length === 0 ? (
            <Box sx={{ py: 2 }}>
              <Typography variant="bodyLarge" sx={{ color: c.onSurfaceVariant }}>
                {stats.guidance || 'No matches found. Try a shorter phrase or another word.'}
              </Typography>
            </Box>
          ) : (
            <List aria-label="Search results" disablePadding sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pb: 1 }}>
              {results.map((result, index) => (
                <React.Fragment key={`${result.path}-${result.identity}`}>
                  <ListItem disableGutters sx={{ alignItems: 'center', gap: 1, py: 0.75 }}>
                    <FileIcon item={{ name: result.name, type: 'file' }} size={36} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="titleMedium" title={result.name} sx={{ overflowWrap: 'anywhere' }}>{result.name}</Typography>
                      <Typography variant="bodySmall" title={result.relativePath} sx={{ color: c.onSurfaceVariant, overflowWrap: 'anywhere' }}>
                        {result.relativePath === result.name ? 'This folder' : result.relativePath} · {formatBytes(result.size)} · {result.matchIn === 'name' ? 'Name' : 'Content'} match
                      </Typography>
                      {result.matchIn === 'content' && result.snippet && (
                        <Typography variant="bodyMedium" sx={{ display: '-webkit-box', WebkitLineClamp: { xs: 4, sm: 3 }, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: c.onSurfaceVariant, mt: 0.5 }}>
                          <HighlightedSnippet text={result.snippet} query={submittedQuery} colors={c} />
                        </Typography>
                      )}
                    </Box>
                    <IconButton aria-label={`Open ${result.name}`} title="Open" onClick={() => openResult('open', result.path)} sx={{ minWidth: 48, minHeight: 48, color: c.primary, flexShrink: 0 }}>
                      <OpenInNewIcon />
                    </IconButton>
                    <IconButton aria-label={`Show ${result.name} in folder`} title="Show in folder" onClick={() => openResult('show', result.path)} sx={{ minWidth: 48, minHeight: 48, color: c.onSurfaceVariant, flexShrink: 0 }}>
                      <FolderOpenOutlinedIcon />
                    </IconButton>
                  </ListItem>
                  {index < results.length - 1 && <Divider component="li" sx={{ borderColor: c.outlineVariant }} />}
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>
      )}

      {!stats && !loading && !error && rootPath && !submittedQuery && (
        <Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant }}>
          Enter a word or phrase to search file names and readable document text.
        </Typography>
      )}
    </Box>
  );
}
