import * as pdfjsLib from "./vendor/pdf.min.mjs";

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
      expectedOutputs: [{ type: "text" }]
    });
    if (availability !== "available") {
      throw new Error(`Gemma image model is not ready (status: ${availability}).`);
    }
    const session = await LanguageModel.create({
      expectedInputs: [{ type: "image" }],
      expectedOutputs: [{ type: "text" }]
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
    const response = await chrome.runtime.sendMessage({ type: "planCheckpoints", sections });
    if (response?.error) {
      throw new Error(response.error);
    }
    response.plan.checkpoints.forEach(({ sectionIndex, reason }, checkpointIndex) => {
      const section = sections[sectionIndex];
      const page = renderedPages.find(({ pageNumber }) => pageNumber === section?.pageNumber);
      if (page) {
        const marker = document.createElement("div");
        marker.className = "checkpoint";
        marker.textContent = `Checkpoint ${checkpointIndex + 1}: ${reason}`;
        page.container.appendChild(marker);
      }
    });
    setStatus(`${response.plan.checkpoints.length} checkpoints added from Gemma page vision.`);
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
    const response = await chrome.runtime.sendMessage({
      type: "planCheckpoints",
      sections
    });
    if (response?.error) {
      throw new Error(response.error);
    }
    response.plan.checkpoints.forEach(({ sectionIndex, reason }, checkpointIndex) => {
      const section = sections[sectionIndex];
      const page = renderedPages.find(({ pageNumber }) => pageNumber === section?.pageNumber);
      if (!page) {
        return;
      }
      const marker = document.createElement("div");
      marker.className = "checkpoint";
      marker.textContent = `Checkpoint ${checkpointIndex + 1}: ${reason}`;
      marker.style.top = "0";
      page.container.appendChild(marker);
    });
    setStatus(`${response.plan.checkpoints.length} checkpoints added to the viewer.`);
  } catch (error) {
    setStatus(`Checkpoint planning failed: ${error.message || error}`);
  } finally {
    planButton.disabled = false;
  }
});

if (sourceUrl) {
  loadSource({ url: sourceUrl });
}
