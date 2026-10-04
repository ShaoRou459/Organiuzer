'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { prepareNamingBrief } = require('./renamePrivacy');

const MIN_CONFIDENCE = 0.6;
const MAX_BASE_NAME_UNITS = 120;
const MAX_TEXT_READ_BYTES = 64 * 1024;
const MAX_TEXT_CHARS = 12_000;
const MAX_PDF_BYTES = 18 * 1024 * 1024;
const MAX_DOCX_BYTES = 12 * 1024 * 1024;
const MAX_DIAGNOSTICS = 100;
const SUGGESTION_CONCURRENCY = 3;
const COPY_SUFFIX = /\s+\(\d+\)$/;
const PORTABLE_FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const CASE_INSENSITIVE_PATHS = process.platform === 'win32' || process.platform === 'darwin';
const COMPOUND_EXTENSIONS = ['.tar.gz', '.tar.bz2', '.tar.xz', '.nii.gz'];
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.tif', '.heic', '.avif', '.svg']);
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.rtf', '.html', '.htm', '.tex',
]);
const SENSITIVE_NAME = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|\.gitconfig|credentials?(?:\..*)?|secrets?(?:\..*)?|settings?(?:\..*)?|config(?:uration)?(?:\..*)?|.*(?:api[-_]?key|access[-_]?token|private[-_]?key|password|secret).*)$/i;
const SENSITIVE_EXTENSION = new Set(['.env', '.pem', '.key', '.p12', '.pfx', '.kdbx', '.sqlite', '.db', '.wallet']);

