import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const expectedPackageName = "tutor-benchmark";

function run(command, args, cwd, environment = process.env, options = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: environment,
      shell: options.shell ?? false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}.\n${stdout}\n${stderr}`));
        return;
      }
      resolveResult({ stdout, stderr });
    });
  });
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pathIsWithin(baseDirectory, candidate) {
  const relativePath = relative(baseDirectory, candidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function normalizeRelativePath(value) {
  const normalized = String(value).replaceAll("\\", "/");
  assertCondition(
    normalized.length > 0 && !normalized.startsWith("/") && !/^[A-Za-z]:/u.test(normalized),
    `Expected a relative path: ${normalized}`,
  );
  assertCondition(!normalized.split("/").includes(".."), `Path traversal is not allowed: ${normalized}`);
  return normalized;
}

async function collectFileManifest(directory, relativeDirectory = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = relativeDirectory ? join(relativeDirectory, entry.name) : entry.name;
    const absolutePath = join(directory, entry.name);
    const stats = await lstat(absolutePath);
    assertCondition(!stats.isSymbolicLink(), `Artifact contains a symbolic link: ${relativePath}`);
    if (entry.isDirectory()) {
      files.push(...(await collectFileManifest(absolutePath, relativePath)));
    } else if (entry.isFile()) {
      const bytes = await readFile(absolutePath);
      files.push({
        path: normalizeRelativePath(relativePath),
        size: bytes.byteLength,
        sha256: sha256(bytes),
      });
    }
  }
  return files.sort((left, right) => comparePaths(left.path, right.path));
}

function manifestFingerprint(files) {
  return sha256(Buffer.from(`${canonicalJson(files)}\n`, "utf8"));
}

function packageEnvironment(temporaryRoot) {
  const environment = { ...process.env };
  for (const key of [
    "OPENAI_API_KEY",
    "DEEPSEEK_API_KEY",
    "MINIMAX_API_KEY",
    "TUTOR_MODEL_API_KEY",
    "CHAT_COMPLETIONS_JUDGE_API_KEY",
    "NPM_TOKEN",
    "NODE_AUTH_TOKEN",
  ]) {
    delete environment[key];
  }
  environment.npm_config_cache = join(temporaryRoot, "npm-cache");
  environment.npm_config_userconfig = join(temporaryRoot, "npmrc");
  environment.npm_config_audit = "false";
  environment.npm_config_fund = "false";
  environment.npm_config_update_notifier = "false";
  return environment;
}

function parseOptions(args) {
  let outputDirectory = "artifacts/release";
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--output-dir") {
      const value = args[index + 1];
      assertCondition(value !== undefined && !value.startsWith("--"), "--output-dir requires a directory.");
      outputDirectory = value;
      index += 1;
      continue;
    }
    if (argument?.startsWith("--output-dir=")) {
      outputDirectory = argument.slice("--output-dir=".length);
      assertCondition(outputDirectory.length > 0, "--output-dir requires a directory.");
      continue;
    }
    throw new Error(`Unknown option: ${argument ?? ""}`);
  }
  return { outputDirectory: resolve(repositoryRoot, outputDirectory) };
}

async function readPackageJson() {
  return JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
}

async function assertSourceIsClean() {
  const result = await run(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    repositoryRoot,
  );
  assertCondition(result.stdout.trim() === "", "Release verification requires a clean source checkout.");
}

async function sourceCommit() {
  const result = await run("git", ["rev-parse", "--verify", "HEAD^{commit}"], repositoryRoot);
  const commit = result.stdout.trim();
  assertCondition(/^[0-9a-f]{40}$/u.test(commit), "Could not resolve a full source commit SHA.");
  return commit;
}

function parsePackInfo(stdout) {
  const parsed = JSON.parse(stdout);
  assertCondition(Array.isArray(parsed) && parsed[0] !== undefined, "npm pack returned no package metadata.");
  return parsed[0];
}

async function buildPackagePayload(packInfo) {
  const paths = packInfo.files
    .map((file) => normalizeRelativePath(file.path))
    .sort(comparePaths);
  assertCondition(new Set(paths).size === paths.length, "npm pack returned duplicate package paths.");
  const files = [];
  for (const path of paths) {
    const absolutePath = resolve(repositoryRoot, path);
    assertCondition(pathIsWithin(repositoryRoot, absolutePath), `Package path escapes the repository: ${path}`);
    const stats = await lstat(absolutePath);
    assertCondition(stats.isFile() && !stats.isSymbolicLink(), `Package path is not a regular file: ${path}`);
    const bytes = await readFile(absolutePath);
    files.push({ path, size: bytes.byteLength, sha256: sha256(bytes) });
  }
  return files;
}

function auditPackagePaths(files) {
  const required = [
    "package.json",
    "README.md",
    "dist/src/index.js",
    "dist/src/index.d.ts",
    "dist/src/cli/tutorbench.js",
    "dist/src/quickstart.js",
    "scenarios/tutor-eval-v0.2a/cases.json",
    "scenarios/tutor-eval-v0.2a/cases.zh-CN.json",
    "scenarios/tutor-eval-v0.1/cases.json",
    "prompts/tutor-baseline-system-v0.1.md",
    "prompts/tutor-eval-pedagogy-judge-system-v0.9.md",
    "prompts/tutor-eval-material-requirement-judge-system-v0.4.md",
    "assets/brand/tutorbench/web/tutorbench-mark.svg",
    "assets/brand/tutorbench/raster/favicon-32.png",
    "LICENSE",
    "LICENSES.md",
    "LICENSES/CC-BY-4.0.txt",
    "LICENSES/BRAND-POLICY.md",
    "NOTICE",
    "docs/licensing.md",
    "docs/quickstart.md",
  ];
  const paths = new Set(files.map((file) => file.path));
  for (const path of required) {
    assertCondition(paths.has(path), `Package is missing ${path}.`);
  }
  const forbidden = [
    /(^|\/)(\.agents|\.github|tests|fixtures|artifacts|data\/private|website\/private-dist|website\/dist|\.git|node_modules)(\/|$)/iu,
    /(^|\/)(\.env(?:\.|$)|\.npmrc$|credentials?|cookies?|secrets?)(\/|$)/iu,
    /(^|\/)(?:real-model|human-reviewer|calibration-submissions|screenshots)(\/|$)/iu,
  ];
  for (const file of files) {
    assertCondition(!forbidden.some((pattern) => pattern.test(file.path)), `Package contains forbidden path: ${file.path}`);
    assertCondition(
      !(file.path.endsWith(".ts") && !file.path.endsWith(".d.ts")),
      `Package contains a source TypeScript file: ${file.path}`,
    );
  }
}

async function auditPackageText(files) {
  const textExtensions = new Set([".css", ".d.ts", ".html", ".js", ".json", ".map", ".md", ".svg"]);
  for (const file of files) {
    const extension = file.path.slice(file.path.lastIndexOf(".")).toLowerCase();
    if (!textExtensions.has(extension)) continue;
    const content = await readFile(resolve(repositoryRoot, file.path), "utf8");
    assertCondition(!/[A-Za-z]:[\\/](?:Users|home)[\\/]/iu.test(content), `Package contains a local Windows path: ${file.path}`);
    assertCondition(!/(?:^|["\s])\/(?:Users|home)\/[^\s"']+/iu.test(content), `Package contains a local POSIX path: ${file.path}`);
    assertCondition(!/(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{20,})/iu.test(content), `Package contains a credential-like value: ${file.path}`);
  }
}

async function loadBuiltIdentities() {
  const importBuilt = (path) => import(pathToFileURL(join(repositoryRoot, "dist", "src", path)).href);
  const [contracts, judge, quickstart, semanticAudit, semanticV2, semanticV21] = await Promise.all([
    importBuilt("contracts/index.js"),
    importBuilt("judge/index.js"),
    importBuilt("quickstart.js"),
    importBuilt("contracts/human-reference-semantic-audit.js"),
    importBuilt("contracts/human-reference-semantic-audit-v2.js"),
    importBuilt("contracts/human-reference-semantic-audit-v2-1.js"),
  ]);
  return { contracts, judge, quickstart, semanticAudit, semanticV2, semanticV21 };
}

async function writeConsumerScript(consumerRoot, reportPath) {
  const scriptPath = join(consumerRoot, "consumer.mjs");
  const script = `import { writeFile } from "node:fs/promises";
