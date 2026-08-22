import { resolve } from "node:path";

import {
  createHumanReferencePilotExport,
  loadHumanReferencePilotTasks,
  mergeHumanReferencePilotSubmissions,
} from "../calibration/human-reference-pilot.js";
import {
  loadHumanReferencePilotPackets,
  loadHumanReferencePilotSubmission,
  writeHumanReferencePilotAnnotationGuide,
  writeHumanReferencePilotJson,
} from "../calibration/human-reference-pilot-io.js";
import {
  HUMAN_REFERENCE_PILOT_DEFAULT_ID,
  HUMAN_REFERENCE_PILOT_FIXTURE_ID,
} from "../calibration/human-reference-pilot.js";
import type { HumanReferencePilotExport } from "../calibration/human-reference-pilot.js";
import { TutorbenchCliUsageError, nextTutorbenchValue, tutorbenchOptionValue } from "./tutorbench-common.js";

const defaultExportDirectory = resolve(
  process.cwd(),
  "artifacts",
  "human-reference-pilot",
  "word-context-001",
);

export type HumanReferencePilotCliOptions =
  | { readonly help: true; readonly mode?: "export" | "import" }
  | {
      readonly help: false;
      readonly mode: "export";
      readonly fixture: typeof HUMAN_REFERENCE_PILOT_FIXTURE_ID;
      readonly annotatorIds: readonly [string, string];
      readonly outputDirectory: string;
      readonly pilotId: string;
    }
  | {
      readonly help: false;
      readonly mode: "import";
      readonly packetDirectory: string;
      readonly submissionPaths: readonly [string, string];
      readonly outputPath: string;
    };

export type HumanReferencePilotExportCliOptions = Extract<
  HumanReferencePilotCliOptions,
  { readonly help: false; readonly mode: "export" }
> | { readonly help: true; readonly mode: "export" };

export type HumanReferencePilotImportCliOptions = Extract<
  HumanReferencePilotCliOptions,
  { readonly help: false; readonly mode: "import" }
> | { readonly help: true; readonly mode: "import" };

function isOpaqueId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(value) && !value.includes("@");
}

function parseFixture(value: string): typeof HUMAN_REFERENCE_PILOT_FIXTURE_ID {
  if (value !== HUMAN_REFERENCE_PILOT_FIXTURE_ID) {
    throw new TutorbenchCliUsageError("--fixture currently supports only word-context.");
  }
  return value;
}

function parseOpaqueId(value: string, option: string): string {
  if (!isOpaqueId(value)) {
    throw new TutorbenchCliUsageError(`${option} must be an opaque ID without PII or email syntax.`);
  }
  return value;
}

export function parseHumanReferencePilotExportArgs(
  args: readonly string[],
): HumanReferencePilotExportCliOptions {
  let fixture: typeof HUMAN_REFERENCE_PILOT_FIXTURE_ID = HUMAN_REFERENCE_PILOT_FIXTURE_ID;
  let outputDirectory = defaultExportDirectory;
  let pilotId: string = HUMAN_REFERENCE_PILOT_DEFAULT_ID;
  const annotatorIds: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      throw new TutorbenchCliUsageError("A CLI option is missing.");
    }
    if (argument === "--help" || argument === "-h") {
      return { help: true, mode: "export" };
    }
    if (argument === "--fixture") {
      fixture = parseFixture(nextTutorbenchValue(args, index, "--fixture"));
      index += 1;
      continue;
    }
    const fixtureValue = tutorbenchOptionValue(argument, "--fixture");
    if (fixtureValue !== undefined) {
      fixture = parseFixture(fixtureValue);
      continue;
    }
    if (argument === "--annotator") {
      annotatorIds.push(parseOpaqueId(nextTutorbenchValue(args, index, "--annotator"), "--annotator"));
      index += 1;
      continue;
    }
    const annotatorValue = tutorbenchOptionValue(argument, "--annotator");
    if (annotatorValue !== undefined) {
      annotatorIds.push(parseOpaqueId(annotatorValue, "--annotator"));
      continue;
    }
    if (argument === "--output-dir") {
      outputDirectory = resolve(nextTutorbenchValue(args, index, "--output-dir"));
      index += 1;
      continue;
    }
    const outputDirectoryValue = tutorbenchOptionValue(argument, "--output-dir");
    if (outputDirectoryValue !== undefined) {
      outputDirectory = resolve(outputDirectoryValue);
      continue;
    }
    if (argument === "--pilot-id") {
      pilotId = parseOpaqueId(nextTutorbenchValue(args, index, "--pilot-id"), "--pilot-id");
      index += 1;
      continue;
    }
    const pilotIdValue = tutorbenchOptionValue(argument, "--pilot-id");
    if (pilotIdValue !== undefined) {
      pilotId = parseOpaqueId(pilotIdValue, "--pilot-id");
      continue;
    }
    throw new TutorbenchCliUsageError(`Unknown option: ${argument}`);
  }
  if (annotatorIds.length !== 2 || new Set(annotatorIds).size !== 2) {
    throw new TutorbenchCliUsageError("Exactly two distinct --annotator opaque IDs are required.");
  }
  return {
    help: false,
    mode: "export",
    fixture,
    annotatorIds: [annotatorIds[0] as string, annotatorIds[1] as string],
    outputDirectory,
    pilotId,
  };
}