class RenameCancelledError extends Error {
  constructor() {
    super('Rename suggestions were cancelled.');
    this.name = 'AbortError';
    this.code = 'ABORT_ERR';
  }
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const normalizeName = (value) => String(value).normalize('NFKC').toLocaleLowerCase('en-US');

function splitFilename(name) {
  const lower = String(name || '').toLowerCase();
  const compound = COMPOUND_EXTENSIONS.find((extension) => lower.endsWith(extension));
  if (compound && String(name).length > compound.length) {
    return { base: String(name).slice(0, -compound.length), extension: String(name).slice(-compound.length) };
  }
  const extension = path.extname(String(name || ''));
  return { base: extension ? String(name).slice(0, -extension.length) : String(name || ''), extension };
}

function filenameExtension(name) {
  return splitFilename(name).extension;
}

function shannonEntropy(value) {
  if (!value) return 0;
  const frequencies = new Map();
  for (const char of value) frequencies.set(char, (frequencies.get(char) || 0) + 1);
  let entropy = 0;
  for (const count of frequencies.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function humanWordParts(stem) {
  return (String(stem).match(/[A-Z]{2,}(?=[A-Z][a-z]|\d|$)|[A-Z]?[a-z]+|[A-Z]+|\d+/g) || [])
    .filter((part) => /^[A-Za-z]{3,}$/.test(part));
}

/** Return a short reason when a filename looks machine-generated; otherwise null. */
function detectRenameCandidate(filename) {
  if (typeof filename !== 'string' || !filename.trim()) return null;
  const name = path.basename(filename.trim());
  if (IMAGE_EXTENSIONS.has(filenameExtension(name).toLowerCase())) return null;
  if (name.startsWith('.')) return null;
  const { base } = splitFilename(name);
  const stem = base.normalize('NFKC').trim();
  if (!stem) return null;

  const words = stem.toLocaleLowerCase('en-US').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  const placeholder = /^(?:untitled|untilted|new document|new file|new image|document|file|image|scan|screenshot|new microsoft word document)(?:\s+(?:\d+|copy(?:\s*\(\d+\))?|\(\d+\)))?$/i;
  if (placeholder.test(words)) return { candidate: true, reason: 'Generic placeholder name' };

  const compact = stem.replace(/[{}\s._-]/g, '');
  const uuid = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i;
  if (uuid.test(stem.replace(/^\{(.*)\}$/, '$1'))) return { candidate: true, reason: 'UUID-like filename' };
  if (/^[0-9a-f]{24,64}$/i.test(compact)) return { candidate: true, reason: 'Hash-like filename' };

  const letters = (compact.match(/[a-z]/gi) || []).length;
  const digits = (compact.match(/\d/g) || []).length;
  const parts = humanWordParts(stem);
  const dateOnly = /^(?:19|20)\d{2}(?:\d{2}){0,3}$/.test(compact);
  const mixedHighEntropy = compact.length >= 16
    && letters >= 8
    && digits >= 2
    && digits / compact.length >= 0.1
    && shannonEntropy(compact) >= 3.4
    && !dateOnly
    && parts.length < 2;
  if (mixedHighEntropy) return { candidate: true, reason: 'Long high-entropy identifier' };
  return null;
}

function invalidNameReason(filename, expectedExtension) {
  if (typeof filename !== 'string' || !filename) return 'Name cannot be empty.';
  if (filename !== filename.trim()) return 'Name cannot start or end with spaces.';
  if (filename === '.' || filename === '..' || filename.startsWith('.')) return 'Name must be a visible filename.';
  if (PORTABLE_FORBIDDEN.test(filename)) {
    PORTABLE_FORBIDDEN.lastIndex = 0;
    return 'Name contains characters that cannot be used on every desktop system.';
  }
  PORTABLE_FORBIDDEN.lastIndex = 0;
  if (/[. ]$/.test(filename)) return 'Name cannot end with a period or space.';
  if (filename.length > 255) return 'Name is too long.';
  if (WINDOWS_RESERVED.test(filename)) return 'Name is reserved by Windows.';
  if (expectedExtension !== undefined && normalizeName(filenameExtension(filename)) !== normalizeName(expectedExtension)) {
    return 'The original file extension must be kept.';
  }
  const { base } = splitFilename(filename);
  if (!base || base === '.' || base === '..') return 'Name needs a title before its extension.';
  return null;
}

function sanitizeBaseName(value, extension = '') {
  if (typeof value !== 'string') return null;
  let base = value.normalize('NFKC').trim();
  if (extension && base.toLocaleLowerCase('en-US').endsWith(extension.toLocaleLowerCase('en-US'))) {
    base = base.slice(0, -extension.length).trim();
  }
  base = base
    .replace(PORTABLE_FORBIDDEN, '-')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/[. ]+$/g, '')
    .trim();
  if (!base || base === '.' || base === '..') return null;
  if (WINDOWS_RESERVED.test(base)) base = `_${base}`;

  const available = Math.max(1, Math.min(MAX_BASE_NAME_UNITS, 255 - extension.length));
  let truncated = '';
  let units = 0;
  for (const point of base) {
    const pointUnits = point.length;
    if (units + pointUnits > available) break;
    truncated += point;
    units += pointUnits;
  }
  truncated = truncated.replace(/[. ]+$/g, '').trim();
  return truncated || null;
}

function pathIsInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function statSignature(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.nlink, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':');
}

function rootIdentity(stat) {
  return { dev: String(stat.dev), ino: String(stat.ino), mode: String(stat.mode) };
}

function sameRootIdentity(a, b) {
  return Boolean(a && b && a.dev === b.dev && a.ino === b.ino && a.mode === b.mode);
}

function normalizePathKey(value) {
  const resolved = path.resolve(String(value || ''));
  return CASE_INSENSITIVE_PATHS ? resolved.toLocaleLowerCase('en-US') : resolved;
}

function samePath(a, b) {
  return normalizePathKey(a) === normalizePathKey(b);
}

async function currentRootMatches(root, trustedSnapshot) {
  try {
    const stat = await fsp.lstat(root.path, { bigint: true });
    const realPath = await fsp.realpath(root.path);
    return stat.isDirectory() && !stat.isSymbolicLink()
      && sameRootIdentity(rootIdentity(stat), trustedSnapshot.rootIdentity)
      && normalizePathKey(realPath) === normalizePathKey(trustedSnapshot.rootRealPath);
  } catch {
    return false;
  }
}

function fileId(name, signature) {
  return crypto.createHash('sha256').update(`${name}\0${signature}`).digest('hex').slice(0, 24);
}

function getContentKind(filename) {
  const extension = filenameExtension(filename).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension)) return { kind: 'text', mime: 'text/plain; charset=utf-8', maxBytes: MAX_TEXT_READ_BYTES };
  if (extension === '.pdf') return { kind: 'pdf', mime: 'application/pdf', maxBytes: MAX_PDF_BYTES };
  if (extension === '.docx') return { kind: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', maxBytes: MAX_DOCX_BYTES };
  return null;
}

function isSensitiveFile(name) {
  const extension = filenameExtension(name).toLowerCase();
  return SENSITIVE_NAME.test(name) || SENSITIVE_EXTENSION.has(extension);
}

function addDiagnostic(list, name, reason, kind = 'file') {
  if (list.length < MAX_DIAGNOSTICS) list.push({ name: String(name || ''), reason, kind });
}

async function inspectRoot(rootPath) {
  if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath)) throw new TypeError('A full folder path is required.');
  const resolved = path.resolve(rootPath);
  const stat = await fsp.lstat(resolved, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new TypeError('Choose a regular folder, not a shortcut or file.');
  const realPath = await fsp.realpath(resolved);
  return { path: resolved, realPath, stat, identity: rootIdentity(stat) };
}

