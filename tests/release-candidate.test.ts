import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  assertReleaseCandidateReport,
  RELEASE_CANDIDATE_PACKAGE_NAME,
  RELEASE_CANDIDATE_PACKAGE_VERSION,
  RELEASE_CANDIDATE_REPORT_KIND,
  RELEASE_CANDIDATE_SCHEMA_VERSION,
  RELEASE_CANDIDATE_STATUS,
  RELEASE_CANDIDATE_TAG,
} from "../src/release/release-candidate.js";

function validReport() {
  return {
    schemaVersion: RELEASE_CANDIDATE_SCHEMA_VERSION,
    reportKind: RELEASE_CANDIDATE_REPORT_KIND,
    packageName: RELEASE_CANDIDATE_PACKAGE_NAME,
    packageVersion: RELEASE_CANDIDATE_PACKAGE_VERSION,
    proposedTag: RELEASE_CANDIDATE_TAG,
    releaseStatus: RELEASE_CANDIDATE_STATUS,
    sourceCommit: "0123456789abcdef0123456789abcdef01234567",
    nodeVersion: "v22.14.0",
    npmVersion: "11.5.1",
    packageFilename: "tutor-benchmark-0.1.0.tgz",
    packagePayloadFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    packageFileCount: 1,
    packageFiles: [
      {
        path: "package.json",
        size: 1,
        sha256: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    ],
    rawTarballFingerprint: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    rawTarballByteReproducible: false,
    quickstartIdentity: {
      id: "tutorbench-quickstart",
      version: "0.1.0",
      datasetId: "tutor-eval-v0.1",
      datasetVersion: "0.1",
      exampleTutorId: "scripted-quickstart-tutor",
      exampleTutorVersion: "1.0.0",
      evaluatorVersion: "0.3a.4",
      passedCount: 3,
      failedCount: 1,
      errorCount: 0,
      officialBenchmarkScore: false,
      publicLeaderboardEligible: false,
    },
    canonicalDatasetIdentity: { id: "tutor-eval-v0.2a", version: "0.2a.5", caseCount: 48 },
    evaluatorVersion: "0.3a.4",
    productionJudgePromptIdentity: {
      id: "tutor-eval-pedagogy-judge-system",
      version: "0.9",
      asset: "prompts/tutor-eval-pedagogy-judge-system-v0.9.md",
    },
    materialJudgePromptIdentity: {
      id: "tutor-eval-material-requirement-judge-system",
      version: "0.4",
      asset: "prompts/tutor-eval-material-requirement-judge-system-v0.4.md",
    },
    semanticAuditIdentity: {
      id: "human-reference-semantic-audit",
      version: "0.2.1",
      guideId: "human-reference-material-annotation-guide",
      guideVersion: "0.2.0",
      guideFingerprint: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    },
    qualificationIdentity: {
      id: "human-reference-semantic-audit-reviewer-comprehension",
      version: "0.1.1",
    },
    licenseIdentities: { software: "Apache-2.0", benchmarkContent: "CC-BY-4.0", brand: "TutorBench Brand Policy" },
    websiteArtifactIdentity: {
      path: "website/dist",
      fileCount: 1,
      byteCount: 1,
      payloadFingerprint: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    },
    verification: {
      sourceClean: true,
      packageContents: true,
      consumerInstall: true,
      packageRootImport: true,
      installedCliHelp: true,
      installedQuickstart: true,
      canonicalAssetLoad: true,
      licensesPresent: true,
      brandPolicyPresent: true,
      forbiddenContentAudit: true,
      optionalOpenAiPeerRequired: false,
      providerCalls: false,
      publicationSideEffects: false,
    },
  };
}

test("release candidate report contract locks public identities", () => {
  assert.doesNotThrow(() => assertReleaseCandidateReport(validReport()));
});

test("release candidate report rejects path-bearing or identity-drifting reports", () => {
  const invalid = validReport();
  invalid.sourceCommit = "C:\\Users\\developer\\release";
  assert.throws(() => assertReleaseCandidateReport(invalid), /sourceCommit/);

  const identityDrift = validReport();
  identityDrift.quickstartIdentity.failedCount = 0;
  assert.throws(() => assertReleaseCandidateReport(identityDrift), /failedCount/);
});

test("release validation workflow stays validation-only", async () => {
  const workflow = await readFile(resolve(process.cwd(), ".github/workflows/release.yml"), "utf8");
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.doesNotMatch(workflow, /id-token:\s*write/);
  assert.doesNotMatch(workflow, /npm publish|NODE_AUTH_TOKEN|NPM_TOKEN|gh release create/iu);
  assert.match(workflow, /release:verify/);
  assert.match(workflow, /release-candidate-report\.json/);
});
