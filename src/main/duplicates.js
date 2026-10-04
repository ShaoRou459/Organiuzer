'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const SAMPLE_WINDOW_BYTES = 64 * 1024;
const READ_ALL_SAMPLE_LIMIT = 256 * 1024;
const FULL_HASH_READ_BYTES = 1024 * 1024;
const HASH_CONCURRENCY = 8;
const ISSUE_LIMIT = 100;
const RECYCLE_ERROR_LIMIT = 100;
const IGNORED_DIRECTORIES = new Set([
  'node_modules', 'venv', 'env', '.env', '__pycache__', 'dist', 'build', 'out', 'target', '.git', '.vscode', '.idea',
]);
const COPY_NAME_PATTERNS = [
  /(?:^|[\s._-])(?:copy|duplicate)(?:[\s._-]?(?:\d+|\(\d+\)))?$/i,
  /\(\d+\)$/i,
  /^copy of /i,
];
const CASE_INSENSITIVE_PATHS = process.platform === 'win32' || process.platform === 'darwin';

class DuplicateScanCancelledError extends Error {
  constructor() {
    super('Duplicate scan was cancelled.');
    this.name = 'AbortError';
    this.code = 'ABORT_ERR';
  }
}

function normalizePath(value) {
  const resolved = path.resolve(String(value || ''));
  return CASE_INSENSITIVE_PATHS ? resolved.toLowerCase() : resolved;
}

function pathIsInside(rootPath, candidatePath) {
  const root = path.resolve(rootPath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isAbortRequested(signal) {
  return Boolean(signal?.aborted);
}

async function checkCancelled(signal, shouldCancel) {
  if (isAbortRequested(signal)) throw new DuplicateScanCancelledError();
  if (typeof shouldCancel === 'function' && await shouldCancel()) throw new DuplicateScanCancelledError();
}

function statSignature(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.nlink, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':');
}

function getFileIdentity(stat) {
  // Some filesystems do not expose a useful inode. In that case, do not collapse
  // distinct paths based on incomplete metadata.
  if (stat.ino === 0n || stat.ino === 0 || stat.ino === undefined || stat.dev === undefined) return null;
  return `${stat.dev}:${stat.ino}`;
}

function addIssue(stats, filePath, reason, kind = 'file') {
  if (kind === 'directory') stats.skippedDirectories++;
  else stats.skippedFiles++;
  if (stats.issues.length < ISSUE_LIMIT) stats.issues.push({ path: filePath, reason, kind });
}

function snapshotStats(stats) {
  return { ...stats, issues: stats.issues.slice() };
}

function emitProgress(onProgress, stats, phase, extra = {}) {
  stats.phase = phase;
  if (typeof onProgress !== 'function') return;
  try {
    const result = onProgress({ ...snapshotStats(stats), ...extra });
    if (result && typeof result.then === 'function') result.catch(() => {});
  } catch {
    // Progress is best-effort; a closed renderer must not interrupt the scan.
  }
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  });
  const settled = await Promise.allSettled(workers);
  const failed = settled.find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
  return results;
}

function makeSampleRanges(size) {
  if (size <= READ_ALL_SAMPLE_LIMIT) return size === 0 ? [] : [{ start: 0, length: size }];

  const windowSize = SAMPLE_WINDOW_BYTES;
  const candidates = [
    0,
    Math.floor((size - windowSize) / 2),
    size - windowSize,
  ].map((start) => ({ start, end: start + windowSize })).sort((a, b) => a.start - b.start);

  const merged = [];
  for (const range of candidates) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged.map(({ start, end }) => ({ start, length: end - start }));
}

async function readExactRange(handle, start, length, onBytesRead, signal, shouldCancel) {
  const buffer = Buffer.allocUnsafe(length);
  let offset = 0;
  while (offset < length) {
    await checkCancelled(signal, shouldCancel);
    const { bytesRead } = await handle.read(buffer, offset, length - offset, start + offset);
    if (bytesRead <= 0) throw new Error('File ended while it was being read.');
    offset += bytesRead;
    onBytesRead(bytesRead);
  }
  return buffer;
}

