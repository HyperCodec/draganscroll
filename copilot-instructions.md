# Instructions for Copilot

Read SPEC.md before making changes. Follow its stack and milestones.

- Stack: Vite + React + TypeScript, pdfjs-dist. No new dependencies
  without asking first.
- Keep components small, one per file, in src/components. Logic in src/lib.
- Only src/lib/quiz.ts calls the model. Keep the model name and base URL
  as constants at the top of that file.
- Always validate model output before using it. Never trust JSON blindly.
- Work on ONE milestone at a time. Do not build ahead.
- Configure the pdf.js worker correctly for Vite (use the bundler-friendly
  worker import, not a CDN).
- After each change, briefly list what I should manually test.
- Prefer simple, readable code over clever abstractions. This is a
  4-hour hackathon project.
- Do not rewrite files unrelated to the current task.