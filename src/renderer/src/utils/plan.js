const caseFold = (() => {
  const p = (typeof navigator === 'undefined' ? '' : navigator.platform || navigator.userAgent || '').toLowerCase();
  return p.includes('win') || p.includes('mac');
})();

export const normalizeKey = (value) => {
  const trimmed = String(value || '').trim();
  return caseFold ? trimmed.toLowerCase() : trimmed;
};

/** Mirrors the main-process check so problems surface before anything moves. */
export function invalidNameReason(name) {
  if (!name || typeof name !== 'string' || !name.trim()) return 'Name is empty.';
  const trimmed = name.trim();
  if (trimmed === '.' || trimmed === '..') return 'Name can’t be “.” or “..”.';
  if (/[\\/<>:"|?*\u0000-\u001f]/.test(trimmed)) return 'Name can’t contain \\ / < > : " | ? *';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(trimmed)) return 'That name is reserved by Windows.';
  if (/[. ]$/.test(trimmed)) return 'Name can’t end with a dot or space.';
  if (trimmed.length > 255) return 'Name is too long.';
  return null;
}

export function normalizePlan(rawPlan) {
  if (!rawPlan || typeof rawPlan !== 'object') return null;
  const normalized = {};
  Object.entries(rawPlan).forEach(([key, cat]) => {
    const list = Array.isArray(cat?.items) ? cat.items : Array.isArray(cat?.files) ? cat.files : [];
    Object.defineProperty(normalized, key, { enumerable: true, writable: true, configurable: true, value: {
      reason: typeof cat?.reason === 'string' ? cat.reason : '',
      items: list
        .map((item) => {
          if (typeof item === 'string') return { name: item, type: 'file' };
          if (!item || typeof item.name !== 'string' || !item.name) return null;
          return { name: item.name, type: item.type === 'folder' ? 'folder' : 'file' };
        })
        .filter(Boolean),
    } });
  });
  return normalized;
}

export const countPlanItems = (plan) => Object.values(plan || {}).reduce((sum, cat) => sum + (cat?.items?.length || 0), 0);

/** Drops categories that are empty after the user's edits. */
export const prunePlan = (plan) => Object.fromEntries(Object.entries(plan || {}).filter(([, c]) => c?.items?.length > 0));

export function validatePlan(plan, files, categoryFolders = []) {
  const errors = [];
  if (!plan || typeof plan !== 'object' || Object.keys(plan).length === 0) return ['The plan is empty.'];

  const categories = Object.keys(plan);
  const protectedSet = new Set([...categoryFolders, ...categories].map(normalizeKey));
  const rootByName = new Map((files || []).map((f) => [normalizeKey(f.name), f]));
  const seenCategories = new Set();
  const seenItems = new Set();

  for (const category of categories) {
    const reason = invalidNameReason(category);
    if (reason) errors.push(`Folder “${category}”: ${reason}`);
    const key = normalizeKey(category);
    if (seenCategories.has(key)) errors.push(`Two categories are both named “${category}”.`);
    seenCategories.add(key);
    if (rootByName.get(key)?.type === 'file') errors.push(`“${category}” is already a file in this folder.`);
  }

  for (const [category, data] of Object.entries(plan)) {
    const categoryKey = normalizeKey(category);
    for (const item of data?.items || []) {
      const key = normalizeKey(item?.name);
      if (!key) continue;
      if (key === categoryKey) {
        errors.push(`“${category}” can’t be moved into itself.`);
        continue;
      }
      if (seenItems.has(key)) errors.push(`“${item.name}” is in more than one category.`);
      seenItems.add(key);
      if (item.type === 'folder' && protectedSet.has(key)) {
        errors.push(`“${item.name}” is a category folder and can’t go inside “${category}”.`);
      }
    }
  }
  return errors;
}

/** Stats for the completion screen, computed from the plan that was applied. */
export function summarizePlan(plan, files) {
  const rootByName = new Map((files || []).map((f) => [normalizeKey(f.name), f]));
  const categories = Object.entries(plan || {}).map(([name, data]) => ({ name, count: data?.items?.length || 0 }))
    .sort((a, b) => b.count - a.count);
  let filesMoved = 0;
  let foldersMoved = 0;
  let totalBytes = 0;
  Object.values(plan || {}).forEach((data) => (data?.items || []).forEach((item) => {
    if (item.type === 'folder') foldersMoved++;
    else {
      filesMoved++;
      totalBytes += rootByName.get(normalizeKey(item.name))?.size || 0;
    }
  }));
  return { categories, filesMoved, foldersMoved, totalBytes, totalItems: filesMoved + foldersMoved };
}
