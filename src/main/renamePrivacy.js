'use strict';

const MAX_BRIEF_CHARS = 1_800;
const MAX_INPUT_CHARS = 200_000;
const MAX_LOCAL_TITLE_CHARS = 100;
const MAX_LOCAL_SUMMARY_CHARS = 180;

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const WINDOWS_PATH = /(?<![\w])(?:[A-Za-z]:\\|\\\\)[^\r\n<>|?*]+/g;
const POSIX_PATH = /(?<![:\w])\/(?:[A-Za-z0-9._ -]+\/){1,}[A-Za-z0-9._ -]*/g;
const PHONE_OR_ID = /(?<![\p{L}\p{N}])\+?(?:\d[ \t().-]*){7,15}(?![\p{L}\p{N}])/gu;
const KNOWN_TOKEN = /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/i;
const PRIVATE_KEY = /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/i;
const SECRET_ASSIGNMENT = /["']?\b(?:api[\s_-]?(?:key|token|secret)|access[\s_-]?token|client[\s_-]?secret|secret(?:[\s_-]?key)?|password|passwd|token|refresh[\s_-]?token|private[\s_-]?(?:token|key))\b["']?\s*[:=]/gi;
const PLACEHOLDER_SECRET = /^(?:\[?(?:redacted|removed|placeholder|your[-_ ]?(?:key|token|secret|password)|none|null|not set|changeme|example)\]?|x{4,}|\*{4,})$/i;

const FIELD_LABELS = String.raw`(?:full\s+name|name|prepared\s+by|author|contact(?:\s+person)?|from|to|patient(?:\s+(?:name|id))?|employee(?:\s+(?:name|id))?|client(?:\s+(?:name|id))?|address|street(?:\s+address)?|city|phone|mobile|email|e-?mail|ssn|social\s+security(?:\s+number)?|account(?:\s+(?:number|no\.?))?|routing(?:\s+(?:number|no\.?))?|card(?:\s+(?:number|no\.?))?|date\s+of\s+birth|dob|birthdate|passport(?:\s+number)?|license(?:\s+number)?|tax\s+id|national\s+id)`;
const FIELD_LINE = new RegExp(String.raw`^\s*(?:[-*]\s*)?${FIELD_LABELS}\s*[:#]\s*(.*)$`, 'i');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.heic', '.avif', '.svg']);

const SENSITIVE_DOCUMENT_PATTERNS = [
  { reason: 'This appears to be a medical or patient record.', pattern: /\b(?:patient\s+(?:medical\s+)?(?:record|chart|file|id|name)|medical\s+(?:record|history|file|claim)|health\s+(?:record|history|insurance\s+claim)|diagnosis\s*:|prescription\s*:|lab(?:oratory)?\s+results?|clinical\s+notes?|medication\s+list|discharge\s+summary)\b/i },
  { reason: 'This appears to be a personnel or employee record.', pattern: /\b(?:personnel\s+file|employee\s+(?:record|file|review|evaluation)|performance\s+review|payroll\s+records?|disciplinary\s+action|salary\s+history|hr\s+(?:case|personnel)\s+file)\b/i },
  { reason: 'This appears to be a personal financial or identity document.', pattern: /\b(?:bank\s+statements?|checking\s+statements?|savings\s+statements?|credit[- ]card\s+statements?|debit[- ]card\s+statements?|tax\s+returns?|pay\s*stubs?|W-2s?|1099s?|loan\s+applications?|passport|driver'?s\s+licen[cs]e|national\s+identity\s+card|social\s+security\s+card|birth\s+certificate)\b/i },
];

const GENERIC_TITLES = new Set([
  'untitled', 'new document', 'new file', 'document', 'file', 'notes', 'note', 'draft', 'report', 'summary',
  'overview', 'introduction', 'conclusion', 'table of contents', 'index', 'readme', 'home', 'invoice', 'receipt',
  'presentation', 'meeting notes', 'agenda', 'form',
]);
const CHATTER_START = /^(?:hi|hello|dear\b|to whom it may concern|please find|here is|here are|today we|in this document|this document|note that|following (?:is|are)|attached is|draft copy)\b/i;
const TITLE_FIELD_START = new RegExp(String.raw`^(?:${FIELD_LABELS})\s*[:#]`, 'i');
const PAGE_MARKER = /^(?:[-–—]{1,2}\s*)?(?:page\s+)?\d+\s+(?:of|\/)\s+\d+(?:\s*[-–—]{1,2})?$/i;

function countDigits(value) {
  return (value.match(/\d/g) || []).length;
}

function testAndReset(pattern, value) {
  const matched = pattern.test(value);
  pattern.lastIndex = 0;
  return matched;
}

function isDate(value) {
  const normalized = value.trim();
  if (/^(?:19|20)\d{2}(?:[-/. ]?(?:0?[1-9]|1[0-2])(?:[-/. ]?(?:0?[1-9]|[12]\d|3[01]))?)?$/.test(normalized)) return true;
  return false;
}

function countReplace(text, pattern, replacement = '[redacted]') {
  const matcher = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let count = 0;
  const result = text.replace(matcher, (match) => {
    count++;
    return replacement;
  });
  return { text: result, count };
}

function redactFieldLines(text) {
  const lines = text.split(/\r?\n/);
  const output = [];
  let redactions = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const match = line.match(FIELD_LINE);
    if (!match) {
      output.push(line);
      continue;
    }
    redactions++;
    output.push('[redacted field]');
    if (match[1].trim()) continue;

    // A small number of continuation lines covers common wrapped address/name
    // fields without consuming an unrelated paragraph or document heading.
    let continuationCount = 0;
    while (index + 1 < lines.length && continuationCount < 3) {
      const next = lines[index + 1];
      const trimmed = next.trim();
      if (!trimmed || /^#{1,6}\s/.test(trimmed) || FIELD_LINE.test(next)) break;
      output.push('[redacted]');
      index++;
      continuationCount++;
    }
  }
  return { text: output.join('\n'), count: redactions };
}

function isSensitiveTitle(title) {
  if (!title || TITLE_FIELD_START.test(title)) return true;
  if ([EMAIL, URL, WINDOWS_PATH, POSIX_PATH].some((pattern) => testAndReset(pattern, title))) return true;
  if (testAndReset(PHONE_OR_ID, title) && !isDate(title)) return true;
  return /\b(?:patient\s+(?:name|id)|employee\s+(?:name|id)|ssn|social security number|account number|routing number|contact details|prepared by|home address)\b/i.test(title);
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;?/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const point = Number(code);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const point = parseInt(code, 16);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    });
}

function toSafePlainText(value) {
  return value
    .replace(/<\s*br\b[^>]*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(?:p|div|li|h[1-6]|tr|table|section|article|header|footer|title|body)\s*>/gi, '\n')
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    .replace(/&nbsp;?/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const point = Number(code);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const point = parseInt(code, 16);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    });
}

