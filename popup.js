chrome.storage.local.get(["model", "checkpointMode"], (data) => {
  if (!data?.model) {
    return;
  }

  const status = document.createElement("p");
  status.textContent = `Mode: ${data.checkpointMode} (${data.model.family}, ${data.model.size} ${data.model.mode})`;
  document.body.appendChild(status);
});
