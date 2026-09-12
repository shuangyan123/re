import { createHash } from "node:crypto";

import {
  CALIBRATION_CONTRACT_SCHEMA_VERSION,
  type CalibrationAnnotationDataKind,
  type CalibrationAnnotationFile,
  type CalibrationCandidateDataKind,
  type CalibrationCandidateResponseFile,
  type CalibrationLabel,
  type CalibrationPacket,
  type SyntheticFixtureMarker,
} from "../contracts/calibration.js";
import {
  parseCalibrationAnnotationFile,
  parseCalibrationCandidateResponseFile,
} from "../contracts/calibration-validation.js";
import { BenchmarkConfigurationError } from "../contracts/errors.js";
import { TUTOR_EVAL_DATASET_ID } from "../contracts/tutor-eval.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import { buildCalibrationPacket } from "./packet.js";

export const CANONICAL_CALIBRATION_PILOT_ID =
  "canonical-tutoreval-human-calibration-pilot-001" as const;
export const CANONICAL_CALIBRATION_PILOT_VERSION = "0.1.0" as const;
export const CANONICAL_CALIBRATION_PILOT_DATASET_VERSION = "0.2a.6" as const;
export const CANONICAL_CALIBRATION_PILOT_GUIDE_ID =
  "canonical-tutoreval-rubric-annotation-guide" as const;
export const CANONICAL_CALIBRATION_PILOT_GUIDE_VERSION = "0.1.0" as const;
export const CANONICAL_CALIBRATION_PILOT_SUBMISSION_KIND =
  "canonical-tutoreval-calibration-pilot-submission" as const;

export const CANONICAL_CALIBRATION_PILOT_ANNOTATION_GUIDE = `# Canonical TutorEval Human Calibration Pilot — Annotation Guide

Guide identity: canonical-tutoreval-rubric-annotation-guide@0.1.0

Judge each rubric independently against the visible case, the candidate Tutor
response, and only the reviewer context supplied with that rubric.

Do not give the Tutor response one overall grade and copy it to every rubric.
Do not consult another reviewer, Judge output, developer expected labels,
provider/model identity, prior annotations, or adjudication.

Allowed labels:

## PASS

Use PASS when the candidate response substantially satisfies every material
requirement in the rubric criterion and does not explicitly conflict with a
material requirement. Equivalent wording or a different sound teaching
strategy is acceptable; exact lexical matching is not required.

For a prohibited rubric written as "Do not ...", PASS means the response
respects that prohibition.

## PARTIAL

Use PARTIAL when the core direction is substantially correct and at least one
material requirement is satisfied, but another material requirement is
omitted, ambiguous, weakly executed, or otherwise incomplete without a clear
substantive conflict.

Do not use PARTIAL to hide an explicit contradiction merely because another
part of the response is helpful.

## FAIL

Use FAIL when the response does not meaningfully satisfy the core of the
criterion, or when it explicitly asserts, recommends, performs, or concludes
something materially incompatible with the criterion.

For a prohibited rubric written as "Do not ...", a clear occurrence of the
prohibited behavior is ordinarily FAIL.

## UNSURE

UNSURE is not a fourth score between PARTIAL and FAIL. Use it only when the
packet evidence or rubric wording does not let you make a reliable rubric-level
judgment. When you choose UNSURE, set ambiguity.present to true and briefly
state why.

## Rubric independence

Evaluate only the rubric currently shown. A response may PASS one rubric and
FAIL another. Correctness does not automatically imply good diagnosis,
guidance, adaptation, or actionability. Likewise, one failure must not be
propagated to unrelated rubrics.

## Disclosure policies

Use a disclosure policy only when it appears in the reviewer context for the
rubric. Judge the criterion as written and preserve the case-specific learner
work boundary. A complete answer is not globally good or bad: it can violate a
hint-only prohibition and still be allowed or required in a full-solution
case.

## Evidence and ambiguity

Evidence is optional and must be short, observable, and grounded in the
candidate Tutor response. Do not provide hidden reasoning or speculate about
intent.

If ambiguity.present is true, give a short reason. Ambiguity is a reviewer QA
signal; it does not replace the selected label except when the reviewer must
use UNSURE because a reliable label cannot be assigned.
` as const;

