import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

const requiredRepositoryFiles = [
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
];

const requiredPackageFiles = [
  "LICENSE",
  "LICENSES.md",
  "LICENSES/CC-BY-4.0.txt",
  "LICENSES/BRAND-POLICY.md",
  "NOTICE",
  "docs/licensing.md",
  "assets/brand/tutorbench/web/",
  "assets/brand/tutorbench/raster/",
];

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readRepositoryFile(relativePath) {
  return readFile(join(repositoryRoot, relativePath), "utf8");
}

async function main() {
  for (const relativePath of requiredRepositoryFiles) {
    const content = await readRepositoryFile(relativePath);
    assertCondition(content.trim().length > 0, `Governance file is empty: ${relativePath}`);
  }

  const apache = await readRepositoryFile("LICENSE");
  assertCondition(
    /Apache License\s+Version 2\.0, January 2004/.test(apache) &&
      /TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION/.test(apache) &&
      /END OF TERMS AND CONDITIONS/.test(apache),
    "LICENSE is not the standard Apache License 2.0 text.",
  );

  const contentLicense = await readRepositoryFile("LICENSES/CC-BY-4.0.txt");
  assertCondition(
    /Creative Commons Attribution 4\.0 International/.test(contentLicense) &&
      /creativecommons\.org\/licenses\/by\/4\.0\/legalcode/.test(contentLicense),
    "CC BY 4.0 pointer is missing its canonical legal-code reference.",
  );

  const licenseMap = await readRepositoryFile("LICENSES.md");
  assertCondition(
    /Software implementation.*Apache-2\.0/s.test(licenseMap) &&
      /Authored benchmark, dataset, and evaluation content.*CC-BY-4\.0/s.test(licenseMap) &&
      /TutorBench name and brand assets.*TutorBench Brand Policy/s.test(licenseMap),
    "LICENSES.md does not declare all three TutorBench license scopes.",
  );

  const brandPolicy = await readRepositoryFile("LICENSES/BRAND-POLICY.md");
  assertCondition(
    /not grant unrestricted permission/i.test(brandPolicy) &&
      /Derived from TutorBench/.test(brandPolicy) &&
      /Official TutorBench/.test(brandPolicy),
    "TutorBench Brand Policy is missing its referential and official-identity boundaries.",
  );

  const packageJson = JSON.parse(await readRepositoryFile("package.json"));
  assertCondition(
    packageJson.license === "SEE LICENSE IN LICENSES.md",
    "package.json must point consumers to the multi-license scope manifest.",
  );
  const configuredPackageFiles = new Set(
    Array.isArray(packageJson.files) ? packageJson.files.map((value) => String(value)) : [],
  );
  for (const relativePath of requiredPackageFiles) {
    assertCondition(
      configuredPackageFiles.has(relativePath),
      `package.json files is missing ${relativePath}.`,
    );
  }

  const readme = await readRepositoryFile("README.md");
  for (const link of [
    "(LICENSE)",
    "(docs/licensing.md)",
    "(LICENSES/CC-BY-4.0.txt)",
    "(LICENSES/BRAND-POLICY.md)",
    "(CONTRIBUTING.md)",
    "(SECURITY.md)",
  ]) {
    assertCondition(readme.includes(link), `README is missing governance link ${link}.`);
  }

  console.log(
    `Governance validation passed: ${requiredRepositoryFiles.length} repository files and ${requiredPackageFiles.length} package entries.`,
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Governance validation failed.");
  process.exitCode = 1;
}
