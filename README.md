# 🐉📜 DraganScroll

**Transform passive PDF reading into an interactive, multimodal learning experience with on-device Gemma 4.**

## About the Project

DraganScroll is a local-first Chrome extension that transforms passive PDF reading into an interactive learning experience through auto-generated comprehension checkpoints.

To meet the short hackathon deadline, our team deployed a deliberate "shotgun vibe coding" strategy—rapidly building parallel prototypes to bypass merge conflicts and identify the strongest architecture. The winning result leverages on-device Gemma 4 text and multimodal vision to intelligently map document structures, generate contextual reading quizzes, and evaluate short answers locally without ever sending your data to the cloud.

Built for the **MLH Hacktoberfest Hack Day Pittsburgh (2026)**.

## ✨ Features

* **Local-First & Private:** Runs entirely on-device using Chrome's built-in `window.LanguageModel` API. Your personal PDFs and academic papers never leave your machine.
* **Smart Checkpoint Planning:** Analyzes document structure to intelligently place reading checkpoints at logical intervals, rather than arbitrarily splitting pages.
* **Active Recall Quizzing:** Automatically generates a mix of multiple-choice, checklist, and short-answer questions based strictly on the bounded context of the reading section.
* **Local Auto-Grading:** Evaluates your written short answers against the source text to provide immediate, context-aware feedback on what you missed.
* **Multimodal Vision Fallback:** Seamlessly switches to Gemma 4's image capabilities to scan and extract educational content from image-only, non-OCR textbook PDFs.
* **Robust JSON Sanitization:** Features a custom open-source model harness that scrubs PDF typography and auto-corrects syntax to force strict JSON outputs from lightweight models.

## 🛠️ How We Built It: "Shotgun Vibe Coding"

Hackathons are a sprint. Because AI-assisted coding can quickly lead to massive, tangled merge conflicts when multiple developers touch the same logic, we utilized a parallel **"shotgun vibe coding"** approach.

Each team member rapidly built their own prototype of the application on separate branches, exploring different architectural visions (web app vs. desktop vs. extension). After a few hours, we regrouped, evaluated the prototypes, and selected this browser extension version to merge to `master`. This strategy completely bypassed Git bottlenecks, allowed everyone to code freely at maximum speed, and resulted in a frictionless, highly polished final product.

## 🚀 Installation & Setup

Because DraganScroll utilizes experimental on-device AI features, you must use a compatible version of Google Chrome with the Prompt API enabled.

### 1. Enable Chrome AI Flags

1. Open Chrome and navigate to `chrome://flags/`.
2. Search for **Prompt API for Gemini Nano** and set it to **Enabled**.
3. Search for **Enables optimization guide on device** and set it to **Enabled BypassPrefRequirement**.
4. Relaunch Chrome. (You may need to wait a few minutes for the model weights to download in the background via `chrome://components`).

### 2. Load the Extension

1. Clone this repository:
```bash
git clone https://github.com/HyperCodec/draganscroll.git

```


2. Open Chrome and navigate to `chrome://extensions/`.
3. Toggle on **Developer mode** in the top right corner.
4. Click **Load unpacked** in the top left corner.
5. Select the `draganscroll` directory you just cloned.
6. Open a PDF in your browser and click the DraganScroll extension icon to begin!

## 🏆 Hackathon Tracks

* **Best Use of Gemma 4:** Demonstrates rapid prototyping by utilizing the Gemini API in Chrome to build a focused educational tool with both text and multimodal image support.
* **Best Open-Source AI Project:** Built entirely around an open-source model harness that strictly manages and sanitizes inputs/outputs to make a lightweight open-weights model reliable for structured JSON generation.