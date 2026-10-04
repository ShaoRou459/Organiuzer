const test = require('node:test');
const assert = require('node:assert/strict');
const { BUILTIN_PRESETS, validatePreset, buildPresetPlan } = require('../src/main/cleanupPresets');

test('presets produce local review plans and leave folders, hidden files and links alone', () => {
  const files = [{ name: 'memo.PDF', type: 'file' }, { name: 'notes.docx', type: 'file' }, { name: 'work', type: 'folder' }, { name: '.secret.pdf', type: 'file', hidden: true }, { name: 'link.pdf', type: 'file', link: true }];
  const result = buildPresetPlan(files, BUILTIN_PRESETS[0]);
  assert.deepEqual(result.plan.Documents.items.map(file => file.name), ['memo.PDF', 'notes.docx']);
  assert.equal(result.skipped.length, 3);
});
test('keep-in-place names and unknown types never enter a move plan', () => {
  const result = buildPresetPlan([{ name: 'memo.pdf', type: 'file' }, { name: 'code.js', type: 'file' }], { ...BUILTIN_PRESETS[0], excludedNames: ['MEMO.pdf'] });
  assert.deepEqual(result.plan, {});
});
test('presets reject traversal, reserved names, ambiguous extensions and file destinations', () => {
  for (const destination of ['../outside', 'NUL', 'folder.', 'bad/name']) assert.throws(() => validatePreset({ name: 'Test', rules: [{ extensions: ['pdf'], destination }] }));
  assert.throws(() => validatePreset({ name: 'Test', rules: [{ extensions: ['pdf'], destination: 'A' }, { extensions: ['.PDF'], destination: 'B' }] }), /more than one/);
  assert.throws(() => buildPresetPlan([{ name: 'memo.pdf', type: 'file' }, { name: 'Documents', type: 'file' }], BUILTIN_PRESETS[0]), /already a file/);
});
test('existing destination casing is preserved and saved presets are normalized', () => {
  const result = buildPresetPlan([{ name: 'memo.pdf', type: 'file' }, { name: 'documents', type: 'folder' }], BUILTIN_PRESETS[0]);
  assert.ok(result.plan.documents);
  assert.deepEqual(validatePreset({ name: ' My preset ', rules: [{ extensions: [' .PDF '], destination: 'Reports' }] }).rules[0].extensions, ['pdf']);
});
test('folder names that overlap object properties stay ordinary destination keys', () => {
  const result = buildPresetPlan([{ name: 'memo.pdf', type: 'file' }], { name: 'Special name', rules: [{ extensions: ['pdf'], destination: '__proto__' }] });
  assert.equal(Object.hasOwn(result.plan, '__proto__'), true);
  assert.equal(result.plan.__proto__.items[0].name, 'memo.pdf');
  assert.equal(Object.getPrototypeOf(result.plan), Object.prototype);
});