export function parseHumanReferencePilotImportArgs(
  args: readonly string[],
): HumanReferencePilotImportCliOptions {
  let packetDirectory: string | undefined;
  let outputPath: string | undefined;
  const submissionPaths: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      throw new TutorbenchCliUsageError("A CLI option is missing.");
    }
    if (argument === "--help" || argument === "-h") {
      return { help: true, mode: "import" };
    }
    if (argument === "--packet-dir") {
      packetDirectory = resolve(nextTutorbenchValue(args, index, "--packet-dir"));
      index += 1;
      continue;
    }
    const packetDirectoryValue = tutorbenchOptionValue(argument, "--packet-dir");
    if (packetDirectoryValue !== undefined) {
      packetDirectory = resolve(packetDirectoryValue);
      continue;
    }
    if (argument === "--submission") {
      submissionPaths.push(resolve(nextTutorbenchValue(args, index, "--submission")));
      index += 1;
      continue;
    }
    const submissionValue = tutorbenchOptionValue(argument, "--submission");
    if (submissionValue !== undefined) {
      submissionPaths.push(resolve(submissionValue));
      continue;
    }
    if (argument === "--output") {
      outputPath = resolve(nextTutorbenchValue(args, index, "--output"));
      index += 1;
      continue;
    }
    const outputValue = tutorbenchOptionValue(argument, "--output");
    if (outputValue !== undefined) {
      outputPath = resolve(outputValue);
      continue;
    }
    throw new TutorbenchCliUsageError(`Unknown option: ${argument}`);
  }
  if (packetDirectory === undefined) {
    throw new TutorbenchCliUsageError("--packet-dir requires a value.");
  }
  if (submissionPaths.length !== 2) {
    throw new TutorbenchCliUsageError("Exactly two --submission paths are required.");
  }
  return {
    help: false,
    mode: "import",
    packetDirectory,
    submissionPaths: [submissionPaths[0] as string, submissionPaths[1] as string],
    outputPath: outputPath ?? resolve(packetDirectory, "human-reference-annotations.json"),
  };
}

export function printHumanReferencePilotExportHelp(): void {
  console.log(`Tutor Benchmark human-reference blind pilot export

Usage:
  tutorbench human-reference-pilot-export --fixture word-context \\
    --annotator <opaque-id> --annotator <opaque-id> --output-dir <path>

Options:
  --fixture <id>          word-context (the only supported pilot fixture)
  --annotator <id>        Repeat exactly twice; opaque ID, not a name/email
  --pilot-id <id>         Stable pilot identity (default: ${HUMAN_REFERENCE_PILOT_DEFAULT_ID})
  --output-dir <path>     Directory for packets, templates, and the shared guide
  --help                  Show this help

The export is provider-free. Each packet contains the same allowlisted visible
task evidence and one annotator identity. Each matching submission template
contains only prefilled identity and atomic IDs; expected labels and Judge
output are not exported. One neutral annotation guide is shared by both
annotators.`);
}

