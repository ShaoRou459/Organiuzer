const assert = require('node:assert/strict');
const test = require('node:test');

const loadPreview = () => import('../src/renderer/src/utils/organizationPreview.mjs');

test('keeps current entries outside the plan at the root', async () => {
  const { buildOrganizationPreview } = await loadPreview();
  const preview = buildOrganizationPreview({
    files: [
      { name: 'notes.txt', type: 'file', size: 10 },
      { name: 'photo.png', type: 'file', size: 20 },
      { name: 'Archive', type: 'folder', context: { fileCount: 4 } },
    ],
    plan: { Pictures: { items: [{ name: 'photo.png', type: 'file' }] } },
  });

  assert.deepEqual(preview.rootItems.map((item) => item.name), ['Archive', 'notes.txt']);
  assert.equal(preview.destinations.get('photo.png'), 'Pictures');
  assert.equal(preview.movedCount, 1);
});

test('keeps an excluded entry in the root and marks it as explicitly kept', async () => {
  const { buildOrganizationPreview, normalizePreviewName } = await loadPreview();
  const readme = { name: 'README.md', type: 'file', size: 50 };
  const preview = buildOrganizationPreview({ files: [readme], excluded: [readme] });

  assert.deepEqual(preview.rootItems, [readme]);
  assert.equal(preview.excludedByName.has(normalizePreviewName('README.md')), true);
  assert.equal(preview.categories.length, 0);
});

test('merges planned items into an existing destination folder exactly once', async () => {
  const { buildOrganizationPreview } = await loadPreview();
  const photos = { name: 'Photos', type: 'folder', context: { fileCount: 12 } };
  const preview = buildOrganizationPreview({
    files: [photos, { name: 'new.png', type: 'file', size: 100 }],
    plan: { Photos: { items: [{ name: 'new.png', type: 'file' }] } },
  });

  assert.equal(preview.categories.length, 1);
  assert.equal(preview.categories[0].existing, photos);
  assert.equal(preview.rootItems.some((item) => item.name === 'Photos'), false);
});

test('filters empty categories and leaves matching existing folders unchanged', async () => {
  const { buildOrganizationPreview, normalizePreviewName } = await loadPreview();
  const drafts = { name: 'Drafts', type: 'folder', context: { fileCount: 3 } };
  const preview = buildOrganizationPreview({
    files: [drafts, { name: 'keep.txt', type: 'file', size: 10 }],
    plan: {
      Drafts: { items: [] },
      Empty: { items: [] },
    },
  });

  assert.deepEqual(preview.categories, []);
  assert.equal(preview.existingTargetNames.has(normalizePreviewName('Drafts')), false);
  assert.deepEqual(preview.rootItems.map((item) => item.name), ['Drafts', 'keep.txt']);
});

test('flags planned items that no longer exist in the current root', async () => {
  const { buildOrganizationPreview } = await loadPreview();
  const preview = buildOrganizationPreview({
    files: [{ name: 'present.txt', type: 'file', size: 5 }],
    plan: { Documents: { items: [
      { name: 'present.txt', type: 'file' },
      { name: 'missing.txt', type: 'file' },
    ] } },
  });

  assert.deepEqual(preview.categories[0].items.map((item) => [item.name, item.sourceMissing]), [
    ['missing.txt', true],
    ['present.txt', false],
  ]);
});