function snapshotCandidate(root, name, stat) {
  const signature = statSignature(stat);
  const { extension } = splitFilename(name);
  const type = getContentKind(name);
  return {
    id: fileId(name, signature),
    name,
    path: path.join(root.path, name),
    reason: detectRenameCandidate(name)?.reason || 'Unusual filename',
    size: Number(stat.size),
    extension,
    kind: type?.kind || 'unsupported',
    mime: type?.mime || '',
    signature,
    dev: String(stat.dev),
    ino: String(stat.ino),
  };
}

/** List root-level filename candidates without opening or sending file contents. */
async function listRenameCandidates(rootPath, { signal } = {}) {
  await checkCancelled(signal);
  const root = await inspectRoot(rootPath);
  const entries = await fsp.readdir(root.path, { withFileTypes: true });
  const candidates = [];
  const skipped = [];
  const existingNames = entries.map((entry) => entry.name);

  for (const entry of entries) {
    await checkCancelled(signal);
    if (entry.name.startsWith('.')) continue;
    if (isSensitiveFile(entry.name)) {
      addDiagnostic(skipped, entry.name, 'Sensitive or configuration files are never analyzed.');
      continue;
    }
    const detected = detectRenameCandidate(entry.name);
    if (!detected) continue;
    const fullPath = path.join(root.path, entry.name);
    if (entry.isSymbolicLink()) {
      addDiagnostic(skipped, entry.name, 'Symbolic links are not analyzed.');
      continue;
    }
    if (!entry.isFile()) continue;
    if (!getContentKind(entry.name)) {
      addDiagnostic(skipped, entry.name, 'This file type cannot be analyzed.');
      continue;
    }
    try {
      const stat = await fsp.lstat(fullPath, { bigint: true });
      if (!stat.isFile() || stat.isSymbolicLink()) {
        addDiagnostic(skipped, entry.name, 'This path is not a regular file.');
        continue;
      }
      if (stat.nlink !== 1n) {
        addDiagnostic(skipped, entry.name, 'Hard-linked files are not analyzed.');
        continue;
      }
      if (stat.size > BigInt(Number.MAX_SAFE_INTEGER)) {
        addDiagnostic(skipped, entry.name, 'File is too large to inspect safely.');
        continue;
      }
      candidates.push(snapshotCandidate(root, entry.name, stat));
    } catch (error) {
      addDiagnostic(skipped, entry.name, error?.message || 'Could not inspect this file.');
    }
  }

  candidates.sort((a, b) => cmp(normalizeName(a.name), normalizeName(b.name)) || cmp(a.name, b.name));
  const files = Object.fromEntries(candidates.map((candidate) => [candidate.id, {
    id: candidate.id,
    name: candidate.name,
    path: candidate.path,
    size: candidate.size,
    extension: candidate.extension,
    signature: candidate.signature,
    dev: candidate.dev,
    ino: candidate.ino,
  }]));
  return {
    candidates: candidates.map(({ signature, dev, ino, path: filePath, ...publicCandidate }) => publicCandidate),
    skipped,
    trustSnapshot: {
      rootPath: root.path,
      rootRealPath: root.realPath,
      rootIdentity: root.identity,
      existingNames,
      files,
      skipped: skipped.slice(),
    },
  };
}

async function checkCancelled(signal) {
  if (signal?.aborted) throw new RenameCancelledError();
}

function emitProgress(callback, payload) {
  if (typeof callback !== 'function') return;
  try {
    const result = callback(payload);
    if (result && typeof result.then === 'function') result.catch(() => {});
  } catch { }
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
  const failure = settled.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
  return results;
}

function trustFile(snapshot, candidate) {
  const trusted = snapshot?.files?.[candidate?.id];
  if (!trusted || trusted.name !== candidate.name || trusted.size !== candidate.size
    || trusted.extension !== candidate.extension || trusted.path !== path.join(snapshot.rootPath, trusted.name)) return null;
  return trusted;
}

