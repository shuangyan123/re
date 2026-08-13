import { readFile } from "node:fs/promises";
import { join } from "node:path";

const packagePath = join(process.cwd(), "package.json");
const tag = process.argv[2]?.trim();
const tagPattern = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

try {
  if (tag === undefined || tag.length === 0) {
    throw new Error("A release tag is required, for example v0.1.0.");
  }
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  const match = tagPattern.exec(tag);
  if (match === null) {
    throw new Error(`Release tag must match vX.Y.Z or vX.Y.Z-prerelease: ${tag}`);
  }
  if (match[1] !== packageJson.version) {
    throw new Error(
      `Release tag ${tag} does not match package version ${packageJson.version}.`,
    );
  }
  console.log(`Release version check passed: ${tag} matches package ${packageJson.version}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Release version check failed.");
  process.exitCode = 1;
}
