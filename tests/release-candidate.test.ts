import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  assertReleaseCandidateReport,
  RELEASE_CANDIDATE_PACKAGE_NAME,
  RELEASE_CANDIDATE_REPORT_KIND,
  RELEASE_CANDIDATE_SCHEMA_VERSION,
  RELEASE_CANDIDATE_STATUS,
} from "../src/release/release-candidate.js";

function workflowStep(workflow: string, name: string): string {
  const start = workflow.indexOf(`- name: ${name}`);
  assert.ok(start >= 0, `Missing workflow step: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + 1);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

function validReport(packageVersion = "0.1.0") {
  return {
    schemaVersion: RELEASE_CANDIDATE_SCHEMA_VERSION,
    reportKind: RELEASE_CANDIDATE_REPORT_KIND,
    packageName: RELEASE_CANDIDATE_PACKAGE_NAME,
    packageVersion,
    proposedTag: `v${packageVersion}`,
    releaseStatus: RELEASE_CANDIDATE_STATUS,
    sourceCommit: "0123456789abcdef0123456789abcdef01234567",
    nodeVersion: "v22.14.0",
    npmVersion: "11.5.1",
    packageFilename: `tutor-benchmark-${packageVersion}.tgz`,
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

test("release candidate package identity supports future semver releases without identity drift", () => {
  for (const packageVersion of ["0.1.0", "0.1.1", "0.2.0-beta.1"]) {
    assert.doesNotThrow(
      () => assertReleaseCandidateReport(validReport(packageVersion)),
      packageVersion,
    );
  }

  const malformedVersion = validReport("0.2");
  assert.throws(
    () => assertReleaseCandidateReport(malformedVersion),
    /packageVersion/,
  );

  const wrongTag = validReport("0.1.1");
  wrongTag.proposedTag = "v0.1.0";
  assert.throws(() => assertReleaseCandidateReport(wrongTag), /proposedTag/);

  const wrongFilename = validReport("0.1.1");
  wrongFilename.packageFilename = "tutor-benchmark-0.1.0.tgz";
  assert.throws(
    () => assertReleaseCandidateReport(wrongFilename),
    /packageFilename/,
  );

  const futureReport = validReport("0.2.0-beta.1");
  assert.equal(futureReport.quickstartIdentity.version, "0.1.0");
  assert.equal(futureReport.canonicalDatasetIdentity.version, "0.2a.5");
  assert.equal(futureReport.evaluatorVersion, "0.3a.4");
  assert.equal(futureReport.productionJudgePromptIdentity.version, "0.9");
  assert.equal(futureReport.materialJudgePromptIdentity.version, "0.4");
  assert.equal(futureReport.semanticAuditIdentity.version, "0.2.1");
  assert.equal(futureReport.qualificationIdentity.version, "0.1.1");
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

test("future npm workflow is explicit, OIDC-only, and stage-only", async () => {
  const workflow = await readFile(
    resolve(process.cwd(), ".github/workflows/npm-publish.yml"),
    "utf8",
  );
  assert.match(workflow, /^on:\s*\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+(push|pull_request|release|schedule|workflow_run):/m);
  assert.match(workflow, /runs-on:\s*ubuntu-latest/);
  assert.match(workflow, /node-version:\s*22\.23\.2/);
  assert.match(workflow, /npm@11\.19\.1/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s+read\s*\n\s+id-token:\s+write/m);
  assert.doesNotMatch(workflow, /\b(?:contents|packages|actions|pull-requests|issues):\s+write\b/);
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN|secrets\./i);
  assert.doesNotMatch(workflow, /\bnpm\s+publish\b/iu);
  assert.match(workflow, /npm\s+stage\s+publish\s+"artifacts\/release\/\$\{PACKAGE_FILENAME\}"/);
  assert.doesNotMatch(workflow, /npm\s+stage\s+(?:approve|reject)\b/iu);
  assert.match(workflow, /git\s+cat-file\s+-t/);
  assert.match(workflow, /git\s+rev-list\s+-n\s+1\s+"\$tag_ref"/);
  assert.match(workflow, /git\s+rev-parse\s+HEAD/);
  assert.match(workflow, /npm\s+view\s+"\$\{PACKAGE_NAME\}@\$\{PACKAGE_VERSION\}"/);
  assert.match(workflow, /npm run release:verify\b/);
  assert.match(workflow, /PACKAGE STAGED — AWAITING MAINTAINER 2FA APPROVAL/);
  assert.ok(
    workflow.indexOf("- name: Validate dispatch inputs") <
      workflow.indexOf("- name: Check out exact annotated release tag"),
  );
});

test("release verifier derives package release identity from package.json", async () => {
  const verifier = await readFile(
    resolve(process.cwd(), "scripts/verify-release-candidate.mjs"),
    "utf8",
  );
  assert.match(verifier, /const expectedPackageVersion = packageJson\.version/);
  assert.match(verifier, /const expectedTag = `v\$\{expectedPackageVersion\}`/);
  assert.match(verifier, /const expectedPackageFilename = `\$\{expectedPackageName\}-\$\{expectedPackageVersion\}\.tgz`/);
  assert.doesNotMatch(verifier, /expectedPackageVersion\s*=\s*["']0\.1\.0["']/);
  assert.doesNotMatch(verifier, /tutor-benchmark-0\.1\.0\.tgz/);
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