async function withStableFile(filePath, expectedSignature, operation, { signal, shouldCancel } = {}) {
  await checkCancelled(signal, shouldCancel);
  const beforePath = await fsp.lstat(filePath, { bigint: true });
  if (!beforePath.isFile() || beforePath.isSymbolicLink()) throw new Error('Path is no longer a regular file.');
  const beforeSignature = statSignature(beforePath);
  if (expectedSignature && beforeSignature !== expectedSignature) throw new Error('File changed after it was scanned.');

  let flags = fs.constants.O_RDONLY;
  if (process.platform !== 'win32' && typeof fs.constants.O_NOFOLLOW === 'number') flags |= fs.constants.O_NOFOLLOW;
  const handle = await fsp.open(filePath, flags);
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || statSignature(opened) !== beforeSignature) throw new Error('File changed while it was being opened.');
    const boundPath = await fsp.lstat(filePath, { bigint: true });
    if (!boundPath.isFile() || boundPath.isSymbolicLink() || statSignature(boundPath) !== beforeSignature) {
      throw new Error('Path changed while the file was being opened.');
    }

    const value = await operation(handle, opened);
    await checkCancelled(signal, shouldCancel);
    const afterHandle = await handle.stat({ bigint: true });
    const afterPath = await fsp.lstat(filePath, { bigint: true });
    if (!afterPath.isFile() || afterPath.isSymbolicLink()
      || statSignature(afterHandle) !== beforeSignature
      || statSignature(afterPath) !== beforeSignature) {
      throw new Error('File changed while it was being read.');
    }
    return { value, stat: opened };
  } finally {
    await handle.close().catch(() => {});
  }
}

async function hashSample(file, context) {
  const { stats, signal, shouldCancel } = context;
  const ranges = makeSampleRanges(file.size);
  const result = await withStableFile(file.path, file.signature, async (handle) => {
    const digest = crypto.createHash('sha256');
    digest.update('organiuzer-sample-v1\0');
    digest.update(String(file.size));
    let completeBuffer = null;
    for (const range of ranges) {
      const bytes = await readExactRange(
        handle,
        range.start,
        range.length,
        (count) => { stats.bytesRead += count; },
        signal,
        shouldCancel,
      );
      digest.update('\0');
      digest.update(String(range.start));
      digest.update('\0');
      digest.update(bytes);
      if (ranges.length === 1 && range.start === 0 && range.length === file.size) completeBuffer = bytes;
    }
    const sampleHash = digest.digest('hex');
    const fullHash = completeBuffer !== null
      ? crypto.createHash('sha256').update(completeBuffer).digest('hex')
      : null;
    return { sampleHash, fullHash };
  }, { signal, shouldCancel });
  return result.value;
}

async function hashFull(filePath, context, expectedSignature) {
  const { stats, signal, shouldCancel } = context;
  const digest = crypto.createHash('sha256');
  const result = await withStableFile(filePath, expectedSignature, async (handle, stat) => {
    const size = Number(stat.size);
    if (!Number.isSafeInteger(size)) throw new Error('File is too large to process safely.');
    const buffer = Buffer.allocUnsafe(FULL_HASH_READ_BYTES);
    let position = 0;
    while (position < size) {
      await checkCancelled(signal, shouldCancel);
      const length = Math.min(buffer.length, size - position);
      const { bytesRead } = await handle.read(buffer, 0, length, position);
      if (bytesRead <= 0) throw new Error('File ended while it was being read.');
      digest.update(buffer.subarray(0, bytesRead));
      stats.bytesRead += bytesRead;
      position += bytesRead;
    }
    return {
      hash: digest.digest('hex'),
      size,
      identity: getFileIdentity(stat),
      links: Number(stat.nlink),
      signature: statSignature(stat),
    };
  }, { signal, shouldCancel });
  return result.value;
}

