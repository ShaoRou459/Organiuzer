/**
 * Material 3 Expressive tokens for the web.
 * Values come from the M3 token tables (shape scale, type scale, spring → cubic-bezier fallbacks).
 */

// Corner radius scale (10 steps). Bold steps (lgInc, xlInc, xxl) are new in M3 Expressive.
export const corner = {
  none: '0px',
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  lgInc: '20px',
  xl: '28px',
  xlInc: '32px',
  xxl: '48px',
  full: '9999px',
};

// Motion: M3 spring tokens converted to CSS for non-interruptible transitions.
export const easing = {
  fastSpatial: 'cubic-bezier(0.42, 1.67, 0.21, 0.90)',
  defaultSpatial: 'cubic-bezier(0.38, 1.21, 0.22, 1.00)',
  slowSpatial: 'cubic-bezier(0.39, 1.29, 0.35, 0.98)',
  fastEffects: 'cubic-bezier(0.31, 0.94, 0.34, 1.00)',
  defaultEffects: 'cubic-bezier(0.34, 0.80, 0.34, 1.00)',
  slowEffects: 'cubic-bezier(0.34, 0.88, 0.34, 1.00)',
  // Legacy transition easings (still used for enter/exit).
  emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
  emphasizedDecelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  emphasizedAccelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
};

export const duration = {
  fastSpatial: 350,
  defaultSpatial: 500,
  slowSpatial: 650,
  fastEffects: 150,
  defaultEffects: 200,
  slowEffects: 300,
};

/** `transition` shorthand: spatial props bounce, effects props never overshoot. */
export const motion = {
  spatial: (props, speed = 'default') => props
    .map((p) => `${p} ${duration[`${speed}Spatial`]}ms ${easing[`${speed}Spatial`]}`)
    .join(', '),
  effects: (props, speed = 'default') => props
    .map((p) => `${p} ${duration[`${speed}Effects`]}ms ${easing[`${speed}Effects`]}`)
    .join(', '),
};

/**
 * Framer Motion springs. M3 specifies damping as a *ratio*; framer wants the coefficient:
 * c = ratio · 2 · √(stiffness · mass), mass = 1.
 */
const spring = (ratio, stiffness) => ({ type: 'spring', stiffness, damping: ratio * 2 * Math.sqrt(stiffness), mass: 1 });
export const springs = {
  fastSpatial: spring(0.6, 800),
  defaultSpatial: spring(0.8, 380),
  slowSpatial: spring(0.8, 200),
  fastEffects: spring(1, 3800),
  defaultEffects: spring(1, 1600),
  slowEffects: spring(1, 800),
};

// Type scale (baseline + emphasized). Sizes in rem (sp / 16), tracking converted to em.
const FONT = '"Roboto Flex Variable", "Roboto Flex", Roboto, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
const em = (trackingSp, sizeSp) => `${(trackingSp / sizeSp).toFixed(4)}em`;

const BASE = [
  // name, size, lineHeight, tracking, weight, emphasizedTracking, emphasizedWeight
  ['displayLarge', 57, 64, -0.2, 400, 0, 500],
  ['displayMedium', 45, 52, 0, 400, 0, 500],
  ['displaySmall', 36, 44, 0, 400, 0, 500],
  ['headlineLarge', 32, 40, 0, 400, 0, 500],
  ['headlineMedium', 28, 36, 0, 400, 0, 500],
  ['headlineSmall', 24, 32, 0, 400, 0, 500],
  ['titleLarge', 22, 28, 0, 400, 0, 500],
  ['titleMedium', 16, 24, 0.2, 500, 0.15, 700],
  ['titleSmall', 14, 20, 0.1, 500, 0.1, 700],
  ['bodyLarge', 16, 24, 0.5, 400, 0.15, 500],
  ['bodyMedium', 14, 20, 0.2, 400, 0.25, 500],
  ['bodySmall', 12, 16, 0.4, 400, 0.4, 500],
  ['labelLarge', 14, 20, 0.1, 500, 0.1, 700],
  ['labelMedium', 12, 16, 0.5, 500, 0.5, 700],
  ['labelSmall', 11, 16, 0.5, 500, 0.5, 700],
];

export const typeScale = {};
for (const [name, size, lh, tr, w, etr, ew] of BASE) {
  const common = { fontFamily: FONT, fontSize: `${size / 16}rem`, lineHeight: `${lh / 16}rem` };
  typeScale[name] = { ...common, letterSpacing: em(tr, size), fontWeight: w };
  typeScale[`${name}Emphasized`] = { ...common, letterSpacing: em(etr, size), fontWeight: ew };
}

export const fontFamily = FONT;

// Spacing follows the 8dp grid (MUI spacing(1) = 8px); 4dp half-steps are allowed.
export const SPACING_UNIT = 8;

// Seed colours offered in Settings. The first one reproduces the app's original violet.
export const SEED_COLORS = [
  { name: 'Violet', value: '#6750A4' },
  { name: 'Ocean', value: '#0061A4' },
  { name: 'Teal', value: '#006A6A' },
  { name: 'Moss', value: '#4C662B' },
  { name: 'Amber', value: '#8B5000' },
  { name: 'Rose', value: '#9C4146' },
];
