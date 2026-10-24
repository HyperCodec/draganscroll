chrome.storage.local.get(["modelPlan", "checkpointMode"], (data) => {
  if (!data?.modelPlan) {
    return;
  }

  const status = document.createElement("p");
  status.textContent = `Mode: ${data.checkpointMode} (${data.modelPlan})`;
  document.body.appendChild(status);
});