async function readStableFile(trusted, root, maxBytes, allowPrefix, signal) {
  await checkCancelled(signal);
  if (!pathIsInside(root.path, trusted.path) || !samePath(path.dirname(trusted.path), root.path)) throw new Error('File escaped the selected folder.');
  const beforePath = await fsp.lstat(trusted.path, { bigint: true });
  if (!beforePath.isFile() || beforePath.isSymbolicLink() || beforePath.nlink !== 1n
    || statSignature(beforePath) !== trusted.signature) throw new Error('File changed after it was listed.');
  const beforeRealPath = await fsp.realpath(trusted.path);
  if (!pathIsInside(root.realPath, beforeRealPath) || !samePath(path.dirname(beforeRealPath), root.realPath)) throw new Error('File no longer points directly inside the selected folder.');
  if (beforePath.size > BigInt(maxBytes) && !allowPrefix) throw new Error(`File exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB analysis limit.`);

  let flags = fs.constants.O_RDONLY;
  if (process.platform !== 'win32' && typeof fs.constants.O_NOFOLLOW === 'number') flags |= fs.constants.O_NOFOLLOW;
  const handle = await fsp.open(trusted.path, flags);
  try {
    const opened = await handle.stat({ bigint: true });
    if (statSignature(opened) !== trusted.signature || !opened.isFile()) throw new Error('File changed while it was being opened.');
    const length = Math.min(Number(opened.size), maxBytes);
    const buffer = Buffer.allocUnsafe(length);
    let offset = 0;
    while (offset < length) {
      await checkCancelled(signal);
      const { bytesRead } = await handle.read(buffer, offset, length - offset, offset);
      if (bytesRead <= 0) throw new Error('File ended while it was being read.');
      offset += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    const afterPath = await fsp.lstat(trusted.path, { bigint: true });
    const afterRealPath = await fsp.realpath(trusted.path);
    if (statSignature(after) !== trusted.signature || statSignature(afterPath) !== trusted.signature
      || !afterPath.isFile() || afterPath.isSymbolicLink() || afterPath.nlink !== 1n
      || !pathIsInside(root.realPath, afterRealPath) || !samePath(path.dirname(afterRealPath), root.realPath)) {
      throw new Error('File changed while its contents were being read.');
    }
    return { buffer, truncated: Number(opened.size) > length };
  } finally {
    await handle.close().catch(() => {});
  }
}

async function extractContent(trusted, root, signal) {
  const type = getContentKind(trusted.name);
  if (!type) throw new Error('This file type cannot be analyzed.');
  const { buffer, truncated } = await readStableFile(trusted, root, type.maxBytes, type.kind === 'text', signal);
  if (type.kind === 'text') {
    if (buffer.includes(0)) throw new Error('File contains binary data and was not sent for analysis.');
    const controlCount = (buffer.toString('latin1').match(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g) || []).length;
    if (buffer.length > 0 && controlCount / buffer.length > 0.01) throw new Error('File contains too much binary data to analyze safely.');
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '').slice(0, MAX_TEXT_CHARS);
    if (!text.trim()) throw new Error('File has no readable text.');
    return { content: text, contentTruncated: truncated || text.length === MAX_TEXT_CHARS };
  }
  if (type.kind === 'pdf') {
    let parser = null;
    try {
      const { PDFParse } = require('pdf-parse');
      parser = new PDFParse({ data: buffer });
      const result = await parser.getText({ first: 2 });
      const pageText = Array.isArray(result?.pages)
        ? result.pages.map((page) => String(page?.text || '')).filter((page) => page.trim()).join('\n\n')
        : '';
      const extractedText = Array.isArray(result?.pages) ? pageText : String(result?.text || '');
      const text = extractedText
        .replace(/(?:\s*\(page\s+\d+\s+of\s+\d+\)\s*)+/gi, '').trim().slice(0, MAX_TEXT_CHARS);
      if (!text) throw new Error('No readable text was found in the first two PDF pages.');
      return { content: text, contentTruncated: true };
    } catch (error) {
      if (/^No readable text was found/.test(error?.message || '')) throw error;
      const detail = String(error?.message || 'unknown PDF parser error').replace(/[\r\n]+/g, ' ').slice(0, 240);
      throw new Error(`Could not read PDF: ${detail}`);
    } finally {
      if (parser) {
        try { await parser.destroy(); } catch { }
      }
    }
  }
  if (type.kind === 'docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    const text = String(result?.value || '').slice(0, MAX_TEXT_CHARS);
    if (!text.trim()) throw new Error('No readable text was found in the document.');
    return { content: text, contentTruncated: truncated || text.length === MAX_TEXT_CHARS };
  }
  throw new Error('This file type cannot be analyzed.');
}

