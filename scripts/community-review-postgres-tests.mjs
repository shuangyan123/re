import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const testDirectory = resolve(repositoryRoot, "services/community-review-service/dist/services/community-review-service/tests");
const testFiles = readdirSync(testDirectory)
  .filter((name) => name.endsWith(".test.js"))
  .sort()
  .map((name) => resolve(testDirectory, name));
const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  env: { ...process.env, COMMUNITY_REVIEW_POSTGRES_TESTS: "1" },
  stdio: "inherit",
});
if (result.error !== undefined) throw result.error;
process.exitCode = result.status ?? 1;
