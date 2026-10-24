import * as pdfjsLib from "./vendor/pdf.min.mjs";
import {
  createTextSession,
  evaluateShortAnswer,
  generateCheckpoint,
  planCheckpoints,
  updateReadingSummary
} from "./gemma4-skill.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.min.mjs");

const fileInput = document.querySelector("#file");
const planButton = document.querySelector("#plan");
const visionButton = document.querySelector("#vision");
const resetButton = document.querySelector("#reset");
const textModelProgress = document.querySelector("#text-model-progress");
const textModelProgressBar = document.querySelector("#text-model-progress-bar");
const textModelProgressLabel = document.querySelector("#text-model-progress-label");
const imageModelProgress = document.querySelector("#image-model-progress");
const imageModelProgressBar = document.querySelector("#image-model-progress-bar");
const imageModelProgressLabel = document.querySelector("#image-model-progress-label");
const status = document.querySelector("#status");
const pages = document.querySelector("#pages");
const sourceUrl = new URLSearchParams(window.location.search).get("url");
let renderedPages = [];
let warmTextSessionPromise;
let warmTextSession;
let activeTextSession;
let warmImageSessionPromise;
let warmImageSession;
let textModelReady = false;
let imageModelReady = false;

function setStatus(message) {
  status.textContent = message;
}

function formatDownloadProgress(loaded, total) {
  const fraction = total ? loaded / total : loaded <= 1 ? loaded : 0;
  return fraction > 0 ? ` (${Math.round(fraction * 100)}%)` : "…";
}

function updateModelProgress(progress, bar, labelElement, label, loaded, total) {
  const fraction = total ? loaded / total : loaded <= 1 ? loaded : 0;
  bar.value = Math.max(0, Math.min(1, fraction));
  labelElement.textContent = `${label}${fraction > 0 ? ` (${Math.round(fraction * 100)}%)` : ""}`;
  if (fraction >= 1) {
    progress.hidden = true;
  } else {
    progress.hidden = false;
  }
}

function updateButtonState() {
  planButton.disabled = renderedPages.length < 2 || !textModelReady;
  visionButton.disabled = renderedPages.length < 1 || !imageModelReady;
}

async function renderPdf(source) {
  planButton.disabled = true;
  pages.replaceChildren();
  renderedPages = [];
  setStatus("Loading PDF…");

  const pdf = await pdfjsLib.getDocument({
    ...source,
    wasmUrl: chrome.runtime.getURL("vendor/wasm/"),
    standardFontDataUrl: chrome.runtime.getURL("vendor/wasm/"),
    useWasm: true
  }).promise;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const initialViewport = page.getViewport({ scale: 1.35 });
    const scale = Math.min(1.1, 1800 / Math.max(initialViewport.width, initialViewport.height));
    const viewport = page.getViewport({ scale });
    const container = document.createElement("article");
    container.className = "page";
    container.dataset.pageNumber = pageNumber;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    container.appendChild(canvas);
    pages.appendChild(container);
    await page.render({
      canvasContext: context,
      viewport,
      background: "white"
    }).promise;

    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    renderedPages.push({ pageNumber, container, text });
    setStatus(`Rendered page ${pageNumber} of ${pdf.numPages}…`);
  }

  updateButtonState();
  setStatus(
    renderedPages.some(({ text }) => text.length >= 20)
      ? "PDF ready. Plan checkpoints when ready."
      : "PDF rendered, but no text layer was found. Scanned-page vision support can be added here."
  );
}

async function loadSource(source) {
  try {
    await renderPdf(source);
  } catch (error) {
    planButton.disabled = true;
    visionButton.disabled = true;
    setStatus(`Unable to load PDF: ${error.message || error}`);
  }
}

