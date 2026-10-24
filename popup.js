const status = document.querySelector("#status");
const planButton = document.querySelector("#plan");
const ocrButton = document.querySelector("#ocr");
const results = document.querySelector("#results");

chrome.storage.local.get(["model", "checkpointMode"], (data) => {
  const model = data.model || { family: "Gemma 4", size: "4B", mode: "thinking" };
  status.textContent = `Mode: ${data.checkpointMode || "placeholder-planning"} (${model.family}, ${model.size} ${model.mode})`;
});

planButton.addEventListener("click", async () => {
  planButton.disabled = true;
  status.textContent = "Planning checkpoints…";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error("No active tab was found.");
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: "planCurrentDocument" }).catch(() => null);
    if (response?.readable) {
      status.textContent = "Checkpoint planning started.";
      return;
    }
    status.textContent = "No accessible text layer found. Try OCR below.";
    ocrButton.focus();
  } catch (error) {
    const message = String(error?.message || error);
    status.textContent = message.includes("Receiving end does not exist")
      ? "This tab has no accessible text layer. Try OCR below."
      : message;
  } finally {
    planButton.disabled = false;
  }
});

ocrButton.addEventListener("click", async () => {
  planButton.disabled = true;
  ocrButton.disabled = true;
  results.replaceChildren();
  status.textContent = "Capturing the visible page…";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.windowId) {
      throw new Error("No active tab was found.");
    }

    const image = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    status.textContent = "Running local OCR (the first run downloads English language data)…";
    const worker = await Tesseract.createWorker("eng", 1, {
      workerPath: chrome.runtime.getURL("vendor/worker.min.js"),
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0",
      langPath: "https://tessdata.projectnaptha.com/4.0.0"
    });
    const {
      data: { text }
    } = await worker.recognize(image);
    await worker.terminate();

    let sections = text
      .split(/\n\s*\n|(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((value) => value.replace(/\s+/g, " ").trim())
      .filter((value) => value.length >= 80);
    if (sections.length < 2) {
      const words = text.replace(/\s+/g, " ").trim().split(" ");
      const wordsPerSection = Math.max(40, Math.ceil(words.length / 8));
      sections = [];
      for (let index = 0; index < words.length; index += wordsPerSection) {
        const section = words.slice(index, index + wordsPerSection).join(" ");
        if (section.length >= 80) {
          sections.push(section);
        }
      }
    }
    if (sections.length < 2) {
      throw new Error("OCR found too little readable text on the visible page.");
    }

    const response = await chrome.runtime.sendMessage({
      type: "planCheckpoints",
      sections: sections.map((value, index) => ({ index, isHeading: false, text: value.slice(0, 1200) }))
    });
    const checkpoints = response?.plan?.checkpoints || [];
    results.innerHTML = `<strong>${checkpoints.length} checkpoint${checkpoints.length === 1 ? "" : "s"} planned from OCR</strong>`;
    for (const checkpoint of checkpoints) {
      const item = document.createElement("p");
      item.textContent = `Section ${checkpoint.sectionIndex + 1}: ${checkpoint.reason}`;
      results.appendChild(item);
    }
    status.textContent = "OCR planning complete. The native PDF viewer cannot display DOM placeholders; results are shown here.";
  } catch (error) {
    status.textContent = String(error?.message || error);
  } finally {
    planButton.disabled = false;
    ocrButton.disabled = false;
  }
});
