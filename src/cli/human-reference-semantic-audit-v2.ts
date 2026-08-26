import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildQualifiedLocalizedSemanticAuditReportV21,
  createQualifiedLocalizedSemanticAuditExportV21,
  createReviewerQualificationExportV21,
  evaluateReviewerQualificationV21,
  importQualifiedLocalizedSemanticAuditSubmissionV21,
} from "../calibration/human-reference-semantic-audit-v2-1.js";
import {
  buildOfficialZhCnSemanticAuditLocalization,
  buildQualifiedLocalizedSemanticAuditReport,
  buildSemanticAuditLocalizationIdentity,
  createQualifiedLocalizedSemanticAuditExport,
  evaluateReviewerQualification,
  importQualifiedLocalizedSemanticAuditSubmission,
} from "../calibration/human-reference-semantic-audit-v2.js";
import {
  loadQualifiedSemanticAuditAnnotationsV21,
  loadQualifiedSemanticAuditPacketV21,
  loadQualifiedSemanticAuditSubmissionV21,
  loadReviewerQualificationPacketV21,
  loadReviewerQualificationResultV21,
  loadReviewerQualificationSubmissionV21,
  writeHumanReferenceSemanticAuditV21Json,
  writeHumanReferenceSemanticAuditV21Markdown,
} from "../calibration/human-reference-semantic-audit-v2-1-io.js";
import {
  loadQualifiedSemanticAuditAnnotations,
  loadQualifiedSemanticAuditPacket,
  loadQualifiedSemanticAuditSubmission,
  loadReviewerQualificationPacket,
  loadReviewerQualificationResult,
  loadReviewerQualificationSubmission,
  writeHumanReferenceSemanticAuditV2Json,
} from "../calibration/human-reference-semantic-audit-v2-io.js";
import {
  loadHumanReferenceAdjudicationFile,
  loadHumanReferenceAnnotationFile,
} from "../calibration/human-reference-io.js";
import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION,
} from "../contracts/human-reference-semantic-audit-v2.js";
import { HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION } from
  "../contracts/human-reference-semantic-audit-v2-1.js";
import { nextTutorbenchValue, tutorbenchOptionValue, TutorbenchCliUsageError } from "./tutorbench-common.js";

type Mode = "qualification-export" | "qualification-import" | "localized-export" | "localized-import" |
  "localized-compare";
type SupportedProtocolVersion = typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION |
  typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION;

export type HumanReferenceSemanticAuditV2CliOptions =
  | { readonly help: true; readonly mode: Mode }
  | { readonly help: false; readonly mode: "qualification-export"; readonly annotationPath: string;
      readonly reviewerId: string; readonly outputDirectory: string }
  | { readonly help: false; readonly mode: "qualification-import"; readonly packetPath: string;
      readonly submissionPath: string; readonly outputPath: string }
  | { readonly help: false; readonly mode: "localized-export"; readonly annotationPath: string;
      readonly reviewerId: string; readonly qualificationPath: string; readonly outputDirectory: string }
  | { readonly help: false; readonly mode: "localized-import"; readonly packetPath: string;
      readonly submissionPath: string; readonly qualificationPath: string; readonly outputPath: string }
  | { readonly help: false; readonly mode: "localized-compare"; readonly annotationPath: string;
      readonly adjudicationPath: string; readonly auditPath: string; readonly qualificationPath: string;
      readonly outputPath: string };

function opaqueId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(value) || value.includes("@")) {
    throw new TutorbenchCliUsageError("--reviewer must be an opaque ID without PII or email syntax.");
  }
  return value;
}

function values(args: readonly string[], names: readonly string[]): Map<string, string> | { help: true } {
  const output = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) throw new TutorbenchCliUsageError("A CLI option is missing.");
    if (argument === "--help" || argument === "-h") return { help: true };
    const name = names.find((candidate) => argument === candidate || argument.startsWith(`${candidate}=`));
    if (name === undefined) throw new TutorbenchCliUsageError(`Unknown option: ${argument}`);
    const inline = tutorbenchOptionValue(argument, name);
    output.set(name, inline ?? nextTutorbenchValue(args, index, name));
    if (inline === undefined) index += 1;
  }
  return output;
}

