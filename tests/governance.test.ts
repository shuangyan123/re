import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_DATASET_VERSION,
  TUTOR_EVAL_EVALUATOR_VERSION,
} from "../src/contracts/index.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_FINGERPRINT,
} from "../src/contracts/human-reference-semantic-audit.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_PILOT_2_SOURCE_TASK_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_GUIDE_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_TASK_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_PRESENTATION_FINGERPRINT,
} from "../src/calibration/human-reference-semantic-audit-v2.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_DEFINITION_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PRESENTATION_FINGERPRINT,
} from "../src/calibration/human-reference-semantic-audit-v2-1.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_EXPECTED_ASSESSMENTS,
} from "../src/calibration/human-reference-semantic-audit-qualification-fixture.js";
import {
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_ASSET,
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID,
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION,
  TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ASSET,
  TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ID,
  TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
} from "../src/judge/index.js";

const repositoryRoot = process.cwd();

const requiredGovernanceFiles = [
  "LICENSE",
  "LICENSES.md",
  "LICENSES/CC-BY-4.0.txt",
  "LICENSES/BRAND-POLICY.md",
  "NOTICE",
  "docs/licensing.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  "CITATION.cff",
  ".github/pull_request_template.md",
  ".github/ISSUE_TEMPLATE/bug.yml",
  ".github/ISSUE_TEMPLATE/benchmark-case.yml",
  ".github/ISSUE_TEMPLATE/methodology.yml",
  ".github/ISSUE_TEMPLATE/model-run.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
] as const;

const frozenFileHashes = {
  "scenarios/tutor-eval-v0.2a/cases.json":
    "c15ad221b4d536ea8b843093bb51c0c75ce4e04b739b42ddbf04bf4d29655b67",
  "scenarios/tutor-eval-v0.2a/cases.zh-CN.json":
    "b053d79ea20c4e03eee75dcc6a403cd69989ce04e530ccd71de7275568a21db6",
  "prompts/tutor-eval-pedagogy-judge-system-v0.9.md":
    "75c3382942b4858f6e77513d68760cf2e99a7a8b22d9dc032d38261049842012",
  "prompts/tutor-eval-material-requirement-judge-system-v0.4.md":
    "06f11fe2fab277ce053b408d89f66aad4c46581391074c1779c72def01725316",
  "src/calibration/human-reference-semantic-audit-qualification-fixture.ts":
    "d013c84b650906b044ec09e487c11dcd102026e7a702ea92e1f3db2f1e77e7f9",
} as const;

