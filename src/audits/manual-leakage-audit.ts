import { readFile } from "node:fs/promises";

export const MANUAL_LEAKAGE_AUDIT_SCHEMA_VERSION = 1 as const;
export const MANUAL_LEAKAGE_AUDIT_SCOPE = "judge_positive_only" as const;

export const MANUAL_LEAKAGE_AUDIT_LIMITATIONS = [
  "Judge negatives not audited",
  "recall unknown",
  "full leakage prevalence unknown",
  "9/48 is only a lower bound of human-confirmed leakage in this cohort",
] as const;

export type ManualLeakageAuditAnswerLeakage = "present" | "absent";
export type ManualLeakageAuditAgreement = "agree" | "disagree";
export type ManualLeakageAuditClassification = "true_positive" | "false_positive";

export interface ManualLeakageAuditSourceIdentity {
  readonly provider: string;
  readonly model: string;
}

export interface ManualLeakageAuditPromptIdentity {
  readonly id: string;
  readonly version: string;
}

export interface ManualLeakageAuditEntry {
  readonly caseId: string;
  readonly judgeCriticalFailure: {
    readonly type: "answer_leakage";
    readonly severity: "major";
  };
  readonly humanDecision: {
    readonly answerLeakage: ManualLeakageAuditAnswerLeakage;
    readonly agreement: ManualLeakageAuditAgreement;
    readonly classification: ManualLeakageAuditClassification;
    readonly confidence: "high";
    readonly rationale: string;
  };
}

export interface ManualLeakageAuditArtifact {
  readonly schemaVersion: typeof MANUAL_LEAKAGE_AUDIT_SCHEMA_VERSION;
  readonly auditId: string;
  readonly auditVersion: string;
  readonly sourceDatasetId: string;
  readonly sourceDatasetVersion: string;
  readonly sourceTutor: ManualLeakageAuditSourceIdentity;
  readonly sourceJudge: ManualLeakageAuditSourceIdentity;
  readonly sourceJudgePrompt: ManualLeakageAuditPromptIdentity;
  readonly scope: {
    readonly type: typeof MANUAL_LEAKAGE_AUDIT_SCOPE;
  };
  readonly cohort: {
    readonly caseCount: number;
    readonly judgeObservedPositiveCount: number;
    readonly judgeObservedPositiveRate: number;
    readonly humanConfirmedLowerBoundCount: number;
    readonly humanConfirmedLowerBoundRate: number;
  };
  readonly auditedJudgePositiveCount: number;
  readonly humanConfirmedPositiveCount: number;
  readonly humanDisagreedCount: number;
  readonly limitations: readonly string[];
  readonly entries: readonly ManualLeakageAuditEntry[];
}

export interface ManualLeakageAuditSummary {
  readonly auditedJudgePositiveCount: number;
  readonly humanConfirmedPositiveCount: number;
  readonly humanDisagreedCount: number;
  readonly positiveAgreementRate: number;
  readonly limitation: string;
}

export class ManualLeakageAuditError extends Error {
  readonly code = "manual_leakage_audit_invalid" as const;

  constructor() {
    super("Manual leakage audit artifact is invalid.");
    this.name = "ManualLeakageAuditError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function parseSourceIdentity(value: unknown): ManualLeakageAuditSourceIdentity | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.provider) || !isNonEmptyString(value.model)) {
    return undefined;
  }
  return { provider: value.provider, model: value.model };
}

function parsePromptIdentity(value: unknown): ManualLeakageAuditPromptIdentity | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.version)) {
    return undefined;
  }
  return { id: value.id, version: value.version };
}

function parseEntry(value: unknown): ManualLeakageAuditEntry | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.caseId)) {
    return undefined;
  }
  const judgeCriticalFailure = value.judgeCriticalFailure;
  const humanDecision = value.humanDecision;
  if (
    !isRecord(judgeCriticalFailure) ||
    judgeCriticalFailure.type !== "answer_leakage" ||
    judgeCriticalFailure.severity !== "major" ||
    !isRecord(humanDecision) ||
    (humanDecision.answerLeakage !== "present" && humanDecision.answerLeakage !== "absent") ||
    (humanDecision.agreement !== "agree" && humanDecision.agreement !== "disagree") ||
    (humanDecision.classification !== "true_positive" &&
      humanDecision.classification !== "false_positive") ||
    humanDecision.confidence !== "high" ||
    !isNonEmptyString(humanDecision.rationale)
  ) {
    return undefined;
  }

  const expectedAgreement = humanDecision.answerLeakage === "present" ? "agree" : "disagree";
  const expectedClassification =
    humanDecision.answerLeakage === "present" ? "true_positive" : "false_positive";
  if (
    humanDecision.agreement !== expectedAgreement ||
    humanDecision.classification !== expectedClassification
  ) {
    return undefined;
  }

  return {
    caseId: value.caseId,
    judgeCriticalFailure: { type: "answer_leakage", severity: "major" },
    humanDecision: {
      answerLeakage: humanDecision.answerLeakage,
      agreement: humanDecision.agreement,
      classification: humanDecision.classification,
      confidence: "high",
      rationale: humanDecision.rationale,
    },
  };
}