function sanitizeSummary(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function createUniqueFilename(base, extension, reserved) {
  let candidate = `${base}${extension}`;
  if (!reserved.has(normalizeName(candidate))) return candidate;
  for (let index = 2; index < 10_000; index++) {
    const suffix = ` (${index})`;
    const allowedUnits = Math.max(1, Math.min(MAX_BASE_NAME_UNITS, 255 - extension.length) - suffix.length);
    let truncated = '';
    let units = 0;
    for (const point of base) {
      if (units + point.length > allowedUnits) break;
      truncated += point;
      units += point.length;
    }
    candidate = `${truncated.trimEnd()}${suffix}${extension}`;
    if (!reserved.has(normalizeName(candidate))) return candidate;
  }
  return null;
}

/** Extract bounded local content and ask the caller's AI callback for names. */
async function buildRenameSuggestions(rootPath, {
  suggestName,
  signal,
  onProgress,
  candidates,
  trustSnapshot,
  deferAi = false,
  localOnly = false,
} = {}) {
  if (!deferAi && typeof suggestName !== 'function') throw new TypeError('A name-suggestion callback is required.');
  const root = await inspectRoot(rootPath);
  let trustedSnapshot = trustSnapshot;
  let trustedCandidates = candidates;
  let initialSkipped = [];
  if (!trustedSnapshot) {
    const listed = await listRenameCandidates(root.path, { signal });
    trustedSnapshot = listed.trustSnapshot;
    trustedCandidates = listed.candidates;
    initialSkipped = listed.skipped;
  }
  if (!samePath(trustedSnapshot?.rootPath || '', root.path) || !samePath(trustedSnapshot.rootRealPath, root.realPath)
    || !sameRootIdentity(trustedSnapshot.rootIdentity, root.identity)) throw new Error('Folder changed after candidates were listed.');
  if (!Array.isArray(trustedCandidates)) throw new TypeError('Trusted candidates are required.');

  // When the caller supplies a listed snapshot, its initial skips were already
  // shown alongside that listing. Only add skips discovered during extraction.
  const diagnostics = initialSkipped.slice(0, MAX_DIAGNOSTICS);
  const pendingAi = [];
  const cache = new Map();
  const usable = trustedCandidates.map((candidate) => ({ candidate, trusted: trustFile(trustedSnapshot, candidate) }))
    .filter(({ candidate, trusted }) => Boolean(trusted) && detectRenameCandidate(candidate.name)
      && !isSensitiveFile(candidate.name) && Boolean(getContentKind(candidate.name)));
  let completed = 0;
  const outputs = await mapLimit(usable, SUGGESTION_CONCURRENCY, async ({ candidate, trusted }, index) => {
    try {
      await checkCancelled(signal);
      const contentType = getContentKind(trusted.name);
      const extracted = await extractContent(trusted, root, signal);
      await checkCancelled(signal);
      const brief = prepareNamingBrief(extracted.content, { kind: contentType.kind, extension: trusted.extension });
      if (brief.blocked) throw new Error(brief.blockReason || 'Sensitive document kept on this device.');
      let response;
      let source = 'local';
      if (brief.localName) response = { name: brief.localName, summary: brief.localSummary, confidence: 0.9 };
      else {
        if (localOnly) throw new Error('No clear local heading found. Local-only mode kept this file unchanged.');
        if (!brief.excerpt || !/[\p{L}]{3}/u.test(brief.excerpt.replace(/\[[^\]]*\]/g, ''))) throw new Error('Not enough non-private text to suggest a useful name.');
        if (deferAi) {
          pendingAi.push({ id: trusted.id, oldName: trusted.name, extension: trusted.extension, kind: contentType.kind, size: trusted.size, reason: candidate.reason, excerpt: brief.excerpt, redactions: brief.redactions });
          return null;
        }
        const cacheKey = crypto.createHash('sha256').update(`${contentType.kind}\0${trusted.extension}\0${brief.excerpt}`).digest('hex');
        source = cache.has(cacheKey) ? 'cache' : 'ai';
        if (!cache.has(cacheKey)) cache.set(cacheKey, Promise.resolve().then(() => suggestName({ content: brief.excerpt, kind: contentType.kind, extension: trusted.extension }, { signal })));
        response = await cache.get(cacheKey);
      }
      await checkCancelled(signal);
      const confidence = Number(response?.confidence);
      if (!response || typeof response.name !== 'string' || !response.name.trim() || !Number.isFinite(confidence)
        || confidence < MIN_CONFIDENCE || confidence > 1) {
        addDiagnostic(diagnostics, trusted.name, 'AI did not return a confident name suggestion.');
        return null;
      }
      const checkedName = prepareNamingBrief(response.name, { kind: 'text' });
      if (checkedName.blocked || checkedName.redactions > 0) throw new Error('The generated name contained private details and was discarded.');
      const checkedSummary = prepareNamingBrief(response.summary || '', { kind: 'text' });
      const base = sanitizeBaseName(response.name, trusted.extension);
      if (!base) {
        addDiagnostic(diagnostics, trusted.name, 'AI returned a name that could not be made portable.');
        return null;
      }
      const requestedName = `${base}${trusted.extension}`;
      return {
        id: trusted.id,
        oldName: trusted.name,
        requestedName,
        summary: checkedSummary.blocked ? 'Named from the cleaned excerpt.' : sanitizeSummary(checkedSummary.excerpt),
        reason: candidate.reason || detectRenameCandidate(trusted.name)?.reason || 'Unusual filename',
        confidence,
        size: trusted.size,
        extension: trusted.extension,
        source,
      };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      addDiagnostic(diagnostics, trusted.name, error?.message || 'Could not create a suggestion.');
      return null;
    } finally {
      completed++;
      emitProgress(onProgress, { phase: deferAi || localOnly ? 'local' : 'ai', processed: completed, total: usable.length });
    }
  });

  const suggestions = finalizeSuggestions(outputs.filter(Boolean), trustedSnapshot, diagnostics);
  pendingAi.sort((a, b) => cmp(normalizeName(a.oldName), normalizeName(b.oldName)));
  emitProgress(onProgress, { phase: 'complete', processed: usable.length, total: usable.length, suggestions: suggestions.length });
  return { suggestions, pendingAi, skipped: diagnostics, trustSnapshot: trustedSnapshot, localOnly };
}