async function readRepositoryFile(relativePath: string): Promise<string> {
  return readFile(resolve(repositoryRoot, relativePath), "utf8");
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

test("public governance files, package metadata, and issue entry points are explicit", async () => {
  for (const relativePath of requiredGovernanceFiles) {
    assert.ok((await readRepositoryFile(relativePath)).trim().length > 0, relativePath);
  }

  const packageJson = JSON.parse(await readRepositoryFile("package.json")) as {
    readonly license?: unknown;
    readonly files?: readonly unknown[];
  };
  assert.equal(packageJson.license, "SEE LICENSE IN LICENSES.md");
  const packageFiles = new Set(
    (packageJson.files ?? []).map((value) => String(value)),
  );
  for (const packagePath of [
    "LICENSE",
    "LICENSES.md",
    "LICENSES/CC-BY-4.0.txt",
    "LICENSES/BRAND-POLICY.md",
    "NOTICE",
    "docs/licensing.md",
    "assets/brand/tutorbench/web/",
    "assets/brand/tutorbench/raster/",
  ]) {
    assert.ok(packageFiles.has(packagePath), packagePath);
  }

  const apache = await readRepositoryFile("LICENSE");
  assert.match(apache, /Apache License\s+Version 2\.0, January 2004/);
  assert.match(apache, /END OF TERMS AND CONDITIONS/);
  const contentLicense = await readRepositoryFile("LICENSES/CC-BY-4.0.txt");
  assert.match(contentLicense, /Creative Commons Attribution 4\.0 International/);
  assert.match(contentLicense, /creativecommons\.org\/licenses\/by\/4\.0\/legalcode/);
  const licenseMap = await readRepositoryFile("LICENSES.md");
  assert.match(licenseMap, /Apache-2\.0/);
  assert.match(licenseMap, /CC-BY-4\.0/);
  assert.match(licenseMap, /TutorBench Brand Policy/);
  assert.match(await readRepositoryFile("LICENSES/BRAND-POLICY.md"), /Official TutorBench/);
  assert.match(await readRepositoryFile(".github/workflows/release.yml"), /npm run test:governance/);

  const readme = await readRepositoryFile("README.md");
  for (const link of [
    "(LICENSE)",
    "(docs/licensing.md)",
    "(LICENSES/CC-BY-4.0.txt)",
    "(LICENSES/BRAND-POLICY.md)",
    "(CONTRIBUTING.md)",
    "(SECURITY.md)",
  ]) {
    assert.ok(readme.includes(link), link);
  }

  const citation = await readRepositoryFile("CITATION.cff");
  assert.match(citation, /version: "0\.1\.0"/);
  assert.match(citation, /license: "other"/);
  assert.match(citation, /LICENSES\.md/);
});

test("release governance validator passes and preserves benchmark identities", async () => {
  const validation = spawnSync(
    process.execPath,
    [resolve(repositoryRoot, "scripts", "validate-governance.mjs")],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(validation.status, 0, validation.stderr.toString());
  assert.match(validation.stdout.toString(), /Governance validation passed/);

  assert.equal(TUTOR_EVAL_DATASET_ID, "tutor-eval-v0.2a");
  assert.equal(TUTOR_EVAL_DATASET_VERSION, "0.2a.5");
  assert.equal(TUTOR_EVAL_EVALUATOR_VERSION, "0.3a.4");
  assert.equal(TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ID, "tutor-eval-pedagogy-judge-system");
  assert.equal(TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION, "0.9");
  assert.equal(TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ASSET, "prompts/tutor-eval-pedagogy-judge-system-v0.9.md");
  assert.equal(MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID, "tutor-eval-material-requirement-judge-system");
  assert.equal(MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION, "0.4");
  assert.equal(MATERIAL_REQUIREMENT_JUDGE_PROMPT_ASSET, "prompts/tutor-eval-material-requirement-judge-system-v0.4.md");

  for (const [relativePath, expectedHash] of Object.entries(frozenFileHashes)) {
    assert.equal(
      sha256(await readFile(resolve(repositoryRoot, relativePath))),
      expectedHash,
      `Frozen benchmark file changed: ${relativePath}`,
    );
  }

  assert.deepEqual(
    HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_EXPECTED_ASSESSMENTS.map((assessment) => ({
      caseId: assessment.caseId,
      rubricId: assessment.rubricId,
      requirementId: assessment.requirementId,
      status: assessment.status,
    })),
    [
      { caseId: "qualification-omission-negative", rubricId: "qualification-omission-negative", requirementId: "Q1", status: "OMITTED_OR_INCOMPLETE" },
      { caseId: "qualification-omission-negative", rubricId: "qualification-omission-negative", requirementId: "Q2", status: "SATISFIED" },
      { caseId: "qualification-support-sufficiency", rubricId: "qualification-support-sufficiency", requirementId: "Q1", status: "SATISFIED" },
      { caseId: "qualification-support-sufficiency", rubricId: "qualification-support-sufficiency", requirementId: "Q2", status: "EXPLICIT_CONFLICT" },
      { caseId: "qualification-contextual-correction", rubricId: "qualification-contextual-correction", requirementId: "Q1", status: "SATISFIED" },
      { caseId: "qualification-contextual-correction", rubricId: "qualification-contextual-correction", requirementId: "Q2", status: "SATISFIED" },
      { caseId: "qualification-unsupported-verdict", rubricId: "qualification-unsupported-verdict", requirementId: "Q1", status: "OMITTED_OR_INCOMPLETE" },
      { caseId: "qualification-unsupported-verdict", rubricId: "qualification-unsupported-verdict", requirementId: "Q2", status: "EXPLICIT_CONFLICT" },
    ],
  );

  assert.deepEqual(
    {
      guide: HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_FINGERPRINT,
      pilotSource: HUMAN_REFERENCE_SEMANTIC_AUDIT_PILOT_2_SOURCE_TASK_FINGERPRINT,
      localizedGuide: HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_GUIDE_FINGERPRINT,
      localizedTask: HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_TASK_FINGERPRINT,
      localizedPresentation: HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_PRESENTATION_FINGERPRINT,
      qualification: HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_FINGERPRINT,
      qualificationPresentation: HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PRESENTATION_FINGERPRINT,
      qualificationDefinition: HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_DEFINITION_FINGERPRINT,
    },
    {
      guide: "sha256:dcf8ebba67250311a134788919984f13777a51516cb6294ed4c24742be65ff3a",
      pilotSource: "sha256:2e73aa96062b00908fe9f329e744cf91cb3f127865bce02ea33356069bb09285",
      localizedGuide: "sha256:346a18d21cfdf6989081456481cdce7d257060c7ff8f1ff9d4e1d2a4f94d624f",
      localizedTask: "sha256:c8d5343fc1d41d42c1d1ad928967dd44de03afd8fc5fcc1dbc6328edabb53a18",
      localizedPresentation: "sha256:e92fbc2182bfc544b2499e17673b9e1c2cf902eab8dc555388b6ee6fb3e1f661",
      qualification: "sha256:65f43e191a04301ef83b796af5395ffb46f3a6ae143bf4ea983d8a2439cdb291",
      qualificationPresentation: "sha256:65f43e191a04301ef83b796af5395ffb46f3a6ae143bf4ea983d8a2439cdb291",
      qualificationDefinition: "sha256:3a86b044b7f7f5d06536092e649095512a7e983bb94a899d175b0dd77ba9dec7",
    },
  );
});