export const CANONICAL_CALIBRATION_PILOT_REVIEWER_INSTRUCTIONS = `# Reviewer Instructions

1. Read ANNOTATION_GUIDE.md before rating.
2. Open review-packet.json and judge every entry independently.
3. Copy submission-template.json to a separate completed file before editing.
4. Set completedAt once using an ISO-8601 timestamp.
5. For every annotation slot, replace the empty label with PASS, PARTIAL, FAIL,
   or UNSURE. Optional evidence must be brief and based only on the visible
   candidate response.
6. If you use UNSURE, set ambiguity.present to true and provide a short reason.
7. Do not change case, response, rubric, reviewer, dataset, guide, or
   fingerprint identity fields.
8. Do not consult another reviewer, Judge output, provider/model metadata,
   developer expected labels, previous annotations, or adjudication.
9. Return only your completed submission file through the agreed private
   channel. Do not exchange completed files with the other reviewer before both
   independent submissions are finished.

The response stimuli in this pilot are fixed, developer-authored synthetic
examples. Your judgments are human annotations of those examples; they are not
model-performance evidence and do not by themselves establish calibration.
` as const;

const syntheticFixture: SyntheticFixtureMarker = Object.freeze({
  synthetic: true,
  notHumanCalibrationData: true,
});

interface CanonicalPilotCaseSpec {
  readonly caseId: string;
  readonly caseVersion: string;
}

export const CANONICAL_CALIBRATION_PILOT_CASES: readonly CanonicalPilotCaseSpec[] =
  Object.freeze([
    { caseId: "fraction-misconception-001", caseVersion: "1.2.0" },
    { caseId: "fraction-misconception-001-zh-CN", caseVersion: "1.2.0" },
    { caseId: "correct-answer-wrong-reasoning-001", caseVersion: "1.1.0" },
    { caseId: "science-force-transfer-001", caseVersion: "1.0.0" },
    { caseId: "science-density-knowledge-001", caseVersion: "1.0.0" },
    { caseId: "language-verb-check-001", caseVersion: "1.0.1" },
    { caseId: "language-word-context-001", caseVersion: "1.1.1" },
    { caseId: "history-source-bias-001", caseVersion: "1.0.0" },
    { caseId: "programming-function-recall-001", caseVersion: "1.0.0" },
  ]);

interface CanonicalPilotResponseSpec extends CanonicalPilotCaseSpec {
  readonly responseId: string;
  readonly responseText: string;
}

