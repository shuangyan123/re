import type {
  HumanAnnotationDataKind,
  HumanAtomicStatus,
  HumanReferenceAnnotationTask,
  HumanReferenceSyntheticFixtureMarker,
} from "./human-reference-calibration.js";

export const HUMAN_REFERENCE_PILOT_SCHEMA_VERSION = 1 as const;
export const HUMAN_REFERENCE_PILOT_PROTOCOL_ID =
  "human-reference-material-blind-pilot" as const;
export const HUMAN_REFERENCE_PILOT_PROTOCOL_VERSION = "0.1.0" as const;
export const HUMAN_REFERENCE_PILOT_PACKET_KIND = "annotator-packet" as const;
export const HUMAN_REFERENCE_PILOT_SUBMISSION_KIND = "annotator-submission" as const;

export interface HumanReferencePilotSource {
  readonly diagnosticId: string;
  readonly diagnosticVersion: string;
  readonly fixtureId: string;
  readonly fixtureVersion: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  /** The fixed word-context source is synthetic diagnostic material. */
  readonly dataKind: "synthetic-fixture";
  readonly fixture: HumanReferenceSyntheticFixtureMarker;
}

/** The visible source material shared by both annotator packets. */
export interface HumanReferencePilotPacket {
  readonly schemaVersion: typeof HUMAN_REFERENCE_PILOT_SCHEMA_VERSION;
  readonly packetKind: typeof HUMAN_REFERENCE_PILOT_PACKET_KIND;
  readonly pilotProtocolId: typeof HUMAN_REFERENCE_PILOT_PROTOCOL_ID;
  readonly pilotProtocolVersion: typeof HUMAN_REFERENCE_PILOT_PROTOCOL_VERSION;
  readonly pilotId: string;
  readonly batchId: string;
  readonly calibrationProtocolId: string;
  readonly calibrationProtocolVersion: string;
  readonly source: HumanReferencePilotSource;
  readonly taskSetFingerprint: string;
  /** Opaque stable identifier; never a person's name, email, or account. */
  readonly annotatorId: string;
  readonly tasks: readonly HumanReferenceAnnotationTask[];
}

/**
 * A deliberately small editable atom. The envelope supplies annotatorId and
 * identity binding; an annotator only fills the status and optional evidence.
 */
export interface HumanReferencePilotAtomicAnnotation {
  readonly caseId: string;
  readonly rubricId: string;
  readonly requirementId: string;
  readonly status: HumanAtomicStatus;
  readonly evidence?: string;
}

export interface HumanReferencePilotSubmission {
  readonly schemaVersion: typeof HUMAN_REFERENCE_PILOT_SCHEMA_VERSION;
  readonly packetKind: typeof HUMAN_REFERENCE_PILOT_SUBMISSION_KIND;
  readonly pilotProtocolId: typeof HUMAN_REFERENCE_PILOT_PROTOCOL_ID;
  readonly pilotProtocolVersion: typeof HUMAN_REFERENCE_PILOT_PROTOCOL_VERSION;
  readonly pilotId: string;
  readonly batchId: string;
  readonly calibrationProtocolId: string;
  readonly calibrationProtocolVersion: string;
  readonly taskSetFingerprint: string;
  /** Opaque stable identifier copied from exactly one exported packet. */
  readonly annotatorId: string;
  readonly dataKind: HumanAnnotationDataKind;
  readonly fixture?: HumanReferenceSyntheticFixtureMarker;
  readonly annotations: readonly HumanReferencePilotAtomicAnnotation[];
}

/**
 * An editable working document generated from one blind packet. It is
 * intentionally not accepted by parseHumanReferencePilotSubmission(): the
 * empty status marks work that still needs an annotator decision.
 */
export interface HumanReferencePilotSubmissionTemplateAnnotation {
  readonly caseId: string;
  readonly rubricId: string;
  readonly requirementId: string;
  readonly status: "";
  /** Added only when the annotator chooses to record visible evidence. */
  readonly evidence?: string;
}

export interface HumanReferencePilotSubmissionTemplate {
  readonly schemaVersion: typeof HUMAN_REFERENCE_PILOT_SCHEMA_VERSION;
  readonly packetKind: typeof HUMAN_REFERENCE_PILOT_SUBMISSION_KIND;
  readonly pilotProtocolId: typeof HUMAN_REFERENCE_PILOT_PROTOCOL_ID;
  readonly pilotProtocolVersion: typeof HUMAN_REFERENCE_PILOT_PROTOCOL_VERSION;
  readonly pilotId: string;
  readonly batchId: string;
  readonly calibrationProtocolId: string;
  readonly calibrationProtocolVersion: string;
  readonly taskSetFingerprint: string;
  /** Opaque stable identifier copied from exactly one exported packet. */
  readonly annotatorId: string;
  readonly dataKind: "human-annotation";
  readonly annotations: readonly HumanReferencePilotSubmissionTemplateAnnotation[];
}
