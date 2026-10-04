import React, { useId } from 'react';
import { AnimatePresence, MotionConfig, motion as m, useIsPresent, useReducedMotion } from 'framer-motion';
import {
  Alert, Box, Button, Checkbox, Chip, InputAdornment, TextField, Typography, useTheme,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import FileIcon from './FileIcon';
import FloatingToolbar from './FloatingToolbar';
import ProgressPanel from './ProgressPanel';
import { corner, springs } from '../../theme/tokens';
import { invalidNameReason } from '../../utils/plan';
import { extensionOf, pluralize } from '../../utils/format';

const SOURCE_LABELS = {
  local: 'Local heading · not sent',
  cache: 'Reused this session',
};

export default function RenamePanel(props) {
  const reducedMotion = useReducedMotion();
  const phase = props.loading || props.stage === 'generating'
    ? `progress:${props.stage || 'loading'}:${props.progress?.phase || 'scan'}`
    : props.stage === 'privacy' ? 'privacy'
      : props.stage === 'review' ? 'review' : 'candidates';
  const initial = reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 };
  const animate = reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 };
  const exit = reducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 };

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait" initial={false}>
        <RenameStage
          key={phase}
          initial={initial}
          animate={animate}
          exit={exit}
          transition={{ y: springs.defaultSpatial, opacity: springs.defaultEffects }}
          style={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, width: '100%' }}
        >
          <RenamePanelContent {...props} />
        </RenameStage>
      </AnimatePresence>
    </MotionConfig>
  );
}

function RenameStage({ children, style, ...props }) {
  const present = useIsPresent();
  return <m.div {...props} inert={!present} aria-hidden={!present}
    style={{ ...style, pointerEvents: present ? 'auto' : 'none' }}>{children}</m.div>;
}

