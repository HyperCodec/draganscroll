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
const status = document.querySelector("#status");
const pages = document.querySelector("#pages");
const sourceUrl = new URLSearchParams(window.location.search).get("url");
let renderedPages = [];

function setStatus(message) {
  status.textContent = message;
}

function formatDownloadProgress(loaded, total) {
  const fraction = total ? loaded / total : loaded <= 1 ? loaded : 0;
  return fraction > 0 ? ` (${Math.round(fraction * 100)}%)` : "…";
}

async function renderPdf(source) {
  planButton.disabled = true;
  pages.replaceChildren();
  renderedPages = [];
  setStatus("Loading PDF…");

  const pdf = await pdfjsLib.getDocument(source).promise;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.35 });
    const container = document.createElement("article");
    container.className = "page";
    container.dataset.pageNumber = pageNumber;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    container.appendChild(canvas);
    pages.appendChild(container);
    await page.render({ canvasContext: context, viewport }).promise;

    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    renderedPages.push({ pageNumber, container, text });
    setStatus(`Rendered page ${pageNumber} of ${pdf.numPages}…`);
  }

  planButton.disabled = renderedPages.length < 2;
  visionButton.disabled = renderedPages.length < 1;
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
  title.textContent = `Checkpoint ${checkpointIndex + 1} · ${checkpoint.type.replace("_", " ")}`;
  const question = document.createElement("p");
  question.textContent = checkpoint.question;
  card.append(title, question);

  let controls;
  if (checkpoint.type === "short_answer") {
    controls = document.createElement("textarea");
    controls.rows = 3;
    controls.placeholder = "Write your answer…";
    controls.className = "checkpoint-answer";
  } else {
    controls = document.createElement("div");
    controls.className = "checkpoint-options";
    const useCheckboxes = checkpoint.type === "checklist" || checkpoint.correctAnswers.length > 1;
    checkpoint.options.forEach((option, optionIndex) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = useCheckboxes ? "checkbox" : "radio";
      input.name = `checkpoint-${checkpointIndex}`;
      input.value = option;
      input.id = `checkpoint-${checkpointIndex}-${optionIndex}`;
      const text = document.createElement("span");
      text.textContent = option;
      label.append(input, text);
      controls.append(label);
    });
  }

  const submit = document.createElement("button");
  submit.type = "button";
  submit.textContent = "Check answer";
  const feedback = document.createElement("p");
  feedback.className = "checkpoint-feedback";
  submit.addEventListener("click", async () => {
    if (checkpoint.type === "short_answer") {
      const answer = controls.value.trim();
      if (!answer) {
        feedback.textContent = "Write an answer before checking it.";
        feedback.className = "checkpoint-feedback incorrect";
        return;
      }
      submit.disabled = true;
      feedback.textContent = "Gemma is evaluating your answer…";
      try {
        feedback.textContent = "Preparing Gemma model…";
        const session = await createTextSession({
          onDownloadProgress: (loaded, total) => {
            feedback.textContent = `Downloading Gemma model${formatDownloadProgress(loaded, total)}`;
          }
        });
        try {
          feedback.textContent = await evaluateShortAnswer(session, {
            checkpoint,
            answer,
            context
          });
          feedback.className = "checkpoint-feedback";
        } finally {
          session.destroy();
        }
      } catch (error) {
        feedback.textContent = `Unable to evaluate the answer: ${error.message || error}`;
        feedback.className = "checkpoint-feedback incorrect";
      } finally {
        submit.disabled = false;
      }
      return;
    }
    const answer = [...controls.querySelectorAll("input:checked")].map((input) => input.value);
    const correct = answer.length === checkpoint.correctAnswers.length &&
      answer.every((value) => checkpoint.correctAnswers.includes(value));
    feedback.textContent = correct ? "Correct." : `Not quite. ${checkpoint.explanation}`;
    feedback.className = `checkpoint-feedback ${correct ? "correct" : "incorrect"}`;
  });
  card.append(controls, submit, feedback);
  page.container.append(card);
}

async function planAndGenerate(sections, emptyMessage) {
  const plan = await requestPlan(sections);
  if (!plan.checkpoints.length) {
    setStatus(emptyMessage);
    return;
  }
  setStatus("Preparing Gemma text model…");
  const session = await createTextSession({
    onDownloadProgress: (loaded, total) => {
      setStatus(`Downloading Gemma text model${formatDownloadProgress(loaded, total)}`);
    }
  });
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
    session.destroy();
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
    const availability = await LanguageModel.availability({
      expectedInputs: [{ type: "image" }],
      expectedOutputs: [{ type: "text" }],
      outputLanguage: "en"
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
    const session = await LanguageModel.create({
      expectedInputs: [{ type: "image" }],
      expectedOutputs: [{ type: "text" }],
      outputLanguage: "en",
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (event) => {
          setStatus(`Downloading Gemma image model${formatDownloadProgress(event.loaded, event.total)}`);
        });
      }
    });
    const sections = [];
    for (const [index, page] of renderedPages.entries()) {
      setStatus(`Gemma is reading page ${index + 1}…`);
      const canvas = page.container.querySelector("canvas");
      const image = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
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
    }
    session.destroy();
    if (sections.length < 2) {
      throw new Error("Gemma found fewer than two readable page sections.");
    }
    await planAndGenerate(sections, "No checkpoint boundaries were found.");
  } catch (error) {
    setStatus(`Gemma page vision failed: ${error.message || error}`);
  } finally {
    planButton.disabled = false;
    visionButton.disabled = false;
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
    planButton.disabled = false;
  }
});

if (sourceUrl) {
  loadSource({ url: sourceUrl });
}
