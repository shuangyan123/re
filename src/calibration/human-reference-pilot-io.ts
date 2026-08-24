import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  parseHumanReferencePilotPacket,
  parseHumanReferencePilotSubmission,
} from "../contracts/human-reference-pilot-validation.js";
import type {
  HumanReferencePilotPacket,
  HumanReferencePilotSubmissionTemplate,
  HumanReferencePilotSubmission,
} from "../contracts/human-reference-pilot.js";
import type { HumanReferenceAnnotationFile } from "../contracts/human-reference-calibration.js";

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
  }
}

export async function loadHumanReferencePilotPacket(
  path: string,
): Promise<HumanReferencePilotPacket> {
  return parseHumanReferencePilotPacket(await readJson(path));
}

export async function loadHumanReferencePilotSubmission(
  path: string,
): Promise<HumanReferencePilotSubmission> {
  return parseHumanReferencePilotSubmission(await readJson(path));
}

export async function loadHumanReferencePilotPackets(
  directory: string,
): Promise<readonly HumanReferencePilotPacket[]> {
  let packetPaths: string[];
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    packetPaths = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".packet.json"))
      .map((entry) => join(directory, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
  }
  if (packetPaths.length !== 2) {
    throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
  }
  return Promise.all(packetPaths.map(loadHumanReferencePilotPacket));
}

export async function writeHumanReferencePilotJson(
  value: HumanReferencePilotPacket | HumanReferenceAnnotationFile,
  outputPath: string,
): Promise<void>;

export async function writeHumanReferencePilotJson(
  value: HumanReferencePilotSubmission,
  outputPath: string,
): Promise<void>;

export async function writeHumanReferencePilotJson(
  value: HumanReferencePilotSubmissionTemplate,
  outputPath: string,
): Promise<void>;

export async function writeHumanReferencePilotJson(
  value: HumanReferencePilotPacket |
    HumanReferencePilotSubmission |
    HumanReferencePilotSubmissionTemplate |
    HumanReferenceAnnotationFile,
  outputPath: string,
): Promise<void> {
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  } catch {
    throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
  }
}

export async function writeHumanReferencePilotAnnotationGuide(
  outputPath: string,
  annotationGuide: string,
): Promise<void> {
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, annotationGuide, "utf8");
  } catch {
    throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
  }
}
