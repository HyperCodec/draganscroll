const status = document.querySelector("#status");
const viewerButton = document.querySelector("#viewer");
const planButton = document.querySelector("#plan");

chrome.storage.local.get(["model", "checkpointMode"], (data) => {
  const model = data.model || { family: "Gemma 4", size: "4B", mode: "thinking" };
  status.textContent = `Mode: ${data.checkpointMode || "placeholder-planning"} (${model.family}, ${model.size} ${model.mode})`;
});

viewerButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ? `?url=${encodeURIComponent(tab.url)}` : "";
  await chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html${url}`) });
  window.close();
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
    status.textContent = "No accessible text layer found. Open the PDF in the DraganScroll viewer.";
  } catch (error) {
    const message = String(error?.message || error);
    status.textContent = message.includes("Receiving end does not exist")
      ? "This tab has no accessible text layer. Open the PDF in the DraganScroll viewer."
      : message;
  } finally {
    planButton.disabled = false;
  }
});
