export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const n = value / 1024 ** i;
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

/** Splits a byte count into a number and unit so they can be typeset separately. */
export function splitBytes(bytes) {
  const [num, unit] = formatBytes(bytes).split(' ');
  return { num, unit };
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return { num: String(s), unit: 's' };
  const mins = Math.floor(s / 60);
  if (mins < 60) return { num: String(mins), unit: 'min' };
  const hrs = mins / 60;
  return { num: hrs >= 10 ? String(Math.round(hrs)) : hrs.toFixed(1), unit: 'h' };
}

export const formatNumber = (n) => (Number(n) || 0).toLocaleString();

const rtf = typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }) : null;

export function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Unknown time';
  const diff = (timestamp - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (!rtf) return new Date(timestamp).toLocaleString();
  if (abs < 60) return 'Just now';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function folderNameFromPath(dirPath) {
  if (!dirPath) return '';
  const parts = String(dirPath).split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || String(dirPath);
}

export function parentPath(dirPath) {
  const parts = String(dirPath || '').split(/[\\/]/).filter(Boolean);
  return parts.slice(0, -1).join('\\');
}

export const joinPath = (dir, name) => `${String(dir).replace(/[\\/]+$/, '')}\\${name}`;

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const pluralize = (count, one, many = `${one}s`) => `${formatNumber(count)} ${count === 1 ? one : many}`;

export function extensionOf(name) {
  const s = String(name || '');
  const i = s.lastIndexOf('.');
  return i > 0 ? s.slice(i + 1).toLowerCase() : '';
}

/** Coarse file kind used for icons and tinting in lists. */
export function fileKind(name) {
  const ext = extensionOf(name);
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic', 'tif', 'tiff', 'ico', 'raw'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'wmv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(ext)) return 'audio';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'].includes(ext)) return 'archive';
  if (['exe', 'msi', 'dmg', 'pkg', 'appx', 'msix', 'deb', 'rpm', 'apk'].includes(ext)) return 'installer';
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'md', 'pages', 'epub'].includes(ext)) return 'document';
  if (['xls', 'xlsx', 'csv', 'ods', 'numbers'].includes(ext)) return 'sheet';
  if (['ppt', 'pptx', 'key', 'odp'].includes(ext)) return 'slides';
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'json', 'html', 'css', 'scss', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'sh', 'ps1', 'yml', 'yaml', 'xml', 'sql'].includes(ext)) return 'code';
  return 'file';
}

/** Case-insensitive, separator-agnostic key for comparing Windows paths. */
export const normalizeKeyPath = (p) => String(p || '').trim().replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
