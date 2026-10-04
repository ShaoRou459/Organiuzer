'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const JSZip = require('jszip');

const {
  applyRenameSuggestions,
  buildRenameSuggestions,
  detectRenameCandidate,
  finishRenameSuggestions,
  filenameExtension,
  invalidNameReason,
  listRenameCandidates,
} = require('../src/main/renaming');

async function makeTempFolder(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'organiuzer-renaming-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function writeFile(root, name, contents) {
  const filePath = path.join(root, name);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
  return filePath;
}

async function listAndSuggest(root, suggestName) {
  return listAndBuild(root, { suggestName });
}

async function listAndBuild(root, options) {
  const listing = await listRenameCandidates(root);
  const built = await buildRenameSuggestions(root, {
    candidates: listing.candidates,
    trustSnapshot: listing.trustSnapshot,
    ...options,
  });
  return { listing, built };
}

function makePdf(text) {
  const pages = Array.isArray(text) ? text : [text];
  const fontObject = pages.length + 3;
  const contentStart = fontObject + 1;
  const pageObjects = pages.map((pageText, index) => {
    const safeText = pageText.replace(/[()\\]/g, (character) => `\\${character}`);
    const stream = `BT /F1 18 Tf 72 720 Td (${safeText}) Tj ET`;
    return {
      page: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentStart + index} 0 R >>`,
      content: `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    };
  });
  const pageRefs = pages.map((_, index) => `${3 + index} 0 R`).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`,
    ...pageObjects.map(({ page }) => page),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...pageObjects.map(({ content }) => content),
  ];
  let document = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) document += `${String(offset).padStart(10, '0')} 00000 n \n`;
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(document, 'binary');
}

async function makeDocx(text) {
  const escapeXml = (value) => value.replace(/[<>&\"']/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '\"': '&quot;', "'": '&apos;',
  })[character]);
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  const paragraphs = text.split(/\r?\n/)
    .map((line) => `<w:p><w:r><w:t>${escapeXml(line)}</w:t></w:r></w:p>`)
    .join('');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paragraphs}<w:sectPr/></w:body>
</w:document>`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

test('classifies placeholders and random IDs while avoiding human titles, dates, and images', () => {
  for (const name of ['untitled.txt', 'untilted 2.docx', 'New-Document.pdf']) {
    assert.ok(detectRenameCandidate(name), `${name} should be a rename candidate`);
  }
  for (const name of ['IMG_000123.jpg', 'Untitled.png', '9f8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c.svg']) {
    assert.equal(detectRenameCandidate(name), null, `${name} should be excluded from smart rename`);
  }
  for (const name of ['x9Kq2mP8rT4vN7zL.txt', '9f8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c.bin']) {
    assert.ok(detectRenameCandidate(name), `${name} should look machine-generated`);
  }
  for (const name of ['20261003.txt', '19991225183000.log', 'QuarterlyBudget2026.xlsx', 'CharacterizationStudy2026.docx', 'my-interview-notes.txt']) {
    assert.equal(detectRenameCandidate(name), null, `${name} should be left alone`);
  }
});

test('lists only supported root-level regular candidates and keeps sensitive content local', async (t) => {
  const root = await makeTempFolder(t);
  await writeFile(root, 'Untitled.txt', 'do not read until suggestion step');
  await writeFile(root, 'untitled.pdf', Buffer.from('%PDF-1.4'));
  await writeFile(root, 'untitled.exe', 'unsupported');
  await writeFile(root, 'api-key-untitled.txt', 'secret value');
  await writeFile(root, '.hidden-untitled.txt', 'hidden');
  await writeFile(root, path.join('nested', 'Untitled.txt'), 'nested');
  const listing = await listRenameCandidates(root);

  assert.deepEqual(listing.candidates.map((candidate) => candidate.name), ['untitled.pdf', 'Untitled.txt']);
  assert.ok(listing.candidates.every((candidate) => !candidate.path));
  assert.ok(listing.candidates.every((candidate) => candidate.id && !path.isAbsolute(candidate.id)));
  assert.ok(listing.skipped.some((item) => item.name === 'untitled.exe' && /cannot be analyzed/i.test(item.reason)));
  assert.ok(listing.skipped.some((item) => /api-key/i.test(item.name)));
});