function cleanCandidateTitle(value) {
  const cleaned = decodeHtmlEntities(String(value || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/\s+#+$/, '')
    .trim();
  if (!cleaned || cleaned.length > 160 || CHATTER_START.test(cleaned) || isSensitiveTitle(cleaned)) return null;
  const key = cleaned.toLocaleLowerCase('en-US').replace(/[.!?]+$/g, '').trim();
  if (GENERIC_TITLES.has(key)) return null;
  if (SENSITIVE_DOCUMENT_PATTERNS.some(({ pattern }) => pattern.test(cleaned))) return null;
  return cleaned;
}

function explicitTitleCandidates(text) {
  const candidates = [];
  const htmlTitle = text.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  if (htmlTitle) candidates.push(htmlTitle[1]);
  for (const match of text.matchAll(/^\s{0,3}#{1,6}\s+([^\r\n]+)$/gm)) candidates.push(match[1]);
  for (const match of text.matchAll(/^\s*(?:title|subject)\s*:\s*([^\r\n]+)$/gim)) candidates.push(match[1]);
  return candidates;
}

function isHeadingLike(line) {
  const candidate = line.trim().replace(/^[-*•]\s+/, '').replace(/^#{1,6}\s+/, '');
  if (candidate.length < 12 || candidate.length > 100 || /[.!?;:]$/.test(candidate)) return false;
  if (/^(?:[-*•]|\d+[.)])\s/.test(line) || PAGE_MARKER.test(candidate)) return false;
  if (TITLE_FIELD_START.test(candidate) || CHATTER_START.test(candidate)) return false;
  const words = candidate.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) || [];
  if (words.length < 3 || words.length > 10) return false;
  const titleCaseWords = words.filter((word) => /^\p{Lu}[\p{L}\p{N}'’]*$/u.test(word)).length;
  const allCaps = candidate === candidate.toLocaleUpperCase('en-US');
  return allCaps || titleCaseWords >= 2;
}

function findLocalTitle(text, kind, extension) {
  for (const raw of explicitTitleCandidates(text)) {
    const title = cleanCandidateTitle(raw);
    if (title) return title;
  }
  const normalizedKind = String(kind || '').toLowerCase();
  const normalizedExtension = String(extension || '').toLowerCase();
  if (!['pdf', 'docx'].includes(normalizedKind) && !['.pdf', '.docx'].includes(normalizedExtension)) return null;
  const lines = text.split(/\r?\n/).slice(0, 20);
  for (const line of lines) {
    const candidate = line.trim();
    if (!candidate || PAGE_MARKER.test(candidate)) continue;
    if (!isHeadingLike(candidate)) continue;
    const title = cleanCandidateTitle(candidate);
    if (title) return title;
  }
  return null;
}

function sanitizeLocalName(title) {
  if (!title) return null;
  const safe = title.normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, ' ')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return safe ? Array.from(safe).slice(0, MAX_LOCAL_TITLE_CHARS).join('').trim() || null : null;
}

function isPlaceholderOrInstruction(value) {
  const normalized = String(value || '').trim().replace(/^[\s\[({"']+|[\s\])}"'.,]+$/g, '');
  if (!normalized) return true;
  if (PLACEHOLDER_SECRET.test(normalized)) return true;
  if (/^(?:n\/a|tbd|todo|not provided|not included|see below|add (?:your )?|insert (?:your )?|enter (?:your )?|type (?:your )?|choose (?:a |your )?|create (?:a |your )?|set (?:a |your )?|use (?:a |your )?|provide (?:your )?|the key (?:goes|is) here|the password (?:goes|is) here|this is (?:a )?(?:sample|example)|example value)\b/i.test(normalized)) return true;
  if (/^(?:your[_ -]?(?:api[_ -]?)?(?:key|token|secret|password)(?:[_ -]?(?:here|goes here))?|<[^>]+>)$/i.test(normalized)) return true;
  return false;
}

function nextLineCredentialValue(text, offset) {
  const rest = text.slice(offset);
  const leading = rest.match(/^[ \t]*/)?.[0].length || 0;
  const afterWhitespace = rest.slice(leading);
  if (afterWhitespace && !afterWhitespace.startsWith('\n') && !afterWhitespace.startsWith('\r')) return null;
  const lines = afterWhitespace.replace(/^\r?\n/, '').split(/\r?\n/);
  for (const line of lines.slice(0, 2)) {
    const value = line.trim();
    if (!value) continue;
    if (FIELD_LINE.test(value) || /^(?:api[\s_-]?(?:key|token|secret)|access[\s_-]?token|client[\s_-]?secret|secret(?:[\s_-]?key)?|password|passwd|token|refresh[\s_-]?token|private[\s_-]?(?:token|key))\s*[:=]\s*$/i.test(value)) return null;
    if (/^(?:[-*#>]\s*)/.test(value)) return value.replace(/^[-*#>]\s*/, '').trim() || null;
    // Wrapped secrets are normally compact tokens. Avoid interpreting the next
    // explanatory sentence after an empty "API key:" heading as a credential.
    if (/^["'][^"']+["']\s*,?$/.test(value)) return value.replace(/^["']|["'],?$/g, '').trim() || null;
    return /^[^\s,;]+$/.test(value) ? value.replace(/[,;]+$/, '') || null : null;
  }
  return null;
}

function hasCredentialAssignment(text) {
  const matcher = new RegExp(SECRET_ASSIGNMENT.source, SECRET_ASSIGNMENT.flags);
  let match;
  while ((match = matcher.exec(text))) {
    const rest = text.slice(matcher.lastIndex);
    const leading = rest.match(/^[ \t]*/)?.[0].length || 0;
    const valueStart = matcher.lastIndex + leading;
    const afterWhitespace = rest.slice(leading);
    let value = '';
    if (afterWhitespace.startsWith('"') || afterWhitespace.startsWith("'")) {
      const quote = afterWhitespace[0];
      const end = afterWhitespace.indexOf(quote, 1);
      if (end > 1) value = afterWhitespace.slice(1, end);
      else value = afterWhitespace.slice(1).split(/[,;}\r\n]/, 1)[0];
    } else if (afterWhitespace && !afterWhitespace.startsWith('\n') && !afterWhitespace.startsWith('\r')) {
      value = afterWhitespace.split(/[,;}\r\n]/, 1)[0].trim();
      value = value.replace(/^\[/, '').trim();
    } else {
      value = nextLineCredentialValue(text, valueStart) || '';
    }
    if (!isPlaceholderOrInstruction(value)) return true;
  }
  return false;
}

function findBlockReason(rawText, plainText = rawText) {
  if (PRIVATE_KEY.test(rawText) || PRIVATE_KEY.test(plainText)) return 'This text contains a private key.';
  if (KNOWN_TOKEN.test(rawText) || KNOWN_TOKEN.test(plainText)) return 'This text contains a recognized access token or credential.';
  // Inspect the decoded, tag-stripped form for key/value assignments so markup
  // cannot hide a value, and so harmless HTML wrappers don't look like secrets.
  if (hasCredentialAssignment(plainText)) return 'This text contains a credential or secret value.';
  for (const entry of SENSITIVE_DOCUMENT_PATTERNS) {
    if (entry.pattern.test(plainText) || entry.pattern.test(rawText)) return entry.reason;
  }
  return null;
}

function redact(text) {
  let current = text;
  let redactions = 0;
  const fields = redactFieldLines(current);
  current = fields.text;
  redactions += fields.count;

  const patterns = [EMAIL, URL, WINDOWS_PATH, POSIX_PATH];
  for (const pattern of patterns) {
    const result = countReplace(current, pattern);
    current = result.text;
    redactions += result.count;
  }

  const phoneMatcher = new RegExp(PHONE_OR_ID.source, PHONE_OR_ID.flags);
  current = current.replace(phoneMatcher, (match) => {
    if (isDate(match)) return match;
    const digits = countDigits(match);
    if (digits < 7) return match;
    redactions++;
    return '[redacted]';
  });

  return { text: current, redactions };
}

function makeLocalSummary(text, localName) {
  if (localName) return localName;
  const first = text.split(/\r?\n/).map((line) => line.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
    .find((line) => line && line !== '[redacted field]' && line !== '[redacted]' && !PAGE_MARKER.test(line));
  if (!first) return null;
  const sentence = first.split(/(?<=[.!?])\s+/)[0].trim();
  return Array.from(sentence).slice(0, MAX_LOCAL_SUMMARY_CHARS).join('') || null;
}

/**
 * Prepare a locally redacted short brief. This is a conservative filter, not a
 * guarantee that every personal or confidential detail will be detected.
 */
function prepareNamingBrief(input, { kind, extension } = {}) {
  const normalizedKind = String(kind || '').toLowerCase();
  const normalizedExtension = String(extension || '').toLowerCase();
  if (normalizedKind === 'image' || normalizedKind.startsWith('image/') || IMAGE_EXTENSIONS.has(normalizedExtension.startsWith('.') ? normalizedExtension : `.${normalizedExtension}`)) {
    return { excerpt: '', redactions: 0, blocked: true, blockReason: 'Images are not included in smart filename suggestions.', localName: null, localSummary: null };
  }
  if (typeof input !== 'string') {
    return { excerpt: '', redactions: 0, blocked: true, blockReason: 'No readable document text was provided.', localName: null, localSummary: null };
  }
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (text.length > MAX_INPUT_CHARS) {
    return { excerpt: '', redactions: 0, blocked: true, blockReason: 'The text is too long for local privacy checks.', localName: null, localSummary: null };
  }
  const plainText = toSafePlainText(text);
  const blockReason = findBlockReason(text, plainText);
  if (blockReason) {
    return { excerpt: '', redactions: 0, blocked: true, blockReason, localName: null, localSummary: null };
  }

  const title = findLocalTitle(text, kind, extension);
  const redacted = redact(plainText);
  const excerpt = redacted.text.replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_BRIEF_CHARS);
  const localName = title ? sanitizeLocalName(title) : null;
  const localSummary = makeLocalSummary(excerpt, localName);
  return { excerpt, redactions: redacted.redactions, blocked: false, localName, localSummary };
}

module.exports = { prepareNamingBrief };
