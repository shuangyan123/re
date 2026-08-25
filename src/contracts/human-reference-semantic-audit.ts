import type {
  HumanAnnotationDataKind,
  HumanAtomicConfusionMatrix,
  HumanAtomicIdentity,
  HumanAtomicStatus,
  HumanReferenceAnnotationTask,
  HumanReferenceProvenance,
  HumanReferenceSyntheticFixtureMarker,
} from "./human-reference-calibration.js";

export const HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION = 1 as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID =
  "human-reference-semantic-audit" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION = "0.1.0" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_PACKET_KIND =
  "human-reference-semantic-audit-packet" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_SUBMISSION_KIND =
  "human-reference-semantic-audit-submission" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_ANNOTATIONS_KIND =
  "human-reference-semantic-audit-annotations" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_REPORT_KIND =
  "human-reference-semantic-audit-report" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_ID =
  "human-reference-material-annotation-guide" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_VERSION = "0.2.0" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_FINGERPRINT =
  "sha256:dcf8ebba67250311a134788919984f13777a51516cb6294ed4c24742be65ff3a" as const;

export interface HumanReferenceSemanticAuditSourceIdentity {
  readonly batchId: string;
  readonly calibrationProtocolId: string;
  readonly calibrationProtocolVersion: string;
  readonly dataKind: HumanAnnotationDataKind;
  readonly fixture?: HumanReferenceSyntheticFixtureMarker;
}

export interface HumanReferenceSemanticAuditGuideIdentity {
  readonly id: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_ID;
  readonly version: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_VERSION;
  readonly fingerprint: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_FINGERPRINT;
}

export interface HumanReferenceSemanticAuditPacket {
  readonly schemaVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION;
  readonly packetKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_PACKET_KIND;
  readonly auditProtocolId: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID;
  readonly auditProtocolVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION;
  readonly auditBatchId: string;
  readonly reviewerId: string;
  readonly sourceCalibration: HumanReferenceSemanticAuditSourceIdentity;
  readonly taskSetFingerprint: string;
  readonly annotationGuide: HumanReferenceSemanticAuditGuideIdentity;
  readonly tasks: readonly HumanReferenceAnnotationTask[];
}

export interface HumanReferenceSemanticAuditAtomicAnnotation extends HumanAtomicIdentity {
  readonly status: HumanAtomicStatus;
  readonly evidence?: string;
}

interface HumanReferenceSemanticAuditSubmissionEnvelope {
  readonly schemaVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION;
  readonly packetKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_SUBMISSION_KIND;
  readonly auditProtocolId: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID;
  readonly auditProtocolVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION;
  readonly auditBatchId: string;
  readonly reviewerId: string;
  readonly sourceCalibration: HumanReferenceSemanticAuditSourceIdentity;
  readonly taskSetFingerprint: string;
  readonly annotationGuide: HumanReferenceSemanticAuditGuideIdentity;
}

export interface HumanReferenceSemanticAuditSubmission
  extends HumanReferenceSemanticAuditSubmissionEnvelope {
  readonly annotations: readonly HumanReferenceSemanticAuditAtomicAnnotation[];
}

export interface HumanReferenceSemanticAuditTemplateAnnotation extends HumanAtomicIdentity {
  readonly status: "";
  readonly evidence?: string;
}

export interface HumanReferenceSemanticAuditSubmissionTemplate
  extends HumanReferenceSemanticAuditSubmissionEnvelope {
  readonly annotations: readonly HumanReferenceSemanticAuditTemplateAnnotation[];
}

export interface HumanReferenceSemanticAuditAnnotations {
  readonly schemaVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION;
  readonly dataKind: HumanAnnotationDataKind;
  readonly fixture?: HumanReferenceSyntheticFixtureMarker;
  readonly annotationKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_ANNOTATIONS_KIND;
  readonly auditProtocolId: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID;
  readonly auditProtocolVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION;
  readonly auditBatchId: string;
  readonly reviewerId: string;
  readonly sourceCalibration: HumanReferenceSemanticAuditSourceIdentity;
  readonly taskSetFingerprint: string;
  readonly annotationGuide: HumanReferenceSemanticAuditGuideIdentity;
  readonly annotations: readonly HumanReferenceSemanticAuditAtomicAnnotation[];
}

export interface SemanticAuditAgreementSummary {
  readonly comparableAtomicCount: number;
  readonly agreementCount: number;
  readonly disagreementCount: number;
  readonly agreementShare: number | null;
}

export interface HumanReferenceSemanticAuditDisagreement extends HumanAtomicIdentity {
  readonly frozenReferenceStatus: HumanAtomicStatus;
  readonly frozenReferenceProvenance: HumanReferenceProvenance;
  readonly auditStatus: HumanAtomicStatus;
  readonly auditEvidence?: string;
}

export interface HumanReferenceSemanticAuditAgreement extends SemanticAuditAgreementSummary {
  /** Rows are frozen Human Reference; columns are the independent audit reviewer. */
  readonly confusionMatrix: HumanAtomicConfusionMatrix;
  readonly disagreements: readonly HumanReferenceSemanticAuditDisagreement[];
}

export interface HumanReferenceSemanticAuditCase extends SemanticAuditAgreementSummary {
  readonly caseId: string;
  readonly disagreements: readonly HumanReferenceSemanticAuditDisagreement[];
}

export interface HumanReferenceSemanticAuditDerivedDisagreement {
  readonly caseId: string;
  readonly rubricId: string;
  readonly frozenReferenceLabel: "PASS" | "PARTIAL" | "FAIL";
  readonly auditLabel: "PASS" | "PARTIAL" | "FAIL";
}

export interface HumanReferenceSemanticAuditDerivedAgreement {
  readonly comparableRubricCount: number;
  readonly agreementCount: number;
  readonly disagreementCount: number;
  readonly agreementShare: number | null;
  readonly disagreements: readonly HumanReferenceSemanticAuditDerivedDisagreement[];
}

export interface HumanReferenceSemanticAuditReport {
  readonly schemaVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION;
  readonly reportKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_REPORT_KIND;
  readonly auditProtocolId: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID;
  readonly auditProtocolVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION;
  readonly calibrationProtocolId: string;
  readonly calibrationProtocolVersion: string;
  readonly dataKind: "human-reference" | "synthetic-fixture";
  readonly reviewerId: string;
  readonly plannedAtomicCount: number;
  readonly comparableAtomicCount: number;
  readonly agreementCount: number;
  readonly disagreementCount: number;
  readonly agreementShare: number | null;
  readonly semanticAuditAgreement: HumanReferenceSemanticAuditAgreement;
  readonly referenceProvenanceAgreement: Readonly<
    Record<HumanReferenceProvenance, SemanticAuditAgreementSummary>
  >;
  readonly perRequirement: Readonly<Record<string, SemanticAuditAgreementSummary>>;
  readonly perCase: readonly HumanReferenceSemanticAuditCase[];
  readonly derivedLabelAgreement: HumanReferenceSemanticAuditDerivedAgreement;
  readonly limitations: readonly string[];
}
