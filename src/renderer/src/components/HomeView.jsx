import React from 'react';
import { Box, Typography, Button, Paper, Grid, Fade, IconButton, Tooltip } from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import StorageIcon from '@mui/icons-material/Storage';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SettingsIcon from '@mui/icons-material/Settings';

export default function HomeView({ onSelectFolder, onOpenSettings, metrics }) {
  return (
    <Fade in={true} timeout={800}>
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 4,
        p: 3
      }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h1" gutterBottom sx={{
            background: 'linear-gradient(45deg, #D0BCFF 30%, #EFB8C8 90%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Organiuzer
          </Typography>
          <Typography variant="h5" color="text.secondary">
            Your intelligent file system assistant
          </Typography>
        </Box>

        {/* Button Group */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="contained"
            size="large"
            startIcon={<FolderOpenIcon />}
            onClick={onSelectFolder}
            sx={{
              px: 5,
              py: 1.75,
              fontSize: '1.1rem',
              borderRadius: 3,
            }}
          >
            Select Folder to Organize
          </Button>
          <Tooltip title="Settings">
            <IconButton
              onClick={onOpenSettings}
              sx={{
                bgcolor: 'background.surfaceContainer',
                border: '1px solid',
                borderColor: 'divider',
                width: 52,
                height: 52,
                '&:hover': {
                  bgcolor: 'action.hover',
                  borderColor: 'primary.main',
                },
              }}
            >
              <SettingsIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <Grid container spacing={3} sx={{ maxWidth: 800, mt: 4 }}>
          <MetricCard
            icon={<AutoAwesomeIcon color="primary" />}
            value={metrics.filesOrganized}
            label="Files Organized"
          />
          <MetricCard
            icon={<StorageIcon color="secondary" />}
            value={metrics.spaceSaved}
            label="Space Reclaimed"
          />
          <MetricCard
            icon={<AccessTimeIcon color="success" />}
            value={metrics.timeSaved}
            label="Time Saved"
          />
        </Grid>
      </Box>
    </Fade>
  );
}

function MetricCard({ icon, value, label }) {
  return (
    <Grid size={{ xs: 12, md: 4 }}>
      <Paper sx={{
        p: 3,
        textAlign: 'center',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.surfaceContainer',
        border: '1px solid',
        borderColor: 'divider',
      }}>
        <Box sx={{ mb: 1, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
          {icon}
        </Box>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Paper>
    </Grid>
  );
}
