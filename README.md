# Organiuzer

An AI-powered folder organizer app built with Electron, React, and Material UI.

## Features
- **AI Categorization:** Uses OpenAI (or compatible APIs like LocalAI/Gemini) to categorize files.
- **Material You Design:** Modern, adaptive UI.
- **Smart History:** Learns from your previous organizations to improve future suggestions.
- **Customizable:** Configure API keys, Base URLs, and Models.

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```

## Usage
1. Start the development app:
   ```bash
   npm run dev
   ```
2. Go to **Settings** (Gear icon) and enter your API Key (e.g., OpenAI or Gemini).
   - For Gemini, use Base URL: `https://generativelanguage.googleapis.com/v1beta/openai/` and your API key.
3. Select a folder to organize.
4. Click "Organize with AI".
5. Review the proposed changes. You can delete categories you don't like.
6. Click "Confirm & Move Files".

## Build
To build for production:
```bash
npm run build
# Then use electron-builder (not currently configured for full packaging, but `electron-builder` is installed)
```
