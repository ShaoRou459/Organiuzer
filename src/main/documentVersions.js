'use strict';

const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { filenameExtension } = require('./renaming');
const { readDocumentText, documentKind } = require('./documentText');

const SUPPORTED_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.rtf', '.pdf', '.docx', '.html', '.htm', '.csv', '.tsv', '.tex',
]);
const SENSITIVE_NAME = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|\.gitconfig|credentials?(?:\..*)?|secrets?(?:\..*)?|settings?(?:\..*)?|config(?:uration)?(?:\..*)?|.*(?:api[-_]?key|access[-_]?token|private[-_]?key|password|secret).*)$/i;
const SENSITIVE_EXTENSIONS = new Set(['.env', '.pem', '.key', '.p12', '.pfx', '.kdbx', '.sqlite', '.db', '.wallet']);
const PLACEHOLDER_CORE = /^(?:untitled|untilted|new document|new file|document|file|scan|screenshot|letter|draft|copy)(?:\s+\d+)?$/i;
const DOWNLOAD_SUFFIX_ONLY_CORE = /^(?:memo|report|notes?)$/i;
const MAX_DIAGNOSTICS = 150;
const MAX_SCAN_FILES = 1_000;
const MAX_SELECTED_IDS = 1_000;
const MAX_CONTENT_FILES = 200;
const MAX_CONTENT_BYTES = 32 * 1024 * 1024;
const MAX_PAIR_COMPARISONS = 3_000;
const MAX_SCANS = 24;
const SCAN_TTL_MS = 30 * 60 * 1000;
const CASE_INSENSITIVE_PATHS = process.platform === 'win32' || process.platform === 'darwin';
const scanRegistry = new Map();

class DocumentVersionScanCancelledError extends Error {
  constructor() {
    super('Document version scan was cancelled.');
    this.name = 'AbortError';
    this.code = 'ABORT_ERR';
  }
}

class DocumentVersionRecycleCancelledError extends Error {
  constructor() {
    super('Document version recycling was cancelled.');
    this.name = 'AbortError';
    this.code = 'ABORT_ERR';
  }
}

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const normalizePath = (value) => {
  const resolved = path.resolve(String(value || ''));
  return CASE_INSENSITIVE_PATHS ? resolved.toLocaleLowerCase('en-US') : resolved;
};

function statSignature(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.nlink, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':');
}

function rootIdentity(stat) {
  return [stat.dev, stat.ino, stat.mode].map(String).join(':');
}

function pathIsInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function emitProgress(callback, payload) {
  if (typeof callback !== 'function') return;
  try {
    const result = callback(payload);
    if (result && typeof result.then === 'function') result.catch(() => {});
  } catch { }
}

async function checkCancelled(signal) {
  if (signal?.aborted) throw new DocumentVersionScanCancelledError();
}

async function checkRecycleCancelled(signal) {
  if (signal?.aborted) throw new DocumentVersionRecycleCancelledError();
}

function addSkipped(skipped, name, reason) {
  if (skipped.length < MAX_DIAGNOSTICS) skipped.push({ name: String(name || ''), reason });
}

async function inspectRoot(rootPath) {
  if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath)) throw new TypeError('A full folder path is required.');
  const resolved = path.resolve(rootPath);
  const stat = await fsp.lstat(resolved, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new TypeError('Choose a regular folder, not a shortcut or file.');
  const realPath = await fsp.realpath(resolved);
  return { path: resolved, realPath, identity: rootIdentity(stat) };
}

async function rootStillMatches(root) {
  try {
    const stat = await fsp.lstat(root.path, { bigint: true });
    const realPath = await fsp.realpath(root.path);
    return stat.isDirectory() && !stat.isSymbolicLink()
      && rootIdentity(stat) === root.identity
      && normalizePath(realPath) === normalizePath(root.realPath);
  } catch {
    return false;
  }
}

