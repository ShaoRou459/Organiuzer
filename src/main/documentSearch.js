'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  assertDocumentFresh,
  documentFileIdentity,
  documentKind,
  isExcludedSegment,
  isPathInside,
  readDocumentText,
} = require('./documentText');

const DEFAULT_MAX_FILES = 5_000;
const DEFAULT_MAX_DIRECTORIES = 2_000;
const DEFAULT_MAX_DEPTH = 32;
const DEFAULT_MAX_EXTRACTED_FILES = 300;
const DEFAULT_MAX_EXTRACT_BYTES = 32 * 1024 * 1024;
const DEFAULT_MAX_RESULTS = 100;
const MAX_DIAGNOSTICS = 100;
const MAX_CACHE_ENTRIES = 48;
const MAX_CACHE_CHARS = 600_000;

const textCache = new Map();
let cachedChars = 0;

function cancelledError() {
  const error = new Error('Document search was cancelled.');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
}

function checkCancelled(signal) {
  if (signal?.aborted) throw cancelledError();
}

function emitProgress(callback, value) {
  if (typeof callback !== 'function') return;
  try {
    const result = callback(value);
    if (result && typeof result.then === 'function') result.catch(() => {});
  } catch { }
}

function boundedInteger(value, fallback, maximum) {
  if (!Number.isFinite(Number(value))) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(Number(value))));
}

function normalize(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('en-US');
}

function matchesQuery(value, normalizedQuery, terms) {
  const candidate = normalize(value);
  return candidate.includes(normalizedQuery) || terms.every((term) => candidate.includes(term));
}

function makeSnippet(text, normalizedQuery, terms) {
  const oneLine = String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const lower = normalize(oneLine);
  let matchAt = lower.indexOf(normalizedQuery);
  if (matchAt < 0) {
    const offsets = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0);
    matchAt = offsets.length ? Math.min(...offsets) : 0;
  }
  const start = Math.max(0, matchAt - 76);
  const end = Math.min(oneLine.length, matchAt + Math.max(160, normalizedQuery.length + 72));
  return `${start > 0 ? '…' : ''}${oneLine.slice(start, end)}${end < oneLine.length ? '…' : ''}`.slice(0, 300);
}

function normalizeSkippedName(root, filePath) {
  const relative = path.relative(root, filePath);
  return relative || path.basename(filePath);
}

function pushSkip(skipped, name, reason, kind, stats) {
  if (skipped.length < MAX_DIAGNOSTICS) skipped.push({ name, reason, kind });
  else stats.skippedDetailsTruncated = true;
}

function addCachedText(key, value) {
  const size = value.text.length;
  if (size > MAX_CACHE_CHARS) return;
  const previous = textCache.get(key);
  if (previous) cachedChars -= previous.text.length;
  textCache.delete(key);
  textCache.set(key, value);
  cachedChars += size;
  while (textCache.size > MAX_CACHE_ENTRIES || cachedChars > MAX_CACHE_CHARS) {
    const oldestKey = textCache.keys().next().value;
    const oldest = textCache.get(oldestKey);
    textCache.delete(oldestKey);
    cachedChars -= oldest?.text.length || 0;
  }
}

function getCachedText(key) {
  const value = textCache.get(key);
  if (!value) return null;
  textCache.delete(key);
  textCache.set(key, value);
  return value;
}

function clearDocumentSearchCache() {
  textCache.clear();
  cachedChars = 0;
}

async function yieldToEventLoop() {
  await new Promise((resolve) => setImmediate(resolve));
}

function statIdentityRoot(stat) {
  return `${stat.dev}:${stat.ino}:${stat.mode}`;
}

function rootCacheIdentity(realPath, stat) {
  const resolved = path.resolve(realPath);
  const normalizedPath = process.platform === 'win32' || process.platform === 'darwin'
    ? resolved.toLocaleLowerCase('en-US') : resolved;
  return `${normalizedPath}\0${statIdentityRoot(stat)}`;
}

/**
 * Search local names and bounded text below a selected folder. No network calls
 * are made. Extracted text is cached in memory only and keyed by file identity.
 */
