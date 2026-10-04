const path = require('node:path');

const safeName = name => typeof name === 'string' && name.trim() && name.length <= 100 && !/[\\/<>:"|?*\u0000-\u001f]/.test(name) && !/^(\.|\.\.|con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name) && !/[. ]$/.test(name);
const rule = (extensions, destination) => ({ extensions: extensions.split(' '), destination });
const BUILTIN_PRESETS = [
  { id: 'downloads', name: 'Downloads', description: 'Separate documents, media, archives and installers.', rules: [rule('pdf doc docx txt md rtf odt csv xls xlsx ppt pptx', 'Documents'), rule('jpg jpeg png gif webp svg heic', 'Images'), rule('mp4 mov mkv webm mp3 wav flac', 'Media'), rule('zip rar 7z tar gz', 'Archives'), rule('exe msi dmg pkg', 'Installers')], excludedNames: [] },
  { id: 'study', name: 'Study', description: 'Keep readings, notes, slides and spreadsheets together.', rules: [rule('pdf', 'Readings'), rule('doc docx txt md rtf odt', 'Notes'), rule('ppt pptx', 'Slides'), rule('csv xls xlsx', 'Data')], excludedNames: [] },
  { id: 'work', name: 'Work', description: 'Group reports, presentations and working data.', rules: [rule('pdf doc docx odt rtf', 'Reports'), rule('ppt pptx', 'Presentations'), rule('csv xls xlsx', 'Spreadsheets'), rule('txt md', 'Notes')], excludedNames: [] },
];

function validatePreset(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string' || !safeName(raw.name.trim())) throw new Error('Give this preset a name without path characters.');
  if (!Array.isArray(raw.rules) || raw.rules.length === 0 || raw.rules.length > 20) throw new Error('A preset needs between 1 and 20 file rules.');
  const seen = new Set();
  const rules = raw.rules.map(row => {
    if (!safeName(row?.destination)) throw new Error('Destination folders must be single, valid folder names.');
    if (!Array.isArray(row.extensions) || !row.extensions.length || row.extensions.length > 40) throw new Error('Add file extensions to each rule.');
    const extensions = row.extensions.map(extension => String(extension).trim().replace(/^\./, '').toLowerCase());
    for (const ext of extensions) {
      if (!/^[a-z0-9]{1,12}$/.test(ext)) throw new Error('Extensions should look like pdf or docx.');
      if (seen.has(ext)) throw new Error(`The ${ext} extension appears in more than one rule.`);
      seen.add(ext);
    }
    return { extensions, destination: row.destination.trim() };
  });
  if (raw.excludedNames !== undefined && (!Array.isArray(raw.excludedNames) || raw.excludedNames.length > 200 || raw.excludedNames.some(name => !safeName(name)))) throw new Error('Keep-in-place names must be valid file or folder names.');
  return { id: typeof raw.id === 'string' && /^[a-z0-9_-]{1,80}$/i.test(raw.id) ? raw.id : '', name: raw.name.trim(), description: String(raw.description || 'Saved by you').slice(0, 160), rules, excludedNames: [...new Set(raw.excludedNames || [])] };
}

function buildPresetPlan(files, raw) {
  const preset = validatePreset(raw);
  const excluded = new Set(preset.excludedNames.map(name => name.toLowerCase()));
  const lookup = new Map(preset.rules.flatMap(row => row.extensions.map(ext => [ext, row.destination])));
  const existing = new Map(files.map(file => [file.name.toLowerCase(), file]));
  const plan = {};
  const skipped = [];
  for (const file of files) {
    if (file.type !== 'file' || file.hidden || file.link || excluded.has(file.name.toLowerCase())) { skipped.push(file.name); continue; }
    const extension = path.extname(file.name).slice(1).toLowerCase();
    const proposed = lookup.get(extension);
    if (!proposed) { skipped.push(file.name); continue; }
    const occupant = existing.get(proposed.toLowerCase());
    if (occupant?.type === 'file' || occupant?.link) throw new Error(`“${proposed}” is already a file or a link. Choose another destination.`);
    // Reuse existing casing on Windows so the preview agrees with the actual folder.
    const destination = occupant?.name || proposed;
    if (!Object.hasOwn(plan, destination)) Object.defineProperty(plan, destination, { value: { reason: `Matched ${preset.name} file rules locally`, items: [] }, writable: true, enumerable: true, configurable: true });
    plan[destination].items.push({ name: file.name, type: 'file' });
  }
  return { plan, skipped, presetName: preset.name };
}

module.exports = { BUILTIN_PRESETS, validatePreset, buildPresetPlan };
