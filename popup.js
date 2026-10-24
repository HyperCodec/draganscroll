const status = document.querySelector("#status");
const planButton = document.querySelector("#plan");

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

    const response = await chrome.tabs.sendMessage(tab.id, { type: "planCurrentDocument" });
    if (response?.error) {
      throw new Error(response.error);
    }
    status.textContent = "Checkpoint planning started.";
  } catch (error) {
    const message = String(error?.message || error);
    status.textContent = message.includes("Receiving end does not exist")
      ? "This tab is Chrome's built-in PDF viewer. Open the PDF in an accessible web page to use checkpoints."
      : message;
  } finally {
    planButton.disabled = false;
  }
});
