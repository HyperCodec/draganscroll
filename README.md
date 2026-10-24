# draganscroll

A Chrome Extension PoC for adding AI-generated checkpoints to PDF reading.

## Current scaffold

This repository now includes a minimal Manifest V3 extension:

- `manifest.json` (MV3 config)
- `background.js` (checkpoint generation stub + model plan placeholder)
- `content-script.js` (injects a checkpoint button on likely PDF pages)
- `popup.html` / `popup.js` (basic extension status UI)

## Load locally in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `/home/runner/work/draganscroll/draganscroll`

## Intended next steps

- Replace stub checkpoint generation with in-browser Gemma 4 inference.
- Connect checkpoint timing to PDF reader progress and user interactions.
