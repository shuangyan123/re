import type {
  HumanAnnotationDataKind,
  HumanAtomicStatus,
  HumanReferenceAnnotationTask,
  HumanReferenceSyntheticFixtureMarker,
} from "./human-reference-calibration.js";
import type {
  HumanReferenceSemanticAuditReport,
  HumanReferenceSemanticAuditSourceIdentity,
  HumanReferenceSemanticAuditTemplateAnnotation,
} from "./human-reference-semantic-audit.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_ANNOTATIONS_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PACKET_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_PACKET_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_RESULT_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_SUBMISSION_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_REPORT_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SUBMISSION_KIND,
  type HumanReferenceSemanticAuditLocalizationIdentity,
  type ReviewerQualificationAtomicAssessment,
  type ReviewerQualificationItem,
  type ReviewerQualificationStatus,
  type ReviewerQualificationTemplateAssessment,
} from "./human-reference-semantic-audit-v2.js";

export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION = "0.2.1" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION = "0.1.1" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PASS_RULE =
  "all_expected_atomics_exact" as const;

export interface ReviewerQualificationDefinitionAssessment {
  readonly caseId: string;
  readonly rubricId: string;
  readonly requirementId: string;
  readonly status: HumanAtomicStatus;
}

export interface ReviewerQualificationDefinition {
  readonly qualificationId: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID;
  readonly qualificationVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION;
  readonly qualificationPresentationFingerprint: string;
  readonly passRule: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PASS_RULE;
  readonly expectedAssessments: readonly ReviewerQualificationDefinitionAssessment[];
}

interface ReviewerQualificationEnvelopeV21 {
  readonly schemaVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION;
  readonly auditProtocolId: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID;
  readonly auditProtocolVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION;
  readonly reviewerId: string;
  readonly qualificationId: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID;
  readonly qualificationVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION;
  readonly qualificationBatchId: string;
  readonly qualificationPresentationFingerprint: string;
  readonly qualificationDefinitionFingerprint: string;
  readonly localization: HumanReferenceSemanticAuditLocalizationIdentity;
}

export interface ReviewerQualificationPacketV21 extends ReviewerQualificationEnvelopeV21 {
  readonly packetKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_PACKET_KIND;
  readonly items: readonly ReviewerQualificationItem[];
}

export interface ReviewerQualificationSubmissionV21 extends ReviewerQualificationEnvelopeV21 {
  readonly packetKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_SUBMISSION_KIND;
  readonly assessments: readonly ReviewerQualificationAtomicAssessment[];
}

export interface ReviewerQualificationSubmissionTemplateV21 extends ReviewerQualificationEnvelopeV21 {
  readonly packetKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_SUBMISSION_KIND;
  readonly assessments: readonly ReviewerQualificationTemplateAssessment[];
}

export interface ReviewerQualificationResultV21 extends ReviewerQualificationEnvelopeV21 {
  readonly resultKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_RESULT_KIND;
  readonly qualificationCompleted: true;
  readonly qualificationStatus: ReviewerQualificationStatus;
  readonly assessedAtomicCount: number;
  readonly conformingAtomicCount: number;
  readonly resultFingerprint: string;
}

export interface ReviewerQualificationBindingV21 {
  readonly qualificationId: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID;
  readonly qualificationVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION;
  readonly qualificationBatchId: string;
  readonly qualificationPresentationFingerprint: string;
  readonly qualificationDefinitionFingerprint: string;
  readonly qualificationResultFingerprint: string;
  readonly qualificationStatus: "qualified";
  readonly qualificationCompleted: true;
}

interface QualifiedAuditEnvelopeV21 {
  readonly schemaVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION;
  readonly auditProtocolId: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID;
  readonly auditProtocolVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION;
  readonly auditBatchId: string;
  readonly reviewerId: string;
  readonly sourceCalibration: HumanReferenceSemanticAuditSourceIdentity;
  readonly localization: HumanReferenceSemanticAuditLocalizationIdentity;
  readonly reviewerQualification: ReviewerQualificationBindingV21;
}

export interface HumanReferenceQualifiedSemanticAuditPacketV21 extends QualifiedAuditEnvelopeV21 {
  readonly packetKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PACKET_KIND;
  readonly localizedTasks: readonly HumanReferenceAnnotationTask[];
}

export interface HumanReferenceQualifiedSemanticAuditSubmissionV21 extends QualifiedAuditEnvelopeV21 {
  readonly packetKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SUBMISSION_KIND;
  readonly reviewLocale: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE;
  readonly instructionsClear: boolean;
  readonly annotations: readonly {
    readonly caseId: string;
    readonly rubricId: string;
    readonly requirementId: string;
    readonly status: HumanAtomicStatus;
    readonly evidence?: string;
  }[];
}

export interface HumanReferenceQualifiedSemanticAuditSubmissionTemplateV21 extends QualifiedAuditEnvelopeV21 {
  readonly packetKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SUBMISSION_KIND;
  readonly reviewLocale: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE;
  readonly instructionsClear: false;
  readonly annotations: readonly HumanReferenceSemanticAuditTemplateAnnotation[];
}

export interface HumanReferenceQualifiedSemanticAuditAnnotationsV21 extends QualifiedAuditEnvelopeV21 {
  readonly dataKind: HumanAnnotationDataKind;
  readonly fixture?: HumanReferenceSyntheticFixtureMarker;
  readonly annotationKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_ANNOTATIONS_KIND;
  readonly reviewLocale: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE;
  readonly instructionsClear: boolean;
  readonly annotations: readonly {
    readonly caseId: string;
    readonly rubricId: string;
    readonly requirementId: string;
    readonly status: HumanAtomicStatus;
    readonly evidence?: string;
  }[];
}

export interface HumanReferenceQualifiedSemanticAuditReportV21
  extends Omit<HumanReferenceSemanticAuditReport, "reportKind" | "auditProtocolVersion" | "reviewerId"> {
  readonly reportKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_REPORT_KIND;
  readonly auditProtocolVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION;
  readonly reviewerId: string;
  readonly reviewLocale: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE;
  readonly localization: HumanReferenceSemanticAuditLocalizationIdentity;
  readonly reviewerQualification: ReviewerQualificationBindingV21;
  readonly qualificationStatus: "qualified";
  readonly qualificationCompleted: true;
  readonly instructionsClear: boolean;
}
