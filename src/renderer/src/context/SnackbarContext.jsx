import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Snackbar, Button, IconButton, Box } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

const SnackbarContext = createContext({ notify: () => { } });

/**
 * M3 snackbar: inverse surface, one optional text action, optional close.
 * notify(message, { action: { label, onClick }, duration })
 */
export function SnackbarProvider({ children }) {
  const [state, setState] = useState({ open: false, key: 0, message: '', action: null, duration: 5000 });

  const notify = useCallback((message, opts = {}) => {
    setState((prev) => ({
      open: true,
      key: prev.key + 1,
      message,
      action: opts.action || null,
      duration: opts.duration ?? (opts.action ? 8000 : 5000),
    }));
  }, []);

  const close = (_e, reason) => {
    if (reason === 'clickaway') return;
    setState((s) => ({ ...s, open: false }));
  };

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <Snackbar
        key={state.key}
        open={state.open}
        onClose={close}
        autoHideDuration={state.duration}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={state.message}
        sx={{
          maxWidth: 560,
          // Lift above the floating toolbar when one is on screen.
          'body[data-floating-toolbar] &': { bottom: '104px !important' },
        }}
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {state.action && (
              <Button
                variant="text"
                onClick={() => {
                  state.action.onClick?.();
                  setState((s) => ({ ...s, open: false }));
                }}
              >
                {state.action.label}
              </Button>
            )}
            <IconButton size="small" aria-label="Dismiss" onClick={close}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        }
      />
    </SnackbarContext.Provider>
  );
}

export const useSnackbar = () => useContext(SnackbarContext);