function finalizeSuggestions(outputs, trustedSnapshot, diagnostics, additionalNames = []) {
  const reserved = new Set([...(trustedSnapshot.existingNames || []), ...additionalNames].map(normalizeName));
  const suggestions = [];
  for (const output of outputs.filter(Boolean).sort((a, b) => cmp(normalizeName(a.oldName), normalizeName(b.oldName)) || cmp(a.id, b.id))) {
    if (normalizeName(output.requestedName) === normalizeName(output.oldName)) {
      addDiagnostic(diagnostics, output.oldName, 'The suggested name is unchanged.');
      continue;
    }
    const { base } = splitFilename(output.requestedName);
    const newName = createUniqueFilename(base, output.extension, reserved);
    if (!newName) {
      addDiagnostic(diagnostics, output.oldName, 'Could not resolve a unique name in this folder.');
      continue;
    }
    if (newName === output.oldName) {
      addDiagnostic(diagnostics, output.oldName, 'The suggested name is unchanged.');
      continue;
    }
    reserved.add(normalizeName(newName));
    suggestions.push({ ...output, newName });
    delete suggestions[suggestions.length - 1].requestedName;
  }
  return suggestions;
}

/** Send only the selected, previously previewed briefs. Raw text is not retained. */
async function finishRenameSuggestions(rootPath, { prepared, selectedIds, suggestName, signal, onProgress } = {}) {
  if (!prepared || prepared.localOnly || typeof suggestName !== 'function') throw new Error('Prepare excerpts before using AI.');
  const root = await inspectRoot(rootPath);
  const snapshot = prepared.trustSnapshot;
  if (!snapshot || !samePath(snapshot.rootPath, root.path) || !(await currentRootMatches(root, snapshot))) throw new Error('Folder changed after excerpts were prepared.');
  const selected = new Set(selectedIds);
  const rows = prepared.pendingAi.filter(row => selected.has(row.id));
  if (!rows.length || rows.length !== selected.size) throw new Error('Select excerpts from the current preview.');
  const diagnostics = [];
  const cache = new Map();
  let completed = 0;
  const outputs = await mapLimit(rows, SUGGESTION_CONCURRENCY, async row => {
    try {
      await checkCancelled(signal);
      const trusted = snapshot.files[row.id];
      if (!trusted || !(await currentRootMatches(root, snapshot)) || !(await currentFileMatches(trusted, root))) throw new Error('File or folder changed after its excerpt was prepared. Check filenames again.');
      const cacheKey = crypto.createHash('sha256').update(`${row.kind}\0${row.extension}\0${row.excerpt}`).digest('hex');
      const source = cache.has(cacheKey) ? 'cache' : 'ai';
      if (!cache.has(cacheKey)) cache.set(cacheKey, Promise.resolve().then(() => suggestName({ content: row.excerpt, kind: row.kind, extension: row.extension }, { signal })));
      const response = await cache.get(cacheKey);
      await checkCancelled(signal);
      if (!response || typeof response.name !== 'string' || !Number.isFinite(response.confidence) || response.confidence < MIN_CONFIDENCE || response.confidence > 1) throw new Error('AI did not return a confident name suggestion.');
      const cleanName = prepareNamingBrief(response.name, { kind: 'text' });
      if (cleanName.blocked || cleanName.redactions > 0) throw new Error('The generated name contained private details and was discarded.');
      const base = sanitizeBaseName(response.name, row.extension);
      if (!base) throw new Error('AI returned a name that could not be made portable.');
      const cleanSummary = prepareNamingBrief(response.summary || '', { kind: 'text' });
      return { id: row.id, oldName: row.oldName, requestedName: `${base}${row.extension}`, summary: cleanSummary.blocked ? 'Named from the cleaned excerpt.' : sanitizeSummary(cleanSummary.excerpt), reason: row.reason, confidence: response.confidence, size: row.size, extension: row.extension, source };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      addDiagnostic(diagnostics, row.oldName, error?.message || 'Could not suggest a name.');
      return null;
    } finally {
      emitProgress(onProgress, { phase: 'ai', processed: ++completed, total: rows.length });
    }
  });
  const aiSuggestions = finalizeSuggestions(outputs.filter(Boolean), snapshot, diagnostics, prepared.suggestions.map(row => row.newName));
  return { suggestions: [...prepared.suggestions, ...aiSuggestions], skipped: diagnostics, trustSnapshot: snapshot };
}