async function warmTextModel() {
  if (warmTextSessionPromise || warmTextSession || !globalThis.LanguageModel) {
    return;
  }
  setStatus("Preparing Gemma text model in the background…");
  updateModelProgress(textModelProgress, textModelProgressBar, textModelProgressLabel,
    "Text model: preparing", 0, 0);
  warmTextSessionPromise = createTextSession({
    onDownloadProgress: (loaded, total) => {
      updateModelProgress(textModelProgress, textModelProgressBar, textModelProgressLabel,
        "Text model: downloading", loaded, total);
      setStatus(`Downloading Gemma text model${formatDownloadProgress(loaded, total)}`);
    }
  }).then((session) => {
    warmTextSession = session;
    textModelReady = true;
    updateModelProgress(textModelProgress, textModelProgressBar, textModelProgressLabel,
      "Text model: ready", 1, 1);
    updateButtonState();
    return session;
  }).finally(() => {
    warmTextSessionPromise = undefined;
  });
  try {
    await warmTextSessionPromise;
  } catch (error) {
    textModelReady = false;
    updateModelProgress(textModelProgress, textModelProgressBar, textModelProgressLabel,
      "Text model: unavailable", 0, 0);
    updateButtonState();
    console.warn("Gemma text model warm-up failed:", error);
  }
}

async function acquireTextSession() {
  if (activeTextSession) {
    return activeTextSession;
  }
  if (warmTextSessionPromise) {
    await warmTextSessionPromise;
  }
  if (warmTextSession) {
    const session = warmTextSession;
    warmTextSession = undefined;
    activeTextSession = session;
    return activeTextSession;
  }
  activeTextSession = await createTextSession({
    onDownloadProgress: (loaded, total) => {
      updateModelProgress(textModelProgress, textModelProgressBar, textModelProgressLabel,
        "Text model: downloading", loaded, total);
      setStatus(`Downloading Gemma text model${formatDownloadProgress(loaded, total)}`);
    }
  });
  return activeTextSession;
}

async function createImageSession() {
  const availability = await LanguageModel.availability({
    expectedInputs: [{ type: "image" }],
    expectedOutputs: [{ type: "text", languages: ["en"] }]
  });
  if (availability === "unavailable") {
    throw new Error(
      "Gemma image generation is unavailable in this browser. Use Chrome with on-device Gemini Nano enabled."
    );
  }
  if (!["available", "downloadable", "downloading"].includes(availability)) {
    throw new Error(`Gemma image model is not ready (status: ${availability}).`);
  }
  setStatus("Preparing Gemma image model…");
  updateModelProgress(imageModelProgress, imageModelProgressBar, imageModelProgressLabel,
    "Image model: preparing", 0, 0);
  return LanguageModel.create({
    expectedInputs: [{ type: "image" }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => {
        updateModelProgress(imageModelProgress, imageModelProgressBar, imageModelProgressLabel,
          "Image model: downloading", event.loaded, event.total);
        setStatus(`Downloading Gemma image model${formatDownloadProgress(event.loaded, event.total)}`);
      });
    }
  });
}

async function warmImageModel() {
  if (warmImageSessionPromise || warmImageSession || !globalThis.LanguageModel) {
    return;
  }
  warmImageSessionPromise = createImageSession().then((session) => {
    warmImageSession = session;
    imageModelReady = true;
    updateModelProgress(imageModelProgress, imageModelProgressBar, imageModelProgressLabel,
      "Image model: ready", 1, 1);
    updateButtonState();
    return session;
  }).catch((error) => {
    imageModelReady = false;
    updateModelProgress(imageModelProgress, imageModelProgressBar, imageModelProgressLabel,
      "Image model: unavailable", 0, 0);
    updateButtonState();
    console.warn("Gemma image model warm-up failed:", error);
    throw error;
  }).finally(() => {
    warmImageSessionPromise = undefined;
  });
  try {
    await warmImageSessionPromise;
  } catch {
    // The vision button remains disabled until a later reset/retry succeeds.
  }
}

async function acquireImageSession() {
  if (warmImageSessionPromise) {
    await warmImageSessionPromise;
  }
  if (warmImageSession) {
    const session = warmImageSession;
    warmImageSession = undefined;
    return session;
  }
  return createImageSession();
}

async function requestPlan(sections) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "planCheckpoints",
      sections
    });
    if (response?.plan && Array.isArray(response.plan.checkpoints)) {
      return response.plan;
    }
    if (response?.error) {
      throw new Error(response.error);
    }
  } catch (error) {
    console.warn("Background planner unavailable; using the bundled planner.", error);
  }
  return planCheckpoints(sections);
}