test('skips symlinks and hard links during candidate listing', async (t) => {
  const root = await makeTempFolder(t);
  const original = await writeFile(root, 'Untitled.txt', 'content');
  try {
    await fs.link(original, path.join(root, 'untilted.txt'));
  } catch (error) {
    t.skip(`Hard links are unavailable here: ${error.message}`);
    return;
  }
  let hasSymlink = true;
  try {
    await fs.symlink(original, path.join(root, 'Untitled 3.txt'));
  } catch {
    hasSymlink = false;
  }

  const listing = await listRenameCandidates(root);

  assert.deepEqual(listing.candidates, []);
  assert.ok(listing.skipped.some((item) => item.name === 'Untitled.txt' && /hard-linked/i.test(item.reason)));
  if (hasSymlink) assert.ok(listing.skipped.some((item) => item.name === 'Untitled 3.txt' && /symbolic/i.test(item.reason)));
});

test('bounds text sent to AI and resolves suggestions against existing and candidate names', async (t) => {
  const root = await makeTempFolder(t);
  const longText = 'A useful title and project detail.\n'.repeat(8_000);
  await writeFile(root, 'Untitled.txt', longText);
  await writeFile(root, 'untilted.txt', longText);
  await writeFile(root, 'Quarterly-Review.txt', 'existing file');
  const calls = [];

  const { listing, built } = await listAndSuggest(root, async (file, { signal }) => {
    calls.push(file);
    assert.equal(signal, undefined);
    return { name: 'Quarterly/Review.txt', summary: 'A project overview', confidence: 0.91 };
  });

  assert.equal(calls.length, 1, 'identical redacted briefs should share one AI request');
  assert.ok(calls.every((call) => call.kind === 'text' && call.content.length <= 1_800));
  assert.ok(calls.every((call) => !('path' in call) && !('name' in call) && !('oldName' in call)));
  assert.equal(built.trustSnapshot, listing.trustSnapshot);
  assert.deepEqual(built.suggestions.map((item) => item.newName), ['Quarterly-Review (2).txt', 'Quarterly-Review (3).txt']);
  assert.ok(built.suggestions.every((item) => item.extension === '.txt' && item.summary === 'A project overview'));
  assert.deepEqual(built.suggestions.map(({ source }) => source).sort(), ['ai', 'cache']);
});

test('prepares redacted previews without AI calls and sends only selected excerpts later', async (t) => {
  const root = await makeTempFolder(t);
  await writeFile(root, 'Untitled.txt', 'The quarterly planning report covers staffing and travel budgets.');
  await writeFile(root, 'untilted.txt', 'A separate release report covers testing and rollout risks.');
  const listing = await listRenameCandidates(root);
  let aiCalls = 0;
  const prepared = await buildRenameSuggestions(root, {
    candidates: listing.candidates,
    trustSnapshot: listing.trustSnapshot,
    deferAi: true,
    suggestName: async () => { aiCalls++; return { name: 'Unexpected', summary: '', confidence: 1 }; },
  });

  assert.equal(aiCalls, 0);
  assert.equal(prepared.suggestions.length, 0);
  assert.equal(prepared.pendingAi.length, 2);
  const selected = prepared.pendingAi[0];
  const finished = await finishRenameSuggestions(root, {
    prepared,
    selectedIds: [selected.id],
    suggestName: async (brief) => {
      aiCalls++;
      assert.ok(brief.content.length <= 1_800);
      assert.ok(!('name' in brief) && !('path' in brief) && !('oldName' in brief));
      return { name: 'Prepared Report', summary: 'A report summary', confidence: 0.9 };
    },
  });

  assert.equal(aiCalls, 1);
  assert.equal(finished.suggestions.length, 1);
  assert.equal(finished.suggestions[0].id, selected.id);
});