async function searchDocuments(rootPath, query, {
  signal,
  onProgress,
  maxFiles = DEFAULT_MAX_FILES,
  maxDirectories = DEFAULT_MAX_DIRECTORIES,
  maxDepth = DEFAULT_MAX_DEPTH,
  maxExtractedFiles = DEFAULT_MAX_EXTRACTED_FILES,
  maxExtractBytes = DEFAULT_MAX_EXTRACT_BYTES,
  maxResults = DEFAULT_MAX_RESULTS,
} = {}) {
  checkCancelled(signal);
  if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath)) throw new TypeError('A full folder path is required.');
  const normalizedQuery = normalize(query).trim().slice(0, 256);
  if (!normalizedQuery) {
    return {
      results: [],
      stats: { scannedFiles: 0, searchedContentFiles: 0, matchedFiles: 0, skippedFiles: 0, skippedDirectories: 0, guidance: 'Enter a word or phrase to search this folder.' },
      skipped: [],
    };
  }

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const limits = {
    maxFiles: boundedInteger(maxFiles, DEFAULT_MAX_FILES, DEFAULT_MAX_FILES),
    maxDirectories: boundedInteger(maxDirectories, DEFAULT_MAX_DIRECTORIES, DEFAULT_MAX_DIRECTORIES),
    maxDepth: boundedInteger(maxDepth, DEFAULT_MAX_DEPTH, DEFAULT_MAX_DEPTH),
    maxExtractedFiles: boundedInteger(maxExtractedFiles, DEFAULT_MAX_EXTRACTED_FILES, DEFAULT_MAX_EXTRACTED_FILES),
    maxExtractBytes: boundedInteger(maxExtractBytes, DEFAULT_MAX_EXTRACT_BYTES, DEFAULT_MAX_EXTRACT_BYTES),
    maxResults: boundedInteger(maxResults, DEFAULT_MAX_RESULTS, DEFAULT_MAX_RESULTS),
  };
  const root = path.resolve(rootPath);
  const rootStat = await fs.lstat(root, { bigint: true });
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Choose a regular folder, not a shortcut or file.');
  const rootRealPath = await fs.realpath(root);
  const cacheRoot = rootCacheIdentity(rootRealPath, rootStat);

  const stats = {
    scannedFiles: 0,
    totalDirectories: 0,
    searchedContentFiles: 0,
    extractedFiles: 0,
    cachedFiles: 0,
    matchedFiles: 0,
    matchedByName: 0,
    matchedByContent: 0,
    skippedFiles: 0,
    skippedDirectories: 0,
    unreadableFiles: 0,
    truncatedFiles: 0,
    limitedPdfFiles: 0,
    limitedTextFiles: 0,
    extractionLimited: 0,
    bytesRead: 0,
    fileLimitReached: false,
    directoryLimitReached: false,
    depthLimitReached: false,
    resultsTruncated: false,
    skippedDetailsTruncated: false,
    maxFiles: limits.maxFiles,
    maxDirectories: limits.maxDirectories,
    maxDepth: limits.maxDepth,
    maxExtractedFiles: limits.maxExtractedFiles,
    maxExtractBytes: limits.maxExtractBytes,
  };
  const skipped = [];
  const candidates = [];
  const pending = [{ path: root, depth: 0 }];

  while (pending.length) {
    checkCancelled(signal);
    const directory = pending.pop();
    if (stats.totalDirectories >= limits.maxDirectories) {
      stats.directoryLimitReached = true;
      stats.skippedDirectories += pending.length + 1;
      pushSkip(skipped, normalizeSkippedName(root, directory.path), `Search reached the ${limits.maxDirectories} folder limit.`, 'directory', stats);
      break;
    }
    stats.totalDirectories++;
    try {
      const directoryStat = await fs.lstat(directory.path, { bigint: true });
      if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
        stats.skippedDirectories++;
        pushSkip(skipped, normalizeSkippedName(root, directory.path), 'Folder is no longer a regular directory.', 'directory', stats);
        continue;
      }
      const realDirectory = await fs.realpath(directory.path);
      if (!isPathInside(rootRealPath, realDirectory) && path.resolve(realDirectory) !== rootRealPath) {
        stats.skippedDirectories++;
        pushSkip(skipped, normalizeSkippedName(root, directory.path), 'Folder points outside the selected folder.', 'directory', stats);
        continue;
      }
      const entries = await fs.readdir(directory.path, { withFileTypes: true });
      // Reverse push preserves natural alphabetical traversal with a LIFO stack.
      entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
      for (let index = entries.length - 1; index >= 0; index--) {
        checkCancelled(signal);
        const entry = entries[index];
        const entryPath = path.join(directory.path, entry.name);
        if (isExcludedSegment(entry.name)) {
          if (entry.isDirectory()) stats.skippedDirectories++;
          else stats.skippedFiles++;
          continue;
        }
        if (entry.isSymbolicLink()) {
          if (entry.isDirectory()) stats.skippedDirectories++;
          else stats.skippedFiles++;
          pushSkip(skipped, normalizeSkippedName(root, entryPath), 'Symbolic links are not searched.', entry.isDirectory() ? 'directory' : 'file', stats);
          continue;
        }
        try {
          const stat = await fs.lstat(entryPath, { bigint: true });
          if (stat.isSymbolicLink()) {
            if (stat.isDirectory()) stats.skippedDirectories++;
            else stats.skippedFiles++;
            pushSkip(skipped, normalizeSkippedName(root, entryPath), 'Symbolic links are not searched.', stat.isDirectory() ? 'directory' : 'file', stats);
            continue;
          }
          if (stat.isDirectory()) {
            if (directory.depth + 1 >= limits.maxDepth) {
              stats.depthLimitReached = true;
              stats.skippedDirectories++;
              continue;
            }
            pending.push({ path: entryPath, depth: directory.depth + 1 });
            continue;
          }
          if (!stat.isFile()) {
            stats.skippedFiles++;
            pushSkip(skipped, normalizeSkippedName(root, entryPath), 'Non-file system entries are not searched.', 'file', stats);
            continue;
          }
          if (stat.nlink !== 1n) {
            stats.skippedFiles++;
            pushSkip(skipped, normalizeSkippedName(root, entryPath), 'Hard-linked files are not searched.', 'file', stats);
            continue;
          }
          const realFile = await fs.realpath(entryPath);
          if (!isPathInside(rootRealPath, realFile)) {
            stats.skippedFiles++;
            pushSkip(skipped, normalizeSkippedName(root, entryPath), 'File points outside the selected folder.', 'file', stats);
            continue;
          }
          candidates.push({
            name: entry.name,
            path: entryPath,
            relativePath: normalizeSkippedName(root, entryPath),
            extension: path.extname(entry.name).toLowerCase(),
            kind: documentKind(entry.name)?.kind || 'file',
            size: Number(stat.size),
            modifiedAt: Number(stat.mtimeMs),
            identity: documentFileIdentity(stat),
          });
          stats.scannedFiles++;
          if (stats.scannedFiles >= limits.maxFiles) {
            stats.fileLimitReached = pending.length > 0 || index > 0;
            break;
          }
        } catch (error) {
          stats.skippedFiles++;
          pushSkip(skipped, normalizeSkippedName(root, entryPath), error?.code === 'ENOENT' ? 'File disappeared during the scan.' : 'File could not be inspected.', 'file', stats);
        }
        if (stats.scannedFiles > 0 && stats.scannedFiles % 100 === 0) {
          emitProgress(onProgress, { phase: 'scan', scannedFiles: stats.scannedFiles, totalFiles: null, searchedContentFiles: 0, currentPath: normalizeSkippedName(root, entryPath) });
          await yieldToEventLoop();
        }
      }
      if (stats.fileLimitReached) {
        stats.skippedFiles += 1;
        pushSkip(skipped, normalizeSkippedName(root, directory.path), `Search stopped after ${limits.maxFiles} files.`, 'limit', stats);
        break;
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      stats.skippedDirectories++;
      pushSkip(skipped, normalizeSkippedName(root, directory.path), 'Folder could not be read.', 'directory', stats);
    }
  }

  const results = [];
  let lastProgress = 0;
  for (const [index, candidate] of candidates.entries()) {
    checkCancelled(signal);
    const nameMatch = matchesQuery(`${candidate.name} ${candidate.relativePath}`, normalizedQuery, terms);
    if (nameMatch) {
      try {
        await assertDocumentFresh(root, candidate, { rootIdentity: statIdentityRoot(rootStat), rootRealPath, signal });
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        stats.skippedFiles++;
        pushSkip(skipped, candidate.relativePath, String(error?.message || 'File or folder changed after the scan.').slice(0, 180), 'file', stats);
        continue;
      }
      results.push({ ...candidate, matchIn: 'name', snippet: candidate.relativePath, truncated: false });
      stats.matchedByName++;
    } else {
      const type = documentKind(candidate.name);
      if (type) {
        const cacheKey = `${cacheRoot}\0${candidate.identity}`;
        let extracted = getCachedText(cacheKey);
        let candidateFresh = true;
        if (extracted) {
          try {
            await assertDocumentFresh(root, candidate, { rootIdentity: statIdentityRoot(rootStat), rootRealPath, signal });
            stats.cachedFiles++;
          } catch (error) {
            if (error?.name === 'AbortError') throw error;
            candidateFresh = false;
            extracted = null;
            stats.skippedFiles++;
            pushSkip(skipped, candidate.relativePath, String(error?.message || 'File or folder changed after the cached text was prepared.').slice(0, 180), 'file', stats);
          }
        }
        if (candidateFresh && !extracted && (stats.extractedFiles >= limits.maxExtractedFiles
          || stats.bytesRead + Math.min(candidate.size, type.maxBytes) > limits.maxExtractBytes)) {
          stats.extractionLimited++;
        } else if (candidateFresh && !extracted) {
          stats.extractedFiles++;
          stats.bytesRead += Math.min(candidate.size, type.maxBytes);
          try {
            extracted = await readDocumentText(root, candidate, { signal });
            addCachedText(cacheKey, extracted);
          } catch (error) {
            if (error?.name === 'AbortError') throw error;
            stats.unreadableFiles++;
            stats.skippedFiles++;
            pushSkip(skipped, candidate.relativePath, String(error?.message || 'Document could not be read.').slice(0, 180), 'file', stats);
          }
        }
        if (extracted) {
          stats.searchedContentFiles++;
          if (extracted.truncated) {
            stats.truncatedFiles++;
            if (extracted.kind === 'pdf') stats.limitedPdfFiles++;
            else stats.limitedTextFiles++;
          }
          if (matchesQuery(extracted.text, normalizedQuery, terms)) {
            results.push({
              ...candidate,
              matchIn: 'content',
              snippet: makeSnippet(extracted.text, normalizedQuery, terms),
              truncated: extracted.truncated,
            });
            stats.matchedByContent++;
          }
        }
      }
    }

    if (index === candidates.length - 1 || index - lastProgress >= 24) {
      lastProgress = index;
      emitProgress(onProgress, {
        phase: 'search',
        scannedFiles: stats.scannedFiles,
        totalFiles: candidates.length,
        searchedContentFiles: stats.searchedContentFiles,
        extractedFiles: stats.extractedFiles,
        currentPath: candidate.relativePath,
      });
      await yieldToEventLoop();
    }
  }

  results.sort((a, b) => (a.matchIn === b.matchIn ? 0 : a.matchIn === 'name' ? -1 : 1)
    || normalize(a.relativePath).localeCompare(normalize(b.relativePath), 'en')
    || a.relativePath.localeCompare(b.relativePath, 'en'));
  stats.matchedFiles = results.length;
  if (results.length > limits.maxResults) {
    stats.resultsTruncated = true;
    results.length = limits.maxResults;
  }
  return { results, stats, skipped };
}

module.exports = { clearDocumentSearchCache, searchDocuments };
