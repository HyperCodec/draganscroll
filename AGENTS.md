 # Instructions for Codex

   Read SPEC.md before making changes. Follow its stack and milestones.

   - Stack: Vite + React + TypeScript, pdfjs-dist. No new dependencies without asking first.
   - Keep components small, one per file, in src/components. Logic in src/lib.
   - Only src/lib/quiz.ts calls the model. Model name and base URL are constants at the top of that file.
   - Always validate model output before using it.
   - Work on ONE milestone at a time. Do not build ahead.
   - Prefer simple, readable code. This is a 4-hour hackathon project.
   - Do not rewrite files unrelated to the current task.
   - After each change, list what I should manually test.

   ## Current status
   - Milestones 1-2 done: upload and render PDFs, text extraction (src/lib/extractText.ts), sections (src/lib/sections.ts), checkpoint detection (src/hooks/useCheckpoints.ts), ?debug=1 overlay.
   - Next: Milestone 3 (modal with mock question).
   - Known issues: Sections do not ignore irrelevant text (ex. table of contents)