const responseSpecs: readonly CanonicalPilotResponseSpec[] = Object.freeze([
  {
    responseId: "canonical-pilot-01-fraction-en-A",
    caseId: "fraction-misconception-001",
    caseVersion: "1.2.0",
    responseText:
      "You're adding the denominators directly. Thirds and fourths are different-sized fraction units, so rewrite them in compatible units first. What common denominator could you use?",
  },
  {
    responseId: "canonical-pilot-01-fraction-en-B",
    caseId: "fraction-misconception-001",
    caseVersion: "1.2.0",
    responseText:
      "The denominator step is the issue: don't add 3 and 4 directly. Look for a common denominator first. What common denominator could you use?",
  },
  {
    responseId: "canonical-pilot-01-fraction-en-C",
    caseId: "fraction-misconception-001",
    caseVersion: "1.2.0",
    responseText:
      "You're adding the denominators directly. Thirds and fourths are different-sized units, so use a common denominator. The answer is 7/12. Try checking it.",
  },
  {
    responseId: "canonical-pilot-02-fraction-zh-CN-A",
    caseId: "fraction-misconception-001-zh-CN",
    caseVersion: "1.2.0",
    responseText:
      "问题在于你把分母直接相加了。三分之一和四分之一对应的分数单位大小不同，所以要先改写成可以直接相加的相同单位。你能先找一个公分母吗？",
  },
  {
    responseId: "canonical-pilot-02-fraction-zh-CN-B",
    caseId: "fraction-misconception-001-zh-CN",
    caseVersion: "1.2.0",
    responseText:
      "问题在于你把分母直接相加了。先不要算 3+4，而是先找公分母。你能找出一个公分母吗？",
  },
  {
    responseId: "canonical-pilot-02-fraction-zh-CN-C",
    caseId: "fraction-misconception-001-zh-CN",
    caseVersion: "1.2.0",
    responseText:
      "问题在于你把分母直接相加了。三分之一和四分之一的分数单位大小不同，所以要先通分。最后答案是 7/12。你再检查一下。",
  },
  {
    responseId: "canonical-pilot-03-wrong-reasoning-A",
    caseId: "correct-answer-wrong-reasoning-001",
    caseVersion: "1.1.0",
    responseText:
      "12 is the correct product, but the reasoning doesn't represent multiplication. Think of 3 x 4 as three groups of four, or 4 + 4 + 4. Can you show those equal groups?",
  },
  {
    responseId: "canonical-pilot-03-wrong-reasoning-B",
    caseId: "correct-answer-wrong-reasoning-001",
    caseVersion: "1.1.0",
    responseText: "Yes, 12 is correct. Nice job getting the answer.",
  },
  {
    responseId: "canonical-pilot-03-wrong-reasoning-C",
    caseId: "correct-answer-wrong-reasoning-001",
    caseVersion: "1.1.0",
    responseText:
      "Your reasoning works: 3 + 4 = 7 and adding 5 more is a valid way to explain why 3 x 4 = 12.",
  },
  {
    responseId: "canonical-pilot-04-force-transfer-A",
    caseId: "science-force-transfer-001",
    caseVersion: "1.0.0",
    responseText:
      "Yes. This is the same balanced-forces idea you used before: gravity pulls the book down while the table pushes up with equal magnitude. Can you name those two opposing forces?",
  },
  {
    responseId: "canonical-pilot-04-force-transfer-B",
    caseId: "science-force-transfer-001",
    caseVersion: "1.0.0",
    responseText: "Yes, the forces are balanced because the book is resting.",
  },
  {
    responseId: "canonical-pilot-04-force-transfer-C",
    caseId: "science-force-transfer-001",
    caseVersion: "1.0.0",
    responseText: "No. Because the book is not moving, no forces are acting on it.",
  },
  {
    responseId: "canonical-pilot-05-density-A",
    caseId: "science-density-knowledge-001",
    caseVersion: "1.0.0",
    responseText:
      "Density tells how much mass is packed into a given volume—the relationship between mass and volume. If two objects have the same volume, which would be denser: the one with more mass or less mass?",
  },
  {
    responseId: "canonical-pilot-05-density-B",
    caseId: "science-density-knowledge-001",
    caseVersion: "1.0.0",
    responseText:
      "Density relates mass to volume: it tells you how much mass there is for a given volume.",
  },
  {
    responseId: "canonical-pilot-05-density-C",
    caseId: "science-density-knowledge-001",
    caseVersion: "1.0.0",
    responseText:
      "Density measures how heavy something feels, regardless of its volume. Which object around you feels heaviest?",
  },
  {
    responseId: "canonical-pilot-06-verb-check-A",
    caseId: "language-verb-check-001",
    caseVersion: "1.0.1",
    responseText:
      "The sentence needs correction. The subject is the singular noun 'list', so the verb should be 'is': 'The list of examples is on the page.' Reread it and check which noun controls the verb.",
  },
  {
    responseId: "canonical-pilot-06-verb-check-B",
    caseId: "language-verb-check-001",
    caseVersion: "1.0.1",
    responseText: "The list of examples is on the page.",
  },
  {
    responseId: "canonical-pilot-06-verb-check-C",
    caseId: "language-verb-check-001",
    caseVersion: "1.0.1",
    responseText:
      "The sentence is correct because 'examples' is plural, so 'are' agrees with the nearest noun.",
  },
  {
    responseId: "canonical-pilot-07-word-context-A",
    caseId: "language-word-context-001",
    caseVersion: "1.1.1",
    responseText:
      "Your guess 'unsure' is plausible, but the pause before agreeing more directly supports hesitation or reluctance. That one clue alone cannot tell us exactly whether the character is uncertain or unwilling. Which words or actions in the sentence are your strongest clue?",
  },
  {
    responseId: "canonical-pilot-07-word-context-B",
    caseId: "language-word-context-001",
    caseVersion: "1.1.1",
    responseText:
      "The pause before agreeing shows hesitation. Look for another clue in the sentence.",
  },
  {
    responseId: "canonical-pilot-07-word-context-C",
    caseId: "language-word-context-001",
    caseVersion: "1.1.1",
    responseText:
      "The pause proves that reluctant means unwilling here, so your guess 'unsure' is simply wrong. Which phrase shows the pause?",
  },
  {
    responseId: "canonical-pilot-08-source-bias-A",
    caseId: "history-source-bias-001",
    caseVersion: "1.0.0",
    responseText:
      "Listing dates does not make a source automatically unbiased. A participant's perspective and purpose can shape which facts are selected and how they are framed. Record who the author was and what political goal they had, then use that when interpreting the source.",
  },
  {
    responseId: "canonical-pilot-08-source-bias-B",
    caseId: "history-source-bias-001",
    caseVersion: "1.0.0",
    responseText: "It may still be biased. Check who wrote it and why.",
  },
  {
    responseId: "canonical-pilot-08-source-bias-C",
    caseId: "history-source-bias-001",
    caseVersion: "1.0.0",
    responseText:
      "Yes. Because it lists factual dates, the source is objective and the author's political purpose does not matter. Write down the dates as your reliability check.",
  },
  {
    responseId: "canonical-pilot-09-function-recall-A",
    caseId: "programming-function-recall-001",
    caseVersion: "1.0.0",
    responseText:
      "An argument is a value you pass into a function; a return value is what the function sends back after it runs. For example, double(3) takes 3 as the argument and might return 6. In that example, label the input and the returned value.",
  },
  {
    responseId: "canonical-pilot-09-function-recall-B",
    caseId: "programming-function-recall-001",
    caseVersion: "1.0.0",
    responseText:
      "An argument is an input to a function, while a return value is the output it gives back.",
  },
  {
    responseId: "canonical-pilot-09-function-recall-C",
    caseId: "programming-function-recall-001",
    caseVersion: "1.0.0",
    responseText:
      "A return value is what you pass into a function, and an argument is what the function sends back. For example, double(3) returns 3 as its argument. Can you label the input and output?",
  },
]);

