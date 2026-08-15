import { createHash } from "node:crypto";

import type { TutorVisibleCasePacket } from "./tutor-response-corpus.js";

/**
 * A reviewed case-version transition. The fingerprints cover only the fields
 * sent to TutorUnderTest; evaluator-only annotations are intentionally absent.
 */
export interface TutorResponseReplayCaseVersionMapping {
  readonly caseId: string;
  readonly sourceVersion: string;
  readonly targetVersion: string;
  readonly sourceTutorVisibleFingerprint: string;
  readonly targetTutorVisibleFingerprint: string;
}

export interface TutorResponseReplayCompatibility {
  readonly compatibilityId: string;
  readonly sourceDatasetId: string;
  readonly sourceDatasetVersion: string;
  readonly targetDatasetId: string;
  readonly targetDatasetVersion: string;
  readonly caseVersionMappings: readonly TutorResponseReplayCaseVersionMapping[];
  readonly rationale: string;
}

/** Optional result provenance; it does not alter the v1 result schema. */
export interface TutorResponseCorpusSemanticReplay {
  readonly compatibilityId: string;
  readonly sourceDatasetId: string;
  readonly sourceDatasetVersion: string;
  readonly targetDatasetId: string;
  readonly targetDatasetVersion: string;
  readonly caseVersionMappings: readonly {
    readonly caseId: string;
    readonly sourceVersion: string;
    readonly targetVersion: string;
  }[];
}

/**
 * The single currently approved transition. Do not infer additional
 * compatibility from semver or from a case patch version.
 */
export const TUTOR_RESPONSE_REPLAY_COMPATIBILITIES = [
  {
    compatibilityId:
      "tutor-eval-v0.2a-0.2a-to-0.2a.1-language-verb-1.0.0-to-1.0.1",
    sourceDatasetId: "tutor-eval-v0.2a",
    sourceDatasetVersion: "0.2a",
    targetDatasetId: "tutor-eval-v0.2a",
    targetDatasetVersion: "0.2a.1",
    caseVersionMappings: [
      {
        caseId: "language-verb-check-001",
        sourceVersion: "1.0.0",
        targetVersion: "1.0.1",
        sourceTutorVisibleFingerprint:
          "c5c84ce2894fcf10708e82c145d21f02d05cc5814dd4e98d3be73b4ec7efe81e",
        targetTutorVisibleFingerprint:
          "c5c84ce2894fcf10708e82c145d21f02d05cc5814dd4e98d3be73b4ec7efe81e",
      },
    ],
    rationale:
      "PR #26 removed the evaluator-only incorrect_diagnosis:major mapping from language-verb-diagnosis-001; Tutor-visible input and relevant rubric identity remained unchanged.",
  },
] as const satisfies readonly TutorResponseReplayCompatibility[];

/**
 * Hashes the exact Tutor-visible projection. Case identity/version are not
 * hashed because a compatible replay deliberately changes only metadata.
 */
export function tutorVisibleCaseFingerprint(
  packet: TutorVisibleCasePacket,
): string {
  const visibleProjection = {
    learningObjective: packet.learningObjective,
    studentProfile: {
      knownConcepts: packet.studentProfile.knownConcepts,
      misconceptions: packet.studentProfile.misconceptions,
      level: packet.studentProfile.level,
      goal: packet.studentProfile.goal,
    },
    conversationHistory: packet.conversationHistory.map((message) => ({
      role: message.role,
      text: message.text,
    })),
    studentMessage: packet.studentMessage,
    problemContext: packet.problemContext,
  };
  return createHash("sha256")
    .update(JSON.stringify(visibleProjection), "utf8")
    .digest("hex");
}