function stripDownloadAndVersionSuffixes(value) {
  let core = String(value || '').normalize('NFKC').trim();
  const original = core;
  let removed = false;
  const suffixes = [
    /\s*\(\s*\d+\s*\)\s*$/i,
    /(?:\s+|\s*-\s*)(?:copy|duplicate)(?:\s*\(\s*\d+\s*\)|\s+\d+)?\s*$/i,
    /^copy\s+of\s+/i,
    /(?:\s+|\s*[-_]+\s*)(?:v(?:ersion)?\s*\d+|rev(?:ision)?\s*\d+|revised|updated|update\s*\d+)\s*$/i,
    /(?:\s+|\s*[-_]+\s*)(?:final|draft)(?:\s*\d+)?\s*$/i,
  ];
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const pattern of suffixes) {
      const next = core.replace(pattern, '').trim();
      if (next !== core) {
        core = next;
        changed = true;
        removed = true;
      }
    }
    if (!changed) break;
  }
  const normalized = core.toLocaleLowerCase('en-US').replace(/[\u2010-\u2015]/g, '-').replace(/[\s._-]+/g, ' ').trim();
  return { core, normalized, removed: removed || core !== original };
}

function describeName(name) {
  const extension = filenameExtension(name);
  const stem = extension ? name.slice(0, -extension.length) : name;
  const stripped = stripDownloadAndVersionSuffixes(stem);
  return {
    core: stripped.core,
    normalizedCore: stripped.normalized,
    variantSuffix: stripped.removed,
    extension,
    meaningful: Boolean(stripped.normalized) && !PLACEHOLDER_CORE.test(stripped.normalized),
  };
}

function fileId(name, signature) {
  return crypto.createHash('sha256').update(`${name}\0${signature}`).digest('hex').slice(0, 24);
}

function cacheGet(cache, id, identity) {
  if (!cache || typeof cache.get !== 'function') return null;
  const entry = cache.get(id);
  if (!entry || entry.identity !== identity || !Array.isArray(entry.tokenHashes) || !Array.isArray(entry.shingleHashes)) return null;
  return entry;
}

function cacheSet(cache, id, entry) {
  if (!cache || typeof cache.set !== 'function') return;
  cache.set(id, entry);
  if (cache.size > 256 && typeof cache.keys === 'function') {
    const first = cache.keys().next();
    if (!first.done && first.value !== id) cache.delete(first.value);
  }
}

function digestSet(values) {
  return [...new Set(values.map((value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 12)))];
}

function evidenceText(text, extension) {
  let value = String(text || '');
  if (extension === '.html' || extension === '.htm') {
    value = value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'");
  } else if (extension === '.rtf') {
    value = value.replace(/\\'[0-9a-f]{2}/gi, ' ')
      .replace(/\\[a-z]+-?\d*\s?/gi, ' ')
      .replace(/[{}]/g, ' ');
  }
  return value;
}

function textFeatures(text, identity, truncated, extension) {
  const evidence = evidenceText(text, extension);
  const tokens = evidence.normalize('NFKC').toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]{2,}/gu) || [];
  const tokenHashes = digestSet(tokens);
  const shingles = [];
  for (let index = 0; index + 4 <= tokens.length; index++) shingles.push(tokens.slice(index, index + 4).join(' '));
  const shingleHashes = digestSet(shingles);
  return { identity, tokenHashes, shingleHashes, tokenCount: tokens.length, shingleCount: shingles.length, charCount: evidence.length, truncated: Boolean(truncated) };
}

function setSimilarity(a, b) {
  if (!a.length && !b.length) return 1;
  const set = new Set(a);
  let intersection = 0;
  for (const value of b) if (set.has(value)) intersection++;
  const union = set.size + b.length - intersection;
  return union ? intersection / union : 0;
}