test('local-only mode uses clear local headings and leaves ambiguous files untouched', async (t) => {
  const root = await makeTempFolder(t);
  await writeFile(root, 'Untitled.txt', '# Quarterly Budget Plan\nCovers expected costs and timing.');
  await writeFile(root, 'untilted.txt', 'This content has no explicit title and stays local.');
  const listing = await listRenameCandidates(root);
  let aiCalls = 0;
  const built = await buildRenameSuggestions(root, {
    candidates: listing.candidates,
    trustSnapshot: listing.trustSnapshot,
    localOnly: true,
    suggestName: async () => { aiCalls++; return { name: 'Unexpected', summary: '', confidence: 1 }; },
  });

  assert.equal(aiCalls, 0);
  assert.equal(built.pendingAi.length, 0);
  assert.equal(built.suggestions.length, 1);
  assert.equal(built.suggestions[0].source, 'local');
  assert.equal(built.suggestions[0].newName, 'Quarterly Budget Plan.txt');
  assert.ok(built.skipped.some((item) => item.name === 'untilted.txt' && /Local-only mode/i.test(item.reason)));
});

test('deduplicates identical selected briefs into one AI call and resolves filename collisions', async (t) => {
  const root = await makeTempFolder(t);
  await writeFile(root, 'Untitled.txt', 'The same content explains the quarterly maintenance schedule.');
  await writeFile(root, 'untilted.txt', 'The same content explains the quarterly maintenance schedule.');
  const listing = await listRenameCandidates(root);
  const prepared = await buildRenameSuggestions(root, {
    candidates: listing.candidates,
    trustSnapshot: listing.trustSnapshot,
    deferAi: true,
  });
  let calls = 0;
  const finished = await finishRenameSuggestions(root, {
    prepared,
    selectedIds: prepared.pendingAi.map(({ id }) => id),
    suggestName: async () => {
      calls++;
      return { name: 'Quarterly Maintenance', summary: 'Maintenance schedule', confidence: 0.95 };
    },
  });

  assert.equal(calls, 1);
  assert.equal(finished.suggestions.length, 2);
  assert.deepEqual(finished.suggestions.map(({ newName }) => newName), ['Quarterly Maintenance.txt', 'Quarterly Maintenance (2).txt']);
  assert.deepEqual(finished.suggestions.map(({ source }) => source).sort(), ['ai', 'cache']);
});

test('revalidates prepared files before AI and skips blocked private text without a callback', async (t) => {
  const staleRoot = await makeTempFolder(t);
  const stalePath = await writeFile(staleRoot, 'Untitled.txt', 'This report describes the shipping plan and delivery schedule.');
  const staleListing = await listRenameCandidates(staleRoot);
  const prepared = await buildRenameSuggestions(staleRoot, {
    candidates: staleListing.candidates,
    trustSnapshot: staleListing.trustSnapshot,
    deferAi: true,
  });
  await fs.writeFile(stalePath, 'Changed content after the preview was created.');
  let staleCalls = 0;
  const stale = await finishRenameSuggestions(staleRoot, {
    prepared,
    selectedIds: [prepared.pendingAi[0].id],
    suggestName: async () => { staleCalls++; return { name: 'Changed', summary: '', confidence: 0.9 }; },
  });
  assert.equal(staleCalls, 0);
  assert.equal(stale.suggestions.length, 0);
  assert.ok(stale.skipped.some((item) => /changed after its excerpt/i.test(item.reason)));

  const privateRoot = await makeTempFolder(t);
  await writeFile(privateRoot, 'Untitled.txt', 'Quarterly operations notes\nPassword: super-secret-password-value');
  let privateCalls = 0;
  const blocked = await listAndSuggest(privateRoot, async () => {
    privateCalls++;
    return { name: 'Private Notes', summary: '', confidence: 1 };
  });
  assert.equal(privateCalls, 0);
  assert.equal(blocked.built.suggestions.length, 0);
  assert.ok(blocked.built.skipped.some((item) => /credential or secret/i.test(item.reason)));
});

