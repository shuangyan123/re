import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { TUTORBENCH_BRAND_ASSET_PATHS } from "../src/site/html.js";

const brandRoot = resolve(process.cwd(), "assets", "brand", "tutorbench");
const svgPaths = TUTORBENCH_BRAND_ASSET_PATHS.filter((assetPath) => assetPath.endsWith(".svg"));

test("approved TutorBench T1 SVG variants preserve their intended treatments", async () => {
  const svgContents = await Promise.all(
    svgPaths.map(async (assetPath) => [
      assetPath,
      await readFile(join(brandRoot, assetPath), "utf8"),
    ] as const),
  );

  for (const [assetPath, content] of svgContents) {
    assert.match(content, /<svg\b/);
    assert.doesNotMatch(content, /T2|T3|T4/i, `Unexpected non-T1 reference in ${assetPath}`);
    assert.doesNotMatch(content, /axis|checkmark|code bracket/i, `Unexpected extra symbol in ${assetPath}`);
  }

  const primary = svgContents.find(([assetPath]) => assetPath === "web/tutorbench-mark.svg")?.[1];
  const monoDark = svgContents.find(([assetPath]) => assetPath === "web/tutorbench-mark-mono-dark.svg")?.[1];
  const monoLight = svgContents.find(([assetPath]) => assetPath === "web/tutorbench-mark-mono-light.svg")?.[1];
  const small = svgContents.find(([assetPath]) => assetPath === "web/tutorbench-mark-small.svg")?.[1];
  assert.ok(primary);
  assert.ok(monoDark);
  assert.ok(monoLight);
  assert.ok(small);
  assert.match(primary, /viewBox="0 0 512 512"/);
  assert.match(primary, /#1A3CFF/);
  assert.match(primary, /#2D7BFF/);
  assert.match(primary, /#8A5CFF/);
  assert.match(monoDark, /#0F172A/);
  assert.match(monoLight, /#FFFFFF/);
  assert.match(small, /viewBox="0 0 64 64"/);
});
