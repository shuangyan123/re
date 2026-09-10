import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(repositoryRoot, "services/community-review-service/portal-src");
const outputDirectory = path.join(repositoryRoot, "services/community-review-service/dist/portal");
const sdkPackageDirectory = path.join(repositoryRoot, "node_modules/@auth0/auth0-spa-js");
const sdkVersion = "2.24.1";

const sdkPackage = JSON.parse(await readFile(path.join(sdkPackageDirectory, "package.json"), "utf8"));
if (sdkPackage.version !== sdkVersion || sdkPackage.license !== "MIT") {
  throw new Error("Unexpected Auth0 SPA SDK package metadata.");
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(path.join(outputDirectory, "vendor"), { recursive: true });
for (const file of ["index.html", "portal.css", "portal.js", "favicon.svg"]) {
  await cp(path.join(sourceDirectory, file), path.join(outputDirectory, file));
}

const sdkSource = await readFile(
  path.join(sdkPackageDirectory, "dist/auth0-spa-js.production.js"),
  "utf8",
);
const sdkWithoutSourceMap = sdkSource.replace(/\r?\n\/\/# sourceMappingURL=[^\r\n]*\r?\n?$/u, "");
await writeFile(path.join(outputDirectory, "vendor/auth0-spa-js.js"), sdkWithoutSourceMap, "utf8");
await cp(
  path.join(sdkPackageDirectory, "LICENSE"),
  path.join(outputDirectory, "vendor/auth0-spa-js.LICENSE.txt"),
);

process.stdout.write(JSON.stringify({
  status: "built",
  outputDirectory,
  auth0SpaSdk: sdkVersion,
  sourceMapIncluded: false,
}) + "\n");
