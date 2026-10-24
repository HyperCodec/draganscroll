const status = document.querySelector("#status");
const planButton = document.querySelector("#plan");
const visionButton = document.querySelector("#vision");
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
    status.textContent = "No accessible text layer found. Try the Gemma image planner below.";
    visionButton.focus();
  } catch (error) {
    const message = String(error?.message || error);
    status.textContent = message.includes("Receiving end does not exist")
      ? "This tab has no accessible text layer. Try the Gemma image planner below."
      : message;
  } finally {
    planButton.disabled = false;
  }
});

visionButton.addEventListener("click", async () => {
  planButton.disabled = true;
  visionButton.disabled = true;
  results.replaceChildren();
  status.textContent = "Capturing the visible page for Gemma…";

  try {
    if (!globalThis.LanguageModel) {
      throw new Error("This browser does not expose Chrome's built-in multimodal Gemma API.");
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.windowId) {
      throw new Error("No active tab was found.");
    }

    const image = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const imageBlob = await fetch(image).then((response) => response.blob());
    const availability = await LanguageModel.availability({
      expectedInputs: [{ type: "image" }],
      expectedOutputs: [{ type: "text" }]
    });
    if (availability !== "available") {
      throw new Error(`Chrome's built-in Gemma image model is not ready (status: ${availability}).`);
    }

    status.textContent = "Gemma is reading the visible page…";
    const session = await LanguageModel.create({
      expectedInputs: [{ type: "image" }],
      expectedOutputs: [{ type: "text" }]
    });
    const response = await session.prompt([{
      role: "user",
      content: [
        {
          type: "text",
          value: `Analyze this document page directly, including scanned text. Return JSON only:
{"sections":[{"text":"short description of an ordered readable section","isHeading":false}],
"checkpoints":[{"sectionIndex":0,"reason":"why this is a useful boundary"}]}
Use at least two sections when the page contains multiple reading portions. Do not
invent sections if the page is blank or unreadable. Checkpoint sectionIndex values
must refer to the sections array.`
        },
        { type: "image", value: imageBlob }
      ]
    }]);
    session.destroy();

    const plan = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || response);
    const checkpoints = Array.isArray(plan.checkpoints) ? plan.checkpoints : [];
    results.innerHTML = `<strong>${checkpoints.length} checkpoint${checkpoints.length === 1 ? "" : "s"} planned by Gemma</strong>`;
    for (const checkpoint of checkpoints) {
      const item = document.createElement("p");
      item.textContent = `Section ${Number(checkpoint.sectionIndex) + 1}: ${checkpoint.reason || "Significant reading boundary."}`;
      results.appendChild(item);
    }
    status.textContent = "Gemma image planning complete. Native PDF viewers cannot display DOM placeholders; results are shown here.";
  } catch (error) {
    status.textContent = String(error?.message || error);
  } finally {
    planButton.disabled = false;
    visionButton.disabled = false;
  }
});
