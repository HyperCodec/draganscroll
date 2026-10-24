# Draganscroll: PDF reader with comprehension checkpoints

## Goal
A web app where the user uploads a PDF and reads it in our own viewer.
After scrolling through each large section of text, a low-friction popup
quiz checks that they actually read it (vs. just scanning), and
encourages re-reading if they miss it. Built for a hackathon; AI is an
open-weight model (Gemma 4) running locally via Ollama.

## Stack
- Vite + React + TypeScript
- pdfjs-dist for rendering and text extraction
- Plain CSS (or CSS modules). No UI framework.
- Model: Gemma 4 E2B via Ollama HTTP API at http://localhost:11434
   - Exact Ollama model tag: 'gemma4:e2b' 
- All processing client-side. PDFs never leave the user's machine.

## Core flow
1. User drops/uploads a PDF.
2. App renders pages in a vertical scroll viewer.
3. App extracts text per page and builds "sections" of ~700 words
   (never split mid-sentence if avoidable; sections may span pages).
4. Each section has a checkpoint at its end position in the document.
5. When the user scrolls past a checkpoint, a modal quiz appears.
6. Correct answer: brief positive feedback, continue.
   Wrong answer: encouraging message + hint + "Re-read" button that
   scrolls back to the section start; user may retry (question stays).
7. A "Skip" link exists (low friction), and skips are counted.

## Skim detection
Track time spent on each section while it is in view (pause when tab
is hidden). Compare to words / 250 wpm. If time < 35% of expected,
flag as "skimmed" and make the quiz message gentler about slowing down.
Show nothing accusatory.

## Quiz generation
- src/lib/quiz.ts is the ONLY file that talks to the model.
- Returns {question, options: string[4], answerIndex: 0-3, hint}.
- Validate the shape; retry once; fall back to a cached/mock question.
- Pre-generate the next section's quiz while the user reads.
- "Demo mode" toggle uses pre-written questions for a sample PDF.

## UX requirements
- Calm, minimal, readable. Light/dark friendly.
- Modal blocks scrolling until answered or skipped.
- Loading state if a quiz isn't ready (never freeze the UI).
- If a PDF has no text layer, show a friendly message and disable quizzes.
- Progress indicator: sections completed, accuracy.

## Non-goals
Accounts, backend, saving to a database, OCR, mobile layout polish.

## Milestones
1. Upload + render PDF pages
2. Extract text, build sections, detect checkpoint crossing (console log)
3. Modal with mock question
4. Real Gemma call + validation + fallback
5. Skim detection, re-read button, encouragements
6. Polish, demo mode, README