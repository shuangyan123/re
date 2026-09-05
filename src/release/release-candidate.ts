export const RELEASE_CANDIDATE_SCHEMA_VERSION = 1 as const;
export const RELEASE_CANDIDATE_REPORT_KIND = "TutorBenchReleaseCandidateReport" as const;
export const RELEASE_CANDIDATE_PACKAGE_NAME = "tutor-benchmark" as const;
export const RELEASE_CANDIDATE_PACKAGE_VERSION = "0.1.0" as const;
export const RELEASE_CANDIDATE_TAG = "v0.1.0" as const;
export const RELEASE_CANDIDATE_STATUS = "Developer Preview" as const;

export interface ReleaseCandidatePackageFile {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

export interface ReleaseCandidateReport {
  readonly schemaVersion: typeof RELEASE_CANDIDATE_SCHEMA_VERSION;
  readonly reportKind: typeof RELEASE_CANDIDATE_REPORT_KIND;
  readonly packageName: typeof RELEASE_CANDIDATE_PACKAGE_NAME;
  readonly packageVersion: typeof RELEASE_CANDIDATE_PACKAGE_VERSION;
  readonly proposedTag: typeof RELEASE_CANDIDATE_TAG;
  readonly releaseStatus: typeof RELEASE_CANDIDATE_STATUS;
  readonly sourceCommit: string;
  readonly nodeVersion: string;
  readonly npmVersion: string;
  readonly packageFilename: string;
  readonly packagePayloadFingerprint: string;
  readonly packageFileCount: number;
  readonly packageFiles: readonly ReleaseCandidatePackageFile[];
  readonly rawTarballFingerprint: string;
  readonly rawTarballByteReproducible: boolean;
  readonly quickstartIdentity: {
    readonly id: "tutorbench-quickstart";
    readonly version: "0.1.0";
    readonly datasetId: "tutor-eval-v0.1";
    readonly datasetVersion: "0.1";
    readonly exampleTutorId: "scripted-quickstart-tutor";
    readonly exampleTutorVersion: "1.0.0";
    readonly evaluatorVersion: "0.3a.4";
    readonly passedCount: 3;
    readonly failedCount: 1;
    readonly errorCount: 0;
    readonly officialBenchmarkScore: false;
    readonly publicLeaderboardEligible: false;
  };
  readonly canonicalDatasetIdentity: {
    readonly id: "tutor-eval-v0.2a";
    readonly version: "0.2a.5";
    readonly caseCount: 48;
  };
  readonly evaluatorVersion: "0.3a.4";
  readonly productionJudgePromptIdentity: {
    readonly id: "tutor-eval-pedagogy-judge-system";
    readonly version: "0.9";
    readonly asset: "prompts/tutor-eval-pedagogy-judge-system-v0.9.md";
  };
  readonly materialJudgePromptIdentity: {
    readonly id: "tutor-eval-material-requirement-judge-system";
    readonly version: "0.4";
    readonly asset: "prompts/tutor-eval-material-requirement-judge-system-v0.4.md";
  };
  readonly semanticAuditIdentity: {
    readonly id: "human-reference-semantic-audit";
    readonly version: "0.2.1";
    readonly guideId: "human-reference-material-annotation-guide";
    readonly guideVersion: "0.2.0";
    readonly guideFingerprint: string;
  };
  readonly qualificationIdentity: {
    readonly id: "human-reference-semantic-audit-reviewer-comprehension";
    readonly version: "0.1.1";
  };
  readonly licenseIdentities: {
    readonly software: "Apache-2.0";
    readonly benchmarkContent: "CC-BY-4.0";
    readonly brand: "TutorBench Brand Policy";
  };
  readonly websiteArtifactIdentity: {
    readonly path: "website/dist";
    readonly fileCount: number;
    readonly byteCount: number;
    readonly payloadFingerprint: string;
  };
  readonly verification: {
    readonly sourceClean: true;
    readonly packageContents: true;
    readonly consumerInstall: true;
    readonly packageRootImport: true;
    readonly installedCliHelp: true;
    readonly installedQuickstart: true;
    readonly canonicalAssetLoad: true;
    readonly licensesPresent: true;
    readonly brandPolicyPresent: true;
    readonly forbiddenContentAudit: true;
    readonly optionalOpenAiPeerRequired: false;
    readonly providerCalls: false;
    readonly publicationSideEffects: false;
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactString(value: unknown, expected: string, label: string): void {
  if (value !== expected) {
    throw new Error(`${label} must be ${expected}.`);
  }
}

function exactBoolean(value: unknown, expected: boolean, label: string): void {
  if (value !== expected) {
    throw new Error(`${label} must be ${String(expected)}.`);
  }
}

function exactNumber(value: unknown, expected: number, label: string): void {
  if (value !== expected) {
    throw new Error(`${label} must be ${String(expected)}.`);
  }
}

function fingerprint(value: unknown, label: string): void {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be a sha256 fingerprint.`);
  }
}

/**
 * Validates the machine-readable RC report without accepting mutable paths,
 * release timestamps, credentials, or benchmark identity drift.
 */
export function assertReleaseCandidateReport(
  value: unknown,
): asserts value is ReleaseCandidateReport {
  const report = record(value, "Release candidate report");
  exactNumber(report.schemaVersion, RELEASE_CANDIDATE_SCHEMA_VERSION, "schemaVersion");
  exactString(report.reportKind, RELEASE_CANDIDATE_REPORT_KIND, "reportKind");
  exactString(report.packageName, RELEASE_CANDIDATE_PACKAGE_NAME, "packageName");
  exactString(report.packageVersion, RELEASE_CANDIDATE_PACKAGE_VERSION, "packageVersion");
  exactString(report.proposedTag, RELEASE_CANDIDATE_TAG, "proposedTag");
  exactString(report.releaseStatus, RELEASE_CANDIDATE_STATUS, "releaseStatus");
  if (typeof report.sourceCommit !== "string" || !/^[0-9a-f]{40}$/u.test(report.sourceCommit)) {
    throw new Error("sourceCommit must be a 40-character lowercase commit SHA.");
  }
  if (typeof report.nodeVersion !== "string" || typeof report.npmVersion !== "string") {
    throw new Error("Runtime versions must be strings.");
  }
  exactString(report.packageFilename, "tutor-benchmark-0.1.0.tgz", "packageFilename");
  fingerprint(report.packagePayloadFingerprint, "packagePayloadFingerprint");
  if (
    typeof report.packageFileCount !== "number" ||
    !Number.isInteger(report.packageFileCount) ||
    report.packageFileCount <= 0
  ) {
    throw new Error("packageFileCount must be a positive integer.");
  }
  fingerprint(report.rawTarballFingerprint, "rawTarballFingerprint");
  if (typeof report.rawTarballByteReproducible !== "boolean") {
    throw new Error("rawTarballByteReproducible must be a boolean.");
  }

  if (!Array.isArray(report.packageFiles) || report.packageFiles.length !== report.packageFileCount) {
    throw new Error("packageFiles must match packageFileCount.");
  }
  let previousPath = "";
  for (const [index, item] of report.packageFiles.entries()) {
    const file = record(item, `packageFiles[${index}]`);
    if (
      typeof file.path !== "string" ||
      file.path.length === 0 ||
      file.path.includes("..") ||
      file.path.startsWith("/") ||
      /^[A-Za-z]:/u.test(file.path) ||
      (previousPath.length > 0 && file.path <= previousPath)
    ) {
      throw new Error("packageFiles must contain sorted, relative paths.");
    }
    previousPath = file.path;
    if (
      typeof file.size !== "number" ||
      !Number.isInteger(file.size) ||
      file.size < 0
    ) {
      throw new Error(`packageFiles[${index}].size must be a non-negative integer.`);
    }
    fingerprint(file.sha256, `packageFiles[${index}].sha256`);
  }

  const quickstart = record(report.quickstartIdentity, "quickstartIdentity");
  exactString(quickstart.id, "tutorbench-quickstart", "quickstartIdentity.id");
  exactString(quickstart.version, "0.1.0", "quickstartIdentity.version");
  exactString(quickstart.datasetId, "tutor-eval-v0.1", "quickstartIdentity.datasetId");
  exactString(quickstart.datasetVersion, "0.1", "quickstartIdentity.datasetVersion");
  exactString(quickstart.exampleTutorId, "scripted-quickstart-tutor", "quickstartIdentity.exampleTutorId");
  exactString(quickstart.exampleTutorVersion, "1.0.0", "quickstartIdentity.exampleTutorVersion");
  exactString(quickstart.evaluatorVersion, "0.3a.4", "quickstartIdentity.evaluatorVersion");
  exactNumber(quickstart.passedCount, 3, "quickstartIdentity.passedCount");
  exactNumber(quickstart.failedCount, 1, "quickstartIdentity.failedCount");
  exactNumber(quickstart.errorCount, 0, "quickstartIdentity.errorCount");
  exactBoolean(quickstart.officialBenchmarkScore, false, "quickstartIdentity.officialBenchmarkScore");
  exactBoolean(quickstart.publicLeaderboardEligible, false, "quickstartIdentity.publicLeaderboardEligible");

  const canonicalDataset = record(report.canonicalDatasetIdentity, "canonicalDatasetIdentity");
  exactString(canonicalDataset.id, "tutor-eval-v0.2a", "canonicalDatasetIdentity.id");
  exactString(canonicalDataset.version, "0.2a.5", "canonicalDatasetIdentity.version");
  exactNumber(canonicalDataset.caseCount, 48, "canonicalDatasetIdentity.caseCount");
  exactString(report.evaluatorVersion, "0.3a.4", "evaluatorVersion");

  const productionJudge = record(report.productionJudgePromptIdentity, "productionJudgePromptIdentity");
  exactString(productionJudge.id, "tutor-eval-pedagogy-judge-system", "productionJudgePromptIdentity.id");
  exactString(productionJudge.version, "0.9", "productionJudgePromptIdentity.version");
  exactString(productionJudge.asset, "prompts/tutor-eval-pedagogy-judge-system-v0.9.md", "productionJudgePromptIdentity.asset");
  const materialJudge = record(report.materialJudgePromptIdentity, "materialJudgePromptIdentity");
  exactString(materialJudge.id, "tutor-eval-material-requirement-judge-system", "materialJudgePromptIdentity.id");
  exactString(materialJudge.version, "0.4", "materialJudgePromptIdentity.version");
  exactString(materialJudge.asset, "prompts/tutor-eval-material-requirement-judge-system-v0.4.md", "materialJudgePromptIdentity.asset");

  const semanticAudit = record(report.semanticAuditIdentity, "semanticAuditIdentity");
  exactString(semanticAudit.id, "human-reference-semantic-audit", "semanticAuditIdentity.id");
  exactString(semanticAudit.version, "0.2.1", "semanticAuditIdentity.version");
  exactString(semanticAudit.guideId, "human-reference-material-annotation-guide", "semanticAuditIdentity.guideId");
  exactString(semanticAudit.guideVersion, "0.2.0", "semanticAuditIdentity.guideVersion");
  fingerprint(semanticAudit.guideFingerprint, "semanticAuditIdentity.guideFingerprint");
  const qualification = record(report.qualificationIdentity, "qualificationIdentity");
  exactString(qualification.id, "human-reference-semantic-audit-reviewer-comprehension", "qualificationIdentity.id");
  exactString(qualification.version, "0.1.1", "qualificationIdentity.version");

  const licenses = record(report.licenseIdentities, "licenseIdentities");
  exactString(licenses.software, "Apache-2.0", "licenseIdentities.software");
  exactString(licenses.benchmarkContent, "CC-BY-4.0", "licenseIdentities.benchmarkContent");
  exactString(licenses.brand, "TutorBench Brand Policy", "licenseIdentities.brand");

  const website = record(report.websiteArtifactIdentity, "websiteArtifactIdentity");
  exactString(website.path, "website/dist", "websiteArtifactIdentity.path");
  if (
    typeof website.fileCount !== "number" ||
    !Number.isInteger(website.fileCount) ||
    website.fileCount <= 0
  ) {
    throw new Error("websiteArtifactIdentity.fileCount must be a positive integer.");
  }
  if (
    typeof website.byteCount !== "number" ||
    !Number.isInteger(website.byteCount) ||
    website.byteCount <= 0
  ) {
    throw new Error("websiteArtifactIdentity.byteCount must be a positive integer.");
  }
  fingerprint(website.payloadFingerprint, "websiteArtifactIdentity.payloadFingerprint");

  const verification = record(report.verification, "verification");
  for (const key of [
    "sourceClean",
    "packageContents",
    "consumerInstall",
    "packageRootImport",
    "installedCliHelp",
    "installedQuickstart",
    "canonicalAssetLoad",
    "licensesPresent",
    "brandPolicyPresent",
    "forbiddenContentAudit",
  ]) {
    exactBoolean(verification[key], true, `verification.${key}`);
  }
  exactBoolean(verification.optionalOpenAiPeerRequired, false, "verification.optionalOpenAiPeerRequired");
  exactBoolean(verification.providerCalls, false, "verification.providerCalls");
  exactBoolean(verification.publicationSideEffects, false, "verification.publicationSideEffects");

  const serialized = JSON.stringify(value);
  if (/[A-Za-z]:[\\/]|(?:^|["\s])\/(?:Users|home|private|tmp)\//iu.test(serialized)) {
    throw new Error("Release candidate report contains an absolute local path.");
  }
  if (/(?:ghp_|github_pat_|sk-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{20,})/iu.test(serialized)) {
    throw new Error("Release candidate report contains a credential-like value.");
  }
}
