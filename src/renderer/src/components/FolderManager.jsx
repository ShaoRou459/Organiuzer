import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { AnimatePresence, motion as m } from 'framer-motion';
import UndoIcon from '@mui/icons-material/Undo';
import FolderHeader from './folder/FolderHeader';
import IdlePanel from './folder/IdlePanel';
import DedupePanel from './folder/DedupePanel';
import RenamePanel from './folder/RenamePanel';
import VersionsPanel from './folder/VersionsPanel';
import SearchPanel from './folder/SearchPanel';
import PresetPanel from './folder/PresetPanel';
import ProgressPanel from './folder/ProgressPanel';
import ReviewPanel from './folder/ReviewPanel';
import CompletePanel from './folder/CompletePanel';
import HistorySheet from './folder/HistorySheet';
import { PlanIssueDialog, ConfirmDialog } from './folder/Dialogs';
import { useSnackbar } from '../context/SnackbarContext';
import { springs } from '../theme/tokens';
import { normalizePlan, validatePlan, countPlanItems, prunePlan, summarizePlan } from '../utils/plan';
import { pluralize, normalizeKeyPath } from '../utils/format';
import { truncateMiddle } from '../utils/truncateMiddle';

const api = () => window.electronAPI;
const KNOWN_CATEGORY_NAMES = new Set([
  'images', 'pictures', 'photos', 'videos', 'audio', 'music', 'documents', 'docs',
  'archives', 'installers', 'downloads', 'projects', 'code_projects', 'misc', 'screenshots',
]);
const EMPTY_ISSUE = { open: false, title: '', message: '', details: [], retryContext: null };

