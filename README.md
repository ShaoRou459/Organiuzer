# Organiuzer

![Electron](https://img.shields.io/badge/Electron-39.x-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=111)
![Vite](https://img.shields.io/badge/Vite-7.x-646CFF?logo=vite&logoColor=white)
![MUI](https://img.shields.io/badge/MUI-7.x-007FFF?logo=mui&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-2ea44f)

Desktop folder organizer that uses AI to propose structure, lets you review changes, and then applies moves with safety checks.

## What it does
- Scans a selected folder and builds a categorized organization plan with AI.
- Excludes hidden items from AI analysis to avoid accidental reorganization.
- Lets you review and adjust the plan before execution (drag-and-drop between categories).
- Shows analysis and execution progress in-app.
- Tracks runs, stores history, and supports reverting a previous run.
- Maintains metrics (files moved, bytes processed, estimated time saved).
- Supports configurable AI provider settings (API key, model, base URL).

## Tech stack
- Electron (main process + IPC)
- React + Vite (renderer)
- Material UI (UI components)
- `electron-store` (local settings/history/metrics persistence)

## Getting started
### Prerequisites
- Node.js 18+
- npm

### Install
```bash
npm install
```

### Run in development
```bash
npm run dev
```

This starts Vite on `127.0.0.1:5173` and then launches Electron.

## Basic workflow
1. Open the app and choose a target folder.
2. Configure AI settings in the Settings dialog if needed.
3. Click `Organize with AI`.
4. Review the generated plan.
5. Apply the plan to move files/folders.
6. Check completion stats and the moved-item recollection list.
7. Revert a run from History if required.

## Scripts
- `npm run dev` — start Vite + Electron in development mode.
- `npm run build` — build the renderer bundle with Vite.
- `npm run pack` — create unpacked desktop app output for local testing.
- `npm run dist` — build Windows installer artifacts.
- `npm run dist:x64` — build Windows x64 installer artifacts.
- `npm run dist:arm64` — build Windows ARM64 installer artifacts.

## End-user install
- Download the installer from the `release` folder:
	- `Organiuzer Setup 1.0.0.exe`
- Run the installer and follow the setup wizard.
- Launch `Organiuzer` from Start Menu or Desktop shortcut.

Current generated installer in this repo is x64.

## Packaging output
- Installer and build artifacts are generated in:
	- `release/`
- Typical files:
	- `Organiuzer Setup 1.0.0.exe`
	- `organiuzer-1.0.0-x64.nsis.7z`
	- `win-arm64-unpacked/`
	- `win-unpacked/` (x64)

## Notes
- If `npm run dev` fails with port conflicts, free port `5173` or stop the existing process using it.
- Use `npm run dist:x64` or `npm run dist:arm64` to target a specific Windows architecture.