function nameLooksLikeCopy(filePath) {
  const extension = path.extname(filePath);
  const name = path.basename(filePath, extension);
  return COPY_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareKeeper(a, b) {
  const aCopy = nameLooksLikeCopy(a.path);
  const bCopy = nameLooksLikeCopy(b.path);
  if (aCopy !== bCopy) return aCopy ? 1 : -1;

  const aDepth = a.path.split(path.sep).length;
  const bDepth = b.path.split(path.sep).length;
  if (aDepth !== bDepth) return aDepth - bDepth;

  const aName = path.basename(a.path);
  const bName = path.basename(b.path);
  if (aName.length !== bName.length) return aName.length - bName.length;

  const compareKnownEarlier = (aValue, bValue) => {
    const aKnown = Number.isFinite(aValue) && aValue > 0;
    const bKnown = Number.isFinite(bValue) && bValue > 0;
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    return aKnown && aValue !== bValue ? aValue - bValue : 0;
  };
  const birthOrder = compareKnownEarlier(Number(a.birthtimeMs || 0), Number(b.birthtimeMs || 0));
  if (birthOrder) return birthOrder;

  const modifiedOrder = compareKnownEarlier(Number(a.mtimeMs || 0), Number(b.mtimeMs || 0));
  if (modifiedOrder) return modifiedOrder;

  const normalized = compareText(normalizePath(a.path), normalizePath(b.path));
  return normalized || compareText(a.path, b.path);
}

function distinctPhysicalFiles(files) {
  const seen = new Set();
  return files.filter((file) => {
    const identity = file.identity;
    if (!identity) return true;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

async function inspectRoot(rootPath) {
  if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath)) {
    throw new TypeError('A full folder path is required.');
  }
  const resolved = path.resolve(rootPath);
  const stat = await fsp.stat(resolved);
  if (!stat.isDirectory()) throw new TypeError('The selected path is not a folder.');
  return resolved;
}

/**
 * Find byte-identical regular files in a folder tree.
 *
 * Small files are hashed in one read. Larger files pass a three-window sample
 * filter before a full SHA-256 read, so a sample match can never create a false
 * duplicate. Symlinks are excluded, and multiple hard-linked names count as one
 * physical file. `onProgress` receives snapshots with a `phase` of scan,
 * sample, full-hash, or complete. Cancellation rejects with an AbortError.
 */
async function findDuplicates(rootPath, options = {}) {
  const root = await inspectRoot(rootPath);
  const recursive = options.recursive !== false;
  const signal = options.signal;
  const shouldCancel = options.shouldCancel;
  const onProgress = options.onProgress;
  const stats = {
    scannedFiles: 0,
    skippedFiles: 0,
    skippedDirectories: 0,
    excludedFiles: 0,
    excludedDirectories: 0,
    symlinksSkipped: 0,
    hardlinksSkipped: 0,
    bytesRead: 0,
    phase: 'scan',
    issues: [],
  };
  const sizeGroups = new Map();
  const ignored = new Set(Array.from(IGNORED_DIRECTORIES, (name) => CASE_INSENSITIVE_PATHS ? name.toLowerCase() : name));

  async function scanDirectory(currentPath, isRoot = false) {
    await checkCancelled(signal, shouldCancel);
    let entries;
    try {
      entries = await fsp.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      if (isRoot) throw error;
      addIssue(stats, currentPath, error?.message || 'Could not read this folder.', 'directory');
      emitProgress(onProgress, stats, 'scan', { currentPath });
      return;
    }

    for (const entry of entries) {
      await checkCancelled(signal, shouldCancel);
      const fullPath = path.join(currentPath, entry.name);
      if (entry.name.startsWith('.')) {
        if (entry.isDirectory()) stats.excludedDirectories++;
        else stats.excludedFiles++;
        continue;
      }
      const ignoredKey = CASE_INSENSITIVE_PATHS ? entry.name.toLowerCase() : entry.name;
      if (entry.isDirectory() && ignored.has(ignoredKey)) {
        stats.excludedDirectories++;
        continue;
      }
      if (entry.isDirectory()) {
        if (recursive) await scanDirectory(fullPath);
        else stats.excludedDirectories++;
        continue;
      }
      if (entry.isSymbolicLink()) {
        stats.symlinksSkipped++;
        stats.excludedFiles++;
        continue;
      }
      if (!entry.isFile()) continue;

      try {
        const stat = await fsp.lstat(fullPath, { bigint: true });
        if (!stat.isFile() || stat.isSymbolicLink()) {
          stats.symlinksSkipped++;
          stats.excludedFiles++;
          continue;
        }
        stats.scannedFiles++;
        if (stat.nlink > 1n) {
          stats.hardlinksSkipped++;
          stats.excludedFiles++;
          continue;
        }
        const size = Number(stat.size);
        if (!Number.isSafeInteger(size)) {
          addIssue(stats, fullPath, 'File is too large to process safely.');
          continue;
        }
        const file = {
          path: fullPath,
          size,
          signature: statSignature(stat),
          identity: getFileIdentity(stat),
          birthtimeMs: Number(stat.birthtimeMs || 0),
          mtimeMs: Number(stat.mtimeMs || 0),
        };
        if (!sizeGroups.has(size)) sizeGroups.set(size, []);
        sizeGroups.get(size).push(file);
      } catch (error) {
        addIssue(stats, fullPath, error?.message || 'Could not inspect this file.');
      }
      emitProgress(onProgress, stats, 'scan', { currentPath: fullPath });
    }
  }

  emitProgress(onProgress, stats, 'scan', { rootPath: root });
  await scanDirectory(root, true);
  await checkCancelled(signal, shouldCancel);

  const candidates = Array.from(sizeGroups.values()).filter((files) => files.length > 1).flat();
  const context = { stats, signal, shouldCancel };
  const samples = new Map();
  let sampled = 0;
  emitProgress(onProgress, stats, 'sample', { totalCandidates: candidates.length, processedCandidates: 0 });
  await mapLimit(candidates, HASH_CONCURRENCY, async (file) => {
    await checkCancelled(signal, shouldCancel);
    try {
      const sample = await hashSample(file, context);
      samples.set(file, sample);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      addIssue(stats, file.path, error?.message || 'Could not compare this file.');
    }
    sampled++;
    emitProgress(onProgress, stats, 'sample', { totalCandidates: candidates.length, processedCandidates: sampled });
  });

  const sampleGroups = new Map();
  for (const [file, sample] of samples) {
    const sizeKey = `${file.size}:${sample.sampleHash}`;
    if (!sampleGroups.has(sizeKey)) sampleGroups.set(sizeKey, []);
    sampleGroups.get(sizeKey).push({ file, sample });
  }

  const ambiguous = Array.from(sampleGroups.values()).filter((group) => group.length > 1);
  const fullHashTasks = ambiguous.flatMap((group) => group
    .filter(({ sample }) => !sample.fullHash)
    .map(({ file }) => file));
  const fullHashes = new Map();
  let hashed = 0;
  emitProgress(onProgress, stats, 'full-hash', { totalCandidates: fullHashTasks.length, processedCandidates: 0 });
  await mapLimit(fullHashTasks, HASH_CONCURRENCY, async (file) => {
    await checkCancelled(signal, shouldCancel);
    try {
      fullHashes.set(file, await hashFull(file.path, context, file.signature));
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      addIssue(stats, file.path, error?.message || 'Could not finish comparing this file.');
    }
    hashed++;
    emitProgress(onProgress, stats, 'full-hash', { totalCandidates: fullHashTasks.length, processedCandidates: hashed });
  });

  const byHash = new Map();
  for (const group of ambiguous) {
    for (const { file, sample } of group) {
      const full = sample.fullHash ? { hash: sample.fullHash, size: file.size } : fullHashes.get(file);
      if (!full || full.size !== file.size) continue;
      if (!byHash.has(full.hash)) byHash.set(full.hash, []);
      byHash.get(full.hash).push(file);
    }
  }

  const groups = [];
  for (const [hash, sameContent] of byHash) {
    const uniqueFiles = distinctPhysicalFiles(sameContent).sort(compareKeeper);
    if (uniqueFiles.length < 2) continue;
    const stableFiles = [];
    for (const file of uniqueFiles) {
      try {
        const current = await fsp.lstat(file.path, { bigint: true });
        if (current.isFile() && !current.isSymbolicLink() && statSignature(current) === file.signature) stableFiles.push(file);
        else addIssue(stats, file.path, 'File changed before the scan results were ready.');
      } catch (error) {
        addIssue(stats, file.path, error?.message || 'Could not verify the final file state.');
      }
    }
    if (stableFiles.length < 2) continue;
    stableFiles.sort(compareKeeper);
    groups.push({ hash, size: stableFiles[0].size, files: stableFiles.map((file) => file.path) });
  }
  groups.sort((a, b) => {
    const aReclaimable = a.size * (a.files.length - 1);
    const bReclaimable = b.size * (b.files.length - 1);
    return (bReclaimable - aReclaimable) || compareText(a.files[0], b.files[0]) || compareText(a.hash, b.hash);
  });
  emitProgress(onProgress, stats, 'complete', { groups: groups.length });
  return { groups, stats: snapshotStats(stats) };
}

function validateGroup(group) {
  return group && typeof group.hash === 'string' && /^[a-f0-9]{64}$/i.test(group.hash)
    && Number.isSafeInteger(group.size) && group.size >= 0
    && Array.isArray(group.files) && group.files.length >= 2;
}

function normalizeSelection(selectedPaths) {
  return new Set((Array.isArray(selectedPaths) ? selectedPaths : [])
    .filter((value) => typeof value === 'string' && path.isAbsolute(value))
    .map(normalizePath));
}

function formatFailure(filePath, reason) {
  return `${path.basename(filePath)}: ${reason}`;
}

/**
 * Revalidate trusted scan groups and send selected duplicate copies to the OS
 * trash. One stable, matching file is retained for every group. `successPaths`
 * lets the renderer clear only successful selections after partial failures.
 * Cancellation returns partial results so completed trash operations are not
 * lost; unprocessed selections remain failures for the caller to retry.
 */
async function recycleDuplicates({
  rootPath,
  groups,
  selectedPaths,
  trashItem,
  signal,
  shouldCancel,
  onProgress,
} = {}) {
  if (typeof trashItem !== 'function') throw new TypeError('An OS trash operation is required.');
  const root = await inspectRoot(rootPath);
  const realRoot = await fsp.realpath(root);
  const selected = normalizeSelection(selectedPaths);
  const selectedOriginals = new Map();
  for (const value of Array.isArray(selectedPaths) ? selectedPaths : []) {
    if (typeof value === 'string' && path.isAbsolute(value)) selectedOriginals.set(normalizePath(value), value);
  }
  const requestedKeys = new Set(selected);
  const trustedFiles = new Map();
  const validGroups = (Array.isArray(groups) ? groups : []).filter(validateGroup);
  for (const group of validGroups) {
    for (const filePath of group.files) {
      if (typeof filePath === 'string' && path.isAbsolute(filePath)) trustedFiles.set(normalizePath(filePath), filePath);
    }
  }

  const results = { success: 0, failed: 0, successPaths: [], recycledPaths: [], errors: [], errorsTruncated: false, cancelled: false };
  const stats = { completed: 0, total: requestedKeys.size, phase: 'revalidate' };
  const progress = (phase, extra = {}) => {
    stats.phase = phase;
    if (typeof onProgress !== 'function') return;
    try {
      const result = onProgress({ ...stats, ...extra });
      if (result && typeof result.then === 'function') result.catch(() => {});
    } catch { }
  };
  const processed = new Set();
  const recordFailure = (key, filePath, message) => {
    if (processed.has(key)) return;
    processed.add(key);
    results.failed++;
    if (results.errors.length < RECYCLE_ERROR_LIMIT) {
      results.errors.push(formatFailure(filePath || selectedOriginals.get(key) || key, message));
    } else {
      results.errorsTruncated = true;
    }
  };
  const fileIsInsideRoot = async (filePath) => {
    if (!pathIsInside(root, filePath)) return false;
    const realPath = await fsp.realpath(filePath);
    return pathIsInside(realRoot, realPath);
  };

  const groupQueue = validGroups.filter((group) => group.files.some((filePath) => selected.has(normalizePath(filePath))));
  try {
    await checkCancelled(signal, shouldCancel);
    for (const group of groupQueue) {
      await checkCancelled(signal, shouldCancel);
      const requestedInGroup = group.files
        .filter((filePath) => selected.has(normalizePath(filePath)))
        .map((filePath) => ({ path: filePath, key: normalizePath(filePath) }));
      if (!requestedInGroup.length) continue;

      progress('revalidate', { groupHash: group.hash });
      const valid = [];
      for (const filePath of group.files) {
        await checkCancelled(signal, shouldCancel);
        const key = normalizePath(filePath);
        if (!path.isAbsolute(filePath) || !pathIsInside(root, filePath)) {
          if (selected.has(key)) recordFailure(key, filePath, 'path is outside the selected folder.');
          continue;
        }
        try {
          if (!(await fileIsInsideRoot(filePath))) {
            if (selected.has(key)) recordFailure(key, filePath, 'path no longer points inside the selected folder.');
            continue;
          }
          const hashed = await hashFull(filePath, { stats: { bytesRead: 0 }, signal, shouldCancel });
          if (hashed.size !== group.size || hashed.hash !== group.hash || hashed.links !== 1
            || !(await fileIsInsideRoot(filePath))) {
            if (selected.has(key)) recordFailure(key, filePath, 'file changed since the duplicate scan.');
            continue;
          }
          const stat = await fsp.lstat(filePath, { bigint: true });
          if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n
            || statSignature(stat) !== hashed.signature) {
            if (selected.has(key)) recordFailure(key, filePath, 'file changed after it was rechecked.');
            continue;
          }
          valid.push({
            path: filePath,
            key,
            identity: getFileIdentity(stat),
            birthtimeMs: Number(stat.birthtimeMs || 0),
            mtimeMs: Number(stat.mtimeMs || 0),
          });
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
          if (selected.has(key)) recordFailure(key, filePath, error?.message || 'could not recheck this file.');
        }
      }

      const physicalFiles = distinctPhysicalFiles(valid).sort(compareKeeper);
      if (physicalFiles.length < 2) {
        for (const item of requestedInGroup) recordFailure(item.key, item.path, 'no longer has another verified copy to keep.');
        continue;
      }

      const unselected = physicalFiles.filter((file) => !selected.has(file.key));
      let keeper = unselected[0] || physicalFiles[0];
      let keeperIsVerified = true;
      const recycleList = physicalFiles.filter((file) => selected.has(file.key) && file.key !== keeper.key);

      for (const target of recycleList) {
        await checkCancelled(signal, shouldCancel);
        // Check the would-be keeper again immediately before each trash action.
        // If it disappeared or changed, choose another intact path and preserve it.
        const keepOptions = physicalFiles
          .filter((file) => file.key !== target.key && !results.successPaths.some((success) => normalizePath(success) === file.key))
          .sort(compareKeeper);
        let verifiedKeeper = null;
        for (const option of keepOptions) {
          try {
            if (!(await fileIsInsideRoot(option.path))) continue;
            const current = await hashFull(option.path, { stats: { bytesRead: 0 }, signal, shouldCancel });
            const currentStat = await fsp.lstat(option.path, { bigint: true });
            if (current.size === group.size && current.hash === group.hash && current.links === 1
              && currentStat.isFile() && !currentStat.isSymbolicLink() && currentStat.nlink === 1n
              && statSignature(currentStat) === current.signature && await fileIsInsideRoot(option.path)) {
              verifiedKeeper = { ...option, verifiedSignature: current.signature };
              break;
            }
          } catch (error) {
            if (error?.name === 'AbortError') throw error;
          }
        }
        if (!verifiedKeeper) {
          keeperIsVerified = false;
          recordFailure(target.key, target.path, 'no stable matching copy could be verified to keep.');
          continue;
        }
        keeper = verifiedKeeper;
        keeperIsVerified = true;

        try {
          progress('target-recheck', { path: target.path, keeper: verifiedKeeper.path });
          if (!(await fileIsInsideRoot(target.path))) throw new Error('path no longer points inside the selected folder.');
          const currentTarget = await hashFull(target.path, { stats: { bytesRead: 0 }, signal, shouldCancel });
          if (currentTarget.size !== group.size || currentTarget.hash !== group.hash || currentTarget.links !== 1
            || !(await fileIsInsideRoot(target.path))) {
            throw new Error('file changed before it could be recycled.');
          }
          const targetStat = await fsp.lstat(target.path, { bigint: true });
          if (!targetStat.isFile() || targetStat.isSymbolicLink() || targetStat.nlink !== 1n
            || statSignature(targetStat) !== currentTarget.signature) {
            throw new Error('file changed before it could be recycled.');
          }
          await checkCancelled(signal, shouldCancel);

          // Target hashing may be slow. Check the retained copy after that work,
          // immediately before asking the OS to move the target to its trash.
          const keeperInside = await fileIsInsideRoot(verifiedKeeper.path);
          const keeperStat = keeperInside ? await fsp.lstat(verifiedKeeper.path, { bigint: true }) : null;
          if (!keeperStat || !keeperStat.isFile() || keeperStat.isSymbolicLink() || keeperStat.nlink !== 1n
            || statSignature(keeperStat) !== verifiedKeeper.verifiedSignature) {
            keeperIsVerified = false;
            throw new Error('the copy being kept changed while this file was rechecked.');
          }
          await trashItem(target.path);
          processed.add(target.key);
          results.success++;
          results.successPaths.push(target.path);
          results.recycledPaths.push(target.path);
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
          recordFailure(target.key, target.path, error?.message || 'could not move to the Recycle Bin.');
        }
        stats.completed = results.success + results.failed;
        progress('recycle', { path: target.path, keeper: keeper.path });
      }

      for (const item of requestedInGroup) {
        if (processed.has(item.key)) continue;
        if (keeperIsVerified && item.key === keeper.key) recordFailure(item.key, item.path, 'kept one verified copy of this duplicate set.');
        else recordFailure(item.key, item.path, 'could not safely recycle this selection.');
      }
    }
  } catch (error) {
    if (error?.name !== 'AbortError') throw error;
    results.cancelled = true;
    for (const key of requestedKeys) {
      if (!processed.has(key)) recordFailure(key, trustedFiles.get(key), 'recycling was cancelled before this file was moved.');
    }
  }

  for (const key of requestedKeys) {
    if (processed.has(key)) continue;
    if (!trustedFiles.has(key)) recordFailure(key, selectedOriginals.get(key), 'path was not part of the current duplicate results.');
    else recordFailure(key, trustedFiles.get(key), 'path was not part of a current duplicate set.');
  }
  results.success = results.successPaths.length;
  stats.completed = results.success + results.failed;
  progress(results.cancelled ? 'cancelled' : 'complete');
  return results;
}

module.exports = {
  DuplicateScanCancelledError,
  findDuplicates,
  recycleDuplicates,
};
