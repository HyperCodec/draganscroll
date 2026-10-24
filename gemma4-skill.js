const GEMMA4_MODEL = {
  id: "gemma-4-4b-thinking",
  family: "Gemma 4",
  size: "4B",
  mode: "thinking"
};

const CHECKPOINT_PLANNING_SKILL = `You are the checkpoint planning skill for a reading assistant.
Given an ordered list of document sections, identify the smallest set of boundaries that
separate significant portions of the reading. Prefer boundaries after a major concept,
argument, procedure, or topic transition. Do not create a checkpoint for every heading,
short section, or page. Return JSON only:
{"checkpoints":[{"sectionIndex": number, "reason": string}]}
The sectionIndex must refer to the supplied sections. Do not write questions, answers,
summaries, or study prompts.`;

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
  GEMMA4_MODEL,
  planCheckpoints
};
