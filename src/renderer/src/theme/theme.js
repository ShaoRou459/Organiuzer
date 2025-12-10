import { createTheme, alpha } from '@mui/material/styles';

// Material Design 3 inspired color palette
const darkPalette = {
  primary: {
    main: '#D0BCFF',
    light: '#EADDFF',
    dark: '#381E72',
    contrastText: '#381E72',
  },
  secondary: {
    main: '#CCC2DC',
    light: '#E8DEF8',
    dark: '#332D41',
    contrastText: '#332D41',
  },
  tertiary: {
    main: '#EFB8C8',
    light: '#FFD8E4',
    dark: '#492532',
  },
  error: {
    main: '#F2B8B5',
    light: '#F9DEDC',
    dark: '#8C1D18',
  },
  success: {
    main: '#A8DAB5',
    light: '#C8E6C9',
    dark: '#1B5E20',
  },
  warning: {
    main: '#FFD599',
    light: '#FFE0B2',
    dark: '#E65100',
  },
  background: {
    default: '#141218',
    paper: '#1D1B20',
    surface: '#141218',
    surfaceContainer: '#211F26',
    surfaceContainerLow: '#1D1B20',
    surfaceContainerHigh: '#2B2930',
    surfaceContainerHighest: '#36343B',
  },
  text: {
    primary: '#E6E1E5',
    secondary: '#CAC4D0',
    disabled: '#938F99',
  },
  divider: '#49454F',
  action: {
    active: '#E6E1E5',
    hover: alpha('#E6E1E5', 0.08),
    selected: alpha('#E6E1E5', 0.12),
    disabled: alpha('#E6E1E5', 0.38),
    disabledBackground: alpha('#E6E1E5', 0.12),
  },
  outline: '#938F99',
  outlineVariant: '#49454F',
};

const lightPalette = {
  primary: {
    main: '#6750A4',
    light: '#7F67BE',
    dark: '#381E72',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#625B71',
    light: '#7A7289',
    dark: '#332D41',
    contrastText: '#FFFFFF',
  },
  tertiary: {
    main: '#7D5260',
    light: '#986977',
    dark: '#492532',
  },
  error: {
    main: '#B3261E',
    light: '#DC362E',
    dark: '#8C1D18',
  },
  success: {
    main: '#2E7D32',
    light: '#4CAF50',
    dark: '#1B5E20',
  },
  warning: {
    main: '#ED6C02',
    light: '#FF9800',
    dark: '#E65100',
  },
  background: {
    default: '#FEF7FF',
    paper: '#FFFFFF',
    surface: '#FEF7FF',
    surfaceContainer: '#F3EDF7',
    surfaceContainerLow: '#F7F2FA',
    surfaceContainerHigh: '#ECE6F0',
    surfaceContainerHighest: '#E6E0E9',
  },
  text: {
    primary: '#1D1B20',
    secondary: '#49454F',
    disabled: '#1D1B2038',
  },
  divider: '#CAC4D0',
  action: {
    active: '#1D1B20',
    hover: alpha('#1D1B20', 0.08),
    selected: alpha('#1D1B20', 0.12),
    disabled: alpha('#1D1B20', 0.38),
    disabledBackground: alpha('#1D1B20', 0.12),
  },
  outline: '#79747E',
  outlineVariant: '#CAC4D0',
};

export const getTheme = (mode = 'dark') => {
  const palette = mode === 'dark' ? darkPalette : lightPalette;

  return createTheme({
    palette: {
      mode,
      ...palette,
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      h1: {
        fontSize: '2.5rem',
        fontWeight: 400,
        letterSpacing: '-0.5px',
        lineHeight: 1.2,
      },
      h2: {
        fontSize: '2rem',
        fontWeight: 400,
        letterSpacing: 0,
        lineHeight: 1.3,
      },
      h3: {
        fontSize: '1.75rem',
        fontWeight: 400,
        letterSpacing: 0,
        lineHeight: 1.3,
      },
      h4: {
        fontSize: '1.5rem',
        fontWeight: 500,
        letterSpacing: '0.25px',
        lineHeight: 1.4,
      },
      h5: {
        fontSize: '1.25rem',
        fontWeight: 500,
        letterSpacing: 0,
        lineHeight: 1.4,
      },
      h6: {
        fontSize: '1rem',
        fontWeight: 500,
        letterSpacing: '0.15px',
        lineHeight: 1.5,
      },
      subtitle1: {
        fontSize: '1rem',
        fontWeight: 500,
        letterSpacing: '0.15px',
        lineHeight: 1.5,
      },
      subtitle2: {
        fontSize: '0.875rem',
        fontWeight: 500,
        letterSpacing: '0.1px',
        lineHeight: 1.57,
      },
      body1: {
        fontSize: '1rem',
        fontWeight: 400,
        letterSpacing: '0.5px',
        lineHeight: 1.5,
      },
      body2: {
        fontSize: '0.875rem',
        fontWeight: 400,
        letterSpacing: '0.25px',
        lineHeight: 1.43,
      },
      button: {
        fontSize: '0.875rem',
        fontWeight: 500,
        letterSpacing: '0.1px',
        textTransform: 'none',
      },
      caption: {
        fontSize: '0.75rem',
        fontWeight: 400,
        letterSpacing: '0.4px',
        lineHeight: 1.66,
      },
      overline: {
        fontSize: '0.75rem',
        fontWeight: 500,
        letterSpacing: '0.5px',
        lineHeight: 2.66,
        textTransform: 'uppercase',
      },
    },
    shape: {
      borderRadius: 16,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            scrollbarWidth: 'thin',
            scrollbarColor: `${palette.outline} transparent`,
            '&::-webkit-scrollbar': {
              width: 8,
              height: 8,
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: palette.outline,
              borderRadius: 4,
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 20,
            padding: '10px 24px',
            fontWeight: 500,
          },
          contained: {
            boxShadow: 'none',
            '&:hover': {
              boxShadow: `0 1px 2px ${alpha(palette.primary.main, 0.3)}`,
            },
          },
          outlined: {
            borderWidth: 1,
            '&:hover': {
              borderWidth: 1,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            backgroundImage: 'none',
          },
          elevation1: {
            boxShadow: `0 1px 3px ${alpha('#000', 0.12)}, 0 1px 2px ${alpha('#000', 0.24)}`,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            backgroundImage: 'none',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontWeight: 500,
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            '&.Mui-selected': {
              backgroundColor: palette.action.selected,
            },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: 8,
            backgroundColor: palette.background.surfaceContainerHighest,
            color: palette.text.primary,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 28,
          },
        },
      },
      MuiSnackbar: {
        styleOverrides: {
          root: {
            borderRadius: 8,
          },
        },
      },
    },
  });
};