test('discards AI names with private data and redacts private data from summaries', async (t) => {
  const root = await makeTempFolder(t);
  await writeFile(root, 'Untitled.txt', 'Vendor ledger details for annual purchases and shipment timing.');
  await writeFile(root, 'untilted.txt', 'Travel planning details cover lodging and rail expenses.');
  const listing = await listRenameCandidates(root);
  const prepared = await buildRenameSuggestions(root, {
    candidates: listing.candidates,
    trustSnapshot: listing.trustSnapshot,
    deferAi: true,
  });
  const finished = await finishRenameSuggestions(root, {
    prepared,
    selectedIds: prepared.pendingAi.map(({ id }) => id),
    suggestName: async ({ content }) => content.includes('Vendor ledger')
      ? { name: 'Invoice for vendor@example.com', summary: 'Contains vendor details', confidence: 0.9 }
      : { name: 'Travel Cost Review', summary: 'Prepared for alice@example.com, call 416-555-0100.', confidence: 0.9 },
  });

  assert.equal(finished.suggestions.length, 1);
  assert.equal(finished.suggestions[0].newName, 'Travel Cost Review.txt');
  assert.ok(!finished.suggestions[0].summary.includes('alice@example.com'));
  assert.ok(!finished.suggestions[0].summary.includes('416-555-0100'));
  assert.match(finished.suggestions[0].summary, /\[redacted\]/);
  assert.ok(finished.skipped.some((item) => /private details/i.test(item.reason)));
});

test('excludes images entirely and does not pass binary text to the AI callback', async (t) => {
  const root = await makeTempFolder(t);
  await writeFile(root, 'Untitled.txt', Buffer.from([0x41, 0x00, 0x42]));
  await writeFile(root, 'untilted.png', 'this is not a PNG');
  await writeFile(root, 'New Image.svg', '<svg><text>private</text></svg>');
  const listing = await listRenameCandidates(root);
  assert.ok(listing.candidates.every((candidate) => !/\.(?:png|svg)$/i.test(candidate.name)));
  let calls = 0;
  const built = await buildRenameSuggestions(root, {
    candidates: listing.candidates,
    trustSnapshot: listing.trustSnapshot,
    suggestName: async () => {
    calls++;
    return { name: 'should not be used', summary: '', confidence: 1 };
    },
  });

  assert.equal(calls, 0);
  assert.equal(built.suggestions.length, 0);
  assert.ok(built.skipped.some((item) => /binary data/i.test(item.reason)));
});

test('does not repeat listing diagnostics when building from the trusted candidate snapshot', async (t) => {
  const root = await makeTempFolder(t);
  await writeFile(root, 'Untitled.txt', Buffer.from([0x41, 0x00, 0x42]));
  await writeFile(root, 'untitled.exe', 'unsupported');
  const listing = await listRenameCandidates(root);
  const built = await buildRenameSuggestions(root, {
    candidates: listing.candidates,
    trustSnapshot: listing.trustSnapshot,
    suggestName: async () => ({ name: 'A guessed title', summary: '', confidence: 1 }),
  });

  assert.ok(listing.skipped.some((item) => item.name === 'untitled.exe'));
  assert.ok(built.skipped.some((item) => item.name === 'Untitled.txt'));
  assert.ok(!built.skipped.some((item) => item.name === 'untitled.exe'));
});

