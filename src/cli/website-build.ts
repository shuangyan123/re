import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TUTOR_EVAL_DATASET_ID } from "../contracts/index.js";
import {
  buildPublicBenchmarkArtifacts,
  loadTutorEvalDataset,
  type PublicBenchmarkArtifacts,
} from "../datasets/index.js";
import { renderPage, type SitePage } from "../site/html.js";
import {
  renderDataIndexPage,
  renderHomePage,
  renderLeaderboardPage,
  renderModelDetailPage,
  renderModelsPage,
} from "../site/pages/overview.js";
import {
  renderCaseDetailPage,
  renderCasesPage,
  renderHeatmapPage,
  renderTrialDetailPage,
  renderTrialsPage,
} from "../site/pages/data.js";
import {
  renderAboutPage,
  renderDocsPage,
  renderMethodologyPage,
  renderRunPage,
} from "../site/pages/developer.js";

const websiteRoot = resolve(process.cwd(), "website");
const defaultOutputDirectory = resolve(websiteRoot, "dist");

export interface BuildOptions {
  readonly outputDirectory?: string;
  readonly siteUrl?: string;
}

interface RoutePage {
  readonly outputRoute: string;
  readonly page: SitePage;
}

function pageOutputPath(outputDirectory: string, route: string): string {
  const normalizedRoute = route.replace(/^\/+|\/+$/g, "");
  return normalizedRoute.length === 0
    ? join(outputDirectory, "index.html")
    : join(outputDirectory, normalizedRoute, "index.html");
}

async function writeJson(outputDirectory: string, filename: string, value: unknown): Promise<void> {
  const outputPath = join(outputDirectory, "public-data", filename);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writePage(
  outputDirectory: string,
  page: SitePage,
  artifacts: PublicBenchmarkArtifacts,
  siteUrl: string | undefined,
): Promise<void> {
  const outputPath = pageOutputPath(outputDirectory, page.route);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    renderPage(page, { benchmark: artifacts.benchmark, ...(siteUrl === undefined ? {} : { siteUrl }) }),
    "utf8",
  );
}

function routePages(artifacts: PublicBenchmarkArtifacts): readonly RoutePage[] {
  const pages: RoutePage[] = [
    { outputRoute: "/", page: renderHomePage(artifacts) },
    { outputRoute: "/leaderboard/", page: renderLeaderboardPage(artifacts) },
    { outputRoute: "/models/", page: renderModelsPage(artifacts) },
    { outputRoute: "/models/[modelId]/", page: renderModelDetailPage(artifacts) },
    { outputRoute: "/data/", page: renderDataIndexPage(artifacts) },
    { outputRoute: "/data/cases/", page: renderCasesPage(artifacts) },
    { outputRoute: "/data/heatmap/", page: renderHeatmapPage(artifacts) },
    { outputRoute: "/data/trials/", page: renderTrialsPage(artifacts) },
    { outputRoute: "/data/trials/[trialId]/", page: renderTrialDetailPage(artifacts) },
    { outputRoute: "/run/", page: renderRunPage(artifacts) },
    { outputRoute: "/methodology/", page: renderMethodologyPage(artifacts) },
    { outputRoute: "/docs/", page: renderDocsPage(artifacts) },
    { outputRoute: "/about/", page: renderAboutPage(artifacts) },
  ];
  return [
    ...pages,
    ...artifacts.cases.cases.map((caseArtifact) => ({
      outputRoute: `/data/cases/${encodeURIComponent(caseArtifact.id)}/`,
      page: renderCaseDetailPage(artifacts, caseArtifact),
    })),
  ];
}

export async function buildWebsite(options: BuildOptions = {}): Promise<number> {
  const outputDirectory = options.outputDirectory ?? defaultOutputDirectory;
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const artifacts = buildPublicBenchmarkArtifacts(dataset);
  const stylesheet = await readFile(join(websiteRoot, "src", "styles.css"), "utf8");
  const clientScript = await readFile(join(websiteRoot, "src", "site.js"), "utf8");

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(join(outputDirectory, "assets"), { recursive: true });
  await writeFile(join(outputDirectory, "assets", "styles.css"), stylesheet, "utf8");
  await writeFile(join(outputDirectory, "assets", "site.js"), clientScript, "utf8");
  await writeJson(outputDirectory, "benchmark.json", artifacts.benchmark);
  await writeJson(outputDirectory, "cases.json", artifacts.cases);
  await writeJson(outputDirectory, "models.json", artifacts.models);
  await writeJson(outputDirectory, "trials.json", artifacts.trials);

  const pages = routePages(artifacts);
  for (const routePage of pages) {
    await writePage(outputDirectory, routePage.page, artifacts, options.siteUrl);
  }
  await writeFile(
    join(outputDirectory, "404.html"),
    renderPage(
      {
        title: "Page not found — Tutor Benchmark",
        description: "The requested Tutor Benchmark page could not be found.",
        route: "/404.html",
        content: `<section class="page-intro"><div class="shell narrow-shell"><h1>Page not found</h1><p class="lede">This route is not part of the public Developer Preview.</p><a class="button button-primary" href="/">Return home</a></div></section>`,
      },
      { benchmark: artifacts.benchmark, ...(options.siteUrl === undefined ? {} : { siteUrl: options.siteUrl }) },
    ),
    "utf8",
  );
  return pages.length;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const outputArgumentIndex = args.indexOf("--output");
  const outputArgument =
    outputArgumentIndex === -1 ? undefined : args[outputArgumentIndex + 1];
  if (outputArgumentIndex !== -1 && (outputArgument === undefined || outputArgument.startsWith("--"))) {
    throw new Error("Website output directory is required after --output.");
  }
  const outputDirectory =
    outputArgument === undefined ? defaultOutputDirectory : resolve(process.cwd(), outputArgument);
  const websitePrefix = `${websiteRoot}${process.platform === "win32" ? "\\" : "/"}`;
  if (
    outputDirectory !== websiteRoot &&
    !outputDirectory.startsWith(websitePrefix)
  ) {
    throw new Error("Website output must stay inside the website directory.");
  }
  const siteUrl = process.env.TUTOR_BENCHMARK_SITE_URL?.trim() || undefined;
  const routeCount = await buildWebsite({ outputDirectory, ...(siteUrl === undefined ? {} : { siteUrl }) });
  console.log(`Built Tutor Benchmark website: ${outputDirectory}`);
  console.log(`Routes: ${routeCount}`);
  console.log("Public model rankings: none");
  console.log("Secrets required: none");
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Website build failed.");
    process.exitCode = 1;
  }
}