function checkpointContext(sections, sectionIndex, previousSectionIndex) {
  return sections
    .slice(Math.max(0, previousSectionIndex), Math.min(sections.length - 1, sectionIndex) + 1)
    .map(({ pageNumber, text }) => `[Page ${pageNumber}]\n${text}`)
    .join("\n\n")
    .slice(0, 12000);
}

function addCheckpointCard(page, checkpoint, checkpointIndex, context) {
  const card = document.createElement("section");
  card.className = "checkpoint-card";
  const title = document.createElement("strong");
  title.textContent = `Checkpoint ${checkpointIndex + 1}`;
  card.append(title);
  checkpoint.questions.forEach((question, questionIndex) => {
    const questionBlock = document.createElement("div");
    questionBlock.className = "checkpoint-question";
    const prompt = document.createElement("p");
    prompt.textContent = `${questionIndex + 1}. ${question.question}`;
    questionBlock.append(prompt);
    let controls;
    if (question.type === "short_answer") {
      controls = document.createElement("textarea");
      controls.rows = 3;
      controls.placeholder = "Write your answer…";
      controls.className = "checkpoint-answer";
    } else {
      controls = document.createElement("div");
      controls.className = "checkpoint-options";
      const useCheckboxes = question.type === "checklist" || question.correctAnswers.length > 1;
      question.options.forEach((option, optionIndex) => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = useCheckboxes ? "checkbox" : "radio";
        input.name = `checkpoint-${checkpointIndex}-question-${questionIndex}`;
        input.value = option;
        input.id = `checkpoint-${checkpointIndex}-${questionIndex}-${optionIndex}`;
        const text = document.createElement("span");
        text.textContent = option;
        label.append(input, text);
        controls.append(label);
      });
    }
    const feedback = document.createElement("p");
    feedback.className = "checkpoint-feedback";
    const submit = document.createElement("button");
    submit.type = "button";
    submit.textContent = "Check answer";
    submit.addEventListener("click", async () => {
      if (question.type === "short_answer") {
        const answer = controls.value.trim();
        if (!answer) {
          feedback.textContent = "Write an answer before checking it.";
          feedback.className = "checkpoint-feedback incorrect";
          return;
        }
        submit.disabled = true;
        feedback.textContent = "Evaluating your answer…";
        try {
          const session = await acquireTextSession();
          feedback.textContent = await evaluateShortAnswer(session, {
            checkpoint: question,
            answer,
            context
          });
          feedback.className = "checkpoint-feedback";
        } catch (error) {
          feedback.textContent = `Unable to evaluate the answer: ${error.message || error}`;
          feedback.className = "checkpoint-feedback incorrect";
        } finally {
          submit.disabled = false;
        }
        return;
      }
      const answer = [...controls.querySelectorAll("input:checked")].map((input) => input.value);
      const correct = answer.length === question.correctAnswers.length &&
        answer.every((value) => question.correctAnswers.includes(value));
      feedback.textContent = correct ? "Correct." : `Not quite. ${question.explanation}`;
      feedback.className = `checkpoint-feedback ${correct ? "correct" : "incorrect"}`;
    });
    questionBlock.append(controls, submit, feedback);
    card.append(questionBlock);
  });
  page.container.append(card);
}

async function planAndGenerate(sections, emptyMessage) {
  const plan = await requestPlan(sections);
  if (!plan.checkpoints.length) {
    setStatus(emptyMessage);
    return;
  }
  setStatus("Preparing Gemma text model…");
  const session = await acquireTextSession();
  let previousSectionIndex = 0;
  let previousSummary = "";
  try {
    for (const [checkpointIndex, planned] of plan.checkpoints.entries()) {
      const sectionIndex = sections.findIndex(({ index }) => index === planned.sectionIndex);
      if (sectionIndex < 0) {
        continue;
      }
      const context = checkpointContext(sections, sectionIndex, previousSectionIndex);
      setStatus(`Gemma is generating checkpoint ${checkpointIndex + 1} of ${plan.checkpoints.length}…`);
      const checkpoint = await generateCheckpoint(session, { context, previousSummary });
      const page = renderedPages.find(({ pageNumber }) =>
        pageNumber === sections[sectionIndex].pageNumber
      );
      if (page) {
        addCheckpointCard(page, checkpoint, checkpointIndex, context);
      }
      previousSummary = await updateReadingSummary(session, { context, previousSummary });
      previousSectionIndex = sectionIndex + 1;
    }
  } finally {
    activeTextSession = session;
  }
  setStatus(`${plan.checkpoints.length} Gemma checkpoints added.`);
}

