import { readFile } from "node:fs/promises";

import { BenchmarkConfigurationError } from "../contracts/index.js";
import {
  parseTutorResponseCorpus,
  parseTutorVisibleCasePacketFile,
  type TutorResponseCorpus,
  type TutorVisibleCasePacketFile,
} from "../contracts/index.js";

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
}

export async function loadTutorResponseCorpus(
  path: string,
): Promise<TutorResponseCorpus> {
  return parseTutorResponseCorpus(await readJson(path));
}

export async function loadTutorVisibleCasePacketFile(
  path: string,
): Promise<TutorVisibleCasePacketFile> {
  return parseTutorVisibleCasePacketFile(await readJson(path));
}
