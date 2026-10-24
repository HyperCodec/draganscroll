const DEFAULT_CHECKPOINT = {
  question: "What is the main point of the page you just read?",
  answerHint: "Summarize it in one or two sentences."
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    modelPlan: "gemma-4-browser",
    checkpointMode: "stub"
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "generateCheckpoint") {
    return;
  }

  sendResponse({ checkpoint: DEFAULT_CHECKPOINT });
});
