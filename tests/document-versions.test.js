'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  compareDocumentVersions,
  recycleDocumentVersions,
  releaseDocumentVersionScan,
  scanDocumentVersions,
} = require('../src/main/documentVersions');

async function makeTempFolder(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'organiuzer-doc-versions-'));
  t.after(() => {
    const cleanupRoot = path.resolve(root);
    assert.equal(path.dirname(cleanupRoot), path.resolve(os.tmpdir()));
    assert.ok(path.basename(cleanupRoot).startsWith('organiuzer-doc-versions-'));
    return fs.rm(cleanupRoot, { recursive: true, force: true });
  });
  return root;
}

async function writeFile(root, name, contents) {
  const fullPath = path.join(root, name);
  await fs.writeFile(fullPath, contents);
  return fullPath;
}

function relatedMemo(version = 'original') {
  const paragraphs = [
    'The community planning memo reviews the proposed improvements to the central library and nearby public spaces.',
    'The project team collected feedback from residents, local businesses, school staff, and visitors during the spring.',
    'The updated schedule includes accessibility work, energy upgrades, quiet study rooms, and a safer crossing.',
    'The finance section compares construction costs, grant funding, maintenance expenses, and expected annual savings.',
    'The committee will review the design package before the next public meeting and publish its recommendations.',
    'Staff members will track each action item, share progress with the neighborhood, and record any unresolved concerns.',
  ];
  if (version === 'updated') paragraphs[2] = 'The updated schedule includes accessibility work, energy upgrades, quiet study rooms, and a protected crossing.';
  if (version === 'unrelated') return [
    'A separate gardening note records soil pH, seed spacing, watering dates, and the harvest plan for the greenhouse.',
    'The greenhouse inventory covers tomatoes, herbs, compost, irrigation supplies, and the annual equipment budget.',
    'Volunteers should label each tray and record germination rates before moving seedlings outdoors.',
  ].join('\n\n');
  return `${paragraphs.join('\n\n')}\n\nVersion status: ${version}.`;
}

function oneGroup(result) {
  assert.equal(result.groups.length, 1);
  return result.groups[0];
}

test('groups six meaningful filename variants without implying which has the latest content', async (t) => {
  const root = await makeTempFolder(t);
  const names = [
    'board memo.txt',
    'board memo (1).txt',
    'board memo - Copy.txt',
    'board memo_v2.txt',
    'board memo final.txt',
    'board memo revised.txt',
  ];
  for (let index = 0; index < names.length; index++) {
    await writeFile(root, names[index], `Short draft entry number ${index}.`);
    const modified = new Date(1_700_000_000_000 + index * 10_000);
    await fs.utimes(path.join(root, names[index]), modified, modified);
  }

  const result = await scanDocumentVersions(root);
  const group = oneGroup(result);
  assert.equal(group.files.length, 6);
  assert.equal(group.reason, 'filename');
  assert.equal(group.title, 'board memo');
  assert.equal(group.files[0].name, 'board memo revised.txt');
  assert.equal(group.suggestedKeeperId, group.files[0].id);
  assert.match(group.keeperNote, /newest by modified time; this may not be the latest content/i);
  assert.ok(group.files.every((file) => typeof file.identity === 'string' && file.identity.length > 0));
});

test('does not group unrelated documents or placeholder names by filename alone', async (t) => {
  const root = await makeTempFolder(t);
  await writeFile(root, 'garden notes.txt', relatedMemo('unrelated'));
  await writeFile(root, 'tax memo.txt', 'A short note about quarterly taxes.');
  await writeFile(root, 'untitled.txt', 'A short placeholder document for testing.');
  await writeFile(root, 'untitled (1).txt', 'A different short placeholder document.');

  const { groups } = await scanDocumentVersions(root);
  assert.deepEqual(groups, []);
});

test('groups similarly worded documents under different filenames with text evidence', async (t) => {
  const root = await makeTempFolder(t);
  const first = await writeFile(root, 'committee update.txt', relatedMemo('original'));
  await writeFile(root, 'meeting copy.txt', relatedMemo('updated'));
  await writeFile(root, 'unrelated gardening.txt', relatedMemo('unrelated'));

  const { groups } = await scanDocumentVersions(root);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].reason, 'content');
  assert.deepEqual(groups[0].files.map((file) => file.name).sort(), ['committee update.txt', 'meeting copy.txt']);
  assert.ok(groups[0].files.every((file) => file.contentEvidence?.match === 'similar text'));
  assert.ok(await fs.stat(first));
});