test('extracts bounded text from real PDF and DOCX documents', async (t) => {
  const root = await makeTempFolder(t);
  const pdfPages = [
    'The Market receipt number 1042 is attached.',
    'The purchase covers office supplies.',
    'Page three text should not be read.',
    'Page four text should not be read.',
    'Page five text should not be read.',
    'Page six text should not be read.',
  ];
  await writeFile(root, 'Untitled.pdf', makePdf(pdfPages));
  await writeFile(root, 'untilted.docx', await makeDocx('Walking On Imported Air\nDetails follow below.'));
  const received = new Map();

  const { built } = await listAndSuggest(root, async (file) => {
    received.set(file.kind, file.content);
    return { name: 'Market Receipt', summary: 'Document content', confidence: 0.85 };
  });
  assert.match(received.get('pdf'), /Market receipt number 1042/);
  assert.match(received.get('pdf'), /purchase covers office supplies/);
  assert.doesNotMatch(received.get('pdf'), /Page (?:three|four|five|six) text/);
  assert.equal(received.has('docx'), false, 'a clear local heading avoids an AI request');
  assert.deepEqual(new Set(built.suggestions.map((suggestion) => suggestion.extension)), new Set(['.pdf', '.docx']));
  assert.equal(built.suggestions.find(({ extension }) => extension === '.docx')?.source, 'local');
});

test('skips blank or image-only PDFs without asking AI to infer their contents', async (t) => {
  const root = await makeTempFolder(t);
  await writeFile(root, 'Untitled.pdf', makePdf(''));
  let calls = 0;
  const { built } = await listAndSuggest(root, async () => {
    calls++;
    return { name: 'Guessed Name', summary: '', confidence: 1 };
  });

  assert.equal(calls, 0);
  assert.equal(built.suggestions.length, 0);
  assert.ok(built.skipped.some((item) => /No readable text/i.test(item.reason)));
});

test('reports PDF parser failures with their underlying reason', async (t) => {
  const root = await makeTempFolder(t);
  await writeFile(root, 'Untitled.pdf', Buffer.from('%PDF-1.4\nnot a complete PDF'));
  let calls = 0;
  const { built } = await listAndSuggest(root, async () => {
    calls++;
    return { name: 'Guessed Name', summary: '', confidence: 1 };
  });

  assert.equal(calls, 0);
  const pdfSkip = built.skipped.find((item) => item.name === 'Untitled.pdf');
  assert.ok(pdfSkip);
  assert.match(pdfSkip.reason, /^Could not read PDF:/i);
  assert.doesNotMatch(pdfSkip.reason, /No readable text/i);
});

test('skips null and low-confidence AI responses and exports portable-name validation', async (t) => {
  const root = await makeTempFolder(t);
  await writeFile(root, 'Untitled.txt', 'text');
  const { built } = await listAndSuggest(root, async () => ({ name: 'Invoice', summary: '', confidence: 0.59 }));

  assert.equal(built.suggestions.length, 0);
  assert.ok(built.skipped.some((item) => /confident name/i.test(item.reason)));
  assert.equal(filenameExtension('archive.tar.gz'), '.tar.gz');
  assert.match(invalidNameReason('CON.txt', '.txt'), /reserved/i);
  assert.match(invalidNameReason('Invoice.pdf', '.txt'), /extension/i);
  assert.equal(invalidNameReason('Invoice (2).txt', '.txt'), null);
});

test('applies exact selected names without overwrite and returns undo-compatible moves', async (t) => {
  const root = await makeTempFolder(t);
  const original = await writeFile(root, 'Untitled.txt', 'document');
  const { listing, built } = await listAndSuggest(root, async () => ({ name: 'Project Notes', summary: 'Notes', confidence: 0.95 }));
  const suggestion = built.suggestions[0];

  const applied = await applyRenameSuggestions(root, {
    trustSnapshot: built.trustSnapshot,
    suggestions: built.suggestions,
    selected: [{ id: suggestion.id, newName: 'Project Notes.txt' }],
  });

  assert.equal(applied.ok, true);
  assert.deepEqual(applied.moves, [{ from: original, to: path.join(root, 'Project Notes.txt') }]);
  assert.equal(await fs.readFile(path.join(root, 'Project Notes.txt'), 'utf8'), 'document');
  assert.equal(listing.candidates[0].id, suggestion.id);
});