export default function FolderManager({ path, onBack, onOpenSettings, hasAiConfig }) {
  const { notify } = useSnackbar();
  const [files, setFiles] = useState([]);
  const filesRef = useRef([]);
  // scanning | idle | deduping | renaming | analyzing | reviewing | executing | reverting | complete
  const [status, setStatus] = useState('scanning');
  const [plan, setPlan] = useState(null);
  const [planSource, setPlanSource] = useState('ai');
  const [documentBusy, setDocumentBusy] = useState(false);
  const [excluded, setExcluded] = useState([]);
  const [aiStream, setAiStream] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [executeProgress, setExecuteProgress] = useState({ total: 0, processed: 0, moved: 0, current: null });
  const [categoryFolders, setCategoryFolders] = useState([]);
  const [planIssue, setPlanIssue] = useState(EMPTY_ISSUE);
  const [runs, setRuns] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [completion, setCompletion] = useState(null);
  const [confirmUndo, setConfirmUndo] = useState(null);

  // Duplicates
  const [dedupeLoading, setDedupeLoading] = useState(false);
  const [dedupeBusy, setDedupeBusy] = useState(false);
  const [dedupeProgress, setDedupeProgress] = useState(null);
  const [dedupeStats, setDedupeStats] = useState(null);
  const [dedupeError, setDedupeError] = useState('');
  const [duplicates, setDuplicates] = useState([]);
  const [checkedDuplicates, setCheckedDuplicates] = useState({});
  const dedupeRequest = useRef(0);
  const dedupeActive = useRef(false);

  const [renameStage, setRenameStage] = useState('candidates');
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameCandidates, setRenameCandidates] = useState([]);
  const [renameSuggestions, setRenameSuggestions] = useState([]);
  const [renameChecked, setRenameChecked] = useState({});
  const [renameSkipped, setRenameSkipped] = useState([]);
  const [renameProgress, setRenameProgress] = useState(null);
  const [renameError, setRenameError] = useState('');
  const [renamePendingAi, setRenamePendingAi] = useState([]);
  const [renameAiChecked, setRenameAiChecked] = useState({});
  const [renameLocalOnly, setRenameLocalOnly] = useState(false);
  const [renameDestination, setRenameDestination] = useState({});
  const renameRequest = useRef(0);
  const renameActive = useRef(false);

  const mounted = useRef(true);
  useEffect(() => {
    // Re-arm on every mount (StrictMode mounts, unmounts, then mounts again in development).
    mounted.current = true;
    return () => {
      mounted.current = false;
      dedupeRequest.current++;
      if (dedupeActive.current) api()?.cancelFindDuplicates?.();
      renameRequest.current++;
      if (renameActive.current) api()?.cancelRenameSuggestions?.();
    };
  }, []);

  // ---------------------------------------------------------------- data

  const loadHistory = useCallback(async () => {
    try {
      const list = await api().getRunHistory();
      const key = normalizeKeyPath(path);
      setRuns((Array.isArray(list) ? list : []).filter((r) => normalizeKeyPath(r?.dirPath) === key));
    } catch (e) {
      console.error(e);
    }
  }, [path]);

  /** Reads the folder. `silent` keeps the current screen (used after moves/deletes). */
  const scanFolder = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setStatus('scanning');
    try {
      const result = await api().scanFolder(path);
      if (!mounted.current) return [];
      filesRef.current = result;
      setFiles(result);

      // Infer "pinned" category folders so the AI never nests or moves them.
      try {
        const existing = (await api().getCategoryFolders(path)) || [];
        const inferred = result
          .filter((it) => it.type === 'folder' && KNOWN_CATEGORY_NAMES.has(it.name.trim().toLowerCase().replace(/\s+/g, '_')))
          .filter((it) => !(it.context?.markers?.length) && (it.context?.fileCount || 0) > 0)
          .map((it) => it.name);
        const merged = Array.from(new Set([...existing, ...inferred]));
        const saved = merged.length !== existing.length ? await api().setCategoryFolders(path, merged) : existing;
        setCategoryFolders(Array.isArray(saved) ? saved : merged);
      } catch { }

      if (!silent) setStatus('idle');
      return result;
    } catch (error) {
      console.error(error);
      notify('Couldn’t read this folder. It may have been moved or you may not have access.');
      if (!silent) setStatus('idle');
      return [];
    }
  }, [path, notify]);

  useEffect(() => {
    scanFolder();
    loadHistory();
  }, [scanFolder, loadHistory]);

  useEffect(() => {
    const offStream = api()?.onAnalyzeStream?.((chunk) => {
      if (!chunk) return;
      setAiStream((prev) => {
        const next = prev + chunk;
        return next.length > 12000 ? next.slice(-12000) : next;
      });
    });
    const offProgress = api()?.onExecuteProgress?.((p) => p && setExecuteProgress((prev) => ({ ...prev, ...p })));
    const offDedupe = api()?.onDuplicateProgress?.((p) => {
      if (dedupeActive.current && p?.rootPath === path && p.requestId === dedupeRequest.current) setDedupeProgress(p);
    });
    const offRename = api()?.onRenameProgress?.((p) => {
      if (renameActive.current && p?.rootPath === path && p.requestId === renameRequest.current) setRenameProgress(p);
    });
    return () => {
      offStream?.();
      offProgress?.();
      offDedupe?.();
      offRename?.();
    };
  }, [path]);

  // Analysis has no real progress signal, so ease toward 95% and let streamed tokens push it along.
  useEffect(() => {
    if (status !== 'analyzing') return undefined;
    const timer = setInterval(() => {
      setAnalysisProgress((p) => (p >= 95 ? p : p + (p < 50 ? 3 : p < 80 ? 1.2 : 0.4)));
    }, 250);
    return () => clearInterval(timer);
  }, [status]);

  // ---------------------------------------------------------------- AI plan

  const runAnalysis = useCallback(async ({ retryReason, previousPlan } = {}) => {
    setPlanSource('ai');
    setPlanIssue(EMPTY_ISSUE);
    setAiStream('');
    setAnalysisProgress(6);
    setStatus('analyzing');

    let pinned = categoryFolders;
    try {
      const fresh = await api().getCategoryFolders(path);
      if (Array.isArray(fresh)) pinned = fresh;
    } catch { }

    const visible = filesRef.current.filter((f) => !f.hidden);
    const res = await api().analyzeFolder(path, visible, { categoryFolders: pinned, retryReason, previousPlan }).catch((e) => ({ ok: false, error: e?.message }));
    if (!mounted.current) return;

    if (res?.cancelled) {
      setStatus('idle');
      notify('Analysis canceled');
      return;
    }
    if (!res?.ok) {
      setStatus(previousPlan ? 'reviewing' : 'idle');
      const msg = res?.error || 'AI analysis failed.';
      const settingsRelated = /key|settings|model|base url|provider/i.test(msg);
      notify(msg, settingsRelated ? { action: { label: 'Settings', onClick: () => onOpenSettings('ai') } } : {});
      return;
    }

    const normalized = normalizePlan(res.plan);
    if (!normalized || countPlanItems(normalized) === 0) {
      setAnalysisProgress(100);
      setStatus('idle');
      notify('This folder already looks organized. Nothing to move.');
      return;
    }

    setAnalysisProgress(100);
    await new Promise((r) => setTimeout(r, 350));
    if (!mounted.current) return;
    setPlan(normalized);
    setExcluded([]);
    setStatus('reviewing');
  }, [categoryFolders, path, notify, onOpenSettings]);

  const cancelAnalysis = () => api().cancelAnalyze();

  // ---------------------------------------------------------------- apply / undo

  const handleApply = async () => {
    const toApply = prunePlan(plan);
    const errors = validatePlan(toApply, filesRef.current, categoryFolders);
    if (errors.length) {
      setPlanIssue({
        open: true,
        title: 'This plan needs a fix',
        message: planSource === 'preset' ? 'Some moves would be unsafe or invalid. Edit the plan or change the preset destinations.' : 'Some moves would be unsafe or invalid. Edit the plan, or ask the AI to fix these problems.',
        details: errors,
        retryContext: planSource === 'ai' ? { retryReason: errors.join('\n'), previousPlan: toApply } : null,
      });
      return;
    }

    const total = countPlanItems(toApply);
    setExecuteProgress({ total, processed: 0, moved: 0, current: null });
    setStatus('executing');

    let result;
    try {
      result = await api().executeOrganization(path, toApply);
    } catch (e) {
      result = { ok: false, fatalError: { message: e?.message || 'Unknown error' } };
    }
    if (!mounted.current) return;

    if (!result?.ok) {
      const fatal = result?.fatalError || {};
      setPlanIssue({
        open: true,
        title: 'Nothing was moved',
        message: planSource === 'preset' ? 'One move failed, so every change from this run was rolled back. Edit the plan or change the preset destinations.' : 'One move failed, so every change from this run was rolled back. Edit the plan, or ask the AI to work around it.',
        details: [fatal.message, fatal.name && `Item: ${fatal.name}`, fatal.category && `Folder: ${fatal.category}`, fatal.code && `Code: ${fatal.code}`].filter(Boolean),
        retryContext: planSource === 'ai' ? { retryReason: [fatal.message, fatal.code].filter(Boolean).join('\n'), previousPlan: toApply } : null,
      });
      setStatus('reviewing');
      return;
    }

    const run = result.run || { id: result.runId, moved: result.moved, moves: [] };
    setCompletion({ stats: summarizePlan(toApply, filesRef.current), run, warnings: result.warnings || [], reverted: false });
    setStatus('complete');
    setPlan(null);
    loadHistory();
    scanFolder({ silent: true });
    notify(`Moved ${pluralize(result.moved, 'item')}`, { action: { label: 'Undo', onClick: () => setConfirmUndo(run) } });
  };

  const doUndo = async (run) => {
    setConfirmUndo(null);
    if (!run?.id) return;
    const previous = status;
    setStatus('reverting');
    const res = await api().revertRun(run.id).catch((e) => ({ ok: false, error: e?.message }));
    if (!mounted.current) return;
    if (!res?.ok) {
      notify(res?.error || 'Undo failed.');
      setStatus(previous === 'reverting' ? 'idle' : previous);
      return;
    }
    const warnCount = res.warnings?.length || 0;
    notify(warnCount ? `Put back ${pluralize(res.reverted, 'item')}. ${pluralize(warnCount, 'item')} couldn’t be restored.` : `Put back ${pluralize(res.reverted, 'item')}`);
    await Promise.all([scanFolder({ silent: true }), loadHistory()]);
    if (completion?.run?.id === run.id) {
      setCompletion((cpl) => ({ ...cpl, reverted: true, warnings: res.warnings || [] }));
      setStatus('complete');
    } else {
      setStatus(previous === 'complete' ? 'complete' : 'idle');
    }
  };

  // ---------------------------------------------------------------- duplicates

  const startDedupe = async () => {
    if (dedupeActive.current) return;
    const request = ++dedupeRequest.current;
    dedupeActive.current = true;
    setDuplicates([]);
    setCheckedDuplicates({});
    setDedupeProgress(null);
    setDedupeStats(null);
    setDedupeError('');
    setDedupeLoading(true);
    setStatus('deduping');
    try {
      const result = await api().findDuplicates(path, true, request);
      if (!mounted.current || request !== dedupeRequest.current) return;
      if (result?.cancelled) { setStatus('idle'); return; }
      if (!result?.ok) throw new Error(result?.error || 'Couldn’t scan for duplicates.');
      const groups = result.groups || [];
      const initial = {};
      groups.forEach((g, gi) => g.files.forEach((f, fi) => { if (fi > 0) initial[`${gi}-${fi}`] = f; }));
      setDuplicates(groups);
      setCheckedDuplicates(initial);
      setDedupeStats(result.stats);
    } catch (error) {
      if (!mounted.current || request !== dedupeRequest.current) return;
      setDedupeError(error?.message || 'Couldn’t scan for duplicates.');
    } finally {
      if (mounted.current && request === dedupeRequest.current) {
        dedupeActive.current = false;
        setDedupeLoading(false);
      }
    }
  };

  const cancelDedupe = () => {
    dedupeRequest.current++;
    dedupeActive.current = false;
    api().cancelFindDuplicates?.();
    setDedupeLoading(false);
    setStatus('idle');
  };

  const toggleDuplicate = (gi, fi, file) => {
    const key = `${gi}-${fi}`;
    const group = duplicates[gi];
    setCheckedDuplicates((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
        return next;
      }
      // Always keep at least one copy of every file.
      const selectedInGroup = group.files.filter((_f, i) => next[`${gi}-${i}`]).length;
      if (selectedInGroup >= group.files.length - 1) {
        notify('One copy has to stay. Unselect another copy first.');
        return prev;
      }
      next[key] = file;
      return next;
    });
  };

  const confirmDedupe = async () => {
    const list = Object.values(checkedDuplicates);
    if (!list.length || dedupeBusy) return;
    setDedupeError('');
    setDedupeBusy(true);
    try {
      const res = await api().deleteFiles(path, list);
      if (!mounted.current) return;
      notify(res.failed
        ? `Recycled ${pluralize(res.success, 'copy', 'copies')}. ${res.failed} couldn’t be moved to the Recycle Bin.`
        : `Moved ${pluralize(res.success, 'copy', 'copies')} to the Recycle Bin`);
      await scanFolder({ silent: true });
      if (!mounted.current) return;
      if (res.failed) {
        const recycled = new Set(res.recycledPaths || []);
        const remaining = duplicates.map((group) => ({ ...group, files: group.files.filter((file) => !recycled.has(file)) })).filter((group) => group.files.length > 1);
        const failedChecked = {};
        remaining.forEach((group, gi) => group.files.forEach((file, fi) => { if (list.includes(file)) failedChecked[`${gi}-${fi}`] = file; }));
        setDuplicates(remaining);
        setCheckedDuplicates(failedChecked);
        const errors = res.errors || [];
        const moreErrors = res.failed - Math.min(3, errors.length);
        setDedupeError([`${pluralize(res.failed, 'copy', 'copies')} couldn’t be recycled.`, ...errors.slice(0, 3), moreErrors > 0 ? `${moreErrors} more errors. Scan again to refresh the results.` : ''].filter(Boolean).join('\n'));
      } else setStatus('idle');
    } catch (error) {
      setDedupeError(error?.message || 'Something went wrong while recycling duplicates.');
    } finally {
      if (mounted.current) setDedupeBusy(false);
    }
  };

  // ---------------------------------------------------------------- smart rename

  const startRename = async () => {
    if (renameActive.current) return;
    const request = ++renameRequest.current;
    renameActive.current = true;
    setRenameStage('candidates');
    setRenameLoading(true);
    setRenameError('');
    setRenameCandidates([]);
    setRenameSuggestions([]);
    setRenamePendingAi([]);
    setRenameAiChecked({});
    setRenameSkipped([]);
    setRenameChecked({});
    setRenameProgress(null);
    setStatus('renaming');
    try {
      const result = await api().findRenameCandidates(path);
      if (!mounted.current || request !== renameRequest.current) return;
      if (!result?.ok) throw new Error(result?.error || 'Couldn’t check filenames.');
      const candidates = result.candidates || [];
      setRenameCandidates(candidates);
      setRenameSkipped(result.skipped || []);
      setRenameChecked(Object.fromEntries(candidates.map(row => [row.id, true])));
    } catch (error) {
      if (mounted.current && request === renameRequest.current) setRenameError(error?.message || 'Couldn’t check filenames.');
    } finally {
      if (mounted.current && request === renameRequest.current) {
        renameActive.current = false;
        setRenameLoading(false);
      }
    }
  };

  const cancelRename = () => {
    renameRequest.current++;
    renameActive.current = false;
    api().cancelRenameSuggestions?.();
    setRenameLoading(false);
    setStatus('idle');
  };

  const generateNames = async () => {
    const selected = renameCandidates.filter(row => renameChecked[row.id]).map(row => row.id);
    if (!selected.length || renameActive.current) return;
    const request = ++renameRequest.current;
    renameActive.current = true;
    setRenameStage('generating');
    setRenameError('');
    setRenameProgress(null);
    try {
      const result = await api().suggestRenames(path, selected, request, { localOnly: renameLocalOnly });
      if (!mounted.current || request !== renameRequest.current) return;
      if (result?.cancelled) { setStatus('idle'); return; }
      if (!result?.ok) throw new Error(result?.error || 'Couldn’t suggest filenames.');
      const suggestions = result.suggestions || [];
      setRenameSuggestions(suggestions);
      setRenameChecked(Object.fromEntries(suggestions.map(row => [row.id, true])));
      setRenamePendingAi(result.pendingAi || []);
      setRenameAiChecked(Object.fromEntries((result.pendingAi || []).map(row => [row.id, true])));
      setRenameDestination({ aiProvider: result.aiProvider, aiModel: result.aiModel });
      setRenameSkipped(previous => [...previous, ...(result.skipped || [])]);
      setRenameStage(result.pendingAi?.length ? 'privacy' : 'review');
    } catch (error) {
      if (!mounted.current || request !== renameRequest.current) return;
      setRenameError(error?.message || 'Couldn’t suggest filenames.');
      setRenameStage('candidates');
    } finally {
      if (mounted.current && request === renameRequest.current) renameActive.current = false;
    }
  };

  const useAiForNames = async (event) => {
    if (renameLocalOnly || renameActive.current) return;
    const selected = renamePendingAi.filter(row => renameAiChecked[row.id]).map(row => row.id);
    if (!selected.length) return;
    if (!hasAiConfig) { onOpenSettings('ai', event?.currentTarget); return; }
    const request = ++renameRequest.current;
    renameActive.current = true;
    setRenameStage('generating');
    setRenameProgress({ phase: 'ai' });
    setRenameError('');
    try {
      const result = await api().namePreparedDocuments(path, selected, request);
      if (!mounted.current || request !== renameRequest.current) return;
      if (result?.cancelled) { setStatus('idle'); return; }
      if (!result?.ok) throw new Error(result?.error || 'Couldn’t suggest filenames.');
      const suggestions = result.suggestions || [];
      setRenameSuggestions(suggestions);
      setRenameChecked(Object.fromEntries(suggestions.map(row => [row.id, true])));
      setRenameSkipped(previous => [...previous, ...(result.skipped || []), ...renamePendingAi.filter(row => !renameAiChecked[row.id]).map(row => ({ name: row.oldName, reason: 'Not selected for AI. Nothing was sent.' }))]);
      setRenamePendingAi([]);
      setRenameStage('review');
    } catch (error) {
      if (mounted.current && request === renameRequest.current) { setRenameError(error?.message || 'Couldn’t suggest filenames.'); setRenameStage('privacy'); }
    } finally {
      if (mounted.current && request === renameRequest.current) renameActive.current = false;
    }
  };

  const reviewLocalNames = () => {
    setRenameSkipped(previous => [...previous, ...renamePendingAi.map(row => ({ name: row.oldName, reason: 'Kept local. No clear heading was found.' }))]);
    setRenamePendingAi([]);
    setRenameStage('review');
    setRenameError('');
  };

  const applyNames = async () => {
    if (renameBusy) return;
    const selected = renameSuggestions.filter(row => renameChecked[row.id]).map(row => ({ id: row.id, newName: row.newName }));
    if (!selected.length) return;
    setRenameBusy(true);
    setRenameError('');
    try {
      const result = await api().applyRenames(path, selected);
      if (!mounted.current) return;
      if (!result?.ok) {
        const errors = [result?.error || 'The names couldn’t be applied.', ...(result?.errors || []).slice(0, 3).map(error => typeof error === 'string' ? error : error.message || error.reason), ...(result?.rollbackErrors || []).slice(0, 3)];
        if (result?.run) {
          await Promise.all([loadHistory(), scanFolder({ silent: true })]);
          if (!mounted.current) return;
          setStatus('idle');
          notify(`${pluralize(result.renamed || result.moves?.length || 0, 'file')} kept a new name because it couldn’t be restored. Use Undo to try restoring it. ${errors.slice(1, 2).join(' ')}`, { duration: 15000, action: { label: 'Undo', onClick: () => setConfirmUndo(result.run) } });
        } else setRenameError(errors.filter(Boolean).join('\n'));
        return;
      }
      await Promise.all([scanFolder({ silent: true }), loadHistory()]);
      if (!mounted.current) return;
      setStatus('idle');
      notify(`Renamed ${pluralize(result.renamed || result.moves?.length || 0, 'file')}`, result.run ? { action: { label: 'Undo', onClick: () => setConfirmUndo(result.run) } } : {});
    } catch (error) {
      if (mounted.current) setRenameError(error?.message || 'Couldn’t rename files.');
    } finally {
      if (mounted.current) setRenameBusy(false);
    }
  };

  // ---------------------------------------------------------------- render

  const folderCount = files.filter((f) => f.type === 'folder').length;
  const fileCount = files.length - folderCount;
  const busy = ['scanning', 'analyzing', 'executing', 'reverting'].includes(status) || documentBusy || (status === 'deduping' && (dedupeLoading || dedupeBusy)) || (status === 'renaming' && (renameLoading || renameBusy || renameStage === 'generating'));
  const streamBoost = Math.min(92, (aiStream.length / 6000) * 92);
  const shownAnalysis = Math.max(analysisProgress, streamBoost);
  const execPct = executeProgress.total ? (executeProgress.processed / executeProgress.total) * 100 : 0;

  let panel;
  switch (status) {
    case 'versions':
      panel = <VersionsPanel path={path} onCancel={() => setStatus('idle')} onChanged={() => scanFolder({ silent: true })} onBusyChange={setDocumentBusy} />;
      break;
    case 'search':
      panel = <SearchPanel path={path} onCancel={() => setStatus('idle')} onBusyChange={setDocumentBusy} />;
      break;
    case 'presets':
      panel = <PresetPanel path={path} onCancel={() => setStatus('idle')} onBusyChange={setDocumentBusy} onPreview={async result => {
        await scanFolder({ silent: true });
        if (!mounted.current) return;
        setPlanSource('preset'); setPlan(normalizePlan(result.plan)); setExcluded([]); setAiStream(''); setStatus('reviewing');
      }} />;
      break;
    case 'scanning':
      panel = <ProgressPanel title="Reading folder" description="Listing files and peeking inside subfolders." />;
      break;
    case 'deduping':
      panel = (
        <DedupePanel
          loading={dedupeLoading}
          duplicates={duplicates}
          checked={checkedDuplicates}
          onToggle={toggleDuplicate}
          progress={dedupeProgress}
          stats={dedupeStats}
          error={dedupeError}
          busy={dedupeBusy}
          rootPath={path}
          onCancel={cancelDedupe}
          onRetry={startDedupe}
          onConfirm={confirmDedupe}
        />
      );
      break;
    case 'analyzing':
      panel = (
        <ProgressPanel
          title="Planning your folder"
          description="The AI is grouping items by type, name, and project markers."
          progress={shownAnalysis}
          detail={aiStream ? 'Receiving plan' : 'Waiting for the model'}
          stream={aiStream}
          action={{ label: 'Cancel', onClick: cancelAnalysis }}
        />
      );
      break;
    case 'renaming':
      panel = <RenamePanel
        stage={renameStage} loading={renameLoading} busy={renameBusy}
        candidates={renameCandidates} suggestions={renameSuggestions} checked={renameChecked}
        existingNames={files.map(file => file.name)}
        pendingAi={renamePendingAi} aiChecked={renameAiChecked}
        onAiToggle={(id, selected) => setRenameAiChecked(previous => id === null ? Object.fromEntries(renamePendingAi.map(row => [row.id, selected])) : { ...previous, [id]: !previous[id] })}
        onUseAi={useAiForNames} onLocalReview={reviewLocalNames}
        localOnly={renameLocalOnly} onLocalOnlyChange={setRenameLocalOnly} {...renameDestination}
        error={renameError} skipped={renameSkipped} progress={renameProgress}
        onToggle={(id, selected) => setRenameChecked(previous => id === null ? Object.fromEntries((renameStage === 'review' ? renameSuggestions : renameCandidates).map(row => [row.id, selected])) : { ...previous, [id]: !previous[id] })}
        onEdit={(id, newName) => setRenameSuggestions(previous => previous.map(row => row.id === id ? { ...row, newName } : row))}
        onSuggest={generateNames} onApply={applyNames} onCancel={cancelRename} onRetry={startRename}
      />;
      break;
    case 'reviewing':
      panel = plan && (
        <ReviewPanel
          files={files}
          rootPath={path}
          plan={plan}
          setPlan={setPlan}
          excluded={excluded}
          setExcluded={setExcluded}
          aiStream={aiStream}
          source={planSource}
          onCancel={() => { setPlan(null); setExcluded([]); setStatus(planSource === 'preset' ? 'presets' : 'idle'); }}
          onApply={handleApply}
          onRetry={planSource === 'preset' ? () => { setPlan(null); setStatus('presets'); } : () => runAnalysis({
            retryReason: 'The user asked for a different plan. Propose a noticeably different, sensible grouping.',
            previousPlan: plan,
          })}
        />
      );
      break;
    case 'executing':
      panel = (
        <ProgressPanel
          title="Moving items"
          description="If any move fails, everything from this run is put back."
          progress={execPct}
          detail={executeProgress.current?.name ? truncateMiddle(executeProgress.current.name, 40, 20, 14) : `${executeProgress.moved} of ${executeProgress.total}`}
        />
      );
      break;
    case 'reverting':
      panel = <ProgressPanel title="Undoing run" description="Putting every item back where it was." />;
      break;
    case 'complete':
      panel = completion && (
        <CompletePanel
          {...completion}
          busy={busy}
          onUndo={() => setConfirmUndo(completion.run)}
          onHistory={() => setHistoryOpen(true)}
          onOpenFolder={() => api().openPath(path)}
          onHome={onBack}
        />
      );
      break;
    default:
      panel = (
        <IdlePanel
          files={files}
          path={path}
          hasAiConfig={hasAiConfig}
          onOrganize={() => runAnalysis()}
          onFindDuplicates={startDedupe}
          onSmartRename={startRename}
          onVersionGroups={() => setStatus('versions')}
          onSearchDocuments={() => setStatus('search')}
          onPresets={() => setStatus('presets')}
          onOpenSettings={onOpenSettings}
        />
      );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', px: { xs: 2, sm: 3 }, pb: 2, gap: 2 }}>
      <FolderHeader
        path={path}
        folderCount={folderCount}
        fileCount={fileCount}
        busy={busy}
        historyCount={runs.length}
        onBack={onBack}
        onRefresh={() => scanFolder()}
        onHistory={() => setHistoryOpen(true)}
        onSettings={(event) => onOpenSettings('appearance', event.currentTarget)}
      />

      <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={status === 'deduping' && dedupeLoading ? 'dedupe-loading' : status}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: { y: springs.defaultSpatial, opacity: springs.defaultEffects } }}
            exit={{ opacity: 0, transition: { opacity: springs.fastEffects } }}
            style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
          >
            {panel}
          </m.div>
        </AnimatePresence>
      </Box>

      <PlanIssueDialog
        issue={planIssue}
        onClose={() => setPlanIssue(EMPTY_ISSUE)}
        onRetry={() => runAnalysis(planIssue.retryContext || {})}
      />

      <ConfirmDialog
        open={Boolean(confirmUndo)}
        icon={<UndoIcon />}
        title="Undo this run?"
        body={confirmUndo?.kind === 'rename' ? `${pluralize(confirmUndo?.moved ?? confirmUndo?.moves?.length ?? 0, 'file')} will get their original names back. Existing names won’t be overwritten.` : `${pluralize(confirmUndo?.moved ?? confirmUndo?.moves?.length ?? 0, 'item')} will go back to where they were. Folders created by this run are removed if they’re empty.`}
        confirmLabel="Undo run"
        onClose={() => setConfirmUndo(null)}
        onConfirm={() => doUndo(confirmUndo)}
      />

      <HistorySheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        runs={runs}
        busy={busy}
        onUndo={(run) => { setHistoryOpen(false); setConfirmUndo(run); }}
      />
    </Box>
  );
}
