'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { findDuplicates, recycleDuplicates } = require('../src/main/duplicates');

async function makeTempFolder(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'organiuzer-duplicates-'));
  t.after(() => {
    const cleanupRoot = path.resolve(root);
    assert.equal(path.dirname(cleanupRoot), path.resolve(os.tmpdir()));
    assert.ok(path.basename(cleanupRoot).startsWith('organiuzer-duplicates-'));
    return fs.rm(cleanupRoot, { recursive: true, force: true });
  });
  return root;
}

async function writeFile(root, relativePath, contents) {
  const fullPath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, contents);
  return fullPath;
}

test('finds recursive exact matches including empty files and ranks a stable keeper first', async (t) => {
  const root = await makeTempFolder(t);
  const original = await writeFile(root, 'report.txt', 'same contents');
  const copy = await writeFile(root, 'nested/report (1).txt', 'same contents');
  const emptyA = await writeFile(root, 'empty.dat', Buffer.alloc(0));
  const emptyB = await writeFile(root, 'nested/empty copy.dat', Buffer.alloc(0));

  const { groups, stats } = await findDuplicates(root, { recursive: true });

  assert.equal(groups.length, 2);
  assert.ok(groups.some((group) => group.size === 0 && group.files.length === 2));
  const reportGroup = groups.find((group) => group.size === Buffer.byteLength('same contents'));
  assert.deepEqual(reportGroup.files, [original, copy]);
  assert.equal(stats.scannedFiles, 4);
  assert.equal(stats.phase, 'complete');
});

test('full hashes distinguish large files that match every sampled region', async (t) => {
  const root = await makeTempFolder(t);
  const firstBytes = Buffer.alloc(1024 * 1024, 0x61);
  const secondBytes = Buffer.from(firstBytes);
  // This offset lies between the prefix, middle, and tail sample windows.
  secondBytes[300_000] = 0x62;
  await writeFile(root, 'first.bin', firstBytes);
  await writeFile(root, 'second.bin', secondBytes);

  const { groups, stats } = await findDuplicates(root);

  assert.equal(groups.length, 0);
  assert.ok(stats.bytesRead > firstBytes.length * 2, 'the matching sample should trigger a full content comparison');
  assert.equal(stats.skippedFiles, 0);
});

test('rejects files that change after the directory scan snapshot', async (t) => {
  const root = await makeTempFolder(t);
  const first = await writeFile(root, 'first.dat', 'same payload');
  const second = await writeFile(root, 'second.dat', 'same payload');
  let changed = false;

  const { groups, stats } = await findDuplicates(root, {
    onProgress(progress) {
      if (!changed && progress.phase === 'sample') {
        changed = true;
        require('node:fs').writeFileSync(second, 'newer payload');
      }
    },
  });

  assert.deepEqual(groups, []);
  assert.equal(stats.skippedFiles, 1);
  assert.ok(stats.issues.some((issue) => issue.path === second && /changed/i.test(issue.reason)));
  assert.ok(await fs.stat(first));
});

test('revalidates selected files and retains one intact copy when recycling a whole set', async (t) => {
  const root = await makeTempFolder(t);
  const payload = Buffer.from('identical bytes for recycle validation');
  const first = await writeFile(root, 'a-original.bin', payload);
  const stale = await writeFile(root, 'b-copy.bin', payload);
  const third = await writeFile(root, 'c-copy.bin', payload);
  const { groups } = await findDuplicates(root);
  assert.equal(groups.length, 1);
  await fs.writeFile(stale, 'changed after scan, same byte count?');

  const trashed = [];
  const result = await recycleDuplicates({
    rootPath: root,
    groups,
    selectedPaths: groups[0].files,
    trashItem: async (filePath) => {
      trashed.push(filePath);
      await fs.rm(filePath);
    },
  });

  assert.deepEqual(trashed, [third]);
  assert.deepEqual(result.recycledPaths, [third]);
  assert.equal(result.success, 1);
  assert.equal(result.failed, 2, 'the stale file and retained keeper both remain selected for review');
  assert.equal(await fs.readFile(first, 'utf8'), payload.toString());
  assert.ok(await fs.stat(stale));
  assert.ok(result.errors.some((message) => /changed since/i.test(message)));
});

test('rechecks the keeper after hashing the target before recycling it', async (t) => {
  const root = await makeTempFolder(t);
  const payload = Buffer.from('identical content used for the keeper race check');
  const keeper = await writeFile(root, 'a-original.bin', payload);
  const target = await writeFile(root, 'b-copy.bin', payload);
  const otherCopy = await writeFile(root, 'c-copy.bin', payload);
  const { groups } = await findDuplicates(root);
  let keeperChanged = false;
  const trashed = [];

  const result = await recycleDuplicates({
    rootPath: root,
    groups,
    selectedPaths: [target, otherCopy],
    onProgress(progress) {
      if (!keeperChanged && progress.phase === 'target-recheck' && progress.path === target) {
        keeperChanged = true;
        require('node:fs').writeFileSync(keeper, 'changed while target was being rechecked');
      }
    },
    trashItem: async (filePath) => {
      trashed.push(filePath);
      await fs.rm(filePath);
    },
  });

  assert.deepEqual(trashed, [otherCopy]);
  assert.deepEqual(result.recycledPaths, [otherCopy]);
  assert.equal(await fs.readFile(target, 'utf8'), payload.toString());
  assert.ok(result.errors.some((message) => /copy being kept changed/i.test(message)));
});

