# draganscroll

A Chrome Extension PoC for adding AI-generated checkpoints to PDF reading.

## Current scaffold

This repository now includes a minimal Manifest V3 extension:

- `manifest.json` (MV3 config)
- `background.js` (Gemma 4 checkpoint planning message handler)
- `gemma4-skill.js` (Gemma 4 4B thinking model metadata and checkpoint-planning skill)
- `content-script.js` (plans and inserts document-anchored checkpoint placeholders)
- `popup.html` / `popup.js` (basic extension status UI)

## Load locally in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `/home/runner/work/draganscroll/draganscroll`

## Current behavior

- The fixed-place checkpoint button has been removed.
- On a readable PDF page, the extension waits for asynchronously rendered PDF text,
  identifies substantial text sections (including generic PDF text layers), and plans
  boundaries between significant portions.
- The popup can OCR the visible page using the bundled Tesseract.js runtime. This works
  for scanned PDFs and native browser PDF viewers; English language data is downloaded
  the first time OCR is used.
- It inserts placeholder checkpoints only. It does not generate questions or answers.
- The planner currently uses a deterministic fallback behind a Gemma 4-compatible skill
  interface; the local Gemma 4 runtime can be connected in `gemma4-skill.js`.

Native browser PDF viewers do not expose their internal text layer or DOM to extensions,
so OCR results and checkpoint reasons are shown in the popup instead of being inserted
into the viewer. DOM placeholders remain available on pages with an accessible text layer.

## Intended next steps

- Connect the `planCheckpoints` adapter to in-browser Gemma 4 inference.
- Generate questions only when a reader reaches a placeholder.