fileInput.addEventListener("change", async () => {
  const [file] = fileInput.files || [];
  if (file) {
    loadSource({ data: new Uint8Array(await file.arrayBuffer()) });
  }
});

visionButton.addEventListener("click", async () => {
  if (!globalThis.LanguageModel) {
    setStatus("This browser does not expose the multimodal Gemma API.");
    return;
  }
  visionButton.disabled = true;
  planButton.disabled = true;
  try {
    let session = await acquireImageSession();
    const sections = [];
    for (const [index, page] of renderedPages.entries()) {
      try {
        setStatus(`Gemma is reading page ${index + 1}…`);
        const canvas = page.container.querySelector("canvas");
        const image = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!image) {
          throw new Error("The page image could not be prepared.");
        }
        const response = await session.prompt([{
          role: "user",
          content: [
            {
              type: "text",
              value: "Describe the main readable section on this document page in 1-2 sentences. If unreadable, return an empty string."
            },
            { type: "image", value: image }
          ]
        }]);
        const text = response.trim();
        if (text) {
          sections.push({ index: sections.length, pageNumber: page.pageNumber, isHeading: false, text });
        }
      } catch (error) {
        console.warn(`Gemma could not read page ${page.pageNumber}:`, error);
        if (index < renderedPages.length - 1) {
          session.destroy();
          session = await acquireImageSession();
        }
      }
    }
    session.destroy();
    if (sections.length < 2) {
      throw new Error("Gemma found fewer than two readable page sections.");
    }
    await planAndGenerate(sections, "No checkpoint boundaries were found.");
  } catch (error) {
    setStatus(`Gemma page vision failed: ${error.message || error}`);
  } finally {
    updateButtonState();
  }
});

planButton.addEventListener("click", async () => {
  const sections = renderedPages
    .filter(({ text }) => text.length >= 20)
    .map(({ pageNumber, text }, index) => ({
      index,
      pageNumber,
      isHeading: false,
      text: text.slice(0, 1200)
    }));
  if (sections.length < 2) {
    setStatus("No readable sections found. Choose a text-based PDF or use page vision.");
    return;
  }

  planButton.disabled = true;
  setStatus("Planning checkpoint boundaries…");
  try {
    await planAndGenerate(sections, "No checkpoint boundaries were found.");
  } catch (error) {
    setStatus(`Checkpoint generation failed: ${error.message || error}`);
  } finally {
    updateButtonState();
  }
});

resetButton.addEventListener("click", () => {
  activeTextSession?.destroy();
  warmTextSession?.destroy();
  warmImageSession?.destroy();
  warmTextSession = undefined;
  activeTextSession = undefined;
  warmImageSession = undefined;
  warmTextSessionPromise = undefined;
  warmImageSessionPromise = undefined;
  textModelReady = false;
  imageModelReady = false;
  updateModelProgress(textModelProgress, textModelProgressBar, textModelProgressLabel,
    "Text model: resetting", 0, 0);
  updateModelProgress(imageModelProgress, imageModelProgressBar, imageModelProgressLabel,
    "Image model: resetting", 0, 0);
  updateButtonState();
  chrome.storage.local.remove(["checkpointMode"]);
  setStatus("Gemma session reset. Chrome manages the downloaded model cache.");
  warmTextModel();
  warmImageModel();
});

if (sourceUrl) {
  loadSource({ url: sourceUrl });
}

warmTextModel();
warmImageModel();
