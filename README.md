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
- Finds identical files across a folder and its subfolders with one click, without an AI account.
- Reviews duplicate copies before recycling, with scan cancellation and content rechecks before cleanup.
- Suggests descriptive names for untitled, hash/UUID and random-looking document names using local headings and optional AI from cleaned excerpts. Images are excluded.
- Shows editable before/after names and a before/after folder view when reviewing an organization plan.

## Document tools
- **Version groups** recognizes repeated downloads such as `memo (1).pdf`, revision names, and similar readable text. Everything starts kept. Open files, compare highlighted text excerpts, select older versions or individual files, and confirm before sending selected versions to the Recycle Bin. At least one unchanged member stays in every group. Most recently modified is a suggestion, not proof of the final revision.
- **Search documents** searches file names recursively and readable text in TXT, Markdown, CSV, RTF, HTML, PDF, and DOCX. Results show matching snippets and open/reveal actions. Content stays on your computer; the bounded text cache exists only in memory and is cleared when leaving search.
- **Use a preset** offers Downloads, Study, and Work starters that organize by extension without AI. Customize destinations and exact keep-in-place names, save reusable presets, then use the existing editable before-and-after review, safe moves, History, and Undo.

Version scans cover supported files directly in the selected folder, up to 1,000 files. Text comparison reads up to 200 documents within a 32 MB total reading budget. Search scans up to 5,000 files and extracts up to 300 documents within a 32 MB budget. Both read bounded text (12,000 characters; first two PDF pages), exclude linked and hidden paths, and report incomplete coverage. Images are excluded from document content analysis. These three tools do not call an AI provider.

## Tech stack
- Electron (main process + IPC)
- React + Vite (renderer)
- Material UI (UI components)
- `electron-store` (local settings/history/metrics persistence)

## Getting started
### Prerequisites
- Node.js 22.16+
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
2. Configure AI on the Settings page if needed.
3. Click `Organize with AI`.
4. Review the generated plan.
5. Apply the plan to move files/folders.
6. Check completion stats and the moved-item recollection list.
7. Revert a run from History if required.

## Scripts
- `npm test` — check duplicate detection, smart renaming, document versions and search, organization presets, AI request handling, history, and organization previews.
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

## Duplicate cleanup
Choose a folder and click **Find duplicates**. The scan includes subfolders automatically and compares file contents across directories. It excludes hidden entries, generated/dependency folders, symbolic links, and hard-linked files. Unreadable or changing files are reported as skipped.

The scan groups files by size, samples their beginning/middle/end, and checks complete SHA-256 hashes for remaining matches. Empty files are included. Results are sorted by the space occupied by extra copies. One copy per group is suggested to keep; this is a naming/path heuristic, so review the selection before recycling.

Click **Recycle copies** after reviewing. The app rechecks selected files against a retained copy and uses the operating system's Recycle Bin, with no permanent-delete fallback. Recycling does not immediately release disk space while the files remain in the Recycle Bin. If any copy cannot be recycled, its selection and the error stay visible for retry or a fresh scan.

## Settings
The settings wheel opens a dedicated page with **Appearance**, **AI & naming**, and **About** sections. Appearance previews theme and accent changes live; **Save changes** keeps them and **Reset changes** restores your saved preferences. Back closes the page directly and discards any edits you have not saved. Provider connection tests, separate organization/naming models, saved-key replacement/removal, and debug logging are under AI & naming. About shows the installed version, an explicit update check, and the project link. Opening Settings from a folder preserves the current review and selection when you return. Settings uses a desktop sidebar, consistent panel padding and left alignment, and Save/Reset controls attached to the settings panel. Keyboard focus returns to the opening control.

The page and file-review screens use the app's Material 3 Expressive colors, typography, shape, and spatial/effects spring tokens. Page and section transitions, accent-shape morphs, and the document naming stages respect reduced-motion preferences.

## Smart rename
Choose a folder and click **Smart rename**. The app checks filenames locally for placeholders such as `Untitled` (including `untilted`), UUIDs/hashes, and long high-entropy identifiers. Descriptive names are left alone. Only regular text documents, PDFs, and DOCX files directly in the selected folder are eligible; images (including SVG), subfolders, hidden entries, links, code/configuration formats, and recognized sensitive filenames are excluded.

Select files and click **Find names locally**. Clear Markdown, HTML, and Title/Subject headings, or conservative PDF/DOCX headings, produce local suggestions without a provider request. The app reads up to 64 KB of text (12,000 characters used locally), the first two PDF pages (18 MB file limit), or DOCX text (12 MB limit). Scanned PDFs without extractable text are left unchanged. **Keep everything on this device** prevents AI requests for the run and leaves documents without a clear heading unchanged. Local naming works without an AI account.

For ambiguous documents, review **what AI can see** before choosing **Use AI**. Common contact details, labeled personal fields, URLs, local paths, and long identifiers are removed locally; known credentials and obvious medical, personnel, or financial identity records are blocked. Only selected cleaned excerpts of at most 1,800 characters are sent: documents are not uploaded and original filenames/paths are not added to requests. Redaction is heuristic and cannot guarantee that every private detail is detected. Review the excerpt or use local-only mode for confidential documents. These safeguards apply to Smart rename, not the separate organization feature.

OpenAI document naming defaults to `gpt-4o-mini`; custom providers keep their configured model. Override the naming model independently in Settings. Identical cleaned excerpts of the same file type share one request within a run. Requests have a 256-token output limit, a 30-second timeout, no automatic retries, and `store:false`. No extracted content, brief, or AI response is persisted as a cache; History stores the filenames and moves needed for Undo. Provider retention policies still apply to excerpts sent to AI; `store:false` is not a zero-retention guarantee.

Review **Before / After** names, read each summary, and edit or deselect suggestions before clicking **Rename files**. Extensions are preserved, generated names are sanitized, and collisions get numbered suffixes. Edited names are validated again before applying; existing files are never overwritten. The app checks that each selected file and folder still matches the scan and rolls back completed renames if a later rename fails. Renames appear in **History** and can be undone; any changes that could not be rolled back are recorded for recovery too.

## Organization preview
When reviewing an organization plan, switch from **Categories** to **Before & after** to compare the current root entries with the proposed folder layout. Items excluded from the plan remain in their current place, and existing destination folders are shown once with their existing contents preserved. The preview updates as you edit the plan. It shows proposed moves; filename suffixes required for conflicts inside destination folders are resolved when applying.