function compareFeatures(a, b) {
  if (!a || !b || a.tokenCount < 12 || b.tokenCount < 12 || a.charCount < 100 || b.charCount < 100) return null;
  if (a.tokenCount < 20 || b.tokenCount < 20) {
    if (a.charCount >= 140 && a.tokenCount === b.tokenCount
      && setSimilarity(a.tokenHashes, b.tokenHashes) >= 0.96) {
      return { score: 0.96, kind: 'matching text' };
    }
    return null;
  }
  const shingleScore = setSimilarity(a.shingleHashes, b.shingleHashes);
  const termScore = setSimilarity(a.tokenHashes, b.tokenHashes);
  const truncatedThreshold = a.truncated || b.truncated;
  if (shingleScore >= (truncatedThreshold ? 0.8 : 0.61) && termScore >= (truncatedThreshold ? 0.58 : 0.43)) {
    return { score: Math.min(0.99, (shingleScore * 0.75) + (termScore * 0.25)), kind: 'similar text' };
  }
  return null;
}

function createUnionFind(items) {
  const parent = new Map(items.map((item) => [item.id, item.id]));
  const rank = new Map(items.map((item) => [item.id, 0]));
  const find = (id) => {
    const current = parent.get(id);
    if (current !== id) parent.set(id, find(current));
    return parent.get(id);
  };
  const union = (a, b) => {
    let rootA = find(a);
    let rootB = find(b);
    if (rootA === rootB) return;
    if (rank.get(rootA) < rank.get(rootB)) [rootA, rootB] = [rootB, rootA];
    parent.set(rootB, rootA);
    if (rank.get(rootA) === rank.get(rootB)) rank.set(rootA, rank.get(rootA) + 1);
  };
  return { find, union };
}

function groupIdentifier(reason, files) {
  return crypto.createHash('sha256').update(`${reason}\0${files.map((file) => file.id).sort().join('\0')}`).digest('hex').slice(0, 24);
}

function displayTitle(files) {
  const names = files.map((file) => file.displayCore).filter(Boolean).sort((a, b) => b.length - a.length || compareText(a.toLocaleLowerCase('en-US'), b.toLocaleLowerCase('en-US')));
  return names[0] || path.basename(files[0]?.name || 'Related documents');
}

function cleanRegistry() {
  const now = Date.now();
  for (const [id, value] of scanRegistry) if (value.expiresAt <= now) scanRegistry.delete(id);
  while (scanRegistry.size >= MAX_SCANS) scanRegistry.delete(scanRegistry.keys().next().value);
}

