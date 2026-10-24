# Draganscroll

A calm, distraction-free PDF reader. PDF files are opened and rendered locally in your browser.

## Run locally

1. Install Node.js (the current Vite release requires a recent supported Node version).
2. Install dependencies with `npm install`.
3. Start the development server with `npm run dev`.
4. Open the local URL printed by Vite and drop a PDF onto the upload area, or click it to choose a file.

Use the **Library** button to return to the upload screen. Pages are rendered as they approach the viewport, so opening a large document does not immediately draw every page.

## Current milestone

Milestone 1 includes PDF upload and lazy page rendering with pdf.js. Text extraction, reading sections, checkpoints, quizzes, and model calls are not implemented yet.
