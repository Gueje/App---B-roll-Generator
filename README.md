# B-Roll Generator

A full-stack capable React application that automates the creation of B-roll plans from video scripts (Word documents).

## Features
- **Smart Parsing**: Extracts script text and editorial notes (e.g., [bracketed text]) from .docx files.
- **AI Analysis**: Uses Google Gemini 2.5 Flash to infer visual intent, style, and keywords.
- **Automated Mapping**: 100% coverage ensures every script segment has a visual suggestion.
- **Direct Export**: Creates a formatted Google Doc with clickable search links for stock footage (Pexels, Unsplash, Google Images).

## Setup Instructions

### 1. Prerequisites
- Node.js installed.
- A Google Cloud Project with the following APIs enabled:
  - Google Docs API
  - Google Drive API
- A Google Gemini API Key.

### 2. Running Locally
1. Clone the repository.
2. Install dependencies (if running in a full local environment):
   ```bash
   npm install react react-dom lucide-react @google/genai mammoth
   ```
   *Note: If testing in a simplified sandbox, ensure these packages are available.*
3. Start the dev server:
   ```bash
   npm start
   ```

### 3. Configuration (In App)
Click the **Settings (Gear Icon)** in the top right corner.
1. **Gemini API Key**: Get from Google AI Studio.
2. **Google Client ID**: Create an OAuth 2.0 Client ID in Google Cloud Console.
   - Authorize `http://localhost:3000` (or your domain) as a Javascript Origin.
3. **Google API Key**: Create a standard API Key in Google Cloud Console restricted to Docs/Drive APIs.

## How it Works
1. **Segmentation**: The app reads the raw ArrayBuffer of the .docx. It splits text by paragraphs. Text inside `[]` or `{}` is extracted as "Notes".
2. **Analysis**: We send the segments to Gemini with a system prompt demanding JSON output containing visual descriptions, keywords, and media types.
3. **Export**: Using the client-side Google API (`gapi`), we authenticate the user and batch-create a Google Doc, inserting text and formatting links dynamically.

## Security
- API Keys are stored in `localStorage` for convenience in this demo but should be handled via a proxy server in a production enterprise environment.
- No script data is persisted to any external database; it lives in React state memory.

## Checklist Verification
- [x] **Coverage**: The UI displays a card for every identified text block.
- [x] **Notes**: Notes are highlighted in yellow in the UI and included in the Google Doc.
- [x] **Specificity**: Queries include main terms + specific keywords.
- [x] **Export**: Generates a valid Google Doc link.
