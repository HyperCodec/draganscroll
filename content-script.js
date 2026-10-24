const isLikelyPdfContext =
  /\.pdf(?:$|[?#])/i.test(window.location.href) ||
  document.contentType === "application/pdf" ||
  Boolean(document.querySelector('embed[type="application/pdf"], object[type="application/pdf"]'));

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function createSection(element, isHeading, text, index) {
  return {
    element,
    index,
    isHeading,
    text: text.slice(0, 1200)
  };
}

function getSections() {
  const sections = [...document.querySelectorAll(
    "h1, h2, h3, h4, p, li, [role='heading'], article, section"
  )]
    .map((element) => ({
      element,
      isHeading: /^H[1-4]$/.test(element.tagName) || element.getAttribute("role") === "heading",
      text: normalizeText(element.innerText || element.textContent || "")
    }))
    .filter(({ isHeading, text }) => isHeading || text.length >= 80);

  if (sections.length >= 2) {
    return sections.map(({ element, isHeading, text }, index) =>
      createSection(element, isHeading, text, index)
    );
  }

  const documentText = document.body?.innerText || document.body?.textContent || "";
  if (normalizeText(documentText).length < 160) {
    return [];
  }

  const chunks = documentText
    .split(/\n\s*\n|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(normalizeText)
    .reduce((result, sentence) => {
      const previous = result.at(-1);
      if (previous && previous.length < 500) {
        result[result.length - 1] = `${previous} ${sentence}`;
      } else {
        result.push(sentence);
      }
      return result;
    }, [])
    .filter((text) => text.length >= 80);

  return chunks.map((text, index) => createSection(document.body, false, text, index));
}

function waitForSections(attempt = 0) {
  const sections = getSections();
  if (sections.length >= 2 || attempt >= 20) {
    return Promise.resolve(sections);
  }

  return new Promise((resolve) => {
    window.setTimeout(() => resolve(waitForSections(attempt + 1)), 500);
  });
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
  if (section.element === document.body) {
    Object.assign(placeholder.style, {
      position: "fixed",
      top: `${16 + index * 58}px`,
      right: "16px"
    });
    document.documentElement.appendChild(placeholder);
  } else {
    section.element.before(placeholder);
  }
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

async function planPlaceholders() {
  if (document.querySelector(".draganscroll-checkpoint-placeholder")) {
    return;
  }

  const sections = await waitForSections();
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "planCurrentDocument") {
    return;
  }

  planPlaceholders()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.error("Unable to plan document checkpoints", error);
      sendResponse({ error: "Checkpoint planning failed." });
    });
  return true;
});

if (isLikelyPdfContext) {
  planPlaceholders();
}