async function scanDocumentVersions(rootPath, { signal, onProgress, cache } = {}) {
  await checkCancelled(signal);
  const root = await inspectRoot(rootPath);
  const stats = {
    scannedFiles: 0,
    eligibleFiles: 0,
    extractedFiles: 0,
    truncatedFiles: 0,
    truncated: false,
    fileLimitReached: false,
    maxFiles: MAX_SCAN_FILES,
    filenameGroups: 0,
    contentGroups: 0,
    comparisons: 0,
    comparisonLimitReached: false,
    contentLimitReached: false,
    phase: 'scan',
  };
  const skipped = [];
  const directory = await fsp.opendir(root.path);
  const files = [];
  for await (const entry of directory) {
    await checkCancelled(signal);
    if (files.length >= MAX_SCAN_FILES) {
      if (!entry.name.startsWith('.') && entry.isFile()
        && SUPPORTED_EXTENSIONS.has(filenameExtension(entry.name).toLocaleLowerCase('en-US'))) {
        if (!stats.fileLimitReached) addSkipped(skipped, '', `File scan limit reached; at most ${MAX_SCAN_FILES} supported documents are checked.`);
        stats.fileLimitReached = true;
      }
      continue;
    }
    if (entry.name.startsWith('.')) continue;
    const extension = filenameExtension(entry.name).toLocaleLowerCase('en-US');
    if (!SUPPORTED_EXTENSIONS.has(extension)) continue;
    if (SENSITIVE_NAME.test(entry.name) || SENSITIVE_EXTENSIONS.has(extension)) {
      addSkipped(skipped, entry.name, 'Sensitive or configuration files are not analyzed.');
      continue;
    }
    if (entry.isSymbolicLink()) {
      addSkipped(skipped, entry.name, 'Symbolic links are not analyzed.');
      continue;
    }
    if (!entry.isFile()) continue;
    const fullPath = path.join(root.path, entry.name);
    try {
      const stat = await fsp.lstat(fullPath, { bigint: true });
      if (!stat.isFile() || stat.isSymbolicLink()) {
        addSkipped(skipped, entry.name, 'This path is not a regular file.');
        continue;
      }
      if (stat.nlink !== 1n) {
        addSkipped(skipped, entry.name, 'Hard-linked files are not analyzed.');
        continue;
      }
      if (stat.size > BigInt(Number.MAX_SAFE_INTEGER)) {
        addSkipped(skipped, entry.name, 'This file is too large to inspect safely.');
        continue;
      }
      const signature = statSignature(stat);
      const naming = describeName(entry.name);
      files.push({
        id: fileId(entry.name, signature),
        name: entry.name,
        path: fullPath,
        size: Number(stat.size),
        mtimeMs: Number(stat.mtimeMs || 0),
        identity: signature,
        signature,
        displayCore: naming.core,
        normalizedCore: naming.normalizedCore,
        meaningfulCore: naming.meaningful,
        variantSuffix: naming.variantSuffix,
        extension,
        features: null,
        contentEvidence: null,
      });
      stats.scannedFiles++;
    } catch (error) {
      addSkipped(skipped, entry.name, error?.message || 'Could not inspect this file.');
    }
    emitProgress(onProgress, { ...stats, phase: 'scan', currentName: entry.name });
  }
  files.sort((a, b) => compareText(a.name.toLocaleLowerCase('en-US'), b.name.toLocaleLowerCase('en-US')) || compareText(a.name, b.name));
  stats.eligibleFiles = files.length;
  if (!(await rootStillMatches(root))) throw new Error('The selected folder changed during the scan.');

  // Prioritize likely download families, then smaller documents, so a folder
  // full of large unrelated PDFs does not consume the local reading budget.
  const coreCounts = new Map();
  for (const file of files) coreCounts.set(file.normalizedCore, (coreCounts.get(file.normalizedCore) || 0) + 1);
  const ranked = files.filter(file => file.size <= 18 * 1024 * 1024).sort((a, b) => Number(coreCounts.get(b.normalizedCore) > 1) - Number(coreCounts.get(a.normalizedCore) > 1) || a.size - b.size || compareText(a.name, b.name));
  let plannedBytes = 0;
  const contentCandidates = [];
  for (const file of ranked) {
    const bytes = Math.min(file.size, documentKind(file.name)?.maxBytes || 64 * 1024);
    if (contentCandidates.length >= MAX_CONTENT_FILES || plannedBytes + bytes > MAX_CONTENT_BYTES) continue;
    plannedBytes += bytes;
    contentCandidates.push(file);
  }
  stats.contentBytesPlanned = plannedBytes;
  stats.maxContentBytes = MAX_CONTENT_BYTES;
  stats.contentLimitReached = files.length > contentCandidates.length;
  if (ranked.length > contentCandidates.length) addSkipped(skipped, '', 'Some document text was outside the 200-file or 32 MB local reading budget. Related download names were still checked.');
  for (const file of files) {
    if (file.size > 18 * 1024 * 1024) addSkipped(skipped, file.name, 'Content comparison is limited to documents under 18 MB.');
  }
  stats.phase = 'extract';
  let extracted = 0;
  for (const file of contentCandidates) {
    await checkCancelled(signal);
    try {
      const cached = cacheGet(cache, file.id, file.signature);
      if (cached) {
        file.features = cached;
        file.contentEvidence = { available: true, truncated: cached.truncated };
      } else {
        const result = await readDocumentText(root.path, {
          path: file.path,
          name: file.name,
          size: file.size,
          identity: file.signature,
        }, { signal });
        if (result.identity && result.identity !== file.signature) throw new Error('File identity did not match the scan snapshot.');
        file.features = textFeatures(result.text, file.signature, result.truncated, file.extension);
        file.contentEvidence = { available: true, truncated: Boolean(result.truncated) };
        cacheSet(cache, file.id, file.features);
      }
      if (file.features.truncated) {
        stats.truncatedFiles++;
        stats.truncated = true;
      }
      stats.extractedFiles++;
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw new DocumentVersionScanCancelledError();
      file.contentEvidence = { available: false, reason: String(error?.message || 'Text could not be read.').slice(0, 180) };
      addSkipped(skipped, file.name, file.contentEvidence.reason);
    }
    extracted++;
    emitProgress(onProgress, { ...stats, phase: 'extract', processedFiles: extracted, totalFiles: contentCandidates.length, currentName: file.name });
  }

  const unionFind = createUnionFind(files);
  const reasons = new Map();
  const filenameBuckets = new Map();
  for (const file of files) {
    if (!file.meaningfulCore && !DOWNLOAD_SUFFIX_ONLY_CORE.test(file.normalizedCore)) continue;
    const key = file.normalizedCore;
    if (!filenameBuckets.has(key)) filenameBuckets.set(key, []);
    filenameBuckets.get(key).push(file);
  }
  for (const bucket of filenameBuckets.values()) {
    if (bucket.length < 2) continue;
    if (DOWNLOAD_SUFFIX_ONLY_CORE.test(bucket[0].normalizedCore) && !bucket.some((file) => file.variantSuffix)) continue;
    stats.filenameGroups++;
    const ids = bucket.map((file) => file.id);
    for (let index = 1; index < ids.length; index++) {
      unionFind.union(ids[0], ids[index]);
      reasons.set([ids[0], ids[index]].sort().join(':'), 'filename');
    }
  }

  stats.phase = 'compare';
  let comparisonLimitReached = false;
  for (let leftIndex = 0; leftIndex < contentCandidates.length; leftIndex++) {
    const left = contentCandidates[leftIndex];
    if (!left.features) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < contentCandidates.length; rightIndex++) {
      await checkCancelled(signal);
      if (stats.comparisons >= MAX_PAIR_COMPARISONS) {
        comparisonLimitReached = true;
        break;
      }
      const right = contentCandidates[rightIndex];
      if (!right.features) continue;
      if (left.id === right.id) continue;
      stats.comparisons++;
      const evidence = compareFeatures(left.features, right.features);
      if (!evidence) continue;
      unionFind.union(left.id, right.id);
      reasons.set([left.id, right.id].sort().join(':'), 'content');
      left.contentEvidence = { ...left.contentEvidence, match: evidence.kind, score: evidence.score };
      right.contentEvidence = { ...right.contentEvidence, match: evidence.kind, score: evidence.score };
    }
    if (comparisonLimitReached) break;
    if (leftIndex % 12 === 0) emitProgress(onProgress, { ...stats, phase: 'compare', processedFiles: leftIndex + 1, totalFiles: contentCandidates.length });
  }
  stats.comparisonLimitReached = comparisonLimitReached;
  if (comparisonLimitReached) addSkipped(skipped, '', 'Content comparison limit reached; remaining pairs were not compared.');

  const components = new Map();
  for (const file of files) {
    const key = unionFind.find(file.id);
    if (!components.has(key)) components.set(key, []);
    components.get(key).push(file);
  }
  const groups = [];
  const trustedGroups = [];
  for (const component of components.values()) {
    if (component.length < 2) continue;
    const stable = [];
    for (const file of component) {
      if (await fileStillMatches(root, file, file.signature)) stable.push(file);
      else addSkipped(skipped, file.name, 'File changed before the scan results were ready.');
    }
    if (stable.length !== component.length || stable.length < 2) continue;
    if (!(await rootStillMatches(root))) throw new Error('The selected folder changed during the scan.');
    component.splice(0, component.length, ...stable);
    const ids = new Set(component.map((file) => file.id));
    const hasFilename = [...filenameBuckets.values()].some((bucket) => bucket.length > 1 && bucket.some((file) => ids.has(file.id)));
    const pairEntries = [...reasons.entries()].filter(([pair]) => {
      const [left, right] = pair.split(':');
      return ids.has(left) && ids.has(right);
    });
    const hasContent = pairEntries.some(([, reason]) => reason === 'content');
    const reason = hasFilename && hasContent ? 'filename+content' : hasFilename ? 'filename' : 'content';
    const groupId = groupIdentifier(reason, component);
    const sorted = component.slice().sort((a, b) => b.mtimeMs - a.mtimeMs || compareText(a.name.toLocaleLowerCase('en-US'), b.name.toLocaleLowerCase('en-US')));
    const topScore = Math.max(0, ...sorted.map((file) => file.contentEvidence?.score || 0));
    const publicFiles = sorted.map((file) => ({
      id: file.id,
      name: file.name,
      path: file.path,
      size: file.size,
      mtimeMs: file.mtimeMs,
      identity: file.identity,
      contentEvidence: file.contentEvidence,
    }));
    groups.push({
      id: groupId,
      title: displayTitle(component),
      reason,
      confidence: hasFilename ? (hasContent ? Math.max(0.75, topScore) : 0.72) : topScore,
      relationNote: hasFilename
        ? (hasContent
          ? 'Grouped by related filename and similar text; review the files before choosing what to keep.'
          : 'Grouped by filename; a matching name does not guarantee these are versions.')
        : 'Grouped by similar extracted text; review the files before choosing what to keep.',
      files: publicFiles,
      suggestedKeeperId: sorted[0].id,
      keeperNote: 'Suggested copy is newest by modified time; this may not be the latest content.',
    });
    if (hasContent) stats.contentGroups++;
    trustedGroups.push({ id: groupId, files: component.map((file) => ({
      id: file.id,
      name: file.name,
      path: file.path,
      size: file.size,
      mtimeMs: file.mtimeMs,
      identity: file.signature,
    })) });
  }
  groups.sort((a, b) => compareText(a.title.toLocaleLowerCase('en-US'), b.title.toLocaleLowerCase('en-US')) || compareText(a.id, b.id));
  const trustedIds = new Set(trustedGroups.map((group) => group.id));
  const orderedTrustedGroups = groups.map((group) => trustedGroups.find((trusted) => trustedIds.has(trusted.id) && trusted.id === group.id)).filter(Boolean);
  if (!(await rootStillMatches(root))) throw new Error('The selected folder changed during the scan.');
  const scanId = crypto.randomUUID();
  cleanRegistry();
  scanRegistry.set(scanId, {
    root: { ...root },
    groups: orderedTrustedGroups,
    expiresAt: Date.now() + SCAN_TTL_MS,
  });
  stats.phase = 'complete';
  emitProgress(onProgress, { ...stats, phase: 'complete', groups: groups.length });
  return { scanId, groups, stats, skipped };
}

