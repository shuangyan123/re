# AI Tutor Judge v0.1

This document records the implementation boundary for the attached `AI Tutor Judge — System Prompt v0.1`.

## Implemented

- The canonical prompt is stored at [prompts/ai-tutor-judge-system-v0.1.md](../prompts/ai-tutor-judge-system-v0.1.md).
- `AiTutorJudgeInput` preserves the nine prompt input blocks, including empty strings and an explicitly nullable `case_rubric`; validators do not infer missing background.
- `AiTutorJudgeResult` preserves independent scores, critical-failure evidence, rubric results, answer leakage, overhelping, strengths, weaknesses, recommended improvement, and confidence.
- Result validation enforces score range `0..5`, confidence range `0..1`, valid failure/rubric enums, the explicit pedagogy formula, and the quality gate rule.
- `Correctness` and `Critical Failure` gates cannot be offset by a high pedagogy score.

## Deliberate non-goals

This layer does not call OpenAI, Gemini, Anthropic, Ollama, or any other model; it does not persist raw provider payloads or hidden reasoning; it does not perform pairwise evaluation, human calibration, statistical analysis, or claim that a judge score proves learning impact.

The prompt's deterministic-looking output schema is a contract for validating a future judge response. It is not itself evidence that the response is correct. A future provider adapter must remain outside the core contracts and must be authorized as a separate phase.
