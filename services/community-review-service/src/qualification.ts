import {
  communityReviewAtomicIdentityKey,
  communityReviewFingerprint,
} from "../../../src/community-review/fingerprint.js";
import type {
  CommunityReviewFingerprint,
  CommunityReviewQualificationInstrumentEligibility,
} from "../../../src/contracts/community-review.js";
import {
  HUMAN_ATOMIC_STATUSES,
  type HumanAtomicIdentity,
  type HumanAtomicStatus,
} from "../../../src/contracts/human-reference-calibration.js";

export const QUALIFICATION_SCHEMA_VERSION = 1 as const;
export const QUALIFICATION_PACKET_KIND = "community-review-qualification-packet" as const;
export const QUALIFICATION_PASS_RULE_ID = "all-required-items-correct@1" as const;

export type QualificationPassRuleId = typeof QUALIFICATION_PASS_RULE_ID;
export type QualificationResult = "qualified" | "not-qualified";

export interface QualificationInstrumentBinding {
  readonly instrumentId: string;
  readonly instrumentVersion: string;
  readonly instrumentFingerprint: CommunityReviewFingerprint;
  readonly reviewLocale: string;
}

/** The identity passed to the private material store; it contains no material content. */
export interface QualificationMaterialIdentity extends QualificationInstrumentBinding {
  readonly qualificationId: string;
  readonly qualificationVersion: string;
  readonly qualificationPoolId: string;
  readonly qualificationPoolVersion: string;
  readonly qualificationDefinitionFingerprint: CommunityReviewFingerprint;
  readonly sealedDefinitionReference: string;
  readonly privateAnswerKeyReference: string;
}

/** Positive allowlist for one visible qualification item. */
export interface QualificationVisibleItem extends HumanAtomicIdentity {
  readonly prompt: string;
}

export interface QualificationVisibleMaterial {
  readonly passRuleId: QualificationPassRuleId;
  readonly items: readonly QualificationVisibleItem[];
}

/** Private answer-key content. This type never crosses a reviewer-facing boundary. */
export interface QualificationPrivateAnswer {
  readonly caseId: string;
  readonly rubricId: string;
  readonly requirementId: string;
  readonly status: HumanAtomicStatus;
}

export interface QualificationPrivateAnswerKey {
  readonly answers: readonly QualificationPrivateAnswer[];
}

/**
 * Narrow substitution boundary for hosted/private material storage. Production
 * implementations must keep answer content behind this interface.
 */
export interface QualificationMaterialStore {
  loadVisiblePacket(identity: QualificationMaterialIdentity):
    Promise<QualificationVisibleMaterial>;
  loadPrivateAnswerKey(identity: QualificationMaterialIdentity):
    Promise<QualificationPrivateAnswerKey>;
}

export interface QualificationVisiblePacket {
  readonly schemaVersion: typeof QUALIFICATION_SCHEMA_VERSION;
  readonly packetKind: typeof QUALIFICATION_PACKET_KIND;
  readonly attemptId: string;
  readonly qualificationId: string;
  readonly qualificationVersion: string;
  readonly qualificationPoolId: string;
  readonly qualificationPoolVersion: string;
  readonly reviewLocale: string;
  readonly instrumentEligibility: CommunityReviewQualificationInstrumentEligibility;
  readonly items: readonly QualificationVisibleItem[];
  readonly packetFingerprint: CommunityReviewFingerprint;
}

export interface QualificationResponse extends HumanAtomicIdentity {
  readonly status: HumanAtomicStatus;
  /** Optional bounded evidence; it is not a request for hidden reasoning. */
  readonly evidence?: string;
}

/** Persisted response projection intentionally omits optional free text. */
export interface QualificationStoredResponse extends HumanAtomicIdentity {
  readonly status: HumanAtomicStatus;
}

export interface QualificationEvaluation {
  readonly result: QualificationResult;
  readonly evaluationRuleId: QualificationPassRuleId;
  readonly responses: readonly QualificationStoredResponse[];
}

export type QualificationMaterialErrorCode = "not_found" | "invalid";