function parseVersionArgs(input, scanId, selectedIds, trashItem, signal, onProgress) {
  if (input && typeof input === 'object') return input;
  return { rootPath: input, scanId, selectedIds, trashItem, signal, onProgress };
}

function rememberError(results, id, name, reason) {
  results.failed++;
  if (results.errors.length < MAX_DIAGNOSTICS) results.errors.push({ id, name, reason });
  else results.errorsTruncated = true;
}

async function fileStillMatches(root, file, identity) {
  if (!path.isAbsolute(file.path) || !pathIsInside(root.path, file.path) || normalizePath(path.dirname(file.path)) !== normalizePath(root.path)) return false;
  try {
    const realPath = await fsp.realpath(file.path);
    if (!pathIsInside(root.realPath, realPath) || normalizePath(path.dirname(realPath)) !== normalizePath(root.realPath)) return false;
    const stat = await fsp.lstat(file.path, { bigint: true });
    return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n && statSignature(stat) === identity;
  } catch {
    return false;
  }
}

/** Move selected scan-result IDs to the OS trash after verifying a stable keeper remains. */
async function recycleDocumentVersions(input = {}, scanIdArg, selectedIdsArg, trashItemArg, signalArg, onProgressArg) {
  const { rootPath, scanId, selectedIds, trashItem, signal, onProgress } = parseVersionArgs(
    input, scanIdArg, selectedIdsArg, trashItemArg, signalArg, onProgressArg,
  );
  if (typeof trashItem !== 'function') throw new TypeError('An OS trash operation is required.');
  if (!Array.isArray(selectedIds)) throw new TypeError('Selected document IDs must be an array.');
  if (selectedIds.length > MAX_SELECTED_IDS) throw new TypeError(`At most ${MAX_SELECTED_IDS} documents can be selected at once.`);
  if (selectedIds.some((id) => typeof id !== 'string')) throw new TypeError('Every selected document ID must be a string.');
  const scan = scanRegistry.get(scanId);
  const selected = [...new Set((Array.isArray(selectedIds) ? selectedIds : []).filter((id) => typeof id === 'string'))];
  const results = { success: 0, failed: 0, successIds: [], errors: [], errorsTruncated: false, cancelled: false };
  const progress = (phase, extra = {}) => emitProgress(onProgress, { phase, completed: results.success + results.failed, total: selected.length, ...extra });
  const failAll = (reason) => {
    for (const id of selected) {
      const file = scan?.groups.flatMap((group) => group.files).find((entry) => entry.id === id);
      rememberError(results, id, file?.name || id, reason);
    }
  };
  if (!scan || scan.expiresAt <= Date.now()) {
    failAll('This version scan has expired. Scan the folder again before recycling files.');
    return results;
  }
  if (typeof rootPath !== 'string' || normalizePath(path.resolve(rootPath)) !== normalizePath(scan.root.path)) {
    failAll('The selected folder does not match the scan.');
    return results;
  }
  if (!(await rootStillMatches(scan.root))) {
    failAll('The selected folder changed after the scan.');
    return results;
  }
  const byId = new Map();
  const groupById = new Map();
  for (const group of scan.groups) for (const file of group.files) {
    byId.set(file.id, file);
    groupById.set(file.id, group);
  }
  const unknown = selected.filter((id) => !byId.has(id));
  for (const id of unknown) rememberError(results, id, id, 'This file was not part of the current version scan.');
  const validSelected = selected.filter((id) => byId.has(id));
  const selectedSet = new Set(validSelected);
  const selectedGroups = scan.groups.filter((group) => group.files.some((file) => selectedSet.has(file.id)));
  try {
    await checkRecycleCancelled(signal);
    for (const group of selectedGroups) {
      await checkRecycleCancelled(signal);
      const targets = group.files.filter((file) => selectedSet.has(file.id));
      const keeperCandidates = group.files.filter((file) => !selectedSet.has(file.id));
      if (!keeperCandidates.length) {
        for (const target of targets) rememberError(results, target.id, target.name, 'Keep at least one file from every related group.');
        continue;
      }
      progress('revalidate', { groupId: group.id });
      for (const target of targets) {
        await checkRecycleCancelled(signal);
        if (!(await rootStillMatches(scan.root))) {
          rememberError(results, target.id, target.name, 'The selected folder changed after the scan.');
          continue;
        }
        let keeper = null;
        for (const candidate of keeperCandidates) {
          await checkRecycleCancelled(signal);
          if (await fileStillMatches(scan.root, candidate, candidate.identity)) {
            keeper = candidate;
            break;
          }
        }
        if (!keeper) {
          rememberError(results, target.id, target.name, 'No unchanged copy from this group could be verified to keep.');
          continue;
        }
        if (!(await fileStillMatches(scan.root, target, target.identity))) {
          rememberError(results, target.id, target.name, 'The file changed after the scan.');
          continue;
        }
        // Verify the keeper again as the final filesystem operation before invoking OS trash.
        if (!(await fileStillMatches(scan.root, keeper, keeper.identity))) {
          rememberError(results, target.id, target.name, 'The copy selected to keep changed before recycling.');
          continue;
        }
        if (!(await rootStillMatches(scan.root))) {
          rememberError(results, target.id, target.name, 'The selected folder changed before recycling.');
          continue;
        }
        await checkRecycleCancelled(signal);
        try {
          await trashItem(target.path);
          results.success++;
          results.successIds.push(target.id);
        } catch (error) {
          rememberError(results, target.id, target.name, String(error?.message || 'Could not move this file to the Recycle Bin.').slice(0, 220));
        }
        progress('recycle', { groupId: group.id, fileId: target.id });
      }
    }
  } catch (error) {
    if (error?.name !== 'AbortError') throw error;
    results.cancelled = true;
    const completed = new Set([...results.successIds, ...results.errors.map((item) => item.id)]);
    for (const id of validSelected) if (!completed.has(id)) rememberError(results, id, byId.get(id).name, 'Recycling was cancelled before this file was moved.');
  }
  progress(results.cancelled ? 'cancelled' : 'complete');
  return results;
}

