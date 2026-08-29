import { lstat, readdir, readFile } from "node:fs/promises";
import { extname, resolve, join } from "node:path";

const outputDirectory = resolve(process.cwd(), process.argv[2] ?? "website/dist");
const requiredFiles = [
  "index.html",
  "404.html",
  "leaderboard/index.html",
  "data/cases/index.html",
  "data/heatmap/index.html",
  "data/trials/index.html",
  "run/index.html",
  "methodology/index.html",
  "docs/index.html",
  "about/index.html",
  "assets/styles.css",
  "assets/site.js",
  "assets/brand/tutorbench/web/tutorbench-mark.svg",
  "assets/brand/tutorbench/web/tutorbench-mark-mono-dark.svg",
  "assets/brand/tutorbench/web/tutorbench-mark-mono-light.svg",
  "assets/brand/tutorbench/web/tutorbench-mark-small.svg",
  "assets/brand/tutorbench/web/tutorbench-app-icon.svg",
  "assets/brand/tutorbench/raster/favicon-16.png",
  "assets/brand/tutorbench/raster/favicon-32.png",
  "assets/brand/tutorbench/raster/favicon.ico",
  "public-data/benchmark.json",
  "public-data/cases.json",
  "public-data/models.json",
  "public-data/trials.json",
];
const forbiddenContent = [
  /OPENAI_API_KEY/i,
  /\bAuthorization\s*[:=]/i,
  /\bapiKey\s*[:=]/i,
  /rawProviderPayload/i,
  /evaluatorOnly/i,
  /groundTruth/i,
  /knownMisconception/i,
  /hiddenReasoning/i,
  /private calibration reviewer data/i,
];

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function collectFiles(directory, relativeDirectory = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = relativeDirectory
      ? join(relativeDirectory, entry.name)
      : entry.name;
    const absolutePath = join(directory, entry.name);
    const stats = await lstat(absolutePath);
    assertCondition(!stats.isSymbolicLink(), `Website artifact contains a symbolic link: ${relativePath}`);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath, relativePath)));
    } else if (entry.isFile()) {
      files.push({ absolutePath, relativePath: relativePath.replaceAll("\\", "/") });
    }
  }
  return files;
}

async function main() {
  const files = await collectFiles(outputDirectory);
  const filePaths = new Set(files.map((file) => file.relativePath));
  for (const requiredFile of requiredFiles) {
    assertCondition(filePaths.has(requiredFile), `Website artifact is missing ${requiredFile}.`);
  }

  let checkedBytes = 0;
  for (const file of files) {
    const content = await readFile(file.absolutePath);
    checkedBytes += content.byteLength;
    if ([".css", ".html", ".js", ".json", ".svg"].includes(extname(file.relativePath).toLowerCase())) {
      const textContent = content.toString("utf8");
      for (const pattern of forbiddenContent) {
        assertCondition(
          !pattern.test(textContent),
          `Website artifact contains forbidden public data (${pattern}): ${file.relativePath}`,
        );
      }
      assertCondition(
        !/(?:href|src)=["']https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/)/i.test(textContent),
        `Website artifact contains an absolute local asset reference: ${file.relativePath}`,
      );
    }
  }

  console.log(
    `Website artifact smoke passed: ${files.length} files, ${checkedBytes} bytes, ${requiredFiles.length} required paths.`,
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Website artifact smoke failed.");
  process.exitCode = 1;
}
