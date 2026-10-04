'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const MAX_TEXT_BYTES = 64 * 1024;
const MAX_TEXT_CHARS = 12_000;
const MAX_PDF_BYTES = 18 * 1024 * 1024;
const MAX_DOCX_BYTES = 12 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.csv', '.tsv', '.rtf', '.html', '.htm', '.tex']);
const GENERATED_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.cache', '__pycache__', 'target', 'vendor', '$recycle.bin',
  'system volume information',
]);

const cmpPath = (value) => process.platform === 'win32' || process.platform === 'darwin'
  ? String(value).toLocaleLowerCase('en-US')
  : String(value);

const statRootIdentity = (stat) => [stat.dev, stat.ino, stat.mode].map(String).join(':');

function documentKind(filename) {
  const extension = path.extname(String(filename || '')).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension)) return { kind: 'text', extension, maxBytes: MAX_TEXT_BYTES };
  if (extension === '.pdf') return { kind: 'pdf', extension, maxBytes: MAX_PDF_BYTES };
  if (extension === '.docx') return { kind: 'docx', extension, maxBytes: MAX_DOCX_BYTES };
  return null;
}

function documentFileIdentity(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.nlink, stat.size, stat.mtimeNs, stat.ctimeNs]
    .map(String).join(':');
}

function isPathInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isExcludedSegment(segment) {
  const name = String(segment || '');
  return !name || name.startsWith('.') || GENERATED_DIRS.has(name.toLocaleLowerCase('en-US'));
}

function abortIfNeeded(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Document reading was cancelled.');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  throw error;
}

function decodeHtmlEntities(value) {
  const named = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return value.replace(/&(#x[\da-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);?/gi, (entity, code) => {
    if (code[0] !== '#') return named[code.toLowerCase()] ?? entity;
    const point = code[1].toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
    if (!Number.isInteger(point) || point <= 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) return '';
    return String.fromCodePoint(point);
  });
}

function htmlToPlainText(input) {
  return decodeHtmlEntities(String(input || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\s*br\b[^>]*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(?:p|div|li|h[1-6]|tr|table|section|article|header|footer|title|body|blockquote|pre)\s*>/gi, '\n')
    .replace(/<\s*(?:p|div|li|h[1-6]|tr|table|section|article|header|footer|blockquote|pre)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' '))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const RTF_IGNORED_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer',
  'headerl', 'headerr', 'footerl', 'footerr', 'filetbl', 'listtable', 'listoverridetable',
  'generator', 'xmlopen', 'xmlclose', 'datastore', 'themedata', 'colorschememapping',
]);

