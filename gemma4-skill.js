const GEMMA4_MODEL = {
  id: "gemma-4-4b-thinking",
  family: "Gemma 4",
  size: "4B",
  mode: "thinking"
};

const CHECKPOINT_TYPES = ["checklist", "multiple_choice", "short_answer"];

const CHECKPOINT_PLANNING_SKILL = `You are the checkpoint planning skill for a reading assistant.
Given an ordered list of document sections, identify the smallest set of boundaries that
separate significant portions of the reading. Prefer boundaries after a major concept,
argument, procedure, or topic transition. Do not create a checkpoint for every heading,
short section, or page. Return JSON only:
{"checkpoints":[{"sectionIndex": number, "reason": string}]}
The sectionIndex must refer to the supplied sections. Do not write questions, answers,
summaries, or study prompts.`;

const CHECKPOINT_GENERATION_SKILL = `You generate reading checkpoints from a bounded portion of a PDF.
Use the current context as the source of truth. The previous summary is only background and must
not introduce facts absent from the current context.

Return JSON only, with exactly one of these shapes:
Checklist:
{"type":"checklist","question":"...","options":["...","..."],"correctAnswers":["..."],"explanation":"..."}
Multiple choice (use this for true/false too):
{"type":"multiple_choice","question":"...","options":["...","..."],"correctAnswers":["..."],"explanation":"..."}
Short answer:
{"type":"short_answer","question":"...","explanation":"..."}

Checklist and multiple_choice correctAnswers must contain only exact strings from options. Include
all correct answers, and make distractors plausible but contradicted by the context. For a true/false
question, options must be exactly ["True","False"] and correctAnswers must contain exactly one of them.
The explanation must explain the answer using the context and should be shown after an incorrect
response. For short_answer, do not provide options or correctAnswers: explanation must be detailed
enough to assess why a reader's response is correct, partially correct, or incorrect. Never invent
information, and prefer one focused question over several loosely related questions.`;

function extractJson(value) {
  const text = String(value || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Gemma did not return checkpoint JSON.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function normalizeCheckpoint(raw) {
  if (!raw || !CHECKPOINT_TYPES.includes(raw.type) || typeof raw.question !== "string") {
    throw new Error("Gemma returned an invalid checkpoint type or question.");
  }
  const checkpoint = {
    type: raw.type,
    question: raw.question.trim(),
    explanation: String(raw.explanation || "").trim()
  };
  if (!checkpoint.question || !checkpoint.explanation) {
    throw new Error("Gemma returned an incomplete checkpoint.");
  }
  if (raw.type === "short_answer") {
    return checkpoint;
  }
  if (!Array.isArray(raw.options) || raw.options.length < 2) {
    throw new Error("Gemma returned too few checkpoint options.");
  }
  const options = [...new Set(raw.options.map((option) => String(option).trim()).filter(Boolean))];
  const correctAnswers = [...new Set(
    (Array.isArray(raw.correctAnswers) ? raw.correctAnswers : [])
      .map((answer) => String(answer).trim())
      .filter((answer) => options.includes(answer))
  )];
  if (options.length < 2 || correctAnswers.length < 1) {
    throw new Error("Gemma returned answers that are not present in the options.");
  }
  if (raw.type === "multiple_choice" &&
      options.length === 2 &&
      options.every((option) => option === "True" || option === "False") &&
      correctAnswers.length !== 1) {
    throw new Error("A true/false checkpoint must have exactly one correct answer.");
  }
  return { ...checkpoint, options, correctAnswers };
}

function buildCheckpointPrompt({ context, previousSummary = "" }) {
  return `${CHECKPOINT_GENERATION_SKILL}

Previous reading summary (optional):
${previousSummary || "(none)"}

Current checkpoint context:
${context}

Generate exactly one checkpoint now.`;
}

function buildSummaryPrompt({ previousSummary = "", context }) {
  return `Compress the following reading context into a factual rolling summary for a later quiz.
Keep important definitions, claims, relationships, procedures, and caveats. Do not add facts.
Return plain text in at most 1200 characters.

Existing summary:
${previousSummary || "(none)"}

New context:
${context}`;
}

async function createTextSession({ onDownloadProgress } = {}) {
  if (!globalThis.LanguageModel) {
    throw new Error("This browser does not expose the Gemma text API.");
  }
  const availability = await LanguageModel.availability({
    expectedInputs: [{ type: "text" }],
    expectedOutputs: [{ type: "text" }]
  });
  if (availability === "unavailable") {
    throw new Error(
      "Gemma text generation is unavailable in this browser. Use a Chrome build with the Prompt API and on-device Gemini Nano enabled."
    );
  }
  if (!["available", "downloadable", "downloading"].includes(availability)) {
    throw new Error(`Gemma text model is not ready (status: ${availability}).`);
  }
  return LanguageModel.create({
    expectedInputs: [{ type: "text" }],
    expectedOutputs: [{ type: "text" }],
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => {
        onDownloadProgress?.(event.loaded, event.total);
      });
    }
  });
}

async function generateCheckpoint(session, input) {
  const response = await session.prompt(buildCheckpointPrompt(input));
  return normalizeCheckpoint(extractJson(response));
}

async function updateReadingSummary(session, input) {
  const response = await session.prompt(buildSummaryPrompt(input));
  return String(response || "").trim().slice(0, 1200);
}

async function evaluateShortAnswer(session, { checkpoint, answer, context }) {
  const response = await session.prompt(`Evaluate a reader's short answer using only the source context.
Give a detailed, encouraging explanation of what is correct, partially correct, or incorrect,
and state the key details the reader should remember. Do not assign a numeric score.

Question:
${checkpoint.question}

Generated answer guidance:
${checkpoint.explanation}

Source context:
${context}

Reader answer:
${answer}`);
  return String(response || "").trim();
}

function planCheckpointsWithHeuristics(sections) {
  if (sections.length < 2) {
    return [];
  }

  const targetCount = Math.max(1, Math.min(8, Math.round(Math.sqrt(sections.length))));
  const headingIndexes = sections
    .map((section, index) => (section.isHeading ? index : -1))
    .filter((index) => index > 0);
  const candidates = [...new Set([...headingIndexes, ...Array.from(
    { length: targetCount },
    (_, index) => Math.round((sections.length / (targetCount + 1)) * (index + 1))
  )])]
    .filter((index) => index > 0 && index < sections.length)
    .sort((left, right) => left - right);
  const checkpoints = [];

  for (const candidate of candidates) {
    const sectionIndex = sections[candidate].index;
    if (checkpoints.at(-1)?.sectionIndex === sectionIndex) {
      continue;
    }
    checkpoints.push({
      sectionIndex,
      reason: "Planned boundary between significant reading portions."
    });
    if (checkpoints.length === targetCount) {
      break;
    }
  }

  return checkpoints;
}

function planCheckpoints(sections) {
  // The model adapter is intentionally isolated so a local Gemma 4 runtime can be
  // connected without changing checkpoint placement or rendering.
  return Promise.resolve({
    model: GEMMA4_MODEL,
    skill: CHECKPOINT_PLANNING_SKILL,
    checkpoints: planCheckpointsWithHeuristics(sections)
  });
}

export {
  CHECKPOINT_PLANNING_SKILL,
  CHECKPOINT_GENERATION_SKILL,
  CHECKPOINT_TYPES,
  GEMMA4_MODEL,
  buildCheckpointPrompt,
  buildSummaryPrompt,
  createTextSession,
  evaluateShortAnswer,
  generateCheckpoint,
  normalizeCheckpoint,
  planCheckpoints,
  updateReadingSummary
};