/** Return bounded local text excerpts for two members of the same trusted scan group. */
async function compareDocumentVersions(input = {}, scanIdArg, leftIdArg, rightIdArg, signalArg) {
  const options = input && typeof input === 'object'
    ? input
    : { rootPath: input, scanId: scanIdArg, leftId: leftIdArg, rightId: rightIdArg, signal: signalArg };
  const { rootPath, scanId, leftId, rightId, signal } = options;
  const scan = scanRegistry.get(scanId);
  if (!scan || scan.expiresAt <= Date.now()) throw new Error('This version scan has expired. Scan the folder again.');
  if (typeof rootPath !== 'string' || normalizePath(path.resolve(rootPath)) !== normalizePath(scan.root.path)) {
    throw new Error('The selected folder does not match the scan.');
  }
  if (!(await rootStillMatches(scan.root))) throw new Error('The selected folder changed after the scan.');
  const group = scan.groups.find((entry) => entry.files.some((file) => file.id === leftId)
    && entry.files.some((file) => file.id === rightId));
  if (!group || leftId === rightId) throw new Error('Choose two different files from the same related group.');
  const left = group.files.find((file) => file.id === leftId);
  const right = group.files.find((file) => file.id === rightId);
  if (!(await fileStillMatches(scan.root, left, left.identity)) || !(await fileStillMatches(scan.root, right, right.identity))) {
    throw new Error('A file changed after the scan. Scan the folder again before comparing.');
  }
  const [leftResult, rightResult] = await Promise.all([
    readDocumentText(scan.root.path, left, { signal }),
    readDocumentText(scan.root.path, right, { signal }),
  ]);
  if (signal?.aborted) throw new DocumentVersionRecycleCancelledError();
  if ((leftResult.identity && leftResult.identity !== left.identity)
    || (rightResult.identity && rightResult.identity !== right.identity)
    || !(await rootStillMatches(scan.root))
    || !(await fileStillMatches(scan.root, left, left.identity))
    || !(await fileStillMatches(scan.root, right, right.identity))) {
    throw new Error('A file changed while the comparison was being prepared. Scan the folder again.');
  }
  const normalizeText = (value) => String(value || '').normalize('NFKC').replace(/\r\n?/g, '\n').replace(/[\t ]+/g, ' ').trim();
  const leftText = normalizeText(leftResult.text);
  const rightText = normalizeText(rightResult.text);
  const sameText = leftResult.truncated || rightResult.truncated
    ? (leftText === rightText ? null : false)
    : leftText === rightText;
  const summary = sameText === true
    ? 'The readable text matches.'
    : sameText === false
      ? 'The readable text differs.'
      : 'The readable prefixes match; the remaining text may differ.';
  return {
    left: { id: left.id, name: left.name, text: String(leftResult.text || '').slice(0, 12_000), truncated: Boolean(leftResult.truncated) },
    right: { id: right.id, name: right.name, text: String(rightResult.text || '').slice(0, 12_000), truncated: Boolean(rightResult.truncated) },
    sameText,
    summary,
  };
}

function releaseDocumentVersionScan(scanId) {
  return scanRegistry.delete(scanId);
}

module.exports = {
  DocumentVersionScanCancelledError,
  DocumentVersionRecycleCancelledError,
  scanDocumentVersions,
  recycleDocumentVersions,
  compareDocumentVersions,
  releaseDocumentVersionScan,
};
