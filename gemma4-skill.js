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

Return JSON only, with exactly one of these shapes. A checkpoint must contain 1 to 5 questions:
Checklist:
{"type":"checklist","questions":[{"question":"...","options":["...","..."],"correctAnswers":["..."],"explanation":"..."}]}
Multiple choice (use this for true/false too):
{"type":"multiple_choice","questions":[{"question":"...","options":["...","..."],"correctAnswers":["..."],"explanation":"..."}]}
Short answer:
{"type":"short_answer","questions":[{"question":"...","explanation":"..."}]}

Checklist and multiple_choice correctAnswers must contain only exact strings from options. Include
all correct answers, and make distractors plausible but contradicted by the context. For a true/false
question, options must be exactly ["True","False"] and correctAnswers must contain exactly one of them.
The explanation must explain the answer using the context and should be shown after an incorrect
response. For short_answer, do not provide options or correctAnswers: explanation must be detailed
enough to assess why a reader's response is correct, partially correct, or incorrect. Never invent
information, and prefer one focused question over several loosely related questions.`;

const CONTENT_FOCUS_INSTRUCTIONS = `Focus on understanding the content, not merely its tone or
style. Ask about concrete events, claims, evidence, definitions, mechanisms, relationships,
causes and effects, procedures, or what a character/person does and why. Do not ask about tone,
mood, genre, writing style, or authorial voice unless the context explicitly makes that the subject.
All question text, options, answers, and explanations must be in English.`;

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
  if (!raw || !CHECKPOINT_TYPES.includes(raw.type)) {
    throw new Error("Gemma returned an invalid checkpoint type or question.");
  }
  const questions = Array.isArray(raw.questions)
    ? raw.questions
    : [{ question: raw.question, options: raw.options, correctAnswers: raw.correctAnswers, explanation: raw.explanation }];
  if (questions.length < 1 || questions.length > 5) {
    throw new Error("Gemma must return between 1 and 5 checkpoint questions.");
  }
  return {
    type: raw.type,
    questions: questions.map((rawQuestion) => {
      const question = String(rawQuestion?.question || "").trim();
      const explanation = String(rawQuestion?.explanation || "").trim();
      if (!question || !explanation) {
        throw new Error("Gemma returned an incomplete checkpoint question.");
      }
      const generatedText = `${question} ${explanation}`;
      if (/[\u3400-\u9fff\u3040-\u30ff\u0400-\u04ff]/u.test(generatedText)) {
        throw new Error("Gemma returned checkpoint content in a non-English script.");
      }
      if (raw.type === "short_answer") {
        return { question, explanation };
      }
      if (!Array.isArray(rawQuestion.options) || rawQuestion.options.length < 2) {
        throw new Error("Gemma returned too few checkpoint options.");
      }
      const options = [...new Set(rawQuestion.options.map((option) => String(option).trim()).filter(Boolean))];
      const correctAnswers = [...new Set(
        (Array.isArray(rawQuestion.correctAnswers) ? rawQuestion.correctAnswers : [])
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
      if (/[\u3400-\u9fff\u3040-\u30ff\u0400-\u04ff]/u.test(options.join(" "))) {
        throw new Error("Gemma returned checkpoint content in a non-English script.");
      }
      return { question, options, correctAnswers, explanation };
    })
  };
}

function buildCheckpointPrompt({ context, previousSummary = "" }) {
  return `${CHECKPOINT_GENERATION_SKILL}
  ${CONTENT_FOCUS_INSTRUCTIONS}

Previous reading summary (optional):
${previousSummary || "(none)"}

Current checkpoint context:
${context}

Generate exactly one checkpoint now, with 1 to 5 focused questions.`;
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
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }]
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
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => {
        onDownloadProgress?.(event.loaded, event.total);
      });
    }
  });
}

async function generateCheckpoint(session, input) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await session.prompt(
        `${buildCheckpointPrompt(input)}
${attempt ? `\nCorrection required: ${lastError.message} Return a new English content-focused checkpoint.` : ""}`
      );
      return normalizeCheckpoint(extractJson(response));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function updateReadingSummary(session, input) {
  const response = await session.prompt(buildSummaryPrompt(input));
  return String(response || "").trim().slice(0, 1200);
}

async function evaluateShortAnswer(session, { checkpoint, answer, context }) {
  const response = await session.prompt(`Evaluate the reader's answer against the exact question and source context.
Be direct and concise. Decide whether the answer addresses what the question asks, not whether it
contains a merely true but irrelevant fact. Explain the specific missing or incorrect detail and
give the answer supported by the context. Do not praise irrelevant facts, invent facts, or assign
a numeric score.
Return plain text only: no Markdown, no headings, no bullets, no bold or italic markers, and no
special formatting. Use at most 4 short sentences.

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