function rtfToPlainText(input) {
  const source = String(input || '');
  if (!/^\s*\{\\rtf/i.test(source)) return source;
  const output = [];
  const groupSkipped = [];
  let unicodeFallback = 1;
  let skipFallback = 0;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '{') {
      const prefix = source.slice(index + 1);
      const destination = prefix.match(/^\\(?:\*\\)?([a-z]+)\b/i)?.[1]?.toLowerCase();
      const starredDestination = /^\\\*/.test(prefix);
      groupSkipped.push(Boolean(groupSkipped.at(-1) || starredDestination || (destination && RTF_IGNORED_DESTINATIONS.has(destination))));
      continue;
    }
    if (character === '}') {
      groupSkipped.pop();
      continue;
    }
    if (character !== '\\') {
      if (!groupSkipped.at(-1) && character !== '\r' && character !== '\n') {
        if (skipFallback > 0) skipFallback--;
        else output.push(character);
      }
      continue;
    }

    const next = source[index + 1];
    if (!next) continue;
    if (next === '\\' || next === '{' || next === '}') {
      if (!groupSkipped.at(-1)) output.push(next);
      index++;
      continue;
    }
    if (next === "'") {
      const hex = source.slice(index + 2, index + 4);
      if (!groupSkipped.at(-1) && /^[\da-f]{2}$/i.test(hex)) {
        output.push(new TextDecoder('windows-1252').decode(Uint8Array.of(Number.parseInt(hex, 16))));
      }
      index += 3;
      continue;
    }
    if (!/[a-z]/i.test(next)) {
      if (!groupSkipped.at(-1)) {
        if (next === '~') output.push('\u00a0');
        else if (next === '_') output.push('\u2011');
        else if (next === '-') { /* optional hyphen is a formatting hint */ }
      }
      index++;
      continue;
    }

    const control = source.slice(index).match(/^\\([a-z]+)(-?\d+)? ?/i);
    if (!control) continue;
    const word = control[1].toLowerCase();
    const numeric = control[2] === undefined ? undefined : Number(control[2]);
    index += control[0].length - 1;
    if (groupSkipped.at(-1)) continue;
    if (word === 'uc' && Number.isInteger(numeric)) unicodeFallback = Math.max(0, Math.min(8, numeric));
    else if (word === 'u' && Number.isInteger(numeric)) {
      output.push(String.fromCharCode(numeric < 0 ? numeric + 65536 : numeric));
      skipFallback = unicodeFallback;
    } else if (word === 'par' || word === 'line') output.push('\n');
    else if (word === 'tab' || word === 'cell') output.push('\t');
    else if (word === 'row') output.push('\n');
    else if (word === 'emdash') output.push('\u2014');
    else if (word === 'endash') output.push('\u2013');
    else if (word === 'bullet') output.push('\u2022');
    else if (word === 'lquote') output.push('\u2018');
    else if (word === 'rquote') output.push('\u2019');
    else if (word === 'ldblquote') output.push('\u201c');
    else if (word === 'rdblquote') output.push('\u201d');
  }
  return output.join('').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function assertDocumentFresh(rootPath, file, { rootIdentity, rootRealPath, signal } = {}) {
  abortIfNeeded(signal);
  if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath)) throw new TypeError('A full folder path is required.');
  if (!file || typeof file.path !== 'string' || !path.isAbsolute(file.path)) throw new TypeError('A full document path is required.');
  rootPath = path.resolve(rootPath);
  const filePath = path.resolve(file.path);
  if (!isPathInside(rootPath, filePath)) throw new Error('Document is outside the selected folder.');
  const latestRoot = await fsp.lstat(rootPath, { bigint: true });
  if (!latestRoot.isDirectory() || latestRoot.isSymbolicLink()
    || (rootIdentity && statRootIdentity(latestRoot) !== rootIdentity)) {
    throw new Error('Selected folder changed while the document was being read.');
  }
  const latestRootRealPath = await fsp.realpath(rootPath);
  if (rootRealPath && cmpPath(latestRootRealPath) !== cmpPath(rootRealPath)) throw new Error('Selected folder changed while the document was being read.');

  const relative = path.relative(rootPath, filePath);
  const segments = relative.split(path.sep);
  let currentPath = rootPath;
  let latestFile = null;
  for (let index = 0; index < segments.length; index++) {
    abortIfNeeded(signal);
    currentPath = path.join(currentPath, segments[index]);
    const stat = await fsp.lstat(currentPath, { bigint: true });
    if (stat.isSymbolicLink()) throw new Error('Document path changed to a symbolic link while it was being read.');
    if (index < segments.length - 1) {
      if (!stat.isDirectory()) throw new Error('Document folder changed while the document was being read.');
    } else latestFile = stat;
  }
  if (!latestFile?.isFile() || latestFile.nlink !== 1n || (file.identity && documentFileIdentity(latestFile) !== file.identity)) {
    throw new Error('Document changed while its text was being extracted.');
  }
  const latestRealPath = await fsp.realpath(filePath);
  if (!isPathInside(latestRootRealPath, latestRealPath)) throw new Error('Document no longer points inside the selected folder.');
  return { identity: documentFileIdentity(latestFile), rootIdentity: statRootIdentity(latestRoot), rootRealPath: latestRootRealPath };
}

/**
 * Read a bounded text, PDF, or DOCX document below a selected folder.
 *
 * `file.identity` is an optional freshness token from documentFileIdentity(). If
 * supplied, a changed file is rejected before any content is returned. Every
 * path segment is checked with lstat, so symlinked folders and files are refused.
 */
