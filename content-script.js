const isLikelyPdfContext =
  window.location.href.toLowerCase().endsWith(".pdf") ||
  document.contentType === "application/pdf" ||
  Boolean(document.querySelector('embed[type="application/pdf"], object[type="application/pdf"]'));

function getSections() {
  const candidates = [...document.querySelectorAll("h1, h2, h3, h4, p, li")];
  return candidates
    .map((element) => ({
      element,
      isHeading: /^H[1-4]$/.test(element.tagName),
      text: element.textContent.replace(/\s+/g, " ").trim()
    }))
    .filter(({ isHeading, text }) => isHeading || text.length >= 80)
    .map(({ element, isHeading, text }, index) => ({
      element,
      index,
      isHeading,
      text: text.slice(0, 1200)
    }));
}

function addPlaceholder(section, index, reason) {
  const placeholder = document.createElement("aside");
  placeholder.className = "draganscroll-checkpoint-placeholder";
  placeholder.setAttribute("aria-label", `Checkpoint ${index + 1}`);
  placeholder.textContent = `Checkpoint ${index + 1} · ${reason}`;
  Object.assign(placeholder.style, {
    margin: "16px 0",
    padding: "10px 12px",
    border: "1px dashed #64748b",
    borderRadius: "8px",
    background: "#f8fafc",
    color: "#334155",
    font: "13px system-ui, sans-serif"
  });
  section.before(placeholder);
}

function showStatus(message, isError = false) {
  const status = document.createElement("div");
  status.id = "draganscroll-status";
  status.textContent = message;
  Object.assign(status.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "2147483647",
    maxWidth: "300px",
    padding: "10px 12px",
    borderRadius: "8px",
    background: isError ? "#fee2e2" : "#e0f2fe",
    color: isError ? "#991b1b" : "#075985",
    font: "13px system-ui, sans-serif",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)"
  });
  document.body.appendChild(status);
  window.setTimeout(() => status.remove(), 4000);
}

function planPlaceholders() {
  if (document.querySelector(".draganscroll-checkpoint-placeholder")) {
    return;
  }

  const sections = getSections();
  if (sections.length < 2) {
    showStatus("No readable sections were found for checkpoint planning.", true);
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: "planCheckpoints",
      sections: sections.map(({ index, isHeading, text }) => ({ index, isHeading, text }))
    },
    (response) => {
      if (chrome.runtime.lastError || response?.error) {
        showStatus(response?.error || "Checkpoint planning failed.", true);
        return;
      }

      response?.plan?.checkpoints?.forEach(({ sectionIndex, reason }, checkpointIndex) => {
        const section = sections.find(({ index }) => index === sectionIndex);
        if (section) {
          addPlaceholder(section.element, checkpointIndex, reason);
        }
      });
      showStatus(`${response?.plan?.checkpoints?.length || 0} checkpoint placeholders added.`);
    }
  );
}

if (isLikelyPdfContext) {
  planPlaceholders();
}
