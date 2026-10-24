import { GEMMA4_MODEL, planCheckpoints } from "./gemma4-skill.js";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    model: GEMMA4_MODEL,
    checkpointMode: "placeholder-planning"
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "planCheckpoints" || !Array.isArray(message.sections)) {
    return;
  }

  planCheckpoints(message.sections)
    .then((plan) => sendResponse({ plan }))
    .catch((error) => {
      console.error("Unable to plan checkpoints", error);
      sendResponse({ error: "Unable to plan checkpoints." });
    });

  return true;
});
