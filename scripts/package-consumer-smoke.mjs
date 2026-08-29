import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

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
        reject(
          new Error(
            `${command} ${args.join(" ")} failed with exit code ${code}.\n${stdout}\n${stderr}`,
          ),
        );
        return;
      }
      resolveResult({ stdout, stderr });
    });
  });
}

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a directory.`);
  }
  return value;
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function packageFiles(packInfo) {
  return new Set(
    packInfo.files.map((file) => String(file.path).replaceAll("\\", "/")),
  );
}

function packageEnvironment() {
  const environment = { ...process.env };
  delete environment.OPENAI_API_KEY;
  delete environment.NPM_TOKEN;
  delete environment.NODE_AUTH_TOKEN;
  return environment;
}

async function main() {
  const args = process.argv.slice(2);
  const outputArgument = readOption(args, "--output-dir");
  const unknown = args.filter(
    (argument, index) =>
      argument !== "--output-dir" &&
      (index === 0 || args[index - 1] !== "--output-dir"),
  );
  assertCondition(unknown.length === 0, `Unknown option: ${unknown[0] ?? ""}`);

  const temporaryRoot = await mkdtemp(join(tmpdir(), "tutor-benchmark-package-smoke-"));
  const consumerRoot = join(temporaryRoot, "consumer");
  const packDirectory = outputArgument
    ? resolve(repositoryRoot, outputArgument)
    : join(temporaryRoot, "package");
  const environment = packageEnvironment();
  delete environment.NPM_CONFIG_CACHE;
  environment.npm_config_cache = join(temporaryRoot, "npm-cache");

  try {
    await mkdir(packDirectory, { recursive: true });
    const packageJson = JSON.parse(
      await readFile(join(repositoryRoot, "package.json"), "utf8"),
    );
    const packResult = await run(
      npmCommand,
      ["pack", "--pack-destination", packDirectory, "--json", "--ignore-scripts"],
      repositoryRoot,
      environment,
      { shell: process.platform === "win32" },
    );
    const packInfo = JSON.parse(packResult.stdout)[0];
    assertCondition(packInfo !== undefined, "npm pack returned no package metadata.");
    const expectedFilename = `${packageJson.name}-${packageJson.version}.tgz`;
    assertCondition(
      packInfo.filename === expectedFilename,
      `Unexpected package filename: ${packInfo.filename ?? ""}`,
    );

    const files = packageFiles(packInfo);
    for (const required of [
      "package.json",
      "README.md",
      "dist/src/index.js",
      "dist/src/index.d.ts",
      "dist/src/cli/tutorbench.js",
      "scenarios/tutor-eval-v0.2a/cases.json",
      "scenarios/tutor-eval-v0.2a/cases.zh-CN.json",
      "prompts/tutor-baseline-system-v0.1.md",
      "assets/brand/tutorbench/web/tutorbench-mark.svg",
      "assets/brand/tutorbench/raster/favicon-32.png",
    ]) {
      assertCondition(files.has(required), `Package is missing ${required}.`);
    }
    for (const path of files) {
      assertCondition(
        !/(^|\/)(\.agents|\.github|tests|fixtures|artifacts|website\/dist|\.env|\.git)(\/|$)/i.test(path),
        `Package contains an unexpected development path: ${path}`,
      );
    }

    const tarballPath = join(packDirectory, packInfo.filename);
    await mkdir(consumerRoot, { recursive: true });
    await writeFile(
      join(consumerRoot, "package.json"),
      JSON.stringify(
        {
          name: "tutor-benchmark-consumer-smoke",
          private: true,
          type: "module",
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    await run(
      npmCommand,
      [
        "install",
        "--offline",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--no-package-lock",
        "--omit=peer",
        tarballPath,
      ],
      consumerRoot,
      environment,
      { shell: process.platform === "win32" },
    );

    await writeFile(
      join(consumerRoot, "consumer.mjs"),
      `import {
  createHttpTutor,
  loadTutorEvalDataset,
  runTutorBenchmark,
} from "tutor-benchmark";

const dataset = await loadTutorEvalDataset();
if (dataset.id !== "tutor-eval-v0.2a" || dataset.cases.length !== 48) {
  throw new Error("Installed package did not load the canonical dataset asset.");
}
const firstCase = dataset.cases[0];
if (firstCase === undefined) {
  throw new Error("Canonical dataset is empty.");
}
const result = await runTutorBenchmark({
  dataset: { ...dataset, cases: [firstCase] },
  tutor: {
    id: "package-consumer-smoke",
    async respond() {
      return { text: "Try the next small step." };
    },
  },
});
if (result.caseRunCount !== 1 || result.datasetId !== dataset.id) {
  throw new Error("Installed package public runner did not execute one case.");
}
const httpTutor = createHttpTutor({
  id: "package-consumer-http",
  endpoint: "http://127.0.0.1:1/respond",
});
if (httpTutor.endpoint !== "http://127.0.0.1:1/respond") {
  throw new Error("Installed package HTTP adapter did not preserve its endpoint.");
}
try {
  await import("openai");
  throw new Error("The optional OpenAI peer was installed unexpectedly.");
} catch (error) {
  if (error?.code !== "ERR_MODULE_NOT_FOUND") {
    throw error;
  }
}
console.log("consumer API smoke passed");
`,
      "utf8",
    );
    await run(process.execPath, ["consumer.mjs"], consumerRoot, environment);

    const executable = join(
      consumerRoot,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "tutorbench.cmd" : "tutorbench",
    );
    const help = await run(
      executable,
      ["--help"],
      consumerRoot,
      environment,
      { shell: process.platform === "win32" },
    );
    assertCondition(
      /tutorbench run --http <url>/.test(help.stdout),
      "Installed tutorbench executable did not print help.",
    );
    assertCondition(
      /tutorbench collect --http <url>/.test(help.stdout),
      "Installed tutorbench executable did not expose collection help.",
    );
    assertCondition(
      /tutorbench collect-model --http <url>/.test(help.stdout),
      "Installed tutorbench executable did not expose canonical model collection help.",
    );
    const collectHelp = await run(
      executable,
      ["collect", "--help"],
      consumerRoot,
      environment,
      { shell: process.platform === "win32" },
    );
    assertCondition(
      /Collects Product Tutor responses sequentially/.test(collectHelp.stdout),
      "Installed tutorbench executable did not run collect --help.",
    );
    const collectModelHelp = await run(
      executable,
      ["collect-model", "--help"],
      consumerRoot,
      environment,
      { shell: process.platform === "win32" },
    );
    assertCondition(
      /Collects canonical foundation-model evidence/.test(collectModelHelp.stdout),
      "Installed tutorbench executable did not run collect-model --help.",
    );
    const evaluateHelp = await run(
      executable,
      ["evaluate", "--help"],
      consumerRoot,
      environment,
      { shell: process.platform === "win32" },
    );
    assertCondition(
      /Frozen responses are replayed locally/.test(evaluateHelp.stdout),
      "Installed tutorbench executable did not run evaluate --help.",
    );
    console.log(`Package consumer smoke passed: ${packInfo.filename}`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Package consumer smoke failed.");
  process.exitCode = 1;
}