export interface CanonicalCalibrationPilotManifestCase {
  readonly caseId: string;
  readonly caseVersion: string;
  readonly locale: string;
  readonly subject: string;
  readonly disclosurePolicy: string;
  readonly rubricCount: number;
}

export interface CanonicalCalibrationPilotManifest {
  readonly schemaVersion: 1;
  readonly pilotId: typeof CANONICAL_CALIBRATION_PILOT_ID;
  readonly pilotVersion: typeof CANONICAL_CALIBRATION_PILOT_VERSION;
  readonly datasetId: typeof TUTOR_EVAL_DATASET_ID;
  readonly datasetVersion: typeof CANONICAL_CALIBRATION_PILOT_DATASET_VERSION;
  readonly annotationGuideId: typeof CANONICAL_CALIBRATION_PILOT_GUIDE_ID;
  readonly annotationGuideVersion: typeof CANONICAL_CALIBRATION_PILOT_GUIDE_VERSION;
  readonly annotationGuideFingerprint: string;
  readonly taskSetFingerprint: string;
  readonly stimulusProvenance: "developer-authored-synthetic";
  readonly humanCalibrationDataPresent: false;
  readonly caseCount: 9;
  readonly responseCount: 27;
  readonly rubricJudgmentCountPerReviewer: 84;
  readonly reviewerCount: 2;
  readonly selectedCases: readonly CanonicalCalibrationPilotManifestCase[];
}

export interface CanonicalCalibrationPilotSubmissionSlot {
  readonly entryId: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly responseId: string;
  readonly rubricId: string;
  readonly label: "" | CalibrationLabel;
  readonly evidence: string;
  readonly ambiguity: {
    readonly present: boolean;
    readonly reason: string;
  };
}