export function printHumanReferencePilotImportHelp(): void {
  console.log(`Tutor Benchmark human-reference blind pilot import

Usage:
  tutorbench human-reference-pilot-import --packet-dir <path> \\
    --submission <annotator-a.completed.json> \\
    --submission <annotator-b.completed.json> --output <path>

Options:
  --packet-dir <path>     Directory containing exactly two *.packet.json files
  --submission <path>     Repeat exactly twice; one complete submission per packet
  --output <path>         Existing HumanReferenceAnnotationFile output path
  --help                  Show this help

The import is provider-free and fail-closed. It checks pilot identity, packet
fingerprint, task ownership, exact atomic coverage, and both annotator IDs,
then re-parses the converted canonical annotation file.`);
}

function atomicRequirementCount(exported: HumanReferencePilotExport): number {
  return exported.tasks.reduce(
    (count, task) => count + task.rubrics.reduce(
      (rubricCount, rubric) => rubricCount + rubric.requirements.length,
      0,
    ),
    0,
  );
}

export async function runHumanReferencePilotExport(
  options: Extract<HumanReferencePilotCliOptions, { readonly mode: "export"; readonly help: false }>,
): Promise<void> {
  const exported = await createHumanReferencePilotExport(options.annotatorIds, options.pilotId);
  if (options.fixture !== HUMAN_REFERENCE_PILOT_FIXTURE_ID) {
    throw new TutorbenchCliUsageError("--fixture currently supports only word-context.");
  }
  await Promise.all([
    ...exported.packets.map((packet) =>
      writeHumanReferencePilotJson(
        packet,
        resolve(options.outputDirectory, `${packet.annotatorId}.packet.json`),
      ),
    ),
    ...exported.templates.map((template) =>
      writeHumanReferencePilotJson(
        template,
        resolve(options.outputDirectory, `${template.annotatorId}.submission-template.json`),
      ),
    ),
    writeHumanReferencePilotAnnotationGuide(
      resolve(options.outputDirectory, "ANNOTATION_GUIDE.md"),
    ),
  ]);
  console.log([
    "Human-reference pilot export",
    `  Pilot: ${exported.pilotId}`,
    `  Fixture: ${exported.source.fixtureId}@${exported.source.fixtureVersion}`,
    `  Annotators: ${exported.packets.map((packet) => packet.annotatorId).join(", ")}`,
    `  Tasks: ${exported.tasks.length}`,
    `  Atomic requirements: ${atomicRequirementCount(exported)}`,
    `  Packets: ${exported.packets.map((packet) => `${packet.annotatorId}.packet.json`).join(", ")}`,
    `  Submission templates: ${exported.templates.map((template) => `${template.annotatorId}.submission-template.json`).join(", ")}`,
    "  Annotation guide: ANNOTATION_GUIDE.md",
    `  Output directory: ${options.outputDirectory}`,
  ].join("\n"));
}

export async function runHumanReferencePilotImport(
  options: Extract<HumanReferencePilotCliOptions, { readonly mode: "import"; readonly help: false }>,
): Promise<void> {
  const packets = await loadHumanReferencePilotPackets(options.packetDirectory);
  const submissions = await Promise.all(options.submissionPaths.map(loadHumanReferencePilotSubmission));
  const canonical = mergeHumanReferencePilotSubmissions(
    packets,
    submissions,
    await loadHumanReferencePilotTasks(),
  );
  await writeHumanReferencePilotJson(canonical, options.outputPath);
  const plannedAtomicAssessments = canonical.tasks.reduce(
    (count, task) => count + task.rubrics.reduce(
      (rubricCount, rubric) => rubricCount + rubric.requirements.length,
      0,
    ),
    0,
  );
  console.log([
    "Human-reference pilot import",
    `  Pilot: ${packets[0]?.pilotId ?? "unknown"}`,
    `  Annotators: ${canonical.requiredAnnotatorIds.join(", ")}`,
    `  Planned atomic assessments: ${plannedAtomicAssessments}`,
    `  Imported A: ${canonical.annotations.filter((annotation) => annotation.annotatorId === canonical.requiredAnnotatorIds[0]).length}`,
    `  Imported B: ${canonical.annotations.filter((annotation) => annotation.annotatorId === canonical.requiredAnnotatorIds[1]).length}`,
    `  Canonical annotations: ${canonical.annotations.length}`,
    `  Output: ${options.outputPath}`,
  ].join("\n"));
}
