import { createTheme, alpha } from '@mui/material/styles';
import {
  argbFromHex, hexFromArgb, Hct, SchemeTonalSpot, MaterialDynamicColors, customColor,
} from '@material/material-color-utilities';
import { corner, motion, typeScale, fontFamily } from './tokens';

export const DEFAULT_SEED = '#6750A4';

const ROLE_NAMES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer', 'inversePrimary',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'surface', 'surfaceDim', 'surfaceBright', 'onSurface', 'onSurfaceVariant', 'surfaceVariant',
  'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest',
  'inverseSurface', 'inverseOnSurface', 'outline', 'outlineVariant', 'scrim', 'shadow',
  'primaryFixed', 'primaryFixedDim', 'onPrimaryFixed', 'tertiaryFixed', 'tertiaryFixedDim', 'onTertiaryFixed',
];

/**
 * Builds the full M3 colour scheme (dynamic colour, Tonal Spot variant) from one seed,
 * plus success/warning custom colours harmonised toward the seed hue.
 */
export function buildScheme(seedHex = DEFAULT_SEED, isDark = true) {
  const seed = argbFromHex(/^#[0-9a-f]{6}$/i.test(seedHex) ? seedHex : DEFAULT_SEED);
  const scheme = new SchemeTonalSpot(Hct.fromInt(seed), isDark, 0);
  const roles = {};
  for (const name of ROLE_NAMES) {
    roles[name] = hexFromArgb(MaterialDynamicColors[name].getArgb(scheme));
  }

  const custom = (name, value) => {
    const c = customColor(seed, { name, value: argbFromHex(value), blend: true });
    const set = isDark ? c.dark : c.light;
    return {
      [name]: hexFromArgb(set.color),
      [`on${name[0].toUpperCase()}${name.slice(1)}`]: hexFromArgb(set.onColor),
      [`${name}Container`]: hexFromArgb(set.colorContainer),
      [`on${name[0].toUpperCase()}${name.slice(1)}Container`]: hexFromArgb(set.onColorContainer),
    };
  };

  return { ...roles, ...custom('success', '#2E7D32'), ...custom('warning', '#B26A00') };
}

/** Flat state layer: blends `layer` over `base` at the M3 state opacity. */
export const stateLayer = (base, layer, opacity) => `color-mix(in srgb, ${layer} ${Math.round(opacity * 100)}%, ${base})`;
export const STATE = { hover: 0.08, focus: 0.1, pressed: 0.1, dragged: 0.16 };

export const getTheme = ({ mode = 'dark', seed = DEFAULT_SEED } = {}) => {
  const isDark = mode === 'dark';
  const c = buildScheme(seed, isDark);

  const typography = {
    fontFamily,
    ...typeScale,
    // Map MUI's legacy variants onto M3 roles so any stray usage still lands on the scale.
    h1: typeScale.displayLarge,
    h2: typeScale.displayMedium,
    h3: typeScale.displaySmall,
    h4: typeScale.headlineMedium,
    h5: typeScale.headlineSmall,
    h6: typeScale.titleLarge,
    subtitle1: typeScale.titleMedium,
    subtitle2: typeScale.titleSmall,
    body1: typeScale.bodyLarge,
    body2: typeScale.bodyMedium,
    caption: typeScale.bodySmall,
    button: { ...typeScale.labelLarge, textTransform: 'none' },
    overline: typeScale.labelMedium,
  };

  const variantMapping = {};
  Object.keys(typeScale).forEach((name) => {
    variantMapping[name] = name.startsWith('display') || name.startsWith('headline')
      ? 'h2'
      : name.startsWith('title') ? 'h3' : name.startsWith('body') ? 'p' : 'span';
  });

  const focusRing = { outline: `2px solid ${c.primary}`, outlineOffset: 2 };

  return createTheme({
    palette: {
      mode,
      m3: c,
      primary: { main: c.primary, contrastText: c.onPrimary },
      secondary: { main: c.secondary, contrastText: c.onSecondary },
      tertiary: { main: c.tertiary, contrastText: c.onTertiary },
      error: { main: c.error, contrastText: c.onError },
      success: { main: c.success, contrastText: c.onSuccess },
      warning: { main: c.warning, contrastText: c.onWarning },
      info: { main: c.tertiary, contrastText: c.onTertiary },
      background: { default: c.surface, paper: c.surfaceContainerLow },
      text: { primary: c.onSurface, secondary: c.onSurfaceVariant, disabled: alpha(c.onSurface, 0.38) },
      divider: c.outlineVariant,
      action: {
        active: c.onSurfaceVariant,
        hover: alpha(c.onSurface, STATE.hover),
        selected: alpha(c.onSurface, 0.12),
        focus: alpha(c.onSurface, STATE.focus),
        disabled: alpha(c.onSurface, 0.38),
        disabledBackground: alpha(c.onSurface, 0.12),
      },
    },
    typography,
    shape: { borderRadius: 4 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': { colorScheme: mode },
          html: { WebkitFontSmoothing: 'antialiased' },
          body: {
            backgroundColor: c.surface,
            color: c.onSurface,
            fontOpticalSizing: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: `${c.outlineVariant} transparent`,
            userSelect: 'none',
          },
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-track': { background: 'transparent' },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: c.outlineVariant,
            borderRadius: 9999,
            border: '3px solid transparent',
            backgroundClip: 'content-box',
          },
          '*::-webkit-scrollbar-thumb:hover': { backgroundColor: c.outline },
          '::selection': { backgroundColor: c.primaryContainer, color: c.onPrimaryContainer },
          ':focus-visible': focusRing,
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              transitionDuration: '0.01ms !important',
            },
          },
        },
      },
      MuiTypography: { defaultProps: { variantMapping } },
      MuiButtonBase: { defaultProps: { disableTouchRipple: false } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: corner.full,
            height: 40,
            padding: '0 24px',
            minWidth: 0,
            whiteSpace: 'nowrap',
            transition: [motion.spatial(['border-radius'], 'fast'), motion.effects(['background-color', 'color', 'border-color', 'box-shadow'])].join(', '),
            // Expressive shape morph: buttons square up while pressed.
            '&:active': { borderRadius: corner.sm },
            '&.Mui-focusVisible': focusRing,
            '& .MuiButton-startIcon > *:nth-of-type(1), & .MuiButton-endIcon > *:nth-of-type(1)': { fontSize: 20 },
          },
          sizeSmall: { height: 32, padding: '0 16px', ...typeScale.labelLarge },
          sizeLarge: {
            height: 56,
            padding: '0 24px',
            ...typeScale.titleMedium,
            '&:active': { borderRadius: corner.md },
            '& .MuiButton-startIcon > *:nth-of-type(1), & .MuiButton-endIcon > *:nth-of-type(1)': { fontSize: 24 },
          },
          contained: {
            backgroundColor: c.primary,
            color: c.onPrimary,
            '&:hover': { backgroundColor: stateLayer(c.primary, c.onPrimary, STATE.hover), boxShadow: `0 1px 2px ${alpha(c.shadow, 0.3)}, 0 1px 3px 1px ${alpha(c.shadow, 0.15)}` },
            '&:active': { backgroundColor: stateLayer(c.primary, c.onPrimary, STATE.pressed) },
          },
          containedError: {
            backgroundColor: c.error,
            color: c.onError,
            '&:hover': { backgroundColor: stateLayer(c.error, c.onError, STATE.hover) },
          },
          outlined: {
            borderColor: c.outlineVariant,
            color: c.onSurfaceVariant,
            '&:hover': { borderColor: c.outlineVariant, backgroundColor: alpha(c.onSurfaceVariant, STATE.hover) },
          },
          text: {
            color: c.primary,
            padding: '0 16px',
            '&:hover': { backgroundColor: alpha(c.primary, STATE.hover) },
          },
          textInherit: { color: c.onSurfaceVariant, '&:hover': { backgroundColor: alpha(c.onSurfaceVariant, STATE.hover) } },
        },
        variants: [
          {
            // Filled tonal button (secondary container).
            props: { variant: 'tonal' },
            style: {
              backgroundColor: c.secondaryContainer,
              color: c.onSecondaryContainer,
              '&:hover': { backgroundColor: stateLayer(c.secondaryContainer, c.onSecondaryContainer, STATE.hover) },
              '&.Mui-disabled': { backgroundColor: alpha(c.onSurface, 0.12), color: alpha(c.onSurface, 0.38) },
            },
          },
        ],
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: corner.full,
            color: c.onSurfaceVariant,
            transition: [motion.spatial(['border-radius'], 'fast'), motion.effects(['background-color', 'color'])].join(', '),
            '&:hover': { backgroundColor: alpha(c.onSurfaceVariant, STATE.hover) },
            '&:active': { borderRadius: corner.md },
            '&.Mui-focusVisible': focusRing,
          },
          sizeMedium: { width: 40, height: 40 },
          sizeSmall: { width: 32, height: 32 },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none', backgroundColor: c.surfaceContainerLow },
          rounded: { borderRadius: corner.md },
        },
      },
      MuiCard: { styleOverrides: { root: { borderRadius: corner.md, backgroundImage: 'none' } } },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: corner.xl,
            backgroundColor: c.surfaceContainerHigh,
            boxShadow: `0 3px 6px ${alpha(c.shadow, 0.16)}`,
          },
        },
      },
      MuiDialogTitle: { styleOverrides: { root: { ...typeScale.headlineSmall, color: c.onSurface, padding: '24px 24px 16px' } } },
      MuiDialogContent: { styleOverrides: { root: { padding: '0 24px', color: c.onSurfaceVariant } } },
      MuiDialogActions: { styleOverrides: { root: { padding: 24, gap: 8, '& > :not(style) ~ :not(style)': { marginLeft: 0 } } } },
      MuiBackdrop: { styleOverrides: { root: { backgroundColor: alpha(c.scrim, 0.32) }, invisible: { backgroundColor: 'transparent' } } },
      MuiDrawer: {
        styleOverrides: {
          paper: { backgroundColor: c.surfaceContainerLow, backgroundImage: 'none', border: 'none' },
          paperAnchorRight: { borderRadius: `${corner.lg} 0 0 ${corner.lg}` },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: corner.sm,
            height: 32,
            ...typeScale.labelLarge,
            transition: motion.effects(['background-color', 'border-color', 'color']),
          },
          sizeSmall: { height: 24, ...typeScale.labelMedium },
          filled: { backgroundColor: c.surfaceContainerHighest, color: c.onSurfaceVariant },
          outlined: { borderColor: c.outlineVariant, color: c.onSurfaceVariant },
          clickable: { '&:hover': { backgroundColor: alpha(c.onSurfaceVariant, STATE.hover) } },
          icon: { color: 'inherit', fontSize: 18, marginLeft: 8 },
          label: { paddingLeft: 12, paddingRight: 12 },
          labelSmall: { paddingLeft: 8, paddingRight: 8 },
        },
      },
      MuiTooltip: {
        defaultProps: { enterDelay: 400, disableInteractive: true },
        styleOverrides: {
          tooltip: {
            ...typeScale.bodySmall,
            borderRadius: corner.xs,
            backgroundColor: c.inverseSurface,
            color: c.inverseOnSurface,
            padding: '4px 8px',
            minHeight: 24,
            display: 'flex',
            alignItems: 'center',
          },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            ...typeScale.bodyMedium,
            backgroundColor: c.inverseSurface,
            color: c.inverseOnSurface,
            borderRadius: corner.xs,
            minHeight: 48,
            padding: '0 8px 0 16px',
            boxShadow: `0 3px 8px ${alpha(c.shadow, 0.24)}`,
          },
          action: { '& .MuiButton-root': { color: c.inversePrimary }, '& .MuiIconButton-root': { color: c.inverseOnSurface } },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: corner.xs,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: c.outline },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: c.onSurface },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: c.primary, borderWidth: 2 },
            '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: c.error },
          },
          input: { ...typeScale.bodyLarge, userSelect: 'text' },
        },
      },
      MuiInputLabel: { styleOverrides: { root: { ...typeScale.bodyLarge, color: c.onSurfaceVariant, '&.Mui-focused': { color: c.primary } } } },
      MuiFormHelperText: { styleOverrides: { root: { ...typeScale.bodySmall, marginLeft: 16, marginTop: 4, color: c.onSurfaceVariant } } },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 48, borderBottom: `1px solid ${c.surfaceVariant}` },
          indicator: { height: 3, borderRadius: '3px 3px 0 0', backgroundColor: c.primary },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            ...typeScale.titleSmall,
            minHeight: 48,
            textTransform: 'none',
            color: c.onSurfaceVariant,
            '&.Mui-selected': { color: c.primary },
            '&:hover': { backgroundColor: alpha(c.onSurface, STATE.hover) },
          },
        },
      },
      MuiSwitch: {
        // M3 switch: 52×32 track, 16dp handle (24 when on, 28 while pressed).
        styleOverrides: {
          root: { width: 52, height: 32, padding: 0, overflow: 'visible', margin: 8 },
          switchBase: {
            padding: 0,
            top: 0,
            left: 0,
            width: 32,
            height: 32,
            transform: 'translateX(0)',
            transition: motion.spatial(['transform'], 'fast'),
            '&:hover': { backgroundColor: alpha(c.onSurface, STATE.hover) },
            '&.Mui-checked': {
              transform: 'translateX(20px)',
              color: c.onPrimary,
              '&:hover': { backgroundColor: alpha(c.primary, STATE.hover) },
              '& + .MuiSwitch-track': { backgroundColor: c.primary, opacity: 1, borderColor: c.primary },
              '& .MuiSwitch-thumb': { width: 24, height: 24, backgroundColor: c.onPrimary },
            },
            '&:active .MuiSwitch-thumb': { width: 28, height: 28 },
            '&.Mui-disabled + .MuiSwitch-track': { opacity: 0.12 },
            '&.Mui-focusVisible': focusRing,
          },
          thumb: {
            width: 16,
            height: 16,
            boxShadow: 'none',
            backgroundColor: c.outline,
            transition: [motion.spatial(['width', 'height'], 'fast'), motion.effects(['background-color'])].join(', '),
          },
          track: {
            borderRadius: corner.full,
            opacity: 1,
            backgroundColor: c.surfaceContainerHighest,
            border: `2px solid ${c.outline}`,
            boxSizing: 'border-box',
            transition: motion.effects(['background-color', 'border-color']),
          },
          input: { left: '-20px', width: '72px' },
        },
      },
      MuiCheckbox: {
        styleOverrides: {
          root: {
            color: c.onSurfaceVariant,
            borderRadius: corner.full,
            '&.Mui-checked': { color: c.primary },
            '&.Mui-checked.MuiCheckbox-colorError': { color: c.error },
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { height: 4, borderRadius: corner.full, backgroundColor: c.secondaryContainer },
          bar: { borderRadius: corner.full, backgroundColor: c.primary },
        },
      },
      MuiCircularProgress: { defaultProps: { thickness: 4 } },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: corner.lg,
            backgroundColor: c.surfaceContainer,
            boxShadow: `0 2px 6px ${alpha(c.shadow, 0.2)}`,
            minWidth: 200,
          },
          list: { padding: 4 },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            ...typeScale.labelLarge,
            minHeight: 44,
            borderRadius: corner.md,
            gap: 12,
            color: c.onSurface,
            '& .MuiListItemIcon-root': { minWidth: 0, color: c.onSurfaceVariant },
            '&:hover': { backgroundColor: alpha(c.onSurface, STATE.hover) },
            '&.Mui-selected': {
              backgroundColor: c.tertiaryContainer,
              color: c.onTertiaryContainer,
              ...typeScale.labelLargeEmphasized,
              '&:hover': { backgroundColor: stateLayer(c.tertiaryContainer, c.onTertiaryContainer, STATE.hover) },
            },
          },
        },
      },
      MuiListSubheader: { styleOverrides: { root: { ...typeScale.titleSmall, backgroundColor: 'transparent', color: c.onSurfaceVariant, lineHeight: '36px' } } },
      MuiToggleButtonGroup: {
        // Segmented button: outlined, fully rounded ends, secondary container when selected.
        styleOverrides: {
          root: { borderRadius: corner.full, height: 40 },
          grouped: {
            borderColor: c.outline,
            '&:first-of-type': { borderTopLeftRadius: corner.full, borderBottomLeftRadius: corner.full },
            '&:last-of-type': { borderTopRightRadius: corner.full, borderBottomRightRadius: corner.full },
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            ...typeScale.labelLarge,
            textTransform: 'none',
            color: c.onSurface,
            borderColor: c.outline,
            padding: '0 16px',
            gap: 8,
            transition: motion.effects(['background-color', 'color']),
            '&:hover': { backgroundColor: alpha(c.onSurface, STATE.hover) },
            '&.Mui-selected': {
              backgroundColor: c.secondaryContainer,
              color: c.onSecondaryContainer,
              '&:hover': { backgroundColor: stateLayer(c.secondaryContainer, c.onSecondaryContainer, STATE.hover) },
            },
          },
        },
      },
      MuiDivider: { styleOverrides: { root: { borderColor: c.outlineVariant } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: corner.md, ...typeScale.bodyMedium } } },
      MuiLink: { styleOverrides: { root: { color: c.primary, textDecorationColor: 'currentColor' } } },
    },
  });
};
