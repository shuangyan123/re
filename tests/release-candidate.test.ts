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

function workflowStep(workflow: string, name: string): string {
  const start = workflow.indexOf(`- name: ${name}`);
  assert.ok(start >= 0, `Missing workflow step: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + 1);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

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

test("release validation recovers immutable tag checks for push and manual refs", async () => {
  const workflow = await readFile(resolve(process.cwd(), ".github/workflows/release.yml"), "utf8");
  const packageStep = workflowStep(workflow, "Read package version");
  assert.match(packageStep, /run:\s*\|/);
  assert.ok(
    packageStep.includes(`version=$(node -p "require('./package.json').version")`),
  );
  assert.ok(
    packageStep.includes(`printf 'version=%s\\n' "$version" >> "$GITHUB_OUTPUT"`),
  );
  assert.doesNotMatch(packageStep, /run:\s+echo\s+"version=/);

  const tagStep = workflowStep(workflow, "Check tag and package version");
  assert.match(tagStep, /github\.event_name == 'push'/);
  assert.match(tagStep, /startsWith\(github\.ref, 'refs\/tags\/'\)/);
  assert.match(tagStep, /github\.event_name == 'workflow_dispatch'/);
  assert.match(tagStep, /startsWith\(inputs\.ref, 'refs\/tags\/'\)/);
  assert.match(tagStep, /startsWith\(inputs\.ref, 'v'\)/);
  assert.match(tagStep, /RELEASE_REF:\s+\$\{\{\s*inputs\.ref\s*\|\|\s*github\.ref\s*\}\}/);
  assert.match(tagStep, /tag="\$\{RELEASE_REF#refs\/tags\/\}"/);
  assert.match(tagStep, /node scripts\/validate-release-version\.mjs "\$tag"/);
  assert.doesNotMatch(tagStep, /node scripts\/validate-release-version\.mjs "\$GITHUB_REF_NAME"/);

  for (const artifactName of [
    "tutor-benchmark-${{ steps.package.outputs.version }}",
    "tutor-benchmark-website-${{ steps.package.outputs.version }}",
    "tutor-benchmark-release-candidate-${{ steps.package.outputs.version }}",
  ]) {
    assert.ok(workflow.includes(artifactName), artifactName);
  }

  const tagCondition = tagStep.slice(tagStep.indexOf("if:"), tagStep.indexOf("env:"));
  assert.doesNotMatch(tagCondition, /inputs\.ref\s*(?:==|!=)\s*['"]main['"]/);
});
