const OpenAI = require('openai');

const CASE_INSENSITIVE = process.platform === 'win32' || process.platform === 'darwin';
const MAX_REGEX_LENGTH = 200;
const MAX_RULES_PER_CATEGORY = 25;
const ALLOWED_REGEX_FLAGS = new Set(['i', 'm', 'u', 's']);

const normalizeKey = (value) => {
  const trimmed = String(value || '').trim();
  return CASE_INSENSITIVE ? trimmed.toLowerCase() : trimmed;
};

const normalizeAlias = (value) => {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const sanitizeRegexFlags = (flags) => {
  const raw = String(flags || '');
  let result = '';
  for (const ch of raw) {
    if (!ALLOWED_REGEX_FLAGS.has(ch)) continue;
    if (!result.includes(ch)) result += ch;
  }
  return result;
};

const parseRegexRule = (patternInput, flagsInput) => {
  let source = String(patternInput || '').trim();
  if (!source) return null;
  let flags = String(flagsInput || '').trim();
  if (source.startsWith('/') && source.length > 1) {
    const lastSlash = source.lastIndexOf('/');
    if (lastSlash > 0) {
      const maybeFlags = source.slice(lastSlash + 1);
      const body = source.slice(1, lastSlash);
      if (body) {
        source = body;
        if (!flags && maybeFlags) flags = maybeFlags;
      }
    }
  }
  if (!source || source.length > MAX_REGEX_LENGTH) return null;
  const sanitizedFlags = sanitizeRegexFlags(flags);
  try {
    return new RegExp(source, sanitizedFlags);
  } catch {
    return null;
  }
};

const getRuleType = (rule) => {
  const raw = String(rule?.type || rule?.target || rule?.kind || '').toLowerCase();
  if (raw === 'file' || raw === 'files') return 'file';
  if (raw === 'folder' || raw === 'folders' || raw === 'dir' || raw === 'directory') return 'folder';
  return 'any';
};

const isUnsafeCategoryName = (name) => {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (trimmed === '.' || trimmed === '..') return true;
  if (trimmed.includes('..')) return true;
  if (trimmed.includes('/') || trimmed.includes('\\')) return true;
  return false;
};

const buildRootIndex = (items) => {
  const map = new Map();
  (items || []).forEach((item) => {
    if (!item || !item.name) return;
    const key = normalizeKey(item.name);
    if (!map.has(key)) {
      map.set(key, item);
    }
  });
  return map;
};

const buildAliasMap = (existingFolders) => {
  const map = new Map();
  (existingFolders || []).forEach((name) => {
    const alias = normalizeAlias(name);
    if (alias && !map.has(alias)) {
      map.set(alias, name);
    }
  });
  return map;
};

const ensureCategoryNameAvailable = (name, rootIndex, aliasMap) => {
  const base = String(name || '').trim();
  if (!base) return null;
  const conflict = rootIndex.get(normalizeKey(base));
  if (!conflict || conflict.type === 'folder') return base;

  const suffixes = [' Files', ' Items', ' Folder'];
  for (const suffix of suffixes) {
    const candidate = `${base}${suffix}`;
    if (!rootIndex.has(normalizeKey(candidate)) && !aliasMap.has(normalizeAlias(candidate))) {
      return candidate;
    }
  }
  return `${base} Folder`;
};

const mergePlans = (aiPlan, opts = {}) => {
  const { aliasMap, rootIndex, protectedKeys, scopeItems } = opts;
  const finalPlan = {};
  const usedItems = new Set();
  const scopeList = Array.isArray(scopeItems) ? scopeItems : Array.from(rootIndex.values());
  const scopeKeys = new Set(scopeList.map((item) => normalizeKey(item?.name)));

  Object.entries(aiPlan || {}).forEach(([rawCategory, data]) => {
    if (isUnsafeCategoryName(rawCategory)) return;
    const aliasKey = normalizeAlias(rawCategory);
    const existingCategory = aliasMap.get(aliasKey);
    const resolved = existingCategory || ensureCategoryNameAvailable(rawCategory, rootIndex, aliasMap);
    if (!resolved) return;
    const categoryName = existingCategory || aliasMap.get(normalizeAlias(resolved)) || resolved;
    if (isUnsafeCategoryName(categoryName)) return;
    aliasMap.set(normalizeAlias(categoryName), categoryName);

    if (!finalPlan[categoryName]) {
      finalPlan[categoryName] = { reason: data?.reason || 'AI suggestion', items: [] };
    }

    const items = data?.items || data?.files || [];
    for (const item of items) {
      const itemName = typeof item === 'string' ? item : item?.name;
      if (!itemName) continue;
      const itemKey = normalizeKey(itemName);
      if (!scopeKeys.has(itemKey)) continue;
      if (usedItems.has(itemKey)) continue;
      const actualItem = rootIndex.get(itemKey);
      if (!actualItem) continue;
      const categoryKey = normalizeKey(categoryName);
      if (itemKey === categoryKey) continue;
      if (protectedKeys?.has(itemKey) && itemKey !== categoryKey) continue;

      finalPlan[categoryName].items.push({ name: actualItem.name, type: actualItem.type });
      usedItems.add(itemKey);
    }

    const ruleList = Array.isArray(data?.rules)
      ? data.rules
      : Array.isArray(data?.patterns)
        ? data.patterns
        : Array.isArray(data?.matchers)
          ? data.matchers
          : [];

    const slicedRules = ruleList.slice(0, MAX_RULES_PER_CATEGORY);
    for (const rule of slicedRules) {
      const pattern = rule?.pattern ?? rule?.regex ?? rule?.match;
      if (!pattern) continue;
      const regex = parseRegexRule(pattern, rule?.flags);
      if (!regex) continue;
      const ruleType = getRuleType(rule);
      for (const item of scopeList) {
        if (!item?.name) continue;
        const itemKey = normalizeKey(item.name);
        if (!scopeKeys.has(itemKey)) continue;
        if (usedItems.has(itemKey)) continue;
        if (protectedKeys?.has(itemKey)) continue;
        if (ruleType !== 'any' && item.type !== ruleType) continue;
        if (regex.test(item.name)) {
          const categoryKey = normalizeKey(categoryName);
          if (itemKey === categoryKey) continue;
          finalPlan[categoryName].items.push({ name: item.name, type: item.type });
          usedItems.add(itemKey);
        }
      }
    }
  });

  Object.keys(finalPlan).forEach((category) => {
    if (!finalPlan[category]?.items?.length) {
      delete finalPlan[category];
    }
  });

  return finalPlan;
};

function extractJsonObject(text) {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  return text.slice(first, last + 1);
}

async function analyzeFiles(items, settings, history = [], opts = {}) {
  const { onToken, context } = opts;
  const { apiKey, baseUrl, model, provider, debugMode } = settings;

  // If there's nothing at all, return empty plan
  if (!items || items.length === 0) {
    return {};
  }

  const systemPrompt = "You are a helpful assistant that outputs raw JSON.";

  const pinnedCategoryFolders = Array.isArray(context?.categoryFolders) ? context.categoryFolders : [];
  const safePinnedCategoryFolders = pinnedCategoryFolders
    .map((v) => String(v).trim())
    .filter(Boolean)
    .slice(0, 200);

  const rootIndex = buildRootIndex(items);
  const aliasMap = buildAliasMap(safePinnedCategoryFolders);
  const protectedKeys = new Set(safePinnedCategoryFolders.map(normalizeKey));

  if (!apiKey) throw new Error("API Key is missing in settings.");

  // Configure Client
  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: baseUrl,
  });

  // Limit items for API
  const itemsToAnalyze = items.slice(0, 200);

  let userPrompt = `You are an intelligent file and folder organizer. Your task is to analyze and categorize the following items.

IMPORTANT CONSTRAINTS:
- Only reference items listed in "ITEMS IN FOLDER" for explicit item names. Do not invent items.
- Category names MUST be a single folder name (no path separators like "/" or "\\\\", no "..").
- Never include an item inside a category with the same name (no moving a folder into itself).
- Regex rules must match item names only (no path separators).
`;

  if (safePinnedCategoryFolders.length > 0) {
    userPrompt += `
PINNED CATEGORY FOLDERS (do NOT move these folders):
${JSON.stringify(safePinnedCategoryFolders)}

Rules for pinned category folders:
- Never include a pinned category folder as an item to move.
- Never nest a pinned category folder inside another folder.
- You MAY move other items INTO pinned category folders.
`;
  }

  userPrompt += `
NOTE:
- Regex rules will be applied to all items in this folder.
- The list below may be truncated if the folder is very large.
`;

  if (context?.retryReason) {
    userPrompt += `
PREVIOUS ATTEMPT ISSUE:
${String(context.retryReason)}
`;
  }

  if (context?.previousPlan) {
    userPrompt += `
PREVIOUS PLAN (for reference):
${JSON.stringify(context.previousPlan, null, 2)}
`;
  }

  userPrompt += `
ITEMS IN FOLDER:
${JSON.stringify(itemsToAnalyze, null, 2)}

Item format explained:
- Files: {"name": "filename.ext", "type": "file"}
- Folders: {"name": "foldername", "type": "folder", "context": {...}}
  - context.fileCount: number of files in the folder
  - context.topExtensions: most common file extensions inside
  - context.markers: project markers like package.json (Node.js), Cargo.toml (Rust), .git, etc.

YOUR TASK:
1. **Identify existing category folders**: Look for folders that appear to be organization categories (e.g., "Images", "Documents", "Downloads", "Projects", "Archives"). These typically:
   - Have descriptive names suggesting a category
   - Contain files (fileCount > 0)
   - Don't have project markers

2. **Identify items that need organizing**: These are:
   - Loose files in the root
   - Folders that are projects (have markers like package.json, .git, Cargo.toml)
   - Folders that seem randomly named or unorganized

3. **Create an organization plan**:
   - Use EXISTING category folder names when appropriate (e.g., if "Images" exists, use "Images" not "Pictures")
   - Group project folders under "Projects" or by type ("Node.js Projects", "Python Projects")
   - Only create NEW categories if no existing folder fits
   - Put truly miscellaneous items in "Misc"
   - Prefer REGEX RULES instead of listing many item names

4. **IMPORTANT - What NOT to organize**:
   - Do NOT include existing category folders as items to move (don't move "Images" folder into another folder)
   - Do NOT put a folder or file into a category with the same name (e.g., category "Misc" must not contain item "Misc")
   - If a folder is already serving as an organization category, leave it alone
   - If the folder is already well-organized (only has category folders, no loose files), return an empty plan {}

RESPONSE FORMAT - Return ONLY valid JSON (no markdown, no code fences):
{
  "Category Name": {
    "reason": "Short explanation",
    "rules": [
      {"pattern": "\\\\.py$", "flags": "i", "type": "file"},
      {"pattern": "^git repo 123\\\\.zip$", "type": "file"}
    ],
    "items": [{"name": "MyProject", "type": "folder"}]
  }
}

If everything is already organized, return: {}`;

  if (history && history.length > 0) {
    userPrompt += `

Previous organization history (user preferences):
${JSON.stringify(history.slice(0, 20))}`;
  }

  try {
    let content = '';
    let rawResponse = '';
    let usage = null;

    if (typeof onToken === 'function') {
      const stream = await client.chat.completions.create({
        model: model || 'gpt-4o',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk?.choices?.[0]?.delta?.content || '';
        if (!delta) continue;
        content += delta;
        onToken(delta);
      }

      rawResponse = content.trim();
    } else {
      const response = await client.chat.completions.create({
        model: model || 'gpt-4o',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2,
      });

      content = response.choices[0].message.content.trim();
      rawResponse = content;
      usage = response.usage || null;
    }

    // Clean up markdown if present
    if (content.startsWith('```json')) content = content.replace(/^```json/, '').replace(/```$/, '');
    if (content.startsWith('```')) content = content.replace(/^```/, '').replace(/```$/, '');

    let parsed = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      const extracted = extractJsonObject(content);
      if (!extracted) throw new Error('AI returned invalid JSON.');
      parsed = JSON.parse(extracted);
    }

    parsed = mergePlans(parsed, {
      aliasMap,
      rootIndex,
      protectedKeys,
      scopeItems: items
    });

    // If debug mode, return with debug info
    if (debugMode) {
      return {
        plan: parsed,
        debug: {
          systemPrompt,
          userPrompt,
          rawResponse,
          model: model || 'gpt-4o',
          usage,
          itemCount: itemsToAnalyze.length
        }
      };
    }

    return parsed;
  } catch (error) {
    throw error;
  }
}

module.exports = { analyzeFiles };
