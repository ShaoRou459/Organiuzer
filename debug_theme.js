const { argbFromHex, themeFromSourceColor } = require('@material/material-color-utilities');

const SEED_COLOR = '#00796b';
const m3Theme = themeFromSourceColor(argbFromHex(SEED_COLOR));
const scheme = m3Theme.schemes.light;

console.log('Keys in scheme:', Object.keys(scheme));
console.log('primary:', scheme.primary);
console.log('surfaceContainer:', scheme.surfaceContainer);
console.log('surfaceVariant:', scheme.surfaceVariant);
