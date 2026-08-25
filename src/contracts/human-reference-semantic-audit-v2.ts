import type {
  HumanAnnotationDataKind,
  HumanAtomicIdentity,
  HumanAtomicStatus,
  HumanReferenceAnnotationTask,
  HumanReferenceSyntheticFixtureMarker,
} from "./human-reference-calibration.js";
import type {
  HumanReferenceSemanticAuditGuideIdentity,
  HumanReferenceSemanticAuditReport,
  HumanReferenceSemanticAuditSourceIdentity,
  HumanReferenceSemanticAuditTemplateAnnotation,
} from "./human-reference-semantic-audit.js";

export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION = 1 as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID =
  "human-reference-semantic-audit" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION = "0.2.0" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE = "zh-CN" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZATION_ID =
  "human-reference-semantic-audit-localization-zh-CN" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZATION_VERSION = "0.1.0" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZED_GUIDE_ID =
  "human-reference-material-annotation-guide-zh-CN" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZED_GUIDE_VERSION = "0.1.0" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID =
  "human-reference-semantic-audit-reviewer-comprehension" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_VERSION = "0.1.0" as const;

export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_PACKET_KIND =
  "human-reference-semantic-audit-qualification-packet" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_SUBMISSION_KIND =
  "human-reference-semantic-audit-qualification-submission" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_RESULT_KIND =
  "human-reference-semantic-audit-qualification-result" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PACKET_KIND =
  "human-reference-semantic-audit-localized-packet" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SUBMISSION_KIND =
  "human-reference-semantic-audit-localized-submission" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_ANNOTATIONS_KIND =
  "human-reference-semantic-audit-localized-annotations" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_REPORT_KIND =
  "human-reference-semantic-audit-qualified-report" as const;

export type ReviewerQualificationStatus = "qualified" | "not_qualified";

export interface HumanReferenceSemanticAuditLocalizedGuideIdentity {
  readonly id: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZED_GUIDE_ID;
  readonly version: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZED_GUIDE_VERSION;
  readonly fingerprint: string;
}

export interface HumanReferenceSemanticAuditLocalizationIdentity {
  readonly locale: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE;
  readonly localizationId: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZATION_ID;
  readonly localizationVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZATION_VERSION;
  readonly sourceTaskFingerprint: string;
  readonly localizedTaskFingerprint: string;
  readonly localizedPresentationFingerprint: string;
  readonly sourceAnnotationGuide: HumanReferenceSemanticAuditGuideIdentity;
  readonly localizedAnnotationGuide: HumanReferenceSemanticAuditLocalizedGuideIdentity;
}

export interface ReviewerQualificationItem {
  readonly itemId: string;
  readonly evidence: string;
  readonly response: string;
  readonly requirements: readonly {
    readonly requirementId: string;
    readonly description: string;
  }[];
}

export interface ReviewerQualificationAtomicAssessment extends HumanAtomicIdentity {
  readonly status: HumanAtomicStatus;
}

export interface ReviewerQualificationTemplateAssessment extends HumanAtomicIdentity {
  readonly status: "";
}

interface ReviewerQualificationEnvelope {
  readonly schemaVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION;
  readonly auditProtocolId: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID;
  readonly auditProtocolVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION;
  readonly reviewerId: string;
  readonly qualificationId: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID;
  readonly qualificationVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_VERSION;
  readonly qualificationBatchId: string;
  readonly qualificationFingerprint: string;
  readonly localization: HumanReferenceSemanticAuditLocalizationIdentity;
}

export interface ReviewerQualificationPacket extends ReviewerQualificationEnvelope {
  readonly packetKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_PACKET_KIND;
  readonly items: readonly ReviewerQualificationItem[];
}

export interface ReviewerQualificationSubmission extends ReviewerQualificationEnvelope {
  readonly packetKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_SUBMISSION_KIND;
  readonly assessments: readonly ReviewerQualificationAtomicAssessment[];
}

export interface ReviewerQualificationSubmissionTemplate extends ReviewerQualificationEnvelope {
  readonly packetKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_SUBMISSION_KIND;
  readonly assessments: readonly ReviewerQualificationTemplateAssessment[];
}

export interface ReviewerQualificationResult extends ReviewerQualificationEnvelope {
  readonly resultKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_RESULT_KIND;
  readonly qualificationCompleted: true;
  readonly qualificationStatus: ReviewerQualificationStatus;
  readonly assessedAtomicCount: number;
  readonly conformingAtomicCount: number;
  readonly resultFingerprint: string;
}

export interface ReviewerQualificationBinding {
  readonly qualificationId: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID;
  readonly qualificationVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_VERSION;
  readonly qualificationBatchId: string;
  readonly qualificationFingerprint: string;
  readonly qualificationResultFingerprint: string;
  readonly qualificationStatus: "qualified";
  readonly qualificationCompleted: true;
}

interface QualifiedAuditEnvelope {
  readonly schemaVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION;
  readonly auditProtocolId: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID;
  readonly auditProtocolVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION;
  readonly auditBatchId: string;
  readonly reviewerId: string;
  readonly sourceCalibration: HumanReferenceSemanticAuditSourceIdentity;
  readonly localization: HumanReferenceSemanticAuditLocalizationIdentity;
  readonly reviewerQualification: ReviewerQualificationBinding;
}

export interface HumanReferenceQualifiedSemanticAuditPacket extends QualifiedAuditEnvelope {
  readonly packetKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PACKET_KIND;
  readonly localizedTasks: readonly HumanReferenceAnnotationTask[];
}

export interface HumanReferenceQualifiedSemanticAuditSubmission extends QualifiedAuditEnvelope {
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

export interface HumanReferenceQualifiedSemanticAuditSubmissionTemplate extends QualifiedAuditEnvelope {
  readonly packetKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SUBMISSION_KIND;
  readonly reviewLocale: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE;
  readonly instructionsClear: false;
  readonly annotations: readonly HumanReferenceSemanticAuditTemplateAnnotation[];
}

export interface HumanReferenceQualifiedSemanticAuditAnnotations extends QualifiedAuditEnvelope {
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

export interface HumanReferenceQualifiedSemanticAuditReport
  extends Omit<HumanReferenceSemanticAuditReport,
    "reportKind" | "auditProtocolVersion" | "reviewerId"> {
  readonly reportKind: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_REPORT_KIND;
  readonly auditProtocolVersion: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION;
  readonly reviewerId: string;
  readonly reviewLocale: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE;
  readonly localization: HumanReferenceSemanticAuditLocalizationIdentity;
  readonly reviewerQualification: ReviewerQualificationBinding;
  readonly qualificationStatus: "qualified";
  readonly qualificationCompleted: true;
  readonly instructionsClear: boolean;
}

export interface HumanReferenceSemanticAuditLocalizationDefinition {
  readonly identity: Omit<HumanReferenceSemanticAuditLocalizationIdentity,
    "sourceTaskFingerprint" | "localizedTaskFingerprint" | "localizedPresentationFingerprint">;
  readonly localizedGuide: string;
  readonly localizedTasks: readonly HumanReferenceAnnotationTask[];
}
