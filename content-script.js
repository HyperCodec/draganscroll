const isLikelyPdfContext =
  window.location.href.toLowerCase().endsWith(".pdf") ||
  document.contentType === "application/pdf" ||
  Boolean(document.querySelector('embed[type="application/pdf"], object[type="application/pdf"]'));

if (isLikelyPdfContext && !document.getElementById("draganscroll-checkpoint-btn")) {
  const button = document.createElement("button");
  button.id = "draganscroll-checkpoint-btn";
  button.type = "button";
  button.textContent = "Checkpoint";
  Object.assign(button.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "2147483647",
    border: "1px solid #1f2937",
    borderRadius: "6px",
    padding: "10px 12px",
    background: "#111827",
    color: "#ffffff",
    cursor: "pointer",
    fontFamily: "system-ui, sans-serif",
    fontSize: "14px"
  });

  button.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "generateCheckpoint" }, (response) => {
      const checkpoint = response?.checkpoint;
      if (!checkpoint) {
        return;
      }

      const existing = document.getElementById("draganscroll-checkpoint-card");
      if (existing) {
        existing.remove();
      }

      const card = document.createElement("aside");
      card.id = "draganscroll-checkpoint-card";
      Object.assign(card.style, {
        position: "fixed",
        right: "16px",
        bottom: "64px",
        zIndex: "2147483647",
        width: "320px",
        background: "#ffffff",
        border: "1px solid #d1d5db",
        borderRadius: "8px",
        boxShadow: "0 8px 16px rgba(0, 0, 0, 0.12)",
        padding: "12px",
        fontFamily: "system-ui, sans-serif",
        color: "#111827"
      });

      card.innerHTML = `<strong>Mini checkpoint</strong><p>${checkpoint.question}</p><small>${checkpoint.answerHint}</small>`;
      document.body.appendChild(card);
    });
  });

  document.body.appendChild(button);
}