export interface CanonicalCalibrationPilotSubmissionTemplate {
  readonly schemaVersion: 1;
  readonly kind: typeof CANONICAL_CALIBRATION_PILOT_SUBMISSION_KIND;
  readonly pilotId: typeof CANONICAL_CALIBRATION_PILOT_ID;
  readonly pilotVersion: typeof CANONICAL_CALIBRATION_PILOT_VERSION;
  readonly datasetId: typeof TUTOR_EVAL_DATASET_ID;
  readonly datasetVersion: typeof CANONICAL_CALIBRATION_PILOT_DATASET_VERSION;
  readonly taskSetFingerprint: string;
  readonly annotationGuideId: typeof CANONICAL_CALIBRATION_PILOT_GUIDE_ID;
  readonly annotationGuideVersion: typeof CANONICAL_CALIBRATION_PILOT_GUIDE_VERSION;
  readonly annotationGuideFingerprint: string;
  readonly reviewerId: string;
  readonly dataKind: CalibrationAnnotationDataKind;
  readonly fixture?: SyntheticFixtureMarker;
  readonly completedAt: string;
  readonly annotations: readonly CanonicalCalibrationPilotSubmissionSlot[];
}

export interface CanonicalCalibrationPilotBundle {
  readonly manifest: CanonicalCalibrationPilotManifest;
  readonly candidates: CalibrationCandidateResponseFile;
  readonly packet: CalibrationPacket;
  readonly templates: readonly CanonicalCalibrationPilotSubmissionTemplate[];
  readonly annotationGuide: typeof CANONICAL_CALIBRATION_PILOT_ANNOTATION_GUIDE;
  readonly reviewerInstructions: typeof CANONICAL_CALIBRATION_PILOT_REVIEWER_INSTRUCTIONS;
}

type UnknownRecord = Record<string, unknown>;

function invalid(
  code: "calibration_data_invalid" | "calibration_annotation_invalid" = "calibration_data_invalid",
): never {
  throw new BenchmarkConfigurationError(code);
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function opaqueReviewerId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(value) &&
    !value.includes("@");
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    !Number.isNaN(Date.parse(value));
}

function fingerprintJson(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex")}`;
}

