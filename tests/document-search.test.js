'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const JSZip = require('jszip');
const { assertDocumentFresh, documentFileIdentity, readDocumentText } = require('../src/main/documentText');
const { clearDocumentSearchCache, searchDocuments } = require('../src/main/documentSearch');

async function makeFolder(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'organiuzer-search-'));
  t.after(async () => {
    clearDocumentSearchCache();
    await fs.rm(root, { recursive: true, force: true });
  });
  return root;
}

function makePdf(pageTexts) {
  const fontObject = pageTexts.length + 3;
  const contentStart = fontObject + 1;
  const pageObjects = pageTexts.map((pageText, index) => {
    const safeText = pageText.replace(/[()\\]/g, (character) => `\\${character}`);
    const stream = `BT /F1 18 Tf 72 720 Td (${safeText}) Tj ET`;
    return {
      page: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentStart + index} 0 R >>`,
      content: `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    };
  });
  const pageRefs = pageTexts.map((_, index) => `${3 + index} 0 R`).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageRefs}] /Count ${pageTexts.length} >>`,
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
  const escapeXml = (value) => value.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
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

test('reads supported text locally with bounded output and identity metadata', async (t) => {
  const root = await makeFolder(t);
  const filePath = path.join(root, 'notes.txt');
  await fs.writeFile(filePath, `Useful planning text. ${'extra '.repeat(3_000)}`);
  const stat = await fs.lstat(filePath, { bigint: true });
  const result = await readDocumentText(root, {
    path: filePath,
    name: 'notes.txt',
    size: Number(stat.size),
    identity: documentFileIdentity(stat),
  });

  assert.match(result.text, /Useful planning text/);
  assert.ok(result.text.length <= 12_000);
  assert.equal(result.kind, 'text');
  assert.equal(result.truncated, true);
  assert.equal(result.identity, documentFileIdentity(stat));
});

test('extracts plain readable text from HTML and RTF without markup or controls', async (t) => {
  const root = await makeFolder(t);
  const htmlPath = path.join(root, 'markup.html');
  await fs.writeFile(htmlPath, '<html><head><title>Budget</title><style>.hidden{color:red}</style></head><body><h1>Quarterly &amp; Annual Plans</h1><p>Ignore <b>markup</b> words.</p><script>secretBrowserCode()</script></body></html>');
  const html = await readDocumentText(root, { path: htmlPath, name: 'markup.html' });
  assert.match(html.text, /Quarterly & Annual Plans/);
  assert.match(html.text, /Ignore markup words/);
  assert.doesNotMatch(html.text, /<[^>]+>|secretBrowserCode|color:red/);

  const rtfPath = path.join(root, 'notes.rtf');
  await fs.writeFile(rtfPath, String.raw`{\rtf1\ansi This is {\b bold} text\par Second line: \u233?clair. {\fonttbl{\f0 Arial;}}{\*\customdata hidden payload}}`);
  const rtf = await readDocumentText(root, { path: rtfPath, name: 'notes.rtf' });
  assert.match(rtf.text, /This is bold text/);
  assert.match(rtf.text, /Second line: éclair/);
  assert.doesNotMatch(rtf.text, /\\rtf|\\b|fonttbl|Arial|hidden payload/);
});

test('extracts real PDF pages and DOCX prose, with honest PDF coverage', async (t) => {
  const root = await makeFolder(t);
  const pdfPath = path.join(root, 'pages.pdf');
  const docxPath = path.join(root, 'prose.docx');
  await fs.writeFile(pdfPath, makePdf([
    'First page contains the requested planning terms.',
    'Second page includes additional readable notes.',
    'Third page should remain outside the search excerpt.',
  ]));
  await fs.writeFile(docxPath, await makeDocx('Imported document has a clear heading.\nThe second paragraph should read as prose.'));

  const pdf = await readDocumentText(root, { path: pdfPath, name: 'pages.pdf' });
  const docx = await readDocumentText(root, { path: docxPath, name: 'prose.docx' });
  assert.match(pdf.text, /First page contains the requested planning terms/);
  assert.match(pdf.text, /Second page includes additional readable notes/);
  assert.doesNotMatch(pdf.text, /Third page/);
  assert.equal(pdf.kind, 'pdf');
  assert.equal(pdf.truncated, true);
  assert.match(docx.text, /Imported document has a clear heading/);
  assert.match(docx.text, /second paragraph should read as prose/);
  assert.equal(docx.kind, 'docx');
  assert.equal(docx.truncated, false);
});

test('rejects a file that changes after listing and refuses already-cancelled work', async (t) => {
  const root = await makeFolder(t);
  const filePath = path.join(root, 'notes.md');
  await fs.writeFile(filePath, 'original content');
  const stat = await fs.lstat(filePath, { bigint: true });
  const stale = { path: filePath, name: 'notes.md', identity: documentFileIdentity(stat) };
  await fs.writeFile(filePath, 'replacement content with a different size');
  await assert.rejects(readDocumentText(root, stale), /changed after it was listed/i);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readDocumentText(root, { path: filePath, name: 'notes.md' }, { signal: controller.signal }), { name: 'AbortError' });
});

test('freshness checks catch file edits and replacement of the selected root', async (t) => {
  const root = await makeFolder(t);
  const filePath = path.join(root, 'notes.txt');
  await fs.writeFile(filePath, 'listed text');
  const originalFile = await fs.lstat(filePath, { bigint: true });
  const originalRoot = await fs.lstat(root, { bigint: true });
  const expectedRootIdentity = [originalRoot.dev, originalRoot.ino, originalRoot.mode].map(String).join(':');
  const expectedRootRealPath = await fs.realpath(root);
  const file = { path: filePath, name: 'notes.txt', identity: documentFileIdentity(originalFile) };

  await assertDocumentFresh(root, file, { rootIdentity: expectedRootIdentity, rootRealPath: expectedRootRealPath });
  await fs.writeFile(filePath, 'changed text with another length');
  await assert.rejects(
    assertDocumentFresh(root, file, { rootIdentity: expectedRootIdentity, rootRealPath: expectedRootRealPath }),
    /document changed/i,
  );

  const movedRoot = `${root}-moved`;
  await fs.rename(root, movedRoot);
  t.after(async () => fs.rm(movedRoot, { recursive: true, force: true }));
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'notes.txt'), 'new folder content');
  await assert.rejects(
    assertDocumentFresh(root, { ...file, path: path.join(root, 'notes.txt') }, { rootIdentity: expectedRootIdentity, rootRealPath: expectedRootRealPath }),
    /selected folder changed/i,
  );
});

test('searches recursive file names and supported text, with no content returned beyond snippets', async (t) => {
  const root = await makeFolder(t);
  await fs.mkdir(path.join(root, 'projects'));
  await fs.writeFile(path.join(root, 'projects', 'budget-notes.md'), 'Quarterly planning includes a cedar supply estimate and approval date.');
  await fs.writeFile(path.join(root, 'draft.txt'), 'The cedar shipment arrives next week.');
  await fs.writeFile(path.join(root, 'readme.bin'), Buffer.from([0, 1, 2, 3]));

  const byContent = await searchDocuments(root, 'cedar shipment');
  assert.equal(byContent.results.length, 1);
  assert.equal(byContent.results[0].name, 'draft.txt');
  assert.equal(byContent.results[0].matchIn, 'content');
  assert.match(byContent.results[0].snippet, /cedar shipment/i);
  assert.equal(Object.hasOwn(byContent.results[0], 'text'), false);
  assert.equal(byContent.stats.searchedContentFiles, 2);

  const byName = await searchDocuments(root, 'budget-notes');
  assert.equal(byName.results[0].matchIn, 'name');
  assert.equal(byName.results[0].name, 'budget-notes.md');
});

test('excludes hidden and generated folders and reports file and extraction limits', async (t) => {
  const root = await makeFolder(t);
  await fs.mkdir(path.join(root, '.private'));
  await fs.mkdir(path.join(root, 'node_modules'));
  await fs.writeFile(path.join(root, '.private', 'secret-notes.txt'), 'needle hidden');
  await fs.writeFile(path.join(root, 'node_modules', 'generated.txt'), 'needle generated');
  await fs.writeFile(path.join(root, 'a.txt'), 'needle first document');
  await fs.writeFile(path.join(root, 'b.txt'), 'needle second document');

  const fileLimited = await searchDocuments(root, 'needle', { maxFiles: 1 });
  assert.equal(fileLimited.stats.fileLimitReached, true);
  assert.equal(fileLimited.stats.scannedFiles, 1);
  assert.equal(fileLimited.results.length, 1);
  assert.ok(!fileLimited.results.some((result) => result.name.includes('secret') || result.name.includes('generated')));

  clearDocumentSearchCache();
  const extractionLimited = await searchDocuments(root, 'needle', { maxExtractedFiles: 1, maxFiles: 10 });
  assert.equal(extractionLimited.stats.extractedFiles, 1);
  assert.ok(extractionLimited.stats.extractionLimited >= 1);
});

test('uses bounded identity-keyed memory cache and refreshes changed documents', async (t) => {
  const root = await makeFolder(t);
  const filePath = path.join(root, 'cache.txt');
  await fs.writeFile(filePath, 'violet compass is an old phrase');

  const first = await searchDocuments(root, 'violet compass');
  assert.equal(first.results.length, 1);
  const cached = await searchDocuments(root, 'old phrase');
  assert.equal(cached.results.length, 1);
  assert.equal(cached.stats.cachedFiles, 1);

  await fs.writeFile(filePath, 'silver lantern is the new phrase and has a different length');
  const changed = await searchDocuments(root, 'silver lantern');
  assert.equal(changed.results.length, 1);
  assert.equal(changed.stats.cachedFiles, 0);
});

test('rejects paths outside the selected folder and skips linked content', async (t) => {
  const root = await makeFolder(t);
  const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'organiuzer-outside-'));
  t.after(async () => fs.rm(outsideRoot, { recursive: true, force: true }));
  const outsidePath = path.join(outsideRoot, 'outside.txt');
  await fs.writeFile(outsidePath, 'private needle');
  await assert.rejects(readDocumentText(root, { path: outsidePath, name: 'outside.txt' }), /outside the selected folder/i);

  try {
    await fs.symlink(outsidePath, path.join(root, 'linked.txt'), 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) return t.skip('This Windows setup does not permit creating a test symbolic link.');
    throw error;
  }
  const result = await searchDocuments(root, 'needle');
  assert.equal(result.results.length, 0);
  assert.ok(result.stats.skippedFiles >= 1);
});

test('returns concise guidance for an empty query and scopes progress to the request call', async (t) => {
  const root = await makeFolder(t);
  const empty = await searchDocuments(root, '   ');
  assert.match(empty.stats.guidance, /enter a word or phrase/i);
  assert.equal(empty.stats.scannedFiles, 0);

  await fs.writeFile(path.join(root, 'term.txt'), 'a term appears here');
  const progress = [];
  const result = await searchDocuments(root, 'term', { onProgress: (event) => progress.push(event) });
  assert.equal(result.results.length, 1);
  assert.ok(progress.every((event) => event.scannedFiles === 1));
  assert.equal(progress.at(-1).phase, 'search');
});