test('generic placeholder filenames never create a group, even when suffixes match', async (t) => {
  const root = await makeTempFolder(t);
  await writeFile(root, 'Document.txt', 'A short placeholder document for testing.');
  await writeFile(root, 'Document (1).txt', 'A different short placeholder document.');
  await writeFile(root, 'File final.txt', 'A short file about yesterday.');
  await writeFile(root, 'File v2.txt', 'A short file about tomorrow.');
  await writeFile(root, 'final.txt', 'A standalone final draft.');
  await writeFile(root, 'draft.txt', 'A different standalone draft.');

  const { groups } = await scanDocumentVersions(root);
  assert.deepEqual(groups, []);
});

test('groups short memo variants by explicit download suffix and supports memo, report, and notes PDFs without text', async (t) => {
  const root = await makeTempFolder(t);
  const shortNames = [
    'memo.txt', 'memo (1).txt', 'memo (2).txt', 'memo - Copy.txt', 'memo_v2.txt', 'memo revised.txt',
  ];
  for (let index = 0; index < shortNames.length; index++) {
    await writeFile(root, shortNames[index], `Memo draft ${index}.`);
  }
  await writeFile(root, 'memo.pdf', Buffer.alloc(0));
  await writeFile(root, 'memo (1).pdf', Buffer.alloc(0));
  await writeFile(root, 'report.pdf', Buffer.alloc(0));
  await writeFile(root, 'report (1).pdf', Buffer.alloc(0));
  await writeFile(root, 'notes.pdf', Buffer.alloc(0));
  await writeFile(root, 'notes - Copy.pdf', Buffer.alloc(0));
  await writeFile(root, 'document.pdf', Buffer.alloc(0));
  await writeFile(root, 'document (1).pdf', Buffer.alloc(0));

  const { groups } = await scanDocumentVersions(root);
  const memoTextGroup = groups.find((group) => group.title === 'memo' && group.files.some((file) => file.name.endsWith('.txt')));
  const memoPdfGroup = groups.find((group) => group.title === 'memo' && group.files.some((file) => file.name.endsWith('.pdf')));
  assert.equal(memoTextGroup, memoPdfGroup, 'same-basename formats share one review group');
  assert.equal(memoTextGroup.files.filter((file) => file.name.endsWith('.txt')).length, 6);
  assert.equal(memoTextGroup.reason, 'filename', 'short text does not need to pass the content-similarity threshold');
  assert.equal(memoTextGroup.files.filter((file) => file.name.endsWith('.pdf')).length, 2, 'name grouping still works when PDFs have no readable text');
  assert.ok(groups.some((group) => group.title === 'report' && group.files.length === 2));
  assert.ok(groups.some((group) => group.title === 'notes' && group.files.length === 2));
  assert.ok(!groups.some((group) => group.files.some((file) => file.name.startsWith('document'))));
});

test('excludes images, symlinks, hidden files, and nested documents', async (t) => {
  const root = await makeTempFolder(t);
  await writeFile(root, 'memo.txt', relatedMemo());
  await writeFile(root, '.memo (1).txt', relatedMemo('updated'));
  await writeFile(root, 'memo (2).png', 'not a document');
  await fs.mkdir(path.join(root, 'nested'));
  await writeFile(path.join(root, 'nested'), 'memo (3).txt', relatedMemo('updated'));
  try {
    await fs.symlink(path.join(root, 'memo.txt'), path.join(root, 'memo (4).txt'));
  } catch (error) {
    if (process.platform !== 'win32') throw error;
  }

  const { groups } = await scanDocumentVersions(root);
  assert.deepEqual(groups, []);
});

test('recycles selected scan IDs only and keeps one unchanged member in each group', async (t) => {
  const root = await makeTempFolder(t);
  const original = await writeFile(root, 'board memo.txt', relatedMemo('original'));
  const revised = await writeFile(root, 'board memo (1).txt', relatedMemo('updated'));
  const result = await scanDocumentVersions(root);
  const group = oneGroup(result);
  const selected = group.files.find((file) => file.path === revised);
  const recycled = [];

  const outcome = await recycleDocumentVersions({
    rootPath: root,
    scanId: result.scanId,
    selectedIds: [selected.id],
    trashItem: async (filePath) => recycled.push(filePath),
  });

  assert.equal(outcome.success, 1);
  assert.equal(outcome.failed, 0);
  assert.deepEqual(outcome.successIds, [selected.id]);
  assert.deepEqual(recycled, [revised]);
  assert.ok(await fs.stat(original));
  assert.ok(await fs.stat(revised), 'the injected trash function owns the move; this helper never unlinks directly');
});