function fingerprintText(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function candidateDataKindForAnnotationKind(
  dataKind: CalibrationAnnotationDataKind,
): CalibrationCandidateDataKind {
  return dataKind === "synthetic-fixture" ? "synthetic-fixture" : "candidate-corpus";
}

function buildCandidates(
  dataKind: CalibrationCandidateDataKind,
): CalibrationCandidateResponseFile {
  return parseCalibrationCandidateResponseFile({
    schemaVersion: CALIBRATION_CONTRACT_SCHEMA_VERSION,
    dataKind,
    ...(dataKind === "synthetic-fixture" ? { fixture: syntheticFixture } : {}),
    datasetId: TUTOR_EVAL_DATASET_ID,
    datasetVersion: CANONICAL_CALIBRATION_PILOT_DATASET_VERSION,
    responses: responseSpecs.map((response) => ({
      schemaVersion: CALIBRATION_CONTRACT_SCHEMA_VERSION,
      responseId: response.responseId,
      datasetId: TUTOR_EVAL_DATASET_ID,
      datasetVersion: CANONICAL_CALIBRATION_PILOT_DATASET_VERSION,
      caseId: response.caseId,
      caseVersion: response.caseVersion,
      responseText: response.responseText,
      provenance: "synthetic" as const,
    })),
  });
}

async function buildCore(
  candidateDataKind: CalibrationCandidateDataKind,
): Promise<{
  readonly manifest: CanonicalCalibrationPilotManifest;
  readonly candidates: CalibrationCandidateResponseFile;
  readonly packet: CalibrationPacket;
}> {
  const dataset = await loadTutorEvalDataset(
    TUTOR_EVAL_DATASET_ID,
    CANONICAL_CALIBRATION_PILOT_DATASET_VERSION,
  );
  if (
    dataset.id !== TUTOR_EVAL_DATASET_ID ||
    dataset.version !== CANONICAL_CALIBRATION_PILOT_DATASET_VERSION
  ) {
    return invalid();
  }

  const selectedCases = CANONICAL_CALIBRATION_PILOT_CASES.map((expected) => {
    const caseValue = dataset.cases.find((candidate) => candidate.id === expected.caseId);
    if (caseValue === undefined || caseValue.version !== expected.caseVersion) {
      return invalid();
    }
    return caseValue;
  });
  if (new Set(selectedCases.map((caseValue) => caseValue.id)).size !== 9) {
    return invalid();
  }
  const selectedIds = new Set(selectedCases.map((caseValue) => caseValue.id));
  if (
    responseSpecs.length !== 27 ||
    responseSpecs.some((response) => !selectedIds.has(response.caseId)) ||
    CANONICAL_CALIBRATION_PILOT_CASES.some((caseSpec) =>
      responseSpecs.filter((response) => response.caseId === caseSpec.caseId).length !== 3,
    )
  ) {
    return invalid();
  }

  const candidates = buildCandidates(candidateDataKind);
  const packet = buildCalibrationPacket(dataset, candidates);
  if (packet.entries.length !== 84) {
    return invalid();
  }

  const categorySet = new Set<string>(packet.entries.map((entry) => entry.rubric.category));
  if (
    ["correctness", "diagnosis", "guidance", "adaptation", "actionability"]
      .some((category) => !categorySet.has(category))
  ) {
    return invalid();
  }
  const disclosureSet = new Set<string>(
    selectedCases.map((caseValue) => caseValue.evaluatorOnly.disclosurePolicy),
  );
  if (
    [
      "no_answer",
      "hint_only",
      "partial_solution",
      "full_solution_allowed",
      "full_solution_required",
    ].some((policy) => !disclosureSet.has(policy))
  ) {
    return invalid();
  }
  const subjectSet = new Set<string>(selectedCases.map((caseValue) => caseValue.metadata.subject));
  if (
    [
      "mathematics",
      "science",
      "language",
      "history_or_social_studies",
      "programming",
    ].some((subject) => !subjectSet.has(subject))
  ) {
    return invalid();
  }

  const annotationGuideFingerprint = fingerprintText(
    CANONICAL_CALIBRATION_PILOT_ANNOTATION_GUIDE,
  );
  const taskSetFingerprint = fingerprintJson({
    pilotId: CANONICAL_CALIBRATION_PILOT_ID,
    pilotVersion: CANONICAL_CALIBRATION_PILOT_VERSION,
    datasetId: TUTOR_EVAL_DATASET_ID,
    datasetVersion: CANONICAL_CALIBRATION_PILOT_DATASET_VERSION,
    entries: packet.entries,
  });
  const manifest: CanonicalCalibrationPilotManifest = {
    schemaVersion: 1,
    pilotId: CANONICAL_CALIBRATION_PILOT_ID,
    pilotVersion: CANONICAL_CALIBRATION_PILOT_VERSION,
    datasetId: TUTOR_EVAL_DATASET_ID,
    datasetVersion: CANONICAL_CALIBRATION_PILOT_DATASET_VERSION,
    annotationGuideId: CANONICAL_CALIBRATION_PILOT_GUIDE_ID,
    annotationGuideVersion: CANONICAL_CALIBRATION_PILOT_GUIDE_VERSION,
    annotationGuideFingerprint,
    taskSetFingerprint,
    stimulusProvenance: "developer-authored-synthetic",
    humanCalibrationDataPresent: false,
    caseCount: 9,
    responseCount: 27,
    rubricJudgmentCountPerReviewer: 84,
    reviewerCount: 2,
    selectedCases: selectedCases.map((caseValue) => ({
      caseId: caseValue.id,
      caseVersion: caseValue.version,
      locale: caseValue.locale ?? "en",
      subject: caseValue.metadata.subject,
      disclosurePolicy: caseValue.evaluatorOnly.disclosurePolicy,
      rubricCount: caseValue.evaluatorOnly.rubrics.length,
    })),
  };
  return { manifest, candidates, packet };
}

function buildTemplate(
  manifest: CanonicalCalibrationPilotManifest,
  packet: CalibrationPacket,
  reviewerId: string,
  dataKind: CalibrationAnnotationDataKind,
): CanonicalCalibrationPilotSubmissionTemplate {
  if (!opaqueReviewerId(reviewerId)) {
    return invalid();
  }
  return {
    schemaVersion: 1,
    kind: CANONICAL_CALIBRATION_PILOT_SUBMISSION_KIND,
    pilotId: CANONICAL_CALIBRATION_PILOT_ID,
    pilotVersion: CANONICAL_CALIBRATION_PILOT_VERSION,
    datasetId: TUTOR_EVAL_DATASET_ID,
    datasetVersion: CANONICAL_CALIBRATION_PILOT_DATASET_VERSION,
    taskSetFingerprint: manifest.taskSetFingerprint,
    annotationGuideId: CANONICAL_CALIBRATION_PILOT_GUIDE_ID,
    annotationGuideVersion: CANONICAL_CALIBRATION_PILOT_GUIDE_VERSION,
    annotationGuideFingerprint: manifest.annotationGuideFingerprint,
    reviewerId,
    dataKind,
    ...(dataKind === "synthetic-fixture" ? { fixture: syntheticFixture } : {}),
    completedAt: "",
    annotations: packet.entries.map((entry) => ({
      entryId: entry.entryId,
      caseId: entry.caseId,
      caseVersion: entry.caseVersion,
      responseId: entry.responseId,
      rubricId: entry.rubric.rubricId,
      label: "" as const,
      evidence: "",
      ambiguity: {
        present: false,
        reason: "",
      },
    })),
  };
}

export async function buildCanonicalCalibrationPilotBundle(
  reviewerIds: readonly string[],
  annotationDataKind: CalibrationAnnotationDataKind = "human-annotation",
): Promise<CanonicalCalibrationPilotBundle> {
  if (
    reviewerIds.length !== 2 ||
    new Set(reviewerIds).size !== 2 ||
    reviewerIds.some((reviewerId) => !opaqueReviewerId(reviewerId))
  ) {
    return invalid();
  }
  const core = await buildCore(candidateDataKindForAnnotationKind(annotationDataKind));
  return {
    ...core,
    templates: reviewerIds.map((reviewerId) =>
      buildTemplate(core.manifest, core.packet, reviewerId, annotationDataKind),
    ),
    annotationGuide: CANONICAL_CALIBRATION_PILOT_ANNOTATION_GUIDE,
    reviewerInstructions: CANONICAL_CALIBRATION_PILOT_REVIEWER_INSTRUCTIONS,
  };
}

function immutableTemplateFieldsMatch(
  expected: CanonicalCalibrationPilotSubmissionTemplate,
  submission: UnknownRecord,
): boolean {
  const immutableKeys = [
    "schemaVersion",
    "kind",
    "pilotId",
    "pilotVersion",
    "datasetId",
    "datasetVersion",
    "taskSetFingerprint",
    "annotationGuideId",
    "annotationGuideVersion",
    "annotationGuideFingerprint",
    "reviewerId",
    "dataKind",
  ] as const;
  if (immutableKeys.some((key) => submission[key] !== expected[key])) {
    return false;
  }
  if (expected.fixture === undefined) {
    return submission.fixture === undefined;
  }
  return sameJson(submission.fixture, expected.fixture);
}

function exactKeys(record: UnknownRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export async function importCanonicalCalibrationPilotSubmission(
  templateValue: unknown,
  submissionValue: unknown,
): Promise<CalibrationAnnotationFile> {
  const templateRecord = asRecord(templateValue);
  if (templateRecord === null || !opaqueReviewerId(templateRecord.reviewerId)) {
    return invalid("calibration_annotation_invalid");
  }
  const dataKind = templateRecord.dataKind;
  if (dataKind !== "human-annotation" && dataKind !== "synthetic-fixture") {
    return invalid("calibration_annotation_invalid");
  }
  const validationPeer = templateRecord.reviewerId === "pilot-validation-peer"
    ? "pilot-validation-peer-2"
    : "pilot-validation-peer";
  const bundle = await buildCanonicalCalibrationPilotBundle(
    [templateRecord.reviewerId, validationPeer],
    dataKind,
  );
  const expectedTemplate = bundle.templates[0];
  if (expectedTemplate === undefined || !sameJson(templateValue, expectedTemplate)) {
    return invalid("calibration_annotation_invalid");
  }

  const submission = asRecord(submissionValue);
  if (
    submission === null ||
    !exactKeys(
      submission,
      expectedTemplate.fixture === undefined
        ? [
            "schemaVersion",
            "kind",
            "pilotId",
            "pilotVersion",
            "datasetId",
            "datasetVersion",
            "taskSetFingerprint",
            "annotationGuideId",
            "annotationGuideVersion",
            "annotationGuideFingerprint",
            "reviewerId",
            "dataKind",
            "completedAt",
            "annotations",
          ]
        : [
            "schemaVersion",
            "kind",
            "pilotId",
            "pilotVersion",
            "datasetId",
            "datasetVersion",
            "taskSetFingerprint",
            "annotationGuideId",
            "annotationGuideVersion",
            "annotationGuideFingerprint",
            "reviewerId",
            "dataKind",
            "fixture",
            "completedAt",
            "annotations",
          ],
    ) ||
    !immutableTemplateFieldsMatch(expectedTemplate, submission) ||
    !validTimestamp(submission.completedAt) ||
    !Array.isArray(submission.annotations) ||
    submission.annotations.length !== expectedTemplate.annotations.length
  ) {
    return invalid("calibration_annotation_invalid");
  }

  const labels = new Set<CalibrationLabel>(["PASS", "PARTIAL", "FAIL", "UNSURE"]);
  const completedAt = submission.completedAt;
  const annotations = submission.annotations.map((value, index) => {
    const slot = asRecord(value);
    const expectedSlot = expectedTemplate.annotations[index];
    if (
      slot === null ||
      expectedSlot === undefined ||
      !exactKeys(slot, [
        "entryId",
        "caseId",
        "caseVersion",
        "responseId",
        "rubricId",
        "label",
        "evidence",
        "ambiguity",
      ]) ||
      slot.entryId !== expectedSlot.entryId ||
      slot.caseId !== expectedSlot.caseId ||
      slot.caseVersion !== expectedSlot.caseVersion ||
      slot.responseId !== expectedSlot.responseId ||
      slot.rubricId !== expectedSlot.rubricId ||
      !labels.has(slot.label as CalibrationLabel) ||
      typeof slot.evidence !== "string" ||
      slot.evidence.length > 500
    ) {
      return invalid("calibration_annotation_invalid");
    }
    const ambiguity = asRecord(slot.ambiguity);
    if (
      ambiguity === null ||
      !exactKeys(ambiguity, ["present", "reason"]) ||
      typeof ambiguity.present !== "boolean" ||
      typeof ambiguity.reason !== "string" ||
      ambiguity.reason.length > 500 ||
      (ambiguity.present && ambiguity.reason.trim().length === 0) ||
      (!ambiguity.present && ambiguity.reason.length !== 0) ||
      (slot.label === "UNSURE" && ambiguity.present !== true)
    ) {
      return invalid("calibration_annotation_invalid");
    }
    const evidence = slot.evidence.trim();
    const reason = ambiguity.reason.trim();
    return {
      schemaVersion: CALIBRATION_CONTRACT_SCHEMA_VERSION,
      annotationId: `${CANONICAL_CALIBRATION_PILOT_ID}-${templateRecord.reviewerId}-${String(index + 1).padStart(3, "0")}`,
      datasetId: TUTOR_EVAL_DATASET_ID,
      datasetVersion: CANONICAL_CALIBRATION_PILOT_DATASET_VERSION,
      caseId: expectedSlot.caseId,
      caseVersion: expectedSlot.caseVersion,
      responseId: expectedSlot.responseId,
      rubricId: expectedSlot.rubricId,
      reviewerId: templateRecord.reviewerId,
      label: slot.label as CalibrationLabel,
      ...(evidence.length === 0 ? {} : { evidence }),
      ...(ambiguity.present
        ? { ambiguity: { present: true as const, reason } }
        : {}),
      createdAt: completedAt,
    };
  });

  return parseCalibrationAnnotationFile({
    schemaVersion: CALIBRATION_CONTRACT_SCHEMA_VERSION,
    dataKind,
    ...(dataKind === "synthetic-fixture" ? { fixture: syntheticFixture } : {}),
    datasetId: TUTOR_EVAL_DATASET_ID,
    datasetVersion: CANONICAL_CALIBRATION_PILOT_DATASET_VERSION,
    reviewerId: templateRecord.reviewerId,
    annotations,
  });
}