async function currentFileMatches(snapshot, root) {
  const target = path.join(root.path, snapshot.name);
  if (!samePath(target, snapshot.path) || !samePath(path.dirname(target), root.path) || !pathIsInside(root.path, target)) return false;
  try {
    const stat = await fsp.lstat(target, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || statSignature(stat) !== snapshot.signature) return false;
    const realPath = await fsp.realpath(target);
    return pathIsInside(root.realPath, realPath) && samePath(path.dirname(realPath), root.realPath);
  } catch {
    return false;
  }
}

function sameStableContentStat(current, baseline) {
  return current.dev === baseline.dev && current.ino === baseline.ino && current.mode === baseline.mode
    && current.size === baseline.size && current.mtimeNs === baseline.mtimeNs;
}

async function moveNoOverwrite(from, to, expectedSignature) {
  const startingStat = await fsp.lstat(from, { bigint: true });
  if (!startingStat.isFile() || startingStat.isSymbolicLink() || startingStat.nlink !== 1n) throw new Error('Source is no longer a single-link regular file.');
  if (expectedSignature && statSignature(startingStat) !== expectedSignature) throw new Error('Source changed before it could be renamed.');

  let linked = false;
  let copied = false;
  let createdIdentity = null;
  try {
    await fsp.link(from, to);
    linked = true;
    createdIdentity = { dev: startingStat.dev, ino: startingStat.ino };
  } catch (error) {
    if (error?.code === 'EEXIST') throw error;
    if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV'].includes(error?.code)) throw error;
    await fsp.copyFile(from, to, fs.constants.COPYFILE_EXCL);
    copied = true;
    const createdStat = await fsp.lstat(to, { bigint: true });
    createdIdentity = { dev: createdStat.dev, ino: createdStat.ino };
  }

  try {
    const [sourceStat, destinationStat] = await Promise.all([
      fsp.lstat(from, { bigint: true }),
      fsp.lstat(to, { bigint: true }),
    ]);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || !destinationStat.isFile() || destinationStat.isSymbolicLink()) {
      throw new Error('A path changed during the rename.');
    }
    if (linked && (!sameStableContentStat(sourceStat, startingStat) || !sameStableContentStat(destinationStat, startingStat)
      || sourceStat.dev !== destinationStat.dev || sourceStat.ino !== destinationStat.ino
      || sourceStat.nlink !== 2n || destinationStat.nlink !== 2n)) {
      throw new Error('A file changed during the rename.');
    }
    if (copied && (statSignature(sourceStat) !== statSignature(startingStat) || sourceStat.size !== destinationStat.size
      || destinationStat.dev !== createdIdentity.dev || destinationStat.ino !== createdIdentity.ino)) {
      throw new Error('A file changed while its rename copy was made.');
    }
    if (copied) await fsp.utimes(to, Number(startingStat.atimeMs) / 1000, Number(startingStat.mtimeMs) / 1000);
    const finalSourceStat = await fsp.lstat(from, { bigint: true });
    if (linked
      ? (!sameStableContentStat(finalSourceStat, startingStat) || finalSourceStat.nlink !== 2n)
      : statSignature(finalSourceStat) !== statSignature(startingStat)) {
      throw new Error('Source changed before its old name could be removed.');
    }
    await fsp.unlink(from);
  } catch (error) {
    if (createdIdentity) {
      try {
        const currentDestination = await fsp.lstat(to, { bigint: true });
        if (currentDestination.isFile() && !currentDestination.isSymbolicLink()
          && currentDestination.dev === createdIdentity.dev && currentDestination.ino === createdIdentity.ino) {
          await fsp.unlink(to);
        }
      } catch { }
    }
    throw error;
  }
}