function required(parsed: Map<string, string>, name: string): string {
  const value = parsed.get(name);
  if (value === undefined) throw new TutorbenchCliUsageError(`${name} requires a value.`);
  return value;
}

async function readProtocolVersion(path: string): Promise<SupportedProtocolVersion> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
    const envelope = value as Record<string, unknown>;
    if (envelope.auditProtocolId !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID ||
      (envelope.auditProtocolVersion !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION &&
        envelope.auditProtocolVersion !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION)) throw new Error();
    return envelope.auditProtocolVersion;
  } catch {
    throw new BenchmarkConfigurationError("human_reference_semantic_audit_invalid");
  }
}

export function parseReviewerQualificationExportArgs(args: readonly string[]): HumanReferenceSemanticAuditV2CliOptions {
  const parsed = values(args, ["--annotations", "--reviewer", "--output-dir"]);
  if ("help" in parsed) return { help: true, mode: "qualification-export" };
  return { help: false, mode: "qualification-export", annotationPath: resolve(required(parsed, "--annotations")),
    reviewerId: opaqueId(required(parsed, "--reviewer")), outputDirectory: resolve(required(parsed, "--output-dir")) };
}

export function parseReviewerQualificationImportArgs(args: readonly string[]): HumanReferenceSemanticAuditV2CliOptions {
  const parsed = values(args, ["--packet", "--submission", "--output"]);
  if ("help" in parsed) return { help: true, mode: "qualification-import" };
  return { help: false, mode: "qualification-import", packetPath: resolve(required(parsed, "--packet")),
    submissionPath: resolve(required(parsed, "--submission")), outputPath: resolve(required(parsed, "--output")) };
}

export function parseQualifiedSemanticAuditExportArgs(args: readonly string[]): HumanReferenceSemanticAuditV2CliOptions {
  const parsed = values(args, ["--annotations", "--reviewer", "--qualification", "--output-dir"]);
  if ("help" in parsed) return { help: true, mode: "localized-export" };
  return { help: false, mode: "localized-export", annotationPath: resolve(required(parsed, "--annotations")),
    reviewerId: opaqueId(required(parsed, "--reviewer")),
    qualificationPath: resolve(required(parsed, "--qualification")),
    outputDirectory: resolve(required(parsed, "--output-dir")) };
}

export function parseQualifiedSemanticAuditImportArgs(args: readonly string[]): HumanReferenceSemanticAuditV2CliOptions {
  const parsed = values(args, ["--packet", "--submission", "--qualification", "--output"]);
  if ("help" in parsed) return { help: true, mode: "localized-import" };
  return { help: false, mode: "localized-import", packetPath: resolve(required(parsed, "--packet")),
    submissionPath: resolve(required(parsed, "--submission")),
    qualificationPath: resolve(required(parsed, "--qualification")), outputPath: resolve(required(parsed, "--output")) };
}

export function parseQualifiedSemanticAuditArgs(args: readonly string[]): HumanReferenceSemanticAuditV2CliOptions {
  const parsed = values(args, ["--annotations", "--adjudications", "--audit", "--qualification", "--output"]);
  if ("help" in parsed) return { help: true, mode: "localized-compare" };
  return { help: false, mode: "localized-compare", annotationPath: resolve(required(parsed, "--annotations")),
    adjudicationPath: resolve(required(parsed, "--adjudications")), auditPath: resolve(required(parsed, "--audit")),
    qualificationPath: resolve(required(parsed, "--qualification")), outputPath: resolve(required(parsed, "--output")) };
}

export function printHumanReferenceSemanticAuditV2Help(mode: Mode): void {
  const usages: Record<Mode, string> = {
    "qualification-export": "--annotations <path> --reviewer <opaque-id> --output-dir <path>",
    "qualification-import": "--packet <path> --submission <path> --output <path>",
    "localized-export": "--annotations <path> --reviewer <opaque-id> --qualification <path> --output-dir <path>",
    "localized-import": "--packet <path> --submission <path> --qualification <path> --output <path>",
    "localized-compare": "--annotations <path> --adjudications <path> --audit <path> --qualification <path> --output <path>",
  };
  console.log(`Tutor Benchmark qualified localized Human Reference semantic audit\n\nUsage:\n  ${usages[mode]}\n\n` +
    "New exports use @0.2.1. Historical @0.2.0 artifacts remain supported for version-matched import and " +
    "comparison; cross-version combinations fail closed.");
}

