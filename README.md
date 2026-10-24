# Draganscroll

A calm, distraction-free PDF reader. PDF files are opened and rendered locally in your browser.

## Run locally

1. Install Node.js (the current Vite release requires a recent supported Node version).
2. Install dependencies with `npm install`.
3. Start the development server with `npm run dev`.
4. Open the local URL printed by Vite and drop a PDF onto the upload area, or click it to choose a file.

Use the **Library** button to return to the upload screen. Pages are rendered as they approach the viewport, so opening a large document does not immediately draw every page.

## Current milestone

Milestone 2 adds per-page text extraction in visual reading order, approximately 700-word reading sections, and one-time checkpoint detection as the viewport scrolls forward. Rendered pages also have a selectable pdf.js text layer so text can be highlighted and copied. Use `?debug=1` on the app URL to show checkpoint lines and current section progress. PDFs with fewer than 50 selectable words show a notice and do not get checkpoints.

Milestone 3 will add a modal with a mock question at each reached checkpoint. No quiz modal or model call is included yet.