import { createHttpTutor, loadTutorEvalDataset, runTutorBenchmark } from "tutor-benchmark";

const dataset = await loadTutorEvalDataset();
if (dataset.id !== "tutor-eval-v0.2a" || dataset.version !== "0.2a.5" || dataset.cases.length !== 48) {
  throw new Error("Installed package did not load the canonical dataset asset identity.");
}
const firstCase = dataset.cases[0];
if (firstCase === undefined) throw new Error("Canonical dataset is empty.");
const result = await runTutorBenchmark({
  dataset: { ...dataset, cases: [firstCase] },
  tutor: { id: "package-consumer-smoke", async respond() { return { text: "Try the next small step." }; } },
});
if (result.caseRunCount !== 1 || result.datasetId !== dataset.id || result.datasetVersion !== dataset.version) {
  throw new Error("Installed package public runner did not execute one canonical case.");
}
const httpTutor = createHttpTutor({ id: "package-consumer-http", endpoint: "http://127.0.0.1:1/respond" });
if (httpTutor.endpoint !== "http://127.0.0.1:1/respond") {
  throw new Error("Installed package HTTP adapter did not preserve its endpoint.");
}
let optionalOpenAiPeerInstalled = true;
try {
  await import("openai");
} catch (error) {
  if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
  optionalOpenAiPeerInstalled = false;
}
if (optionalOpenAiPeerInstalled) throw new Error("The optional OpenAI peer was installed unexpectedly.");
await writeFile(${JSON.stringify(reportPath)}, JSON.stringify({
  canonicalDataset: { id: dataset.id, version: dataset.version, caseCount: dataset.cases.length },
  packageRootImport: true,
  optionalOpenAiPeerInstalled,
}, null, 2) + "\\n", "utf8");
console.log("consumer API smoke passed");
`;
  await writeFile(scriptPath, script, "utf8");
  return scriptPath;
}

function executablePath(consumerRoot) {
  return join(
    consumerRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tutorbench.cmd" : "tutorbench",
  );
}

async function verifyInstalledConsumer(
  tarballPath,
  packageJson,
  packageVersion,
  temporaryRoot,
  environment,
  expectedPayload,
) {
  const consumerRoot = join(temporaryRoot, "consumer");
  await mkdir(consumerRoot, { recursive: true });
  await writeFile(
    join(consumerRoot, "package.json"),
    `${JSON.stringify({ name: "tutor-benchmark-release-consumer", private: true, type: "module" }, null, 2)}\n`,
    "utf8",
  );
  await run(
    npmCommand,
    ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock", "--omit=peer", tarballPath],
    consumerRoot,
    environment,
    { shell: process.platform === "win32" },
  );

  const installedPackageRoot = join(consumerRoot, "node_modules", packageJson.name);
  const installedPayload = await collectFileManifest(installedPackageRoot);
  assertCondition(canonicalJson(installedPayload) === canonicalJson(expectedPayload), "Installed package payload differs from the audited npm pack payload.");
  const installedPackageJson = JSON.parse(await readFile(join(installedPackageRoot, "package.json"), "utf8"));
  assertCondition(installedPackageJson.name === expectedPackageName, "Installed package name changed.");
  assertCondition(installedPackageJson.version === packageVersion, "Installed package version changed.");
  const packageLicenseMap = await readFile(join(installedPackageRoot, "LICENSES.md"), "utf8");
  assertCondition(/Apache-2\.0/.test(packageLicenseMap) && /CC-BY-4\.0/.test(packageLicenseMap), "Installed license map is incomplete.");
  const brandPolicy = await readFile(join(installedPackageRoot, "LICENSES", "BRAND-POLICY.md"), "utf8");
  assertCondition(/TutorBench Brand Policy/.test(brandPolicy), "Installed Brand Policy is missing.");

  const consumerReportPath = join(consumerRoot, "consumer-verification.json");
  const consumerScriptPath = await writeConsumerScript(consumerRoot, consumerReportPath);
  await run(process.execPath, [consumerScriptPath], consumerRoot, environment);
  const consumerReport = JSON.parse(await readFile(consumerReportPath, "utf8"));
  assertCondition(consumerReport.packageRootImport === true, "Package root import verification failed.");
  assertCondition(consumerReport.optionalOpenAiPeerInstalled === false, "Optional OpenAI peer was installed.");
  assertCondition(consumerReport.canonicalDataset.id === "tutor-eval-v0.2a", "Installed canonical dataset id changed.");
  assertCondition(consumerReport.canonicalDataset.version === "0.2a.5", "Installed canonical dataset version changed.");
  assertCondition(consumerReport.canonicalDataset.caseCount === 48, "Installed canonical dataset case count changed.");

  const executable = executablePath(consumerRoot);
  const help = await run(executable, ["--help"], consumerRoot, environment, { shell: process.platform === "win32" });
  assertCondition(/tutorbench quickstart \[options\]/.test(help.stdout), "Installed tutorbench --help omitted Quickstart.");
  const quickstartPath = join(consumerRoot, "quickstart.json");
  const quickstart = await run(executable, ["quickstart", "--output", quickstartPath], consumerRoot, environment, { shell: process.platform === "win32" });
  assertCondition(/Official benchmark score: no/.test(quickstart.stdout), "Installed Quickstart became official.");
  assertCondition(/Leaderboard eligible: no/.test(quickstart.stdout), "Installed Quickstart became leaderboard eligible.");
  assertCondition(/Errors: 0/.test(quickstart.stdout), "Installed Quickstart reported an error.");
  assertCondition(!/TutorBench Score|Overall/.test(quickstart.stdout), "Installed Quickstart printed an ambiguous score.");
  const quickstartSummary = JSON.parse(await readFile(quickstartPath, "utf8"));
  assertCondition(quickstartSummary.quickstart?.id === "tutorbench-quickstart", "Quickstart id changed.");
  assertCondition(quickstartSummary.quickstart?.version === "0.1.0", "Quickstart version changed.");
  assertCondition(quickstartSummary.dataset?.id === "tutor-eval-v0.1", "Quickstart dataset id changed.");
  assertCondition(quickstartSummary.dataset?.version === "0.1", "Quickstart dataset version changed.");
  assertCondition(quickstartSummary.exampleTutor?.id === "scripted-quickstart-tutor", "Quickstart tutor id changed.");
  assertCondition(quickstartSummary.exampleTutor?.version === "1.0.0", "Quickstart tutor version changed.");
  assertCondition(quickstartSummary.passedCount === 3, "Quickstart pass count changed.");
  assertCondition(quickstartSummary.failedCount === 1, "Quickstart expected pedagogical fail count changed.");
  assertCondition(quickstartSummary.errorCount === 0, "Quickstart error count changed.");
  assertCondition(quickstartSummary.officialBenchmarkScore === false, "Quickstart official score flag changed.");
  assertCondition(quickstartSummary.publicLeaderboardEligible === false, "Quickstart leaderboard flag changed.");
  return { quickstartSummary };
}

async function main() {
  const { outputDirectory } = parseOptions(process.argv.slice(2));
  await assertSourceIsClean();
  const commit = await sourceCommit();
  const packageJson = await readPackageJson();
  assertCondition(packageJson.name === expectedPackageName, `Expected package ${expectedPackageName}.`);
  assertCondition(typeof packageJson.version === "string" && packageJson.version.length > 0, "Package version must be a non-empty string.");
  const expectedPackageVersion = packageJson.version;
  const expectedPackageFilename = `${expectedPackageName}-${expectedPackageVersion}.tgz`;
  const expectedTag = `v${expectedPackageVersion}`;
  await run(process.execPath, [join(repositoryRoot, "scripts", "validate-release-version.mjs"), expectedTag], repositoryRoot);
  assertCondition(packageJson.engines?.node === ">=22 <23", "Package must retain the Node 22 engine range.");
  assertCondition(packageJson.private !== true, "Release candidate package must not be private.");
  assertCondition(packageJson.license === "SEE LICENSE IN LICENSES.md", "Package license metadata is not multi-license aware.");
  assertCondition(packageJson.peerDependenciesMeta?.openai?.optional === true, "OpenAI peer must remain optional.");
  assertCondition(packageJson.repository?.url === "https://github.com/shuangyan123/re.git", "Package repository metadata changed.");
  assertCondition(packageJson.publishConfig?.registry === undefined, "Package must not hard-code a registry in publishConfig.");

  const temporaryRoot = await mkdtemp(join(tmpdir(), "tutor-benchmark-release-candidate-"));
  const environment = packageEnvironment(temporaryRoot);
  await writeFile(join(temporaryRoot, "npmrc"), "audit=false\nfund=false\n", "utf8");
  try {
    await run(npmCommand, ["run", "build"], repositoryRoot, environment, { shell: process.platform === "win32" });
    const identities = await loadBuiltIdentities();
    const packDirectories = [join(temporaryRoot, "pack-a"), join(temporaryRoot, "pack-b")];
    const packResults = [];
    for (const packDirectory of packDirectories) {
      await mkdir(packDirectory, { recursive: true });
      const result = await run(npmCommand, ["pack", "--pack-destination", packDirectory, "--json", "--ignore-scripts"], repositoryRoot, environment, { shell: process.platform === "win32" });
      const info = parsePackInfo(result.stdout);
      assertCondition(info.filename === expectedPackageFilename, `Unexpected package filename: ${info.filename ?? ""}`);
      packResults.push({ info, tarballPath: join(packDirectory, info.filename), payload: await buildPackagePayload(info) });
    }
    const [firstPack, secondPack] = packResults;
    assertCondition(firstPack !== undefined && secondPack !== undefined, "Two package packs are required.");
    auditPackagePaths(firstPack.payload);
    await auditPackageText(firstPack.payload);
    assertCondition(canonicalJson(firstPack.payload) === canonicalJson(secondPack.payload), "Repeated npm pack payloads differ.");
    const firstTarball = await readFile(firstPack.tarballPath);
    const secondTarball = await readFile(secondPack.tarballPath);
    const rawTarballByteReproducible = sha256(firstTarball) === sha256(secondTarball);
    const packagePayloadFingerprint = manifestFingerprint(firstPack.payload);
    await mkdir(outputDirectory, { recursive: true });
    const retainedTarballPath = join(outputDirectory, expectedPackageFilename);
    await copyFile(firstPack.tarballPath, retainedTarballPath);
    const retainedTarball = await readFile(retainedTarballPath);
    assertCondition(sha256(retainedTarball) === sha256(firstTarball), "Retained package tarball differs from the first validated pack.");
    const consumerTarballPath = join(temporaryRoot, expectedPackageFilename);
    await copyFile(retainedTarballPath, consumerTarballPath);

    const websiteBuildCli = join(repositoryRoot, "dist", "src", "cli", "website-build.js");
    await run(process.execPath, [websiteBuildCli], repositoryRoot, environment);
    await run(process.execPath, [join(repositoryRoot, "scripts", "website-artifact-smoke.mjs")], repositoryRoot, environment);
    const websiteFiles = await collectFileManifest(join(repositoryRoot, "website", "dist"));
    const websiteByteCount = websiteFiles.reduce((total, file) => total + file.size, 0);

    const installed = await verifyInstalledConsumer(
      consumerTarballPath,
      packageJson,
      expectedPackageVersion,
      temporaryRoot,
      environment,
      firstPack.payload,
    );
    const quickstartSummary = installed.quickstartSummary;
    const report = {
      schemaVersion: 1,
      reportKind: "TutorBenchReleaseCandidateReport",
      packageName: expectedPackageName,
      packageVersion: expectedPackageVersion,
      proposedTag: expectedTag,
      releaseStatus: "Developer Preview",
      sourceCommit: commit,
      nodeVersion: process.version,
      npmVersion: (await run(npmCommand, ["--version"], repositoryRoot, environment, { shell: process.platform === "win32" })).stdout.trim(),
      packageFilename: expectedPackageFilename,
      packagePayloadFingerprint,
      packageFileCount: firstPack.payload.length,
      packageFiles: firstPack.payload,
      rawTarballFingerprint: sha256(firstTarball),
      rawTarballByteReproducible,
      quickstartIdentity: {
        id: quickstartSummary.quickstart.id,
        version: quickstartSummary.quickstart.version,
        datasetId: quickstartSummary.dataset.id,
        datasetVersion: quickstartSummary.dataset.version,
        exampleTutorId: quickstartSummary.exampleTutor.id,
        exampleTutorVersion: quickstartSummary.exampleTutor.version,
        evaluatorVersion: quickstartSummary.evaluatorVersion,
        passedCount: quickstartSummary.passedCount,
        failedCount: quickstartSummary.failedCount,
        errorCount: quickstartSummary.errorCount,
        officialBenchmarkScore: quickstartSummary.officialBenchmarkScore,
        publicLeaderboardEligible: quickstartSummary.publicLeaderboardEligible,
      },
      canonicalDatasetIdentity: { id: "tutor-eval-v0.2a", version: "0.2a.5", caseCount: 48 },
      evaluatorVersion: identities.contracts.TUTOR_EVAL_EVALUATOR_VERSION,
      productionJudgePromptIdentity: {
        id: identities.judge.TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ID,
        version: identities.judge.TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
        asset: identities.judge.TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ASSET,
      },
      materialJudgePromptIdentity: {
        id: identities.judge.MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID,
        version: identities.judge.MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION,
        asset: identities.judge.MATERIAL_REQUIREMENT_JUDGE_PROMPT_ASSET,
      },
      semanticAuditIdentity: {
        id: identities.semanticV2.HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
        version: identities.semanticV21.HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION,
        guideId: identities.semanticAudit.HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_ID,
        guideVersion: identities.semanticAudit.HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_VERSION,
        guideFingerprint: identities.semanticAudit.HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_FINGERPRINT,
      },
      qualificationIdentity: {
        id: identities.semanticV2.HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID,
        version: identities.semanticV21.HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION,
      },
      licenseIdentities: { software: "Apache-2.0", benchmarkContent: "CC-BY-4.0", brand: "TutorBench Brand Policy" },
      websiteArtifactIdentity: {
        path: "website/dist",
        fileCount: websiteFiles.length,
        byteCount: websiteByteCount,
        payloadFingerprint: manifestFingerprint(websiteFiles),
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
    const { assertReleaseCandidateReport } = await import(pathToFileURL(join(repositoryRoot, "dist", "src", "release", "release-candidate.js")).href);
    assertReleaseCandidateReport(report);
    await writeFile(join(outputDirectory, "release-candidate-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await assertSourceIsClean();
    console.log(`Release candidate verification passed: ${expectedPackageFilename}`);
    console.log(`Source commit: ${commit}`);
    console.log(`Package payload: ${packagePayloadFingerprint} (${firstPack.payload.length} files)`);
    console.log(`Raw .tgz byte reproducibility: ${rawTarballByteReproducible ? "verified" : "not guaranteed"}`);
    console.log(`Website payload: ${manifestFingerprint(websiteFiles)} (${websiteFiles.length} files)`);
    console.log("Release candidate report: artifacts/release/release-candidate-report.json");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Release candidate verification failed.");
  process.exitCode = 1;
}