export async function runHumanReferenceSemanticAuditV2(options: Exclude<HumanReferenceSemanticAuditV2CliOptions,
  { readonly help: true }>): Promise<void> {
  if (options.mode === "qualification-export") {
    const annotations = await loadHumanReferenceAnnotationFile(options.annotationPath);
    const definition = buildOfficialZhCnSemanticAuditLocalization(annotations.tasks);
    const localization = buildSemanticAuditLocalizationIdentity(annotations.tasks, definition);
    const exported = createReviewerQualificationExportV21(options.reviewerId, localization);
    await Promise.all([
      writeHumanReferenceSemanticAuditV21Json(exported.packet,
        resolve(options.outputDirectory, `${options.reviewerId}.qualification.packet.json`)),
      writeHumanReferenceSemanticAuditV21Json(exported.template,
        resolve(options.outputDirectory, `${options.reviewerId}.qualification.submission-template.json`)),
      writeHumanReferenceSemanticAuditV21Markdown(exported.reviewDocument,
        resolve(options.outputDirectory, "QUALIFICATION_REVIEW.zh-CN.md")),
      writeHumanReferenceSemanticAuditV21Markdown(definition.localizedGuide,
        resolve(options.outputDirectory, "ANNOTATION_GUIDE.zh-CN.md")),
    ]);
    console.log(`Reviewer qualification export\n  Reviewer: ${options.reviewerId}\n  Protocol: ${HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION}\n  Locale: zh-CN\n  Output directory: ${options.outputDirectory}`);
    return;
  }
  if (options.mode === "qualification-import") {
    const version = await readProtocolVersion(options.packetPath);
    if (version === HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION) {
      const result = evaluateReviewerQualification(
        await loadReviewerQualificationPacket(options.packetPath),
        await loadReviewerQualificationSubmission(options.submissionPath),
      );
      await writeHumanReferenceSemanticAuditV2Json(result, options.outputPath);
      console.log(`Reviewer qualification import\n  Reviewer: ${result.reviewerId}\n  Protocol: ${version}\n  Status: ${result.qualificationStatus}\n  Output: ${options.outputPath}`);
      return;
    }
    const result = evaluateReviewerQualificationV21(
      await loadReviewerQualificationPacketV21(options.packetPath),
      await loadReviewerQualificationSubmissionV21(options.submissionPath),
    );
    await writeHumanReferenceSemanticAuditV21Json(result, options.outputPath);
    console.log(`Reviewer qualification import\n  Reviewer: ${result.reviewerId}\n  Protocol: ${version}\n  Status: ${result.qualificationStatus}\n  Output: ${options.outputPath}`);
    return;
  }
  if (options.mode === "localized-export") {
    const annotations = await loadHumanReferenceAnnotationFile(options.annotationPath);
    const version = await readProtocolVersion(options.qualificationPath);
    const definition = buildOfficialZhCnSemanticAuditLocalization(annotations.tasks);
    if (version === HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION) {
      const exported = createQualifiedLocalizedSemanticAuditExport(annotations, options.reviewerId,
        await loadReviewerQualificationResult(options.qualificationPath), definition);
      await Promise.all([
        writeHumanReferenceSemanticAuditV2Json(exported.packet,
          resolve(options.outputDirectory, `${options.reviewerId}.localized.packet.json`)),
        writeHumanReferenceSemanticAuditV2Json(exported.template,
          resolve(options.outputDirectory, `${options.reviewerId}.localized.submission-template.json`)),
        writeHumanReferenceSemanticAuditV21Markdown(exported.reviewDocument,
          resolve(options.outputDirectory, "SEMANTIC_AUDIT_REVIEW.zh-CN.md")),
        writeHumanReferenceSemanticAuditV21Markdown(exported.localizedGuide,
          resolve(options.outputDirectory, "ANNOTATION_GUIDE.zh-CN.md")),
      ]);
      console.log(`Qualified localized semantic-audit export\n  Reviewer: ${options.reviewerId}\n  Protocol: ${version}\n  Locale: zh-CN\n  Atomic requirements: ${exported.template.annotations.length}\n  Output directory: ${options.outputDirectory}`);
      return;
    }
    const exported = createQualifiedLocalizedSemanticAuditExportV21(annotations, options.reviewerId,
      await loadReviewerQualificationResultV21(options.qualificationPath), definition);
    await Promise.all([
      writeHumanReferenceSemanticAuditV21Json(exported.packet,
        resolve(options.outputDirectory, `${options.reviewerId}.localized.packet.json`)),
      writeHumanReferenceSemanticAuditV21Json(exported.template,
        resolve(options.outputDirectory, `${options.reviewerId}.localized.submission-template.json`)),
      writeHumanReferenceSemanticAuditV21Markdown(exported.reviewDocument,
        resolve(options.outputDirectory, "SEMANTIC_AUDIT_REVIEW.zh-CN.md")),
      writeHumanReferenceSemanticAuditV21Markdown(exported.localizedGuide,
        resolve(options.outputDirectory, "ANNOTATION_GUIDE.zh-CN.md")),
    ]);
    console.log(`Qualified localized semantic-audit export\n  Reviewer: ${options.reviewerId}\n  Protocol: ${version}\n  Locale: zh-CN\n  Atomic requirements: ${exported.template.annotations.length}\n  Output directory: ${options.outputDirectory}`);
    return;
  }
  if (options.mode === "localized-import") {
    const version = await readProtocolVersion(options.packetPath);
    if (version === HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION) {
      const audit = importQualifiedLocalizedSemanticAuditSubmission(
        await loadQualifiedSemanticAuditPacket(options.packetPath),
        await loadQualifiedSemanticAuditSubmission(options.submissionPath),
        await loadReviewerQualificationResult(options.qualificationPath),
      );
      await writeHumanReferenceSemanticAuditV2Json(audit, options.outputPath);
      console.log(`Qualified localized semantic-audit import\n  Reviewer: ${audit.reviewerId}\n  Protocol: ${version}\n  Atomic annotations: ${audit.annotations.length}\n  Output: ${options.outputPath}`);
      return;
    }
    const audit = importQualifiedLocalizedSemanticAuditSubmissionV21(
      await loadQualifiedSemanticAuditPacketV21(options.packetPath),
      await loadQualifiedSemanticAuditSubmissionV21(options.submissionPath),
      await loadReviewerQualificationResultV21(options.qualificationPath),
    );
    await writeHumanReferenceSemanticAuditV21Json(audit, options.outputPath);
    console.log(`Qualified localized semantic-audit import\n  Reviewer: ${audit.reviewerId}\n  Protocol: ${version}\n  Atomic annotations: ${audit.annotations.length}\n  Output: ${options.outputPath}`);
    return;
  }
  const version = await readProtocolVersion(options.auditPath);
  const annotations = await loadHumanReferenceAnnotationFile(options.annotationPath);
  const adjudications = await loadHumanReferenceAdjudicationFile(options.adjudicationPath);
  if (version === HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION) {
    const report = buildQualifiedLocalizedSemanticAuditReport(annotations, adjudications,
      await loadQualifiedSemanticAuditAnnotations(options.auditPath),
      await loadReviewerQualificationResult(options.qualificationPath));
    await writeHumanReferenceSemanticAuditV2Json(report, options.outputPath);
    console.log(`Qualified localized semantic-audit comparison\n  Reviewer: ${report.reviewerId}\n  Protocol: ${version}\n  Qualification: ${report.qualificationStatus}\n  Comparable atomics: ${report.comparableAtomicCount}\n  Reference review candidates: ${report.disagreementCount}\n  Output: ${options.outputPath}`);
    return;
  }
  const report = buildQualifiedLocalizedSemanticAuditReportV21(annotations, adjudications,
    await loadQualifiedSemanticAuditAnnotationsV21(options.auditPath),
    await loadReviewerQualificationResultV21(options.qualificationPath));
  await writeHumanReferenceSemanticAuditV21Json(report, options.outputPath);
  console.log(`Qualified localized semantic-audit comparison\n  Reviewer: ${report.reviewerId}\n  Protocol: ${version}\n  Qualification: ${report.qualificationStatus}\n  Comparable atomics: ${report.comparableAtomicCount}\n  Reference review candidates: ${report.disagreementCount}\n  Output: ${options.outputPath}`);
}