export class QualificationMaterialError extends Error {
  readonly code: QualificationMaterialErrorCode;

  constructor(code: QualificationMaterialErrorCode) {
    super(code === "not_found"
      ? "Sealed qualification material was not found."
      : "Sealed qualification material failed validation.");
    this.name = "QualificationMaterialError";
    this.code = code;
  }
}

export class QualificationResponseError extends Error {
  constructor() {
    super("Qualification response is incomplete or invalid.");
    this.name = "QualificationResponseError";
  }
}

const statuses = new Set<string>(HUMAN_ATOMIC_STATUSES);

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

function only(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= 4096 && !value.includes("\u0000");
}

function boundedEvidence(value: unknown): value is string {
  return typeof value === "string" && value.length <= 500 && !value.includes("\u0000");
}

function validStatus(value: unknown): value is HumanAtomicStatus {
  return typeof value === "string" && statuses.has(value);
}

function validFingerprint(value: unknown): value is CommunityReviewFingerprint {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function itemIdentity(value: unknown): QualificationVisibleItem | null {
  const parsed = record(value);
  if (parsed === undefined || !only(parsed, ["caseId", "rubricId", "requirementId", "prompt"]) ||
    !nonEmpty(parsed.caseId) || !nonEmpty(parsed.rubricId) ||
    !nonEmpty(parsed.requirementId) || !nonEmpty(parsed.prompt)) return null;
  return {
    caseId: parsed.caseId,
    rubricId: parsed.rubricId,
    requirementId: parsed.requirementId,
    prompt: parsed.prompt,
  };
}

function answer(value: unknown): QualificationPrivateAnswer | null {
  const parsed = record(value);
  if (parsed === undefined || !only(parsed, ["caseId", "rubricId", "requirementId", "status"]) ||
    !nonEmpty(parsed.caseId) || !nonEmpty(parsed.rubricId) ||
    !nonEmpty(parsed.requirementId) || !validStatus(parsed.status)) return null;
  return {
    caseId: parsed.caseId,
    rubricId: parsed.rubricId,
    requirementId: parsed.requirementId,
    status: parsed.status,
  };
}

function identity(value: unknown): HumanAtomicIdentity | null {
  const parsed = record(value);
  if (parsed === undefined || !only(parsed, ["caseId", "rubricId", "requirementId"]) ||
    !nonEmpty(parsed.caseId) || !nonEmpty(parsed.rubricId) ||
    !nonEmpty(parsed.requirementId)) return null;
  return {
    caseId: parsed.caseId,
    rubricId: parsed.rubricId,
    requirementId: parsed.requirementId,
  };
}

function response(value: unknown): QualificationResponse | null {
  const parsed = record(value);
  const parsedIdentity = parsed === undefined ? null : identity({
    caseId: parsed.caseId,
    rubricId: parsed.rubricId,
    requirementId: parsed.requirementId,
  });
  if (parsed === undefined || parsedIdentity === null ||
    !only(parsed, ["caseId", "rubricId", "requirementId", "status", "evidence"]) ||
    !validStatus(parsed.status) ||
    parsed.evidence !== undefined && !boundedEvidence(parsed.evidence)) return null;
  return {
    ...parsedIdentity,
    status: parsed.status,
    ...(parsed.evidence === undefined ? {} : { evidence: parsed.evidence }),
  };
}

function sortedItems(items: readonly QualificationVisibleItem[]): QualificationVisibleItem[] {
  return [...items].sort((left, right) => communityReviewAtomicIdentityKey(left)
    .localeCompare(communityReviewAtomicIdentityKey(right)));
}

function sortedAnswers(answers: readonly QualificationPrivateAnswer[]): QualificationPrivateAnswer[] {
  return [...answers].sort((left, right) => communityReviewAtomicIdentityKey(left)
    .localeCompare(communityReviewAtomicIdentityKey(right)));
}

function assertUniqueIdentities(values: readonly HumanAtomicIdentity[]): void {
  const keys = values.map(communityReviewAtomicIdentityKey);
  if (new Set(keys).size !== keys.length) throw new QualificationMaterialError("invalid");
}

export function parseQualificationVisibleMaterial(value: unknown): QualificationVisibleMaterial {
  const parsed = record(value);
  if (parsed === undefined || !only(parsed, ["passRuleId", "items"]) ||
    parsed.passRuleId !== QUALIFICATION_PASS_RULE_ID || !Array.isArray(parsed.items) ||
    parsed.items.length === 0) throw new QualificationMaterialError("invalid");
  const parsedItems = parsed.items.map(itemIdentity);
  if (parsedItems.some((item) => item === null)) {
    throw new QualificationMaterialError("invalid");
  }
  const items = parsedItems.filter((item): item is QualificationVisibleItem => item !== null);
  assertUniqueIdentities(items);
  return {
    passRuleId: QUALIFICATION_PASS_RULE_ID,
    items: sortedItems(items),
  };
}

export function parseQualificationPrivateAnswerKey(value: unknown): QualificationPrivateAnswerKey {
  const parsed = record(value);
  if (parsed === undefined || !only(parsed, ["answers"]) || !Array.isArray(parsed.answers) ||
    parsed.answers.length === 0) throw new QualificationMaterialError("invalid");
  const parsedAnswers = parsed.answers.map(answer);
  if (parsedAnswers.some((item) => item === null)) {
    throw new QualificationMaterialError("invalid");
  }
  const answers = parsedAnswers.filter((item): item is QualificationPrivateAnswer => item !== null);
  assertUniqueIdentities(answers);
  return { answers: sortedAnswers(answers) };
}

export function qualificationVisibleTaskSetFingerprint(
  items: readonly QualificationVisibleItem[],
): CommunityReviewFingerprint {
  const parsed = parseQualificationVisibleMaterial({
    passRuleId: QUALIFICATION_PASS_RULE_ID,
    items,
  });
  return communityReviewFingerprint(parsed.items);
}

function definitionInput(input: {
  readonly qualificationId: string;
  readonly qualificationVersion: string;
  readonly qualificationPoolId: string;
  readonly qualificationPoolVersion: string;
  readonly instrumentId: string;
  readonly instrumentVersion: string;
  readonly instrumentFingerprint: string;
  readonly reviewLocale: string;
  readonly passRuleId: QualificationPassRuleId;
  readonly items: readonly QualificationVisibleItem[];
}): unknown {
  return {
    qualificationId: input.qualificationId,
    qualificationVersion: input.qualificationVersion,
    qualificationPoolId: input.qualificationPoolId,
    qualificationPoolVersion: input.qualificationPoolVersion,
    instrumentId: input.instrumentId,
    instrumentVersion: input.instrumentVersion,
    instrumentFingerprint: input.instrumentFingerprint,
    reviewLocale: input.reviewLocale,
    passRuleId: input.passRuleId,
    items: sortedItems(input.items),
  };
}

export function qualificationDefinitionFingerprint(input: {
  readonly qualificationId: string;
  readonly qualificationVersion: string;
  readonly qualificationPoolId: string;
  readonly qualificationPoolVersion: string;
  readonly instrumentId: string;
  readonly instrumentVersion: string;
  readonly instrumentFingerprint: string;
  readonly reviewLocale: string;
  readonly passRuleId: QualificationPassRuleId;
  readonly items: readonly QualificationVisibleItem[];
}): CommunityReviewFingerprint {
  return communityReviewFingerprint(definitionInput(input));
}

export function qualificationAnswerKeyCommitment(input: {
  readonly identity: QualificationMaterialIdentity;
  readonly passRuleId: QualificationPassRuleId;
  readonly answers: readonly QualificationPrivateAnswer[];
}): CommunityReviewFingerprint {
  const key = parseQualificationPrivateAnswerKey({ answers: input.answers });
  return communityReviewFingerprint({
    qualificationId: input.identity.qualificationId,
    qualificationVersion: input.identity.qualificationVersion,
    qualificationPoolId: input.identity.qualificationPoolId,
    qualificationPoolVersion: input.identity.qualificationPoolVersion,
    qualificationDefinitionFingerprint: input.identity.qualificationDefinitionFingerprint,
    instrumentId: input.identity.instrumentId,
    instrumentVersion: input.identity.instrumentVersion,
    instrumentFingerprint: input.identity.instrumentFingerprint,
    reviewLocale: input.identity.reviewLocale,
    passRuleId: input.passRuleId,
    answers: key.answers,
  });
}

function packetWithoutFingerprint(packet: Omit<QualificationVisiblePacket, "packetFingerprint">): unknown {
  return {
    schemaVersion: packet.schemaVersion,
    packetKind: packet.packetKind,
    attemptId: packet.attemptId,
    qualificationId: packet.qualificationId,
    qualificationVersion: packet.qualificationVersion,
    qualificationPoolId: packet.qualificationPoolId,
    qualificationPoolVersion: packet.qualificationPoolVersion,
    reviewLocale: packet.reviewLocale,
    instrumentEligibility: packet.instrumentEligibility,
    items: sortedItems(packet.items),
  };
}

export function buildQualificationVisiblePacket(input: {
  readonly attemptId: string;
  readonly identity: QualificationMaterialIdentity;
  readonly visibleMaterial: QualificationVisibleMaterial;
}): QualificationVisiblePacket {
  const visible = parseQualificationVisibleMaterial(input.visibleMaterial);
  const packetBase = {
    schemaVersion: QUALIFICATION_SCHEMA_VERSION,
    packetKind: QUALIFICATION_PACKET_KIND,
    attemptId: input.attemptId,
    qualificationId: input.identity.qualificationId,
    qualificationVersion: input.identity.qualificationVersion,
    qualificationPoolId: input.identity.qualificationPoolId,
    qualificationPoolVersion: input.identity.qualificationPoolVersion,
    reviewLocale: input.identity.reviewLocale,
    instrumentEligibility: {
      instrumentId: input.identity.instrumentId,
      instrumentVersion: input.identity.instrumentVersion,
      instrumentFingerprint: input.identity.instrumentFingerprint,
      reviewLocale: input.identity.reviewLocale,
    },
    items: visible.items,
  } as const;
  return {
    ...packetBase,
    packetFingerprint: communityReviewFingerprint(packetWithoutFingerprint(packetBase)),
  };
}

export function parseQualificationVisiblePacket(value: unknown): QualificationVisiblePacket {
  const parsed = record(value);
  if (parsed === undefined || !only(parsed, [
    "schemaVersion",
    "packetKind",
    "attemptId",
    "qualificationId",
    "qualificationVersion",
    "qualificationPoolId",
    "qualificationPoolVersion",
    "reviewLocale",
    "instrumentEligibility",
    "items",
    "packetFingerprint",
  ]) || parsed.schemaVersion !== QUALIFICATION_SCHEMA_VERSION ||
    parsed.packetKind !== QUALIFICATION_PACKET_KIND || !nonEmpty(parsed.attemptId) ||
    !nonEmpty(parsed.qualificationId) || !nonEmpty(parsed.qualificationVersion) ||
    !nonEmpty(parsed.qualificationPoolId) || !nonEmpty(parsed.qualificationPoolVersion) ||
    !nonEmpty(parsed.reviewLocale) || !Array.isArray(parsed.items) ||
    parsed.items.length === 0 || !validFingerprint(parsed.packetFingerprint)) {
    throw new QualificationMaterialError("invalid");
  }
  const instrument = record(parsed.instrumentEligibility);
  if (instrument === undefined || !only(instrument, [
    "instrumentId",
    "instrumentVersion",
    "instrumentFingerprint",
    "reviewLocale",
  ]) || !nonEmpty(instrument.instrumentId) || !nonEmpty(instrument.instrumentVersion) ||
    !validFingerprint(instrument.instrumentFingerprint) || instrument.reviewLocale !== parsed.reviewLocale) {
    throw new QualificationMaterialError("invalid");
  }
  const visible = parseQualificationVisibleMaterial({
    passRuleId: QUALIFICATION_PASS_RULE_ID,
    items: parsed.items,
  });
  const packet = {
    schemaVersion: QUALIFICATION_SCHEMA_VERSION,
    packetKind: QUALIFICATION_PACKET_KIND,
    attemptId: parsed.attemptId,
    qualificationId: parsed.qualificationId,
    qualificationVersion: parsed.qualificationVersion,
    qualificationPoolId: parsed.qualificationPoolId,
    qualificationPoolVersion: parsed.qualificationPoolVersion,
    reviewLocale: parsed.reviewLocale,
    instrumentEligibility: {
      instrumentId: instrument.instrumentId,
      instrumentVersion: instrument.instrumentVersion,
      instrumentFingerprint: instrument.instrumentFingerprint,
      reviewLocale: instrument.reviewLocale,
    },
    items: visible.items,
    packetFingerprint: parsed.packetFingerprint,
  } as QualificationVisiblePacket;
  if (communityReviewFingerprint(packetWithoutFingerprint(packet)) !== packet.packetFingerprint) {
    throw new QualificationMaterialError("invalid");
  }
  return packet;
}

export function parseQualificationResponses(
  items: readonly QualificationVisibleItem[],
  value: unknown,
): QualificationResponse[] {
  const visible = parseQualificationVisibleMaterial({
    passRuleId: QUALIFICATION_PASS_RULE_ID,
    items,
  }).items;
  if (!Array.isArray(value) || value.length !== visible.length) {
    throw new QualificationResponseError();
  }
  const parsedResponses = value.map(response);
  if (parsedResponses.some((item) => item === null)) {
    throw new QualificationResponseError();
  }
  const parsed = parsedResponses.filter((item): item is QualificationResponse => item !== null);
  const visibleKeys = new Set(visible.map(communityReviewAtomicIdentityKey));
  const responseKeys = parsed.map(communityReviewAtomicIdentityKey);
  if (new Set(responseKeys).size !== responseKeys.length ||
    responseKeys.some((key) => !visibleKeys.has(key))) {
    throw new QualificationResponseError();
  }
  return [...parsed].sort((left, right) => communityReviewAtomicIdentityKey(left)
    .localeCompare(communityReviewAtomicIdentityKey(right)));
}

export function evaluateQualification(
  visibleMaterial: QualificationVisibleMaterial,
  privateAnswerKey: QualificationPrivateAnswerKey,
  responses: readonly QualificationResponse[],
): QualificationEvaluation {
  const visible = parseQualificationVisibleMaterial(visibleMaterial);
  const answerKey = parseQualificationPrivateAnswerKey(privateAnswerKey);
  const parsedResponses = parseQualificationResponses(visible.items, responses);
  const expectedByIdentity = new Map(answerKey.answers.map((item) => [
    communityReviewAtomicIdentityKey(item),
    item.status,
  ]));
  const visibleKeys = visible.items.map(communityReviewAtomicIdentityKey);
  if (answerKey.answers.length !== visible.items.length ||
    new Set(answerKey.answers.map(communityReviewAtomicIdentityKey)).size !== visible.items.length ||
    answerKey.answers.some((item) => !new Set(visibleKeys).has(communityReviewAtomicIdentityKey(item)))) {
    throw new QualificationMaterialError("invalid");
  }
  const qualified = parsedResponses.every((item) =>
    expectedByIdentity.get(communityReviewAtomicIdentityKey(item)) === item.status);
  return {
    result: qualified ? "qualified" : "not-qualified",
    evaluationRuleId: QUALIFICATION_PASS_RULE_ID,
    responses: parsedResponses.map(({ caseId, rubricId, requirementId, status }) => ({
      caseId,
      rubricId,
      requirementId,
      status,
    })),
  };
}

export function qualificationResponseFingerprint(
  responses: readonly QualificationStoredResponse[],
): CommunityReviewFingerprint {
  return communityReviewFingerprint([...responses]
    .sort((left, right) => communityReviewAtomicIdentityKey(left)
      .localeCompare(communityReviewAtomicIdentityKey(right))));
}

export interface SyntheticSealedQualificationMaterial {
  readonly identity: QualificationMaterialIdentity;
  readonly visibleMaterial: QualificationVisibleMaterial;
  readonly privateAnswerKey: QualificationPrivateAnswerKey;
}

function materialKey(identity: QualificationMaterialIdentity): string {
  return `${identity.qualificationPoolId}\u0000${identity.qualificationPoolVersion}`;
}

function sameIdentity(left: QualificationMaterialIdentity, right: QualificationMaterialIdentity): boolean {
  return JSON.stringify(left) === JSON.stringify(right) ||
    communityReviewFingerprint(left) === communityReviewFingerprint(right);
}

/**
 * Synthetic-only material store. It is deliberately explicit so tests cannot
 * accidentally turn public historical qualification fixtures into active keys.
 */
export class InMemoryQualificationMaterialStore implements QualificationMaterialStore {
  private readonly materials = new Map<string, SyntheticSealedQualificationMaterial>();

  register(material: SyntheticSealedQualificationMaterial): void {
    const visible = parseQualificationVisibleMaterial(material.visibleMaterial);
    const privateAnswerKey = parseQualificationPrivateAnswerKey(material.privateAnswerKey);
    const identity = material.identity;
    if (!nonEmpty(identity.qualificationId) || !nonEmpty(identity.qualificationVersion) ||
      !nonEmpty(identity.qualificationPoolId) || !nonEmpty(identity.qualificationPoolVersion) ||
      !nonEmpty(identity.instrumentId) || !nonEmpty(identity.instrumentVersion) ||
      !validFingerprint(identity.instrumentFingerprint) || !nonEmpty(identity.reviewLocale) ||
      !validFingerprint(identity.qualificationDefinitionFingerprint) ||
      !nonEmpty(identity.sealedDefinitionReference) ||
      !nonEmpty(identity.privateAnswerKeyReference)) {
      throw new QualificationMaterialError("invalid");
    }
    const definition = qualificationDefinitionFingerprint({
      qualificationId: identity.qualificationId,
      qualificationVersion: identity.qualificationVersion,
      qualificationPoolId: identity.qualificationPoolId,
      qualificationPoolVersion: identity.qualificationPoolVersion,
      instrumentId: identity.instrumentId,
      instrumentVersion: identity.instrumentVersion,
      instrumentFingerprint: identity.instrumentFingerprint,
      reviewLocale: identity.reviewLocale,
      passRuleId: visible.passRuleId,
      items: visible.items,
    });
    if (definition !== identity.qualificationDefinitionFingerprint ||
      privateAnswerKey.answers.length !== visible.items.length ||
      privateAnswerKey.answers.some((item) => !visible.items.some((visibleItem) =>
        communityReviewAtomicIdentityKey(visibleItem) === communityReviewAtomicIdentityKey(item)))) {
      throw new QualificationMaterialError("invalid");
    }
    const key = materialKey(identity);
    const existing = this.materials.get(key);
    if (existing !== undefined) {
      if (!sameIdentity(existing.identity, identity) ||
        communityReviewFingerprint(existing.visibleMaterial) !== communityReviewFingerprint(visible) ||
        communityReviewFingerprint(existing.privateAnswerKey) !== communityReviewFingerprint(privateAnswerKey)) {
        throw new QualificationMaterialError("invalid");
      }
      return;
    }
    this.materials.set(key, structuredClone({
      identity,
      visibleMaterial: visible,
      privateAnswerKey,
    }));
  }

  async loadVisiblePacket(identity: QualificationMaterialIdentity): Promise<QualificationVisibleMaterial> {
    const material = this.materials.get(materialKey(identity));
    if (material === undefined || !sameIdentity(material.identity, identity)) {
      throw new QualificationMaterialError("not_found");
    }
    return structuredClone(material.visibleMaterial);
  }

  async loadPrivateAnswerKey(identity: QualificationMaterialIdentity): Promise<QualificationPrivateAnswerKey> {
    const material = this.materials.get(materialKey(identity));
    if (material === undefined || !sameIdentity(material.identity, identity)) {
      throw new QualificationMaterialError("not_found");
    }
    return structuredClone(material.privateAnswerKey);
  }
}