test('rejects extension changes, conflicting edits, stale files, and replaced roots', async (t) => {
  const root = await makeTempFolder(t);
  const file = await writeFile(root, 'Untitled.txt', 'first');
  await writeFile(root, 'Occupied.txt', 'already here');
  const { built } = await listAndSuggest(root, async () => ({ name: 'Fresh Name', summary: '', confidence: 0.8 }));
  const suggestion = built.suggestions[0];

  const changedExtension = await applyRenameSuggestions(root, {
    trustSnapshot: built.trustSnapshot,
    suggestions: built.suggestions,
    selected: [{ id: suggestion.id, newName: 'Fresh Name.pdf' }],
  });
  assert.equal(changedExtension.ok, false);
  assert.match(changedExtension.errors[0], /extension/i);

  const collision = await applyRenameSuggestions(root, {
    trustSnapshot: built.trustSnapshot,
    suggestions: built.suggestions,
    selected: [{ id: suggestion.id, newName: 'Occupied.txt' }],
  });
  assert.equal(collision.ok, false);
  assert.match(collision.errors[0], /already in use/i);

  await fs.writeFile(file, 'changed after suggestion');
  const stale = await applyRenameSuggestions(root, {
    trustSnapshot: built.trustSnapshot,
    suggestions: built.suggestions,
    selected: [suggestion.id],
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.moves.length, 0);

  const secondRoot = await makeTempFolder(t);
  const secondFile = await writeFile(secondRoot, 'Untitled.txt', 'root replacement');
  const second = await listAndSuggest(secondRoot, async () => ({ name: 'Renamed', summary: '', confidence: 0.9 }));
  const displaced = `${secondRoot}-old`;
  await fs.rename(secondRoot, displaced);
  await fs.mkdir(secondRoot);
  const replacedRoot = await applyRenameSuggestions(secondRoot, {
    trustSnapshot: second.built.trustSnapshot,
    suggestions: second.built.suggestions,
    selected: [second.built.suggestions[0].id],
  });
  assert.equal(replacedRoot.ok, false);
  assert.equal(await fs.readFile(path.join(displaced, path.basename(secondFile)), 'utf8'), 'root replacement');
  assert.equal(replacedRoot.moves.length, 0);
  await fs.rm(displaced, { recursive: true, force: true });
});

test('rolls back earlier renames without overwriting a concurrent conflicting file', async (t) => {
  const root = await makeTempFolder(t);
  const first = await writeFile(root, 'Untitled.txt', 'first');
  const second = await writeFile(root, 'untilted.txt', 'second');
  const { built } = await listAndSuggest(root, async (file) => ({
    name: file.name === 'Untitled.txt' ? 'First Notes' : 'Second Notes',
    summary: '',
    confidence: 0.9,
  }));
  const ordered = [...built.suggestions].sort((a, b) => a.oldName.localeCompare(b.oldName));
  let planted = false;

  const result = await applyRenameSuggestions(root, {
    trustSnapshot: built.trustSnapshot,
    suggestions: built.suggestions,
    selected: ordered.map(({ id }) => id),
    onProgress(progress) {
      if (!planted && progress.phase === 'move' && progress.name === ordered[1].oldName) {
        planted = true;
        require('node:fs').writeFileSync(progress.to, 'external file');
      }
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.moves, []);
  assert.equal(await fs.readFile(first, 'utf8'), 'first');
  assert.equal(await fs.readFile(second, 'utf8'), 'second');
  assert.ok(await fs.stat(path.join(root, ordered[1].newName)));
});

test('cancels candidate listing before reading file contents', async (t) => {
  const root = await makeTempFolder(t);
  await writeFile(root, 'Untitled.txt', 'content');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(listRenameCandidates(root, { signal: controller.signal }), { name: 'AbortError', code: 'ABORT_ERR' });
});
