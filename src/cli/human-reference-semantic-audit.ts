import { resolve } from "node:path";

import {
  buildHumanReferenceSemanticAuditReport,
  createHumanReferenceSemanticAuditExport,
  importHumanReferenceSemanticAuditSubmission,
  loadHumanReferenceAdjudicationFile,
  loadHumanReferenceAnnotationFile,
  loadHumanReferenceSemanticAuditAnnotations,
  loadHumanReferenceSemanticAuditGuide,
  loadHumanReferenceSemanticAuditPacket,
  loadHumanReferenceSemanticAuditSubmission,
  writeHumanReferenceSemanticAuditInstructions,
  writeHumanReferenceSemanticAuditJson,
} from "../calibration/index.js";
import { nextTutorbenchValue, tutorbenchOptionValue, TutorbenchCliUsageError } from "./tutorbench-common.js";

type HelpMode = "export" | "import" | "compare";
export type HumanReferenceSemanticAuditCliOptions =
  | { readonly help: true; readonly mode: HelpMode }
  | {
      readonly help: false;
      readonly mode: "export";
      readonly annotationPath: string;
      readonly reviewerId: string;
      readonly guidePath: string;
      readonly outputDirectory: string;
    }
  | {
      readonly help: false;
      readonly mode: "import";
      readonly packetPath: string;
      readonly submissionPath: string;
      readonly outputPath: string;
    }
  | {
      readonly help: false;
      readonly mode: "compare";
      readonly annotationPath: string;
      readonly adjudicationPath: string;
      readonly auditPath: string;
      readonly outputPath: string;
    };

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

export function parseHumanReferenceSemanticAuditExportArgs(
  args: readonly string[],
): HumanReferenceSemanticAuditCliOptions {
  const parsed = values(args, ["--annotations", "--reviewer", "--guide", "--output-dir"]);
  if ("help" in parsed) return { help: true, mode: "export" };
  return {
    help: false,
    mode: "export",
    annotationPath: resolve(required(parsed, "--annotations")),
    reviewerId: opaqueId(required(parsed, "--reviewer")),
    guidePath: resolve(required(parsed, "--guide")),
    outputDirectory: resolve(required(parsed, "--output-dir")),
  };
}

export function parseHumanReferenceSemanticAuditImportArgs(
  args: readonly string[],
): HumanReferenceSemanticAuditCliOptions {
  const parsed = values(args, ["--packet", "--submission", "--output"]);
  if ("help" in parsed) return { help: true, mode: "import" };
  return {
    help: false,
    mode: "import",
    packetPath: resolve(required(parsed, "--packet")),
    submissionPath: resolve(required(parsed, "--submission")),
    outputPath: resolve(required(parsed, "--output")),
  };
}

export function parseHumanReferenceSemanticAuditArgs(
  args: readonly string[],
): HumanReferenceSemanticAuditCliOptions {
  const parsed = values(args, ["--annotations", "--adjudications", "--audit", "--output"]);
  if ("help" in parsed) return { help: true, mode: "compare" };
  return {
    help: false,
    mode: "compare",
    annotationPath: resolve(required(parsed, "--annotations")),
    adjudicationPath: resolve(required(parsed, "--adjudications")),
    auditPath: resolve(required(parsed, "--audit")),
    outputPath: resolve(required(parsed, "--output")),
  };
}

export function printHumanReferenceSemanticAuditExportHelp(): void {
  console.log(`Tutor Benchmark Human Reference semantic-audit export

Usage:
  tutorbench human-reference-semantic-audit-export --annotations <path> \\
    --reviewer <opaque-id> --guide <path> --output-dir <path>

Exports one full-task, Judge-blind packet, an incomplete editable template,
and workflow-only AUDIT_INSTRUCTIONS.md. The supplied frozen guide must match
human-reference-material-annotation-guide@0.2.0 byte-for-byte.`);
}

export function printHumanReferenceSemanticAuditImportHelp(): void {
  console.log(`Tutor Benchmark Human Reference semantic-audit import

Usage:
  tutorbench human-reference-semantic-audit-import --packet <path> \\
    --submission <completed.json> --output <path>

Strictly binds one complete independent reviewer submission to its packet.
This step does not read or change the frozen Human Reference.`);
}

export function printHumanReferenceSemanticAuditHelp(): void {
  console.log(`Tutor Benchmark Human Reference semantic-audit comparison

Usage:
  tutorbench human-reference-semantic-audit --annotations <path> \\
    --adjudications <path> --audit <path> --output <path>

Rebuilds the frozen Human Reference and reports diagnostic agreement. It does
not read Judge output, claim accuracy, or mutate the historical reference.`);
}

export async function runHumanReferenceSemanticAuditExport(
  options: Extract<HumanReferenceSemanticAuditCliOptions, { readonly help: false; readonly mode: "export" }>,
): Promise<void> {
  const exported = createHumanReferenceSemanticAuditExport(
    await loadHumanReferenceAnnotationFile(options.annotationPath),
    options.reviewerId,
    await loadHumanReferenceSemanticAuditGuide(options.guidePath),
  );
  await Promise.all([
    writeHumanReferenceSemanticAuditJson(exported.packet,
      resolve(options.outputDirectory, `${options.reviewerId}.packet.json`)),
    writeHumanReferenceSemanticAuditJson(exported.template,
      resolve(options.outputDirectory, `${options.reviewerId}.submission-template.json`)),
    writeHumanReferenceSemanticAuditInstructions(exported.auditInstructions,
      resolve(options.outputDirectory, "AUDIT_INSTRUCTIONS.md")),
  ]);
  console.log(["Human Reference semantic-audit export",
    `  Reviewer: ${options.reviewerId}`,
    `  Tasks: ${exported.packet.tasks.length}`,
    `  Atomic requirements: ${exported.template.annotations.length}`,
    `  Task fingerprint: ${exported.packet.taskSetFingerprint}`,
    `  Output directory: ${options.outputDirectory}`].join("\n"));
}

export async function runHumanReferenceSemanticAuditImport(
  options: Extract<HumanReferenceSemanticAuditCliOptions, { readonly help: false; readonly mode: "import" }>,
): Promise<void> {
  const audit = importHumanReferenceSemanticAuditSubmission(
    await loadHumanReferenceSemanticAuditPacket(options.packetPath),
    await loadHumanReferenceSemanticAuditSubmission(options.submissionPath),
  );
  await writeHumanReferenceSemanticAuditJson(audit, options.outputPath);
  console.log(["Human Reference semantic-audit import",
    `  Reviewer: ${audit.reviewerId}`,
    `  Atomic annotations: ${audit.annotations.length}`,
    `  Output: ${options.outputPath}`].join("\n"));
}

export async function runHumanReferenceSemanticAudit(
  options: Extract<HumanReferenceSemanticAuditCliOptions, { readonly help: false; readonly mode: "compare" }>,
): Promise<void> {
  const report = buildHumanReferenceSemanticAuditReport(
    await loadHumanReferenceAnnotationFile(options.annotationPath),
    await loadHumanReferenceAdjudicationFile(options.adjudicationPath),
    await loadHumanReferenceSemanticAuditAnnotations(options.auditPath),
  );
  await writeHumanReferenceSemanticAuditJson(report, options.outputPath);
  console.log(["Human Reference semantic-audit comparison",
    `  Reviewer: ${report.reviewerId}`,
    `  Comparable atomics: ${report.comparableAtomicCount}`,
    `  Agreements: ${report.agreementCount}`,
    `  Reference review candidates: ${report.disagreementCount}`,
    `  Output: ${options.outputPath}`].join("\n"));
}
