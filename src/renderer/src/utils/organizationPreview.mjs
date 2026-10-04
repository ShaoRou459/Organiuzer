const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const platformName = typeof navigator !== 'undefined'
  ? navigator.platform || navigator.userAgent || ''
  : typeof process !== 'undefined' ? process.platform : '';
const CASE_INSENSITIVE = /win|mac/i.test(platformName);

export const normalizePreviewName = (name) => {
  const value = String(name || '').trim();
  return CASE_INSENSITIVE ? value.toLowerCase() : value;
};

/** Derive the current and final root-level view without touching the filesystem. */
export function buildOrganizationPreview({ files = [], plan = {}, excluded = [] } = {}) {
  const current = (Array.isArray(files) ? files.slice() : [])
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1) || collator.compare(a.name, b.name));
  const byName = new Map(current.map((item) => [normalizePreviewName(item.name), item]));
  const destinations = new Map();

  Object.entries(plan || {}).forEach(([category, data]) => {
    (Array.isArray(data?.items) ? data.items : []).forEach((item) => {
      const key = normalizePreviewName(item?.name);
      if (key && !destinations.has(key)) destinations.set(key, category);
    });
  });

  const excludedByName = new Map((Array.isArray(excluded) ? excluded : [])
    .filter((item) => item && typeof item.name === 'string')
    .map((item) => [normalizePreviewName(item.name), item]));
  const existingFolders = new Map(current
    .filter((item) => item?.type === 'folder')
    .map((item) => [normalizePreviewName(item.name), item]));

  // Execution prunes empty categories, so they must not absorb an existing root folder.
  const categories = Object.entries(plan || {})
    .map(([name, data]) => ({
      name,
      items: (Array.isArray(data?.items) ? data.items : [])
        .map((item) => ({ ...item, sourceMissing: !byName.has(normalizePreviewName(item?.name)) }))
        .sort((a, b) => collator.compare(a.name, b.name)),
    }))
    .filter((category) => category.items.length > 0)
    .map((category) => ({
      ...category,
      existing: existingFolders.get(normalizePreviewName(category.name)) || null,
      conflictsWithFile: byName.get(normalizePreviewName(category.name))?.type === 'file',
    }));

  const existingTargetNames = new Set(categories
    .filter((category) => category.existing)
    .map((category) => normalizePreviewName(category.name)));
  const rootItems = current
    .filter((item) => !destinations.has(normalizePreviewName(item.name))
      && !existingTargetNames.has(normalizePreviewName(item.name)))
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1) || collator.compare(a.name, b.name));
  const missingExcluded = Array.from(excludedByName.values()).filter((item) => !byName.has(normalizePreviewName(item.name)));
  const movedCount = categories.reduce((sum, category) => sum + category.items.length, 0);

  return { current, byName, destinations, excludedByName, existingTargetNames, categories, rootItems, missingExcluded, movedCount };
}

export default buildOrganizationPreview;
