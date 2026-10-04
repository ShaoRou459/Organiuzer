const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const root = path.resolve('ipc-test-folder');
const groups = [{hash:'a'.repeat(64),size:10,files:[path.join(root,'original.txt'),path.join(root,'copy.txt')]}];
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

function harness(backend) {
  const handlers = new Map();
  class Store { get(_key, fallback) { return fallback; } }
  const electron = {
    app: {requestSingleInstanceLock: () => false,quit() {},on() {}},
    ipcMain: {handle: (channel, fn) => handlers.set(channel, fn),on() {}},
    shell: {trashItem: async () => {}},
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/main/main.js'),'utf8'), {
    require: name => name === 'electron' ? electron : name === 'electron-store' ? {default:Store} : name === './duplicates' ? backend : name === './ai' || name === './renaming' ? {} : require(name.startsWith('./') ? path.join(__dirname, '../src/main', name) : name),
    process, __dirname: path.join(__dirname,'../src/main'), console, AbortController, setTimeout, clearTimeout,
  });
  const sender = new EventEmitter();
  sender.id = 1;
  sender.isDestroyed = () => false;
  const progress = [];
  sender.send = (channel, value) => progress.push({channel,value});
  return {call: (channel,...args) => handlers.get(channel)({sender},...args),sender,progress};
}

test('recycling requires a trusted scan for the same sender and root', async () => {
  let recycled = 0;
  const h = harness({findDuplicates: async () => ({groups,stats:{}}),recycleDuplicates: async args => {recycled++; assert.equal(args.groups,groups); return {success:1,failed:0};}});
  assert.equal((await h.call('folder:deleteFiles',root,[groups[0].files[1]])).failed,1);
  assert.equal((await h.call('folder:findDuplicates',root)).ok,true);
  assert.equal((await h.call('folder:deleteFiles',path.resolve('another-folder'),[groups[0].files[1]])).failed,1);
  assert.equal((await h.call('folder:deleteFiles',root,[groups[0].files[1]])).success,1);
  assert.equal(recycled,1);
  h.sender.emit('destroyed');
  assert.equal((await h.call('folder:deleteFiles',root,[groups[0].files[1]])).failed,1);
});

test('a superseded scan cannot publish its result or progress into the new session', async () => {
  const first = deferred();
  let firstOptions;
  let scans = 0;
  let trusted;
  const h = harness({findDuplicates: async (_root, options) => { if (++scans === 1) { firstOptions = options; await first.promise; options.onProgress({phase:'complete'}); return {groups:[],stats:{}}; } options.onProgress({phase:'complete'}); return {groups,stats:{}}; },recycleDuplicates: async args => {trusted=args.groups; return {success:1,failed:0};}});
  const pending = h.call('folder:findDuplicates',root,true,11);
  assert.equal((await h.call('folder:findDuplicates',root,true,12)).ok,true);
  assert.equal(firstOptions.signal.aborted,true);
  first.resolve();
  assert.equal((await pending).cancelled,true);
  assert.equal(h.progress.length,1);
  assert.equal(h.progress[0].value.requestId,12);
  await h.call('folder:deleteFiles',root,[groups[0].files[1]]);
  assert.equal(trusted,groups);
});

test('canceling a scan invalidates its cleanup session', async () => {
  const gate = deferred();
  const h = harness({findDuplicates: async () => { await gate.promise; return {groups,stats:{}}; },recycleDuplicates: async () => {throw new Error('Must not recycle');}});
  const pending = h.call('folder:findDuplicates',root);
  await h.call('folder:findDuplicates:cancel');
  gate.resolve();
  assert.equal((await pending).cancelled,true);
  assert.equal((await h.call('folder:deleteFiles',root,[groups[0].files[1]])).failed,1);
});

test('scans and second cleanup requests are refused while recycling is active', async () => {
  const gate = deferred();
  const h = harness({findDuplicates: async () => ({groups,stats:{}}),recycleDuplicates: async () => {await gate.promise; return {success:1,failed:0};}});
  await h.call('folder:findDuplicates',root);
  const pending = h.call('folder:deleteFiles',root,[groups[0].files[1]]);
  assert.equal((await h.call('folder:findDuplicates',root)).ok,false);
  assert.equal((await h.call('folder:deleteFiles',root,[groups[0].files[1]])).failed,1);
  gate.resolve();
  assert.equal((await pending).success,1);
});
