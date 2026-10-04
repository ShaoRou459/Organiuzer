const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const fsp = require('node:fs/promises');
const os = require('node:os');

const root = path.resolve('document-ipc-fixture');
function harness(versions, search = async () => ({ results: [], stats: {} })) {
  const handlers = new Map();
  const data = new Map();
  class Store { get(key, fallback) { return data.has(key) ? data.get(key) : fallback; } set(key, value) { data.set(key, value); } }
  const electron = { app: { requestSingleInstanceLock: () => false, quit() {}, on() {} }, ipcMain: { handle: (name, fn) => handlers.set(name, fn), on() {} }, shell: { trashItem: async () => {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8'), {
    require: name => name === 'electron' ? electron : name === 'electron-store' ? { default: Store } : name === './documentVersions' ? versions : name === './documentSearch' ? { searchDocuments: search } : ['../ai', './ai', './renaming', './duplicates'].includes(name) ? {} : require(name.startsWith('./') ? path.join(__dirname, '../src/main', name) : name),
    process, __dirname: path.join(__dirname, '../src/main'), console, URL, AbortController, setTimeout, clearTimeout,
  });
  const sender = new EventEmitter(); sender.id = 1; sender.isDestroyed = () => false;
  const events = []; sender.send = (channel, value) => events.push({ channel, value });
  return { call: (channel, ...args) => handlers.get(channel)({ sender }, ...args), sender, events, data };
}
test('version cleanup and comparison require the same renderer scan token and root', async () => {
  let recycled = 0;
  const h = harness({ scanDocumentVersions: async () => ({ scanId: 'trusted', groups: [], stats: {} }), recycleDocumentVersions: async args => { recycled++; assert.equal(args.scanId, 'trusted'); assert.equal(typeof args.trashItem, 'function'); return { success: 1, failed: 0 }; }, compareDocumentVersions: async () => ({ summary: 'different' }) });
  assert.equal((await h.call('documents:versions:recycle', root, 'trusted', ['a'])).ok, false);
  await h.call('documents:versions:scan', root, 1);
  assert.equal((await h.call('documents:versions:recycle', root, 'forged', ['a'])).ok, false);
  assert.equal((await h.call('documents:versions:compare', path.resolve('other'), 'trusted', 'a', 'b')).ok, false);
  assert.equal((await h.call('documents:versions:recycle', root, 'trusted', ['a'])).success, 1);
  h.sender.emit('destroyed');
  assert.equal((await h.call('documents:versions:recycle', root, 'trusted', ['a'])).ok, false);
  assert.equal(recycled, 1);
});
test('superseded version scans cannot overwrite the current token or send stale progress', async () => {
  let resolve; const gate = new Promise(r => { resolve = r; }); let scans = 0;
  const h = harness({ scanDocumentVersions: async (_path, options) => { if (++scans === 1) { await gate; options.onProgress({ completed: 1 }); return { scanId: 'old' }; } options.onProgress({ completed: 2 }); return { scanId: 'current' }; }, compareDocumentVersions: async () => ({}) });
  const old = h.call('documents:versions:scan', root, 1);
  await h.call('documents:versions:scan', root, 2);
  resolve(); assert.equal((await old).cancelled, true);
  assert.equal(h.events.length, 1); assert.equal(h.events[0].value.requestId, 2);
  assert.equal((await h.call('documents:versions:compare', root, 'old', 'a', 'b')).ok, false);
  assert.equal((await h.call('documents:versions:compare', root, 'current', 'a', 'b')).ok, true);
});
test('cancellation invalidates cleanup while search cancellation aborts its own operation', async () => {
  let release; const gate = new Promise(r => { release = r; }); let signal;
  const h = harness({ scanDocumentVersions: async () => ({ scanId: 'current' }) }, async (_root, _query, options) => { signal = options.signal; await gate; return { results: [] }; });
  await h.call('documents:versions:scan', root, 1);
  await h.call('documents:versions:cancel');
  assert.equal((await h.call('documents:versions:recycle', root, 'current', ['a'])).ok, false);
  const pending = h.call('documents:search', root, 'memo', 3);
  await h.call('documents:search:cancel'); assert.equal(signal.aborted, true);
  release(); assert.equal((await pending).cancelled, true);
});
test('saved presets are reusable and starter presets remain unchanged', async () => {
  const h = harness({});
  const original = await h.call('presets:get', root);
  const saved = await h.call('presets:save', root, { ...original.presets[0], name: 'My documents', rules: [{ extensions: ['pdf'], destination: 'Memos' }] });
  assert.equal(saved.ok, true); assert.notEqual(saved.preset.id, 'downloads');
  const another = await h.call('presets:get', path.resolve('another-folder'));
  assert.equal(another.presets.length, 4); assert.equal(another.presets[0].name, 'Downloads');
  assert.equal((await h.call('presets:get', root)).selectedId, saved.preset.id);
  assert.equal((await h.call('presets:save', root, { ...saved.preset, rules: [{ extensions: ['pdf'], destination: '../outside' }] })).ok, false);
});
test('preset preview, apply and undo use the same local move workflow', async t => {
  const folder = await fsp.mkdtemp(path.join(os.tmpdir(), 'organiuzer-preset-ipc-'));
  t.after(async () => { assert.equal(path.dirname(path.resolve(folder)), path.resolve(os.tmpdir())); assert.ok(path.basename(folder).startsWith('organiuzer-preset-ipc-')); await fsp.rm(folder, { recursive: true, force: true }); });
  await fsp.writeFile(path.join(folder, 'memo.txt'), 'Meeting notes');
  await fsp.writeFile(path.join(folder, 'stay.txt'), 'Leave this one');
  const h = harness({});
  const preset = { name: 'My notes', rules: [{ extensions: ['txt'], destination: 'Notes' }], excludedNames: ['stay.txt'] };
  const preview = await h.call('presets:preview', folder, preset);
  assert.equal(preview.ok, true); assert.equal(preview.plan.Notes.items.length, 1);
  assert.equal(await fsp.readFile(path.join(folder, 'memo.txt'), 'utf8'), 'Meeting notes', 'preview does not move files');
  const applied = await h.call('folder:execute', folder, preview.plan);
  assert.equal(applied.ok, true); assert.equal(applied.moved, 1);
  assert.equal(await fsp.readFile(path.join(folder, 'Notes', 'memo.txt'), 'utf8'), 'Meeting notes');
  assert.equal(await fsp.readFile(path.join(folder, 'stay.txt'), 'utf8'), 'Leave this one');
  const restored = await h.call('folder:revert', applied.runId);
  assert.equal(restored.ok, true);
  assert.equal(await fsp.readFile(path.join(folder, 'memo.txt'), 'utf8'), 'Meeting notes');
});
test('a preset destination replaced with a linked folder after preview is refused', async t => {
  const folder = await fsp.mkdtemp(path.join(os.tmpdir(), 'organiuzer-preset-link-'));
  const outside = await fsp.mkdtemp(path.join(os.tmpdir(), 'organiuzer-preset-outside-'));
  t.after(async () => {
    for (const target of [folder, outside]) { assert.equal(path.dirname(path.resolve(target)), path.resolve(os.tmpdir())); assert.ok(path.basename(target).startsWith('organiuzer-preset-')); await fsp.rm(target, { recursive: true, force: true }); }
  });
  await fsp.writeFile(path.join(folder, 'memo.txt'), 'Keep me here');
  const h = harness({});
  const preview = await h.call('presets:preview', folder, { name: 'My notes', rules: [{ extensions: ['txt'], destination: 'Notes' }] });
  try { await fsp.symlink(outside, path.join(folder, 'Notes'), process.platform === 'win32' ? 'junction' : 'dir'); } catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) return t.skip('Symlink creation is unavailable.'); throw error; }
  assert.equal((await h.call('folder:execute', folder, preview.plan)).ok, false);
  assert.equal(await fsp.readFile(path.join(folder, 'memo.txt'), 'utf8'), 'Keep me here');
  assert.deepEqual(await fsp.readdir(outside), []);
});
