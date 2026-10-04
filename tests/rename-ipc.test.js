const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const realBackend = require('../src/main/renaming');

function harness(backend, suggest = async () => ({name:'Project meeting notes',summary:'Notes from the project meeting.',confidence:0.9})) {
  const handlers = new Map();
  const data = new Map();
  class Store {get(key,fallback) {return data.has(key) ? data.get(key) : fallback;} set(key,value) {data.set(key,value);} delete(key) {data.delete(key);} }
  const electron = {app:{requestSingleInstanceLock:()=>false,quit() {},on() {}},ipcMain:{handle:(name,fn)=>handlers.set(name,fn),on() {}},shell:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/main/main.js'),'utf8'), {
    require:name => name === 'electron' ? electron : name === 'electron-store' ? {default:Store} : name === './renaming' ? backend : name === './ai' ? {suggestFileName:suggest} : name === './duplicates' ? {} : require(name.startsWith('./') ? path.join(__dirname, '../src/main', name) : name),
    process,__dirname:path.join(__dirname,'../src/main'),console,URL,AbortController,setTimeout,clearTimeout,
  });
  const sender = new EventEmitter();
  sender.id=1;
  sender.isDestroyed=()=>false;
  const events=[];
  sender.send=(channel,value)=>events.push({channel,value});
  return {call:(channel,...args)=>handlers.get(channel)({sender},...args),data,events,sender};
}

async function temp(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(),'organiuzer-rename-ipc-'));
  t.after(async () => {
    const absolute=path.resolve(root);
    assert.equal(path.dirname(absolute),path.resolve(os.tmpdir()));
    assert.ok(path.basename(absolute).startsWith('organiuzer-rename-ipc-'));
    await fsp.rm(absolute,{recursive:true,force:true});
  });
  return root;
}

test('rename IPC keeps file trust private and records a rename that History can undo', async t => {
  const root=await temp(t);
  await fsp.writeFile(path.join(root,'Untitled.txt'),'Project team meeting notes and action items.');
  let calls=0;
  const h=harness(realBackend,async ()=>{calls++;return {name:'Project meeting notes',summary:'Team meeting and action items.',confidence:0.9};});
  const list=await h.call('folder:rename:candidates',root);
  assert.equal(list.ok,true);
  assert.equal(calls,0,'local listing does not send content to AI');
  assert.equal(list.trustSnapshot,undefined);
  assert.equal(list.candidates[0].signature,undefined);
  assert.equal(list.candidates[0].path,undefined);
  const result=await h.call('folder:rename:suggest',root,[list.candidates[0].id],44);
  assert.equal(result.ok,true);
  assert.equal(calls,0,'preparing the excerpt is local');
  assert.equal(result.suggestions.length,0);
  assert.equal(result.pendingAi.length,1);
  assert.equal(result.aiModel,'gpt-4o-mini');
  assert.equal(result.trustSnapshot,undefined);
  assert.ok(h.events.every(event=>event.value.requestId===44 && !event.value.content && !event.value.name));
  const named=await h.call('folder:rename:ai',root,[result.pendingAi[0].id],45);
  assert.equal(named.ok,true);
  assert.equal(calls,1);
  const applied=await h.call('folder:rename:apply',root,[{id:named.suggestions[0].id,newName:named.suggestions[0].newName}]);
  assert.equal(applied.ok,true);
  assert.equal(applied.run.kind,'rename');
  assert.equal(applied.renamed,1);
  assert.equal(await fsp.readFile(path.join(root,'Project meeting notes.txt'),'utf8'),'Project team meeting notes and action items.');
  const undone=await h.call('folder:revert',applied.run.id);
  assert.equal(undone.reverted,1);
  assert.equal(await fsp.readFile(path.join(root,'Untitled.txt'),'utf8'),'Project team meeting notes and action items.');
});

test('local-only preparation cannot become a provider request and local names can be applied', async t => {
  const root=await temp(t);
  await fsp.writeFile(path.join(root,'Untitled.txt'),'# Project meeting agenda\nUseful project planning notes.');
  let calls=0;
  const h=harness(realBackend,async()=>{calls++; throw new Error('Must not call AI');});
  const listing=await h.call('folder:rename:candidates',root);
  const prepared=await h.call('folder:rename:suggest',root,[listing.candidates[0].id],1,{localOnly:true});
  assert.equal(prepared.suggestions[0].source,'local');
  assert.equal(prepared.pendingAi.length,0);
  assert.equal((await h.call('folder:rename:ai',root,[listing.candidates[0].id],2)).ok,false);
  assert.equal(calls,0);
  const applied=await h.call('folder:rename:apply',root,[{id:prepared.suggestions[0].id,newName:prepared.suggestions[0].newName}]);
  assert.equal(applied.ok,true);
});