/** Apply main-process trusted suggestions; selected edits are exact portable filenames. */
async function applyRenameSuggestions(rootPath, {
  trustSnapshot,
  suggestions,
  selected,
  signal,
  onProgress,
} = {}) {
  const result = { ok: false, moves: [], errors: [], rollbackErrors: [], cancelled: false };
  const root = await inspectRoot(rootPath);
  if (!trustSnapshot || !samePath(trustSnapshot.rootPath || '', root.path)
    || !samePath(trustSnapshot.rootRealPath, root.realPath) || !sameRootIdentity(trustSnapshot.rootIdentity, root.identity)) {
    return { ...result, errors: ['The selected folder changed after suggestions were prepared.'] };
  }
  const byId = new Map((Array.isArray(suggestions) ? suggestions : []).map((suggestion) => [suggestion.id, suggestion]));
  const selections = Array.isArray(selected) ? selected : [];
  if (!selections.length) return { ...result, ok: true };
  const selectedIds = new Set();
  const plans = [];
  for (const item of selections) {
    const id = typeof item === 'string' ? item : item?.id;
    if (typeof id !== 'string' || selectedIds.has(id)) {
      result.errors.push('Selection contains an unknown or repeated suggestion.');
      return result;
    }
    selectedIds.add(id);
    const suggestion = byId.get(id);
    const trusted = trustSnapshot.files?.[id];
    if (!suggestion || !trusted || suggestion.id !== trusted.id || suggestion.oldName !== trusted.name) {
      result.errors.push('A selected suggestion is not part of the trusted scan.');
      return result;
    }
    const newName = typeof item === 'string' ? suggestion.newName : (item.newName ?? suggestion.newName);
    const invalid = invalidNameReason(newName, trusted.extension);
    if (invalid) {
      result.errors.push(`${trusted.name}: ${invalid}`);
      return result;
    }
    if (normalizeName(newName) === normalizeName(trusted.name)) {
      result.errors.push(`${trusted.name}: new name is unchanged.`);
      return result;
    }
    plans.push({ id, oldName: trusted.name, newName, trusted });
  }

  const plannedNames = new Set();
  for (const plan of plans) {
    const key = normalizeName(plan.newName);
    if (plannedNames.has(key)) {
      result.errors.push(`More than one file uses the name "${plan.newName}".`);
      return result;
    }
    plannedNames.add(key);
  }
  let currentNames;
  try {
    currentNames = new Set((await fsp.readdir(root.path)).map(normalizeName));
  } catch (error) {
    return { ...result, errors: [error?.message || 'Could not recheck the selected folder.'] };
  }
  for (const plan of plans) {
    if (currentNames.has(normalizeName(plan.newName))) {
      result.errors.push(`${plan.newName}: that name is already in use.`);
      return result;
    }
  }
  for (const plan of plans) {
    if (!(await currentFileMatches(plan.trusted, root))) {
      result.errors.push(`${plan.oldName}: file or folder changed after suggestions were prepared.`);
      return result;
    }
  }
  if (!(await currentRootMatches(root, trustSnapshot))) {
    result.errors.push('The selected folder changed after suggestions were prepared.');
    return result;
  }

  const applied = [];
  let failure = null;
  try {
    for (const plan of plans) {
      await checkCancelled(signal);
      if (!(await currentRootMatches(root, trustSnapshot))) throw new Error('The selected folder changed immediately before rename.');
      const from = path.join(root.path, plan.oldName);
      const to = path.join(root.path, plan.newName);
      emitProgress(onProgress, { phase: 'move', from, to, name: plan.oldName });
      if (!(await currentFileMatches(plan.trusted, root))) throw new Error(`${plan.oldName}: file changed immediately before rename.`);
      if (!samePath(path.dirname(to), root.path) || !pathIsInside(root.path, to)) throw new Error(`${plan.newName}: destination escaped the selected folder.`);
      await moveNoOverwrite(from, to, plan.trusted.signature);
      applied.push({ from, to });
    }
  } catch (error) {
    failure = error;
    if (error?.name === 'AbortError') result.cancelled = true;
  }

  if (failure) {
    for (let index = applied.length - 1; index >= 0; index--) {
      const move = applied[index];
      try {
        await moveNoOverwrite(move.to, move.from);
      } catch (error) {
        result.rollbackErrors.push(`${path.basename(move.to)}: ${error?.message || 'could not restore the original name.'}`);
        result.moves.unshift(move);
      }
    }
    result.errors.push(failure?.message || 'Rename failed.');
    result.ok = false;
    return result;
  }

  result.ok = true;
  result.moves = applied;
  return result;
}

module.exports = {
  applyRenameSuggestions,
  buildRenameSuggestions,
  finishRenameSuggestions,
  detectRenameCandidate,
  filenameExtension,
  invalidNameReason,
  listRenameCandidates,
};