function RenamePanelContent({
  stage,
  loading,
  busy,
  candidates,
  suggestions,
  checked,
  existingNames = [],
  error,
  skipped = [],
  progress,
  pendingAi = [],
  aiChecked = {},
  onToggle,
  onEdit,
  onSuggest,
  onApply,
  onCancel,
  onRetry,
  onAiToggle,
  onUseAi,
  onLocalReview,
  aiProvider = 'your configured provider',
  aiModel = '',
  localOnly = false,
  onLocalOnlyChange,
}) {
  const c = useTheme().palette.m3;
  const localOnlyId = useId();
  const providerLabel = [aiProvider, aiModel].filter(Boolean).join(' · ');

  if (loading || stage === 'generating') {
    const usingAi = stage === 'generating' && progress?.phase === 'ai';
    return (
      <ProgressPanel
        title={usingAi ? 'Naming files with AI' : 'Reading documents locally'}
        description={usingAi
          ? `Using cleaned excerpts with ${providerLabel}. Filenames, folder paths, and full documents stay on this device.`
          : 'Preparing excerpts and finding local name ideas. Nothing is being sent yet.'}
        detail={progress?.total ? `${progress.completed || 0} of ${progress.total} files checked` : 'Text documents, PDFs, and Word documents; images are skipped'}
        action={{ label: 'Cancel', onClick: onCancel }}
      />
    );
  }

  if (stage === 'privacy') {
    return <PrivacyReview
      suggestions={suggestions}
      pendingAi={pendingAi}
      aiChecked={aiChecked}
      error={error}
      busy={busy}
      aiProvider={aiProvider}
      aiModel={aiModel}
      localOnly={localOnly}
      onRetry={onRetry}
      onAiToggle={onAiToggle}
      onUseAi={onUseAi}
      onLocalReview={onLocalReview}
      onCancel={onCancel}
    />;
  }

  const reviewing = stage === 'review';
  const rows = reviewing ? suggestions : candidates;
  const selected = rows.filter((row) => checked[row.id]);
  const key = (value) => String(value).normalize('NFKC').toLocaleLowerCase('en-US');
  const existing = new Set(existingNames.map(key));
  const taken = new Map();
  for (const row of selected) {
    const name = key(row.newName || '');
    taken.set(name, (taken.get(name) || 0) + 1);
  }
  const nameError = (row) => reviewing
    ? invalidNameReason(row.newName)
      || (row.newName.startsWith('.') ? 'Add a descriptive title before the extension.' : key(row.newName) === key(row.oldName) ? 'Choose a different name.'
        : existing.has(key(row.newName)) ? 'This name already exists in the folder.'
        : taken.get(key(row.newName)) > 1 ? 'Another selected file uses this name.' : null)
    : null;
  const hasErrors = selected.some((row) => nameError(row));

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="titleLarge" component="h2">{reviewing ? 'Review the new names' : 'Smart rename'}</Typography>
        <Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant, mt: 0.5 }}>
          {reviewing
            ? 'Compare before and after. Edit a suggestion or uncheck a file to keep its current name.'
            : 'Choose untitled or random-looking documents to name from their contents. Subfolders stay untouched.'}
        </Typography>
        {!reviewing && rows.length > 0 && (
          <>
            <Typography variant="bodySmall" sx={{ color: c.onSurfaceVariant, mt: 1 }}>
              Supports TXT, Markdown, CSV/TSV, RTF, HTML, TeX, PDF, and Word (.docx). Images are excluded.
            </Typography>
            <Box component="label" htmlFor={localOnlyId} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mt: 1.5, p: 1.25, borderRadius: corner.lg, bgcolor: c.surfaceContainerLow, cursor: busy ? 'default' : 'pointer' }}>
              <Checkbox
                checked={localOnly}
                disabled={busy}
                onChange={(event) => onLocalOnlyChange?.(event.target.checked)}
                slotProps={{ input: { id: localOnlyId, 'aria-label': 'Keep everything on this device', 'aria-describedby': `${localOnlyId}-hint` } }}
                sx={{ width: 48, height: 48, flexShrink: 0 }}
              />
              <Box sx={{ minWidth: 0, pt: 0.4 }}>
                <Typography variant="labelLarge">Keep everything on this device</Typography>
                <Typography id={`${localOnlyId}-hint`} variant="bodySmall" sx={{ color: c.onSurfaceVariant, mt: 0.25 }}>
                  Names and excerpts are prepared locally first. Nothing is sent until you choose which excerpts to use with AI.
                  {localOnly ? ' Local-only is on, so this run will not contact an AI provider.' : ''}
                </Typography>
              </Box>
            </Box>
          </>
        )}
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2, flexShrink: 0, maxHeight: 140, overflowY: 'auto', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
          action={!reviewing && <Button color="inherit" onClick={onRetry} disabled={busy}>Try again</Button>}
        >
          {error}
        </Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pb: 15 }}>
        {rows.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8, px: 3 }}>
            <DriveFileRenameOutlineIcon sx={{ fontSize: 40, color: c.onSurfaceVariant, mb: 2 }} />
            <Typography variant="titleMedium" component="h3">
              {error ? 'Suggestions aren’t ready' : reviewing ? 'No confident names to suggest' : 'No filenames need a new name'}
            </Typography>
            <Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant, mt: 1 }}>
              {reviewing
                ? 'Files with unreadable or insufficient content keep their names.'
                : 'Descriptive names are left alone. Text documents, PDFs, and Word (.docx) are supported; images are excluded.'}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ borderRadius: corner.lg, overflow: 'hidden', bgcolor: c.surfaceContainerLow }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: reviewing ? '48px minmax(0, 1fr) minmax(0, 1fr)' : '48px minmax(0, 1fr)', alignItems: 'center', px: 1, py: 0.5, bgcolor: c.surfaceContainerHigh }}>
              <Checkbox
                slotProps={{ input: { 'aria-label': 'Select all files' } }}
                checked={selected.length === rows.length}
                indeterminate={selected.length > 0 && selected.length < rows.length}
                disabled={busy}
                onChange={() => onToggle(null, selected.length !== rows.length)}
              />
              <Typography variant="labelLarge">{reviewing ? 'Before' : `${rows.length} documents to review`}</Typography>
              {reviewing && <Typography variant="labelLarge">After</Typography>}
            </Box>
            {rows.map((row) => {
              const oldName = row.oldName || row.name;
              const extension = row.extension || (oldName.lastIndexOf('.') > 0 ? oldName.slice(oldName.lastIndexOf('.')) : '');
              const base = extension && row.newName?.endsWith(extension) ? row.newName.slice(0, -extension.length) : row.newName || '';
              const problem = nameError(row);
              const sourceLabel = SOURCE_LABELS[row.source] || 'AI from cleaned excerpt';
              return (
                <Box key={row.id} sx={{ display: 'grid', gridTemplateColumns: reviewing ? '48px minmax(0, 1fr) minmax(0, 1fr)' : '48px minmax(0, 1fr)', alignItems: 'start', px: 1, py: 1.5, borderTop: `1px solid ${c.outlineVariant}`, opacity: checked[row.id] ? 1 : 0.65 }}>
                  <Checkbox slotProps={{ input: { 'aria-label': `Select ${oldName}` } }} checked={Boolean(checked[row.id])} disabled={busy} onChange={() => onToggle(row.id)} />
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 1, pt: 1, minWidth: 0 }}>
                    <FileIcon item={{ name: oldName, type: 'file' }} size={32} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="bodyMedium" sx={{ overflowWrap: 'anywhere' }}>{oldName}</Typography>
                      <Typography variant="bodySmall" sx={{ color: c.onSurfaceVariant, mt: 0.5 }}>{row.reason}</Typography>
                    </Box>
                  </Box>
                  {reviewing && (
                    <Box sx={{ minWidth: 0, px: 1 }}>
                      <TextField
                        fullWidth
                        size="small"
                        value={base}
                        disabled={busy}
                        error={Boolean(problem && checked[row.id])}
                        helperText={problem && checked[row.id] ? problem : undefined}
                        onChange={(event) => onEdit(row.id, `${event.target.value}${extension}`)}
                        slotProps={{
                          htmlInput: { 'aria-label': `New name for ${oldName}`, maxLength: Math.max(1, 240 - extension.length) },
                          input: { endAdornment: extension ? <InputAdornment position="end">{extension}</InputAdornment> : undefined },
                        }}
                      />
                      <Typography variant="labelSmall" sx={{ display: 'block', color: c.primary, mt: 1 }}>{sourceLabel}</Typography>
                      <Typography variant="bodySmall" sx={{ color: c.onSurfaceVariant, mt: 0.5, overflowWrap: 'anywhere' }}>{row.summary}</Typography>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
        {skipped.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="titleSmall" component="h3">{pluralize(skipped.length, 'file')} left unchanged</Typography>
            <Box component="ul" sx={{ mt: 1, pl: 2.5, color: c.onSurfaceVariant }}>
              {skipped.slice(0, 15).map((row, index) => (
                <Typography variant="bodySmall" component="li" key={`${row.name || row.oldName}-${index}`} sx={{ overflowWrap: 'anywhere' }}>
                  {row.name || row.oldName}: {row.reason || row.message}
                </Typography>
              ))}
              {skipped.length > 15 && <Typography variant="bodySmall" component="li">and {skipped.length - 15} more</Typography>}
            </Box>
          </Box>
        )}
      </Box>

      <FloatingToolbar sx={{ minWidth: 0, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Box sx={{ px: 1.5 }}>
          <Typography variant="titleSmall">{pluralize(selected.length, reviewing ? 'file' : 'document')} selected</Typography>
          <Typography variant="bodySmall" sx={{ color: c.onSurfaceVariant }}>
            {reviewing ? 'Extensions stay the same · Undo in History' : 'Name ideas are prepared on this device'}
          </Typography>
        </Box>
        <Button color="inherit" onClick={onCancel} disabled={busy}>{rows.length ? 'Cancel' : 'Back to folder'}</Button>
        {reviewing && error && <Button color="inherit" onClick={onRetry} disabled={busy}>Start over</Button>}
        {rows.length > 0 && (
          <Button
            variant="contained"
            size="large"
            startIcon={reviewing ? <DriveFileRenameOutlineIcon /> : <AutoAwesomeIcon />}
            disabled={busy || !selected.length || hasErrors}
            onClick={reviewing ? onApply : onSuggest}
          >
            {busy ? 'Renaming…' : reviewing ? `Rename ${pluralize(selected.length, 'file')}` : 'Find names locally'}
          </Button>
        )}
      </FloatingToolbar>
    </Box>
  );
}

function PrivacyReview({
  suggestions = [], pendingAi = [], aiChecked = {}, error, busy, aiProvider, aiModel, localOnly,
  onAiToggle, onUseAi, onLocalReview, onCancel, onRetry,
}) {
  const c = useTheme().palette.m3;
  const localCount = suggestions.filter((row) => row.source === 'local').length || suggestions.length;
  const selected = pendingAi.filter((row) => Boolean(aiChecked[row.id]));
  const providerLabel = [aiProvider, aiModel].filter(Boolean).join(' · ');

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="titleLarge" component="h2">Review what AI can see</Typography>
        <Typography variant="bodyMedium" sx={{ color: c.onSurfaceVariant, mt: 0.5 }}>
          {pluralize(localCount, 'local name')} ready. Review the cleaned excerpts, then choose which documents to send.
        </Typography>
        <Typography variant="bodySmall" sx={{ color: c.onSurfaceVariant, mt: 0.75 }}>
          AI provider: {providerLabel || 'your configured provider'}
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 1.5, flexShrink: 0, maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }} action={<Button color="inherit" onClick={onRetry} disabled={busy}>Start over</Button>}>
          {error}
        </Alert>
      )}

      <Alert severity={localOnly ? 'info' : 'warning'} sx={{ mb: 1.5, flexShrink: 0 }}>
        {localOnly
          ? 'Local-only is on. No excerpts will be sent to an AI provider.'
          : 'Only checked cleaned excerpts will be sent. We don’t attach documents or add filenames and folder paths. Automatic redaction may miss personal details, so review each excerpt before continuing.'}
      </Alert>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pb: 15, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {pendingAi.length === 0 ? (
          <Box sx={{ p: 2, borderRadius: corner.lg, bgcolor: c.surfaceContainerLow }}>
            <Typography variant="titleSmall">No documents are waiting for AI</Typography>
            <Typography variant="bodySmall" sx={{ color: c.onSurfaceVariant, mt: 0.5 }}>
              You can still review the local names.
            </Typography>
          </Box>
        ) : pendingAi.map((row) => {
          const name = row.name || row.oldName || 'Document';
          const excerpt = String(row.sanitizedExcerpt ?? row.cleanedExcerpt ?? row.excerpt ?? '');
          const rawRedactions = row.redactionsCount ?? row.redactionCount ?? row.redactions ?? 0;
          const redactionCount = Array.isArray(rawRedactions) ? rawRedactions.length : Math.max(0, Number(rawRedactions) || 0);
          const extension = row.fileType || row.extension || extensionOf(name) || 'document';
          return (
            <Box key={row.id || name} component="section" sx={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr)', minWidth: 0, flexShrink: 0, borderRadius: corner.lg, bgcolor: c.surfaceContainerLow, overflow: 'hidden' }}>
              <Checkbox
                checked={Boolean(aiChecked[row.id])}
                disabled={busy || localOnly}
                onChange={(event) => onAiToggle?.(row.id, event.target.checked)}
                slotProps={{ input: { 'aria-label': `Select cleaned excerpt for AI, ${name}` } }}
                sx={{ alignSelf: 'start', mt: 1.5, ml: 0.5 }}
              />
              <Box sx={{ minWidth: 0, p: 1.5, pl: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <FileIcon item={{ name, type: 'file' }} size={30} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="titleSmall" noWrap title={name}>{name}</Typography>
                    <Typography variant="bodySmall" sx={{ color: c.onSurfaceVariant }}>{String(extension).toUpperCase()}</Typography>
                  </Box>
                  <Chip
                    size="small"
                    label={redactionCount ? `${pluralize(redactionCount, 'detail')} removed` : 'No details detected'}
                    color={redactionCount ? 'secondary' : 'default'}
                    variant="outlined"
                    sx={{ flexShrink: 0, maxWidth: '48%' }}
                  />
                </Box>
                <Typography variant="labelSmall" sx={{ display: 'block', color: c.onSurfaceVariant, mt: 1 }}>
                  Cleaned excerpt preview
                </Typography>
                <Box
                  component="pre"
                  tabIndex={0}
                  aria-label={`Sanitized excerpt from ${name}`}
                  sx={{
                    m: 0,
                    mt: 0.5,
                    px: 1.25,
                    py: 1,
                    maxHeight: 132,
                    overflow: 'auto',
                    borderRadius: corner.md,
                    bgcolor: c.surfaceContainerHighest,
                    color: c.onSurface,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    fontFamily: 'inherit',
                    fontSize: '0.875rem',
                    lineHeight: 1.45,
                    userSelect: 'text',
                  }}
                >
                  {excerpt || 'No excerpt preview is available for this document.'}
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>

      <FloatingToolbar sx={{ minWidth: 0, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Box sx={{ px: 1.5 }}>
          <Typography variant="titleSmall">{pluralize(selected.length, 'document')} selected for AI</Typography>
          <Typography variant="bodySmall" sx={{ color: c.onSurfaceVariant }}>
            {localOnly ? 'Local-only · no transmission' : 'Review excerpts before continuing'}
          </Typography>
        </Box>
        <Button color="inherit" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="outlined" onClick={onLocalReview} disabled={busy}>Review local names</Button>
        <Button variant="contained" size="large" startIcon={<AutoAwesomeIcon />} disabled={busy || !selected.length || localOnly} onClick={onUseAi}>
          Use AI for {pluralize(selected.length, 'file')}
        </Button>
      </FloatingToolbar>
    </Box>
  );
}