async function readDocumentText(root, file, { signal, maxTextChars = MAX_TEXT_CHARS } = {}) {
  abortIfNeeded(signal);
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new TypeError('A full folder path is required.');
  if (!file || typeof file.path !== 'string' || !path.isAbsolute(file.path)) throw new TypeError('A full document path is required.');

  const rootPath = path.resolve(root);
  const filePath = path.resolve(file.path);
  if (!isPathInside(rootPath, filePath)) throw new Error('Document is outside the selected folder.');
  const relative = path.relative(rootPath, filePath);
  const segments = relative.split(path.sep);
  if (segments.some(isExcludedSegment)) throw new Error('Hidden or generated paths are not analyzed.');
  if (file.name && path.basename(filePath) !== file.name) throw new Error('Document name no longer matches its path.');

  const rootStat = await fsp.lstat(rootPath, { bigint: true });
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Choose a regular folder, not a shortcut or file.');
  const rootRealPath = await fsp.realpath(rootPath);
  const rootIdentity = statRootIdentity(rootStat);

  let currentPath = rootPath;
  for (let index = 0; index < segments.length; index++) {
    abortIfNeeded(signal);
    currentPath = path.join(currentPath, segments[index]);
    const stat = await fsp.lstat(currentPath, { bigint: true });
    if (stat.isSymbolicLink()) throw new Error('Symbolic links are not analyzed.');
    if (index < segments.length - 1) {
      if (!stat.isDirectory()) throw new Error('A document folder changed before it could be read.');
    } else if (!stat.isFile()) {
      throw new Error('Only regular files can be read.');
    }
  }

  const type = documentKind(file.name || filePath);
  if (!type) throw new Error('This file type has no local text extractor.');
  const targetStat = await fsp.lstat(filePath, { bigint: true });
  const identity = documentFileIdentity(targetStat);
  if (targetStat.isSymbolicLink() || !targetStat.isFile()) throw new Error('Only regular files can be read.');
  if (targetStat.nlink !== 1n) throw new Error('Hard-linked files are not analyzed.');
  if (file.identity && file.identity !== identity) throw new Error('Document changed after it was listed.');
  if (targetStat.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Document is too large to inspect safely.');
  if (type.kind !== 'text' && targetStat.size > BigInt(type.maxBytes)) {
    throw new Error(`Document exceeds the ${Math.round(type.maxBytes / (1024 * 1024))} MB local reading limit.`);
  }

  const realPath = await fsp.realpath(filePath);
  if (!isPathInside(rootRealPath, realPath)) throw new Error('Document no longer points inside the selected folder.');
  let flags = fs.constants.O_RDONLY;
  if (process.platform !== 'win32' && typeof fs.constants.O_NOFOLLOW === 'number') flags |= fs.constants.O_NOFOLLOW;
  const handle = await fsp.open(filePath, flags);
  let buffer;
  let byteTruncated = false;
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || opened.nlink !== 1n || documentFileIdentity(opened) !== identity) {
      throw new Error('Document changed while it was being opened.');
    }
    const length = Math.min(Number(opened.size), type.maxBytes);
    buffer = Buffer.allocUnsafe(length);
    let offset = 0;
    while (offset < length) {
      abortIfNeeded(signal);
      const { bytesRead } = await handle.read(buffer, offset, length - offset, offset);
      if (bytesRead <= 0) throw new Error('Document ended while it was being read.');
      offset += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    const afterPath = await fsp.lstat(filePath, { bigint: true });
    const afterRealPath = await fsp.realpath(filePath);
    if (documentFileIdentity(after) !== identity || documentFileIdentity(afterPath) !== identity
      || !afterPath.isFile() || afterPath.isSymbolicLink() || afterPath.nlink !== 1n
      || !isPathInside(rootRealPath, afterRealPath)) {
      throw new Error('Document changed while its contents were being read.');
    }
    byteTruncated = Number(opened.size) > length;
  } finally {
    await handle.close().catch(() => {});
  }

  abortIfNeeded(signal);
  let text;
  if (type.kind === 'text') {
    if (buffer.includes(0)) throw new Error('File contains binary data and was not searched.');
    const controls = buffer.toString('latin1').match(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g) || [];
    if (buffer.length && controls.length / buffer.length > 0.01) throw new Error('File contains too much binary data to search safely.');
    text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    if (type.extension === '.html' || type.extension === '.htm') text = htmlToPlainText(text);
    else if (type.extension === '.rtf') text = rtfToPlainText(text);
  } else if (type.kind === 'pdf') {
    let parser = null;
    try {
      const { PDFParse } = require('pdf-parse');
      parser = new PDFParse({ data: buffer });
      const result = await parser.getText({ first: 2 });
      const pages = Array.isArray(result?.pages) ? result.pages : [];
      text = pages.map((page) => String(page?.text || '')).filter((page) => page.trim()).join('\n\n');
      if (!text && !pages.length) text = String(result?.text || '');
      text = text.replace(/(?:\s*\(page\s+\d+\s+of\s+\d+\)\s*)+/gi, '').trim();
    } catch (error) {
      const detail = String(error?.message || 'unknown PDF parser error').replace(/[\r\n]+/g, ' ').slice(0, 180);
      throw new Error(`Could not read PDF: ${detail}`);
    } finally {
      if (parser) {
        try { await parser.destroy(); } catch { }
      }
    }
  } else {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    text = String(result?.value || '');
  }

  await assertDocumentFresh(rootPath, { path: filePath, identity }, { rootIdentity, rootRealPath, signal });
  if (!text.trim()) throw new Error('No readable text was found in the document.');
  const outputTruncated = text.length > maxTextChars;
  text = text.slice(0, maxTextChars);
  return {
    text,
    truncated: byteTruncated || outputTruncated || type.kind === 'pdf',
    identity,
    kind: type.kind,
  };
}

module.exports = {
  documentFileIdentity,
  documentKind,
  assertDocumentFresh,
  htmlToPlainText,
  isExcludedSegment,
  isPathInside,
  rtfToPlainText,
  readDocumentText,
};