test('reports partial trash failures and retries against remaining trusted copies', async (t) => {
  const root = await makeTempFolder(t);
  const payload = 'same bytes across all four copies';
  const keeper = await writeFile(root, 'a-original.txt', payload);
  const firstTarget = await writeFile(root, 'b-copy.txt', payload);
  const secondTarget = await writeFile(root, 'c-copy.txt', payload);
  const thirdTarget = await writeFile(root, 'd-copy.txt', payload);
  const { groups } = await findDuplicates(root);

  const partial = await recycleDuplicates({
    rootPath: root,
    groups,
    selectedPaths: [firstTarget, secondTarget, thirdTarget],
    trashItem: async (filePath) => {
      if (filePath === firstTarget) throw new Error('simulated Recycle Bin failure');
      await fs.rm(filePath);
    },
  });

  assert.equal(partial.failed, 1);
  assert.deepEqual(partial.recycledPaths, [secondTarget, thirdTarget]);
  assert.ok(partial.errors.some((message) => /simulated Recycle Bin failure/i.test(message)));
  assert.ok(await fs.stat(firstTarget));
  assert.equal(await fs.readFile(keeper, 'utf8'), payload);

  const retry = await recycleDuplicates({
    rootPath: root,
    groups,
    selectedPaths: [firstTarget],
    trashItem: async (filePath) => fs.rm(filePath),
  });

  assert.deepEqual(retry.recycledPaths, [firstTarget]);
  assert.equal(retry.failed, 0);
  assert.equal(await fs.readFile(keeper, 'utf8'), payload);
});

test('does not expose hard links or symlinks as reclaimable duplicate copies', async (t) => {
  const root = await makeTempFolder(t);
  const source = await writeFile(root, 'source.txt', 'shared inode');
  try {
    await fs.link(source, path.join(root, 'hardlink.txt'));
  } catch (error) {
    t.skip(`Hard links are unavailable here: ${error.message}`);
    return;
  }
  try {
    await fs.symlink(source, path.join(root, 'symlink.txt'));
  } catch {
    // Hard-link behavior can still be verified on hosts that forbid symlink creation.
  }
  await writeFile(root, 'separate.txt', 'shared inode');

  const { groups, stats } = await findDuplicates(root);

  assert.deepEqual(groups, []);
  assert.equal(stats.hardlinksSkipped, 2);
  assert.ok(stats.symlinksSkipped === 0 || stats.symlinksSkipped === 1);
});

test('rejects untrusted paths and tolerates a previously recycled path on retry', async (t) => {
  const root = await makeTempFolder(t);
  const payload = 'repeat me';
  const first = await writeFile(root, 'first.txt', payload);
  const second = await writeFile(root, 'second.txt', payload);
  const { groups } = await findDuplicates(root);
  const outside = path.join(path.dirname(root), 'outside.txt');
  let trashCount = 0;

  const refused = await recycleDuplicates({
    rootPath: root,
    groups,
    selectedPaths: [outside],
    trashItem: async () => { trashCount++; },
  });
  assert.equal(refused.success, 0);
  assert.equal(refused.failed, 1);

  const firstAttempt = await recycleDuplicates({
    rootPath: root,
    groups,
    selectedPaths: [second],
    trashItem: async (filePath) => {
      trashCount++;
      await fs.rm(filePath);
    },
  });
  assert.deepEqual(firstAttempt.recycledPaths, [second]);

  const retry = await recycleDuplicates({
    rootPath: root,
    groups,
    selectedPaths: [second],
    trashItem: async () => { trashCount++; },
  });
  assert.equal(retry.success, 0);
  assert.equal(retry.failed, 1);
  assert.equal(trashCount, 1);
  assert.equal(await fs.readFile(first, 'utf8'), payload);
});

test('reports cancellation of a duplicate scan as an AbortError', async (t) => {
  const root = await makeTempFolder(t);
  await writeFile(root, 'first.txt', 'same');
  await writeFile(root, 'second.txt', 'same');
  const controller = new AbortController();

  await assert.rejects(findDuplicates(root, {
    signal: controller.signal,
    onProgress(progress) {
      if (progress.phase === 'scan') controller.abort();
    },
  }), { name: 'AbortError', code: 'ABORT_ERR' });
});

test('caps recycle error details while preserving the full failure count', async (t) => {
  const root = await makeTempFolder(t);
  const outsidePaths = Array.from({ length: 125 }, (_, index) => path.join(path.dirname(root), `outside-${index}.txt`));

  const result = await recycleDuplicates({
    rootPath: root,
    groups: [],
    selectedPaths: outsidePaths,
    trashItem: async () => assert.fail('untrusted paths must not be sent to trash'),
  });

  assert.equal(result.failed, outsidePaths.length);
  assert.equal(result.errors.length, 100);
  assert.equal(result.errorsTruncated, true);
});

test('emits canonical SHA-256 content identities', async (t) => {
  const root = await makeTempFolder(t);
  const content = 'stable hash';
  const first = await writeFile(root, 'one.txt', content);
  const second = await writeFile(root, 'two.txt', content);

  const { groups } = await findDuplicates(root);
  assert.equal(groups[0].hash, crypto.createHash('sha256').update(content).digest('hex'));
  assert.deepEqual(groups[0].files, [first, second]);
});