test('changing the AI destination requires another excerpt preview', async t => {
  const root=await temp(t);
  await fsp.writeFile(path.join(root,'Untitled.txt'),'Project team meeting notes and action items.');
  let calls=0;
  const h=harness(realBackend,async()=>{calls++; throw new Error('Must not call AI');});
  const listing=await h.call('folder:rename:candidates',root);
  const prepared=await h.call('folder:rename:suggest',root,[listing.candidates[0].id],1);
  h.data.set('baseUrl','https://different-provider.example/v1');
  assert.equal((await h.call('folder:rename:ai',root,[prepared.pendingAi[0].id],2)).ok,false);
  assert.equal(calls,0);
});

test('unknown candidate IDs and suggestions from another root are refused before AI or rename', async t => {
  const root=await temp(t);
  await fsp.writeFile(path.join(root,'Untitled.txt'),'Meeting notes.');
  const h=harness(realBackend,async ()=>{throw new Error('Must not call AI');});
  await h.call('folder:rename:candidates',root);
  assert.equal((await h.call('folder:rename:suggest',root,['invented-id'])).ok,false);
  assert.equal((await h.call('folder:rename:suggest',path.join(root,'another'),[])).ok,false);
  assert.equal((await h.call('folder:rename:apply',root,[{id:'invented',newName:'Stolen.txt'}])).ok,false);
});

test('cancelled content analysis cannot install a trusted apply session or send late progress', async t => {
  const root=await temp(t);
  const candidates=[{id:'one',name:'Untitled.txt',size:4,extension:'.txt'}];
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const h=harness({listRenameCandidates:async()=>({candidates,skipped:[],trustSnapshot:{secret:'private'}}),buildRenameSuggestions:async (_root,options)=>{await gate;options.onProgress({phase:'complete',total:1,processed:1});return {suggestions:[{id:'one',oldName:'Untitled.txt',newName:'Notes.txt'}],skipped:[],trustSnapshot:options.trustSnapshot};},applyRenameSuggestions:async()=>{throw new Error('Must not rename');}});
  await h.call('folder:rename:candidates',root);
  const pending=h.call('folder:rename:suggest',root,['one'],5);
  await h.call('folder:rename:cancel');
  release();
  assert.equal((await pending).cancelled,true);
  assert.equal(h.events.length,0);
  assert.equal((await h.call('folder:rename:apply',root,[{id:'one',newName:'Notes.txt'}])).ok,false);
});

test('a partial rollback records remaining changes in History for recovery', async t => {
  const root=await temp(t);
  const candidates=[{id:'one',name:'Untitled.txt',size:4,extension:'.txt'}];
  const moves=[{from:path.join(root,'Untitled.txt'),to:path.join(root,'Notes.txt')}];
  const h=harness({
    listRenameCandidates:async()=>({candidates,skipped:[],trustSnapshot:{}}),
    buildRenameSuggestions:async()=>({suggestions:[{id:'one',oldName:'Untitled.txt',newName:'Notes.txt'}],skipped:[],trustSnapshot:{}}),
    applyRenameSuggestions:async()=>({ok:false,moves,errors:['A later rename failed.'],rollbackErrors:['Notes.txt could not be restored.']}),
  });
  await h.call('folder:rename:candidates',root);
  await h.call('folder:rename:suggest',root,['one'],1);
  const result=await h.call('folder:rename:apply',root,[{id:'one',newName:'Notes.txt'}]);
  assert.equal(result.ok,false);
  assert.equal(result.renamed,1);
  assert.equal(result.run.kind,'rename');
  assert.deepEqual(result.run.moves,moves);
  assert.equal(result.rollbackErrors.length,1);
  assert.equal((await h.call('history:runs:get'))[0].id,result.run.id);
  assert.equal((await h.call('folder:rename:apply',root,[{id:'one',newName:'Notes.txt'}])).ok,false,'completed changes invalidate the old apply session');
});

test('an active apply cannot be superseded by a new candidate scan or another rename', async t => {
  const root=await temp(t);
  const candidates=[{id:'one',name:'Untitled.txt',size:4,extension:'.txt'}];
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const h=harness({
    listRenameCandidates:async()=>({candidates,skipped:[],trustSnapshot:{}}),
    buildRenameSuggestions:async()=>({suggestions:[{id:'one',oldName:'Untitled.txt',newName:'Notes.txt'}],skipped:[],trustSnapshot:{}}),
    applyRenameSuggestions:async()=>{await gate;return {ok:true,moves:[]};},
  });
  await h.call('folder:rename:candidates',root);
  await h.call('folder:rename:suggest',root,['one'],1);
  const pending=h.call('folder:rename:apply',root,[{id:'one',newName:'Notes.txt'}]);
  assert.equal((await h.call('folder:rename:candidates',root)).ok,false);
  assert.equal((await h.call('folder:rename:apply',root,[{id:'one',newName:'Notes.txt'}])).ok,false);
  release();
  assert.equal((await pending).ok,true);
});
