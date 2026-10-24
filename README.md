# draganscroll

A Chrome Extension PoC for adding AI-generated checkpoints to PDF reading.

## Current scaffold

This repository now includes a minimal Manifest V3 extension:

- `manifest.json` (MV3 config)
- `background.js` (Gemma 4 checkpoint planning message handler)
- `gemma4-skill.js` (Gemma 4 metadata, planning, checkpoint-generation, and rolling-summary skills)
- `content-script.js` (plans and inserts document-anchored checkpoint placeholders)
- `popup.html` / `popup.js` (basic extension status UI)
- `viewer.html` / `viewer.js` (extension-owned PDF.js viewer with checkpoint overlays)

## Load locally in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `/home/runner/work/draganscroll/draganscroll`

## Current behavior

- The fixed-place checkpoint button has been removed.
- The popup can open the active PDF in the extension-owned PDF.js viewer. On a readable
  PDF page, the viewer extracts its own text layer,
  identifies substantial text sections (including generic PDF text layers), and plans
  boundaries between significant portions.
- The viewer can send rendered page images directly to Chrome's built-in multimodal
  Gemma API for scanned pages when the browser has the on-device image model available.
- The viewer generates interactive checklist, multiple-choice (including true/false), and short-answer
  checkpoints with Gemma. Closed-option answers are validated against the generated options, and
  incorrect answers receive the generated explanation.
- Each checkpoint uses the PDF text from the previous checkpoint boundary through the current
  boundary. A bounded rolling summary is carried forward so older sections remain available without
  filling the model context window.
- The planner currently uses a deterministic fallback behind a Gemma 4-compatible skill
  interface; the local Gemma 4 runtime can be connected in `gemma4-skill.js`.

The extension-owned viewer renders checkpoint overlays itself, including for pages
analyzed through Gemma image input. The browser's native PDF viewer remains unsupported.

## Intended next steps

- Connect the `planCheckpoints` adapter to in-browser Gemma 4 inference.
- Connect checkpoint planning itself to Gemma rather than the deterministic placement fallback.
