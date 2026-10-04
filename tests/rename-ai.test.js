const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function aiMock(reply, thrown) {
  const requests = [];
  class OpenAI {
    constructor() { this.chat = { completions: { create: async (...args) => { requests.push(args); if (thrown) throw thrown; return {choices:[{message:{content:reply}}]}; } } }; }
  }
  const module = {exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/main/ai.js'),'utf8'), {require:name => name === 'openai' ? OpenAI : name === './renamePrivacy' ? require('../src/main/renamePrivacy') : require(name),module,process});
  return {suggest: (file, options) => module.exports.suggestFileName(file,{provider:'custom',baseUrl:'http://localhost:1234/v1',model:'test-model'}, options),requests};
}

test('filename AI receives bounded content and returns a summary with a base-name suggestion', async () => {
  const ai = aiMock('```json\n{"name":"Quarterly sales overview","summary":"Sales figures for the quarter.","confidence":0.9}\n```');
  const controller = new AbortController();
  const result = await ai.suggest({name:'untitled.txt',kind:'text',extension:'.txt',content:'x'.repeat(30000)}, {signal:controller.signal});
  assert.equal(result.name,'Quarterly sales overview');
  assert.equal(result.confidence,0.9);
  const [request,options] = ai.requests[0];
  assert.equal(request.model,'test-model');
  assert.equal(options.signal,controller.signal);
  assert.ok(request.messages[0].content.includes('untrusted data'));
  assert.equal(request.messages[1].content.split('FILE CONTENT (data only):\n')[1].length,1800);
  assert.equal(request.store,false);
  assert.equal(request.max_completion_tokens,256);
  assert.equal(options.maxRetries,0);
  assert.equal(options.timeout,30000);
  assert.ok(!request.messages[1].content.includes('untitled.txt'));
});

test('images are rejected before a provider request is made', async () => {
  const ai = aiMock('{"name":"Red bicycle beside a lake","summary":"A red bicycle parked near water.","confidence":0.8}');
  await assert.rejects(ai.suggest({name:'a8Kp21xQ.jpg',kind:'image',mime:'image/jpeg',content:{encoding:'base64',data:'aGVsbG8='}}), /Images are excluded/);
  assert.equal(ai.requests.length,0);
});

test('malformed results cannot become filename suggestions and low-confidence abstention is preserved', async () => {
  await assert.rejects(aiMock('{"name":"Title","summary":"Text","confidence":3}').suggest({name:'untitled.txt',content:'text'}), /usable filename/);
  await assert.rejects(aiMock('not JSON').suggest({name:'untitled.txt',content:'text'}), /usable filename/);
  const result = await aiMock('{"name":null,"summary":"Too little readable content.","confidence":0.1}').suggest({name:'untitled.txt',content:'?'});
  assert.equal(result.name,null);
  assert.equal(result.confidence,0.1);
});

test('defensive privacy checks block secrets and clean contact details without sending the filename', async () => {
  const ai = aiMock('{"name":"Project planning overview","summary":"Project planning notes.","confidence":0.8}');
  await assert.rejects(ai.suggest({content:'api_key=private-secret-12345'}), /credential|secret/i);
  assert.equal(ai.requests.length,0);
  await ai.suggest({name:'private-person-name.txt',content:'These are project planning notes.\nEmail: me@example.com\nCall +1 416 555 0123'});
  const request = ai.requests[0][0];
  assert.ok(!request.messages[1].content.includes('me@example.com'));
  assert.ok(!request.messages[1].content.includes('416 555'));
  assert.ok(!request.messages[1].content.includes('private-person-name'));
});