test('refuses an all-selected group and detects files changed after the scan', async (t) => {
  const root = await makeTempFolder(t);
  const original = await writeFile(root, 'board memo.txt', relatedMemo('original'));
  const revised = await writeFile(root, 'board memo (1).txt', relatedMemo('updated'));
  const result = await scanDocumentVersions(root);
  const group = oneGroup(result);
  const recycled = [];

  const allSelected = await recycleDocumentVersions({
    rootPath: root,
    scanId: result.scanId,
    selectedIds: group.files.map((file) => file.id),
    trashItem: async (filePath) => recycled.push(filePath),
  });
  assert.equal(allSelected.success, 0);
  assert.equal(allSelected.failed, 2);
  assert.equal(recycled.length, 0);

  await fs.writeFile(revised, relatedMemo('changed after scan'));
  const staleTarget = group.files.find((file) => file.path === revised);
  const stale = await recycleDocumentVersions({
    rootPath: root,
    scanId: result.scanId,
    selectedIds: [staleTarget.id],
    trashItem: async (filePath) => recycled.push(filePath),
  });
  assert.equal(stale.success, 0);
  assert.equal(stale.failed, 1);
  assert.match(stale.errors[0].reason, /changed/i);
  assert.equal(recycled.length, 0);
  assert.ok(await fs.stat(original));
});

test('reports trash failures and returns completed work on cancellation', async (t) => {
  const root = await makeTempFolder(t);
  await writeFile(root, 'board memo.txt', relatedMemo('original'));
  await writeFile(root, 'board memo (1).txt', relatedMemo('updated'));
  await writeFile(root, 'board memo (2).txt', relatedMemo('draft'));
  const result = await scanDocumentVersions(root);
  const group = oneGroup(result);
  const selected = group.files.slice(0, 2).map((file) => file.id);
  const failed = await recycleDocumentVersions({
    rootPath: root,
    scanId: result.scanId,
    selectedIds: [selected[0]],
    trashItem: async () => { throw new Error('Recycle Bin unavailable'); },
  });
  assert.equal(failed.success, 0);
  assert.equal(failed.failed, 1);
  assert.match(failed.errors[0].reason, /Recycle Bin unavailable/);

  const controller = new AbortController();
  let moves = 0;
  const cancelled = await recycleDocumentVersions({
    rootPath: root,
    scanId: result.scanId,
    selectedIds: selected,
    signal: controller.signal,
    trashItem: async () => {
      moves++;
      if (moves === 1) controller.abort();
    },
  });
  assert.equal(cancelled.success, 1);
  assert.equal(cancelled.failed, 1);
  assert.equal(cancelled.cancelled, true);
});

test('bounds large scans and rejects invalid selection arrays; scan snapshots can be released', async (t) => {
  const root = await makeTempFolder(t);
  const contentsFor = (index) => Array.from({ length: 30 }, (_, word) => `token${index * 31 + word}`).join(' ');
  for (let index = 0; index < 1_005; index++) {
    await writeFile(root, `document-${String(index).padStart(4, '0')}.txt`, contentsFor(index));
  }
  const result = await scanDocumentVersions(root);
  assert.equal(result.stats.scannedFiles, result.stats.maxFiles);
  assert.equal(result.stats.maxFiles, 1_000);
  assert.equal(result.stats.fileLimitReached, true);
  assert.equal(result.stats.contentLimitReached, true);
  assert.equal(result.stats.comparisonLimitReached, true);

  await assert.rejects(() => recycleDocumentVersions({
    rootPath: root,
    scanId: result.scanId,
    selectedIds: null,
    trashItem: async () => {},
  }), /must be an array/i);
  assert.equal(releaseDocumentVersionScan(result.scanId), true);
  const released = await recycleDocumentVersions({
    rootPath: root,
    scanId: result.scanId,
    selectedIds: ['some-id'],
    trashItem: async () => {},
  });
  assert.match(released.errors[0].reason, /expired/i);
});

test('comparison reads only two trusted group members and marks matching truncated prefixes as uncertain', async (t) => {
  const root = await makeTempFolder(t);
  await writeFile(root, 'board memo.txt', `${relatedMemo('original')}\n${'extra discussion '.repeat(5_000)}`);
  await writeFile(root, 'board memo (1).txt', `${relatedMemo('original')}\n${'extra discussion '.repeat(5_001)}`);
  const result = await scanDocumentVersions(root);
  const group = oneGroup(result);
  const comparison = await compareDocumentVersions({
    rootPath: root,
    scanId: result.scanId,
    leftId: group.files[0].id,
    rightId: group.files[1].id,
  });
  assert.equal(comparison.left.truncated, true);
  assert.equal(comparison.right.truncated, true);
  assert.equal(comparison.sameText, null, 'equal prefixes do not prove that the whole files match');
  assert.match(comparison.summary, /remaining text may differ/i);
  assert.ok(comparison.left.text.length <= 12_000);
  await assert.rejects(() => compareDocumentVersions({
    rootPath: root,
    scanId: result.scanId,
    leftId: group.files[0].id,
    rightId: 'not-a-member',
  }), /same related group/i);
});