export function parseManualLeakageAuditArtifact(value: unknown): ManualLeakageAuditArtifact {
  if (!isRecord(value)) {
    throw new ManualLeakageAuditError();
  }
  const sourceTutor = parseSourceIdentity(value.sourceTutor);
  const sourceJudge = parseSourceIdentity(value.sourceJudge);
  const sourceJudgePrompt = parsePromptIdentity(value.sourceJudgePrompt);
  const scope = value.scope;
  const cohort = value.cohort;
  const limitationsValue = value.limitations;
  const entriesValue = value.entries;
  const entries = Array.isArray(entriesValue) ? entriesValue.map(parseEntry) : undefined;
  if (
    value.schemaVersion !== MANUAL_LEAKAGE_AUDIT_SCHEMA_VERSION ||
    !isNonEmptyString(value.auditId) ||
    !isNonEmptyString(value.auditVersion) ||
    !isNonEmptyString(value.sourceDatasetId) ||
    !isNonEmptyString(value.sourceDatasetVersion) ||
    sourceTutor === undefined ||
    sourceJudge === undefined ||
    sourceJudgePrompt === undefined ||
    !isRecord(scope) ||
    scope.type !== MANUAL_LEAKAGE_AUDIT_SCOPE ||
    !isRecord(cohort) ||
    !isNonNegativeInteger(cohort.caseCount) ||
    !isNonNegativeInteger(cohort.judgeObservedPositiveCount) ||
    !isRate(cohort.judgeObservedPositiveRate) ||
    !isNonNegativeInteger(cohort.humanConfirmedLowerBoundCount) ||
    !isRate(cohort.humanConfirmedLowerBoundRate) ||
    !isNonNegativeInteger(value.auditedJudgePositiveCount) ||
    !isNonNegativeInteger(value.humanConfirmedPositiveCount) ||
    !isNonNegativeInteger(value.humanDisagreedCount) ||
    !Array.isArray(limitationsValue) ||
    !limitationsValue.every(isNonEmptyString) ||
    entries === undefined ||
    entries.some((entry): entry is undefined => entry === undefined)
  ) {
    throw new ManualLeakageAuditError();
  }

  const limitations = limitationsValue as string[];
  const parsedEntries = entries as ManualLeakageAuditEntry[];
  const uniqueCaseIds = new Set(parsedEntries.map((entry) => entry.caseId));
  const humanConfirmedCount = parsedEntries.filter(
    (entry) => entry.humanDecision.classification === "true_positive",
  ).length;
  const humanDisagreedCount = parsedEntries.filter(
    (entry) => entry.humanDecision.classification === "false_positive",
  ).length;
  if (
    uniqueCaseIds.size !== parsedEntries.length ||
    parsedEntries.length !== value.auditedJudgePositiveCount ||
    humanConfirmedCount !== value.humanConfirmedPositiveCount ||
    humanDisagreedCount !== value.humanDisagreedCount ||
    value.humanConfirmedPositiveCount + value.humanDisagreedCount !==
      value.auditedJudgePositiveCount ||
    cohort.judgeObservedPositiveCount !== value.auditedJudgePositiveCount ||
    cohort.humanConfirmedLowerBoundCount !== value.humanConfirmedPositiveCount ||
    cohort.judgeObservedPositiveRate !==
      value.auditedJudgePositiveCount / cohort.caseCount ||
    cohort.humanConfirmedLowerBoundRate !==
      value.humanConfirmedPositiveCount / cohort.caseCount ||
    !MANUAL_LEAKAGE_AUDIT_LIMITATIONS.every((limitation) =>
      limitations.includes(limitation),
    )
  ) {
    throw new ManualLeakageAuditError();
  }

  return {
    schemaVersion: MANUAL_LEAKAGE_AUDIT_SCHEMA_VERSION,
    auditId: value.auditId,
    auditVersion: value.auditVersion,
    sourceDatasetId: value.sourceDatasetId,
    sourceDatasetVersion: value.sourceDatasetVersion,
    sourceTutor,
    sourceJudge,
    sourceJudgePrompt,
    scope: { type: MANUAL_LEAKAGE_AUDIT_SCOPE },
    cohort: {
      caseCount: cohort.caseCount,
      judgeObservedPositiveCount: cohort.judgeObservedPositiveCount,
      judgeObservedPositiveRate: cohort.judgeObservedPositiveRate,
      humanConfirmedLowerBoundCount: cohort.humanConfirmedLowerBoundCount,
      humanConfirmedLowerBoundRate: cohort.humanConfirmedLowerBoundRate,
    },
    auditedJudgePositiveCount: value.auditedJudgePositiveCount,
    humanConfirmedPositiveCount: value.humanConfirmedPositiveCount,
    humanDisagreedCount: value.humanDisagreedCount,
    limitations: [...limitations],
    entries: parsedEntries,
  };
}

export async function loadManualLeakageAuditArtifact(
  path: string,
): Promise<ManualLeakageAuditArtifact> {
  try {
    return parseManualLeakageAuditArtifact(JSON.parse(await readFile(path, "utf8")) as unknown);
  } catch (error) {
    if (error instanceof ManualLeakageAuditError) {
      throw error;
    }
    throw new ManualLeakageAuditError();
  }
}

export function summarizeManualLeakageAudit(
  artifact: ManualLeakageAuditArtifact,
): ManualLeakageAuditSummary {
  return {
    auditedJudgePositiveCount: artifact.auditedJudgePositiveCount,
    humanConfirmedPositiveCount: artifact.humanConfirmedPositiveCount,
    humanDisagreedCount: artifact.humanDisagreedCount,
    positiveAgreementRate:
      artifact.humanConfirmedPositiveCount / artifact.auditedJudgePositiveCount,
    limitation:
      "This audit covers Judge-positive cases only. Judge-negative cases were not human-audited, so recall and total leakage prevalence are unknown.",
  };
}
