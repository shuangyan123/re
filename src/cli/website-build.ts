import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_PREVIOUS_DATASET_VERSION,
} from "../contracts/index.js";
import {
  buildPublicBenchmarkArtifacts,
  loadTutorEvalDataset,
  type PublicBenchmarkArtifacts,
} from "../datasets/index.js";
import {
  parseTutorEvaluationAuditArtifact,
  type TutorEvaluationAuditArtifact,
} from "../reporting/index.js";
import {
  createReviewTranslationLookup,
  parseReviewTranslationArtifact,
  type ReviewTranslationArtifact,
  type ReviewTranslationLookup,
} from "../review-translation/index.js";
import {
  renderPage,
  TUTORBENCH_BRAND_ASSET_PATHS,
  type SitePage,
} from "../site/html.js";
import { resolveSiteLocale, type SiteLocale } from "../site/i18n.js";
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
  auditRoute,
  renderTutorEvaluationAuditIndexPage,
  renderTutorEvaluationAuditPage,
} from "../site/pages/audit.js";
import {
  renderAboutPage,
  renderDocsPage,
  renderMethodologyPage,
  renderRunPage,
} from "../site/pages/developer.js";

const websiteRoot = resolve(process.cwd(), "website");
const defaultOutputDirectory = resolve(websiteRoot, "dist");
const privateOutputDirectory = resolve(websiteRoot, "private-dist");
const brandAssetRoot = resolve(process.cwd(), "assets", "brand", "tutorbench");

function requestedDatasetVersion(datasetId: string, datasetVersion: string): string | undefined {
  return datasetId === TUTOR_EVAL_DATASET_ID && datasetVersion === "0.2a"
    ? TUTOR_EVAL_PREVIOUS_DATASET_VERSION
    : datasetVersion;
}

function isWithinDirectory(candidate: string, directory: string): boolean {
  const resolvedCandidate = resolve(candidate);
  return resolvedCandidate === directory || resolvedCandidate.startsWith(`${directory}${process.platform === "win32" ? "\\" : "/"}`);
}

export interface BuildOptions {
  readonly outputDirectory?: string;
  readonly siteUrl?: string;
  readonly basePath?: string;
  readonly locale?: SiteLocale;
  /** Explicit local-only input; never loaded by the default public build. */
  readonly evaluationPath?: string;
  /** Optional local-only review translation sidecar for the private audit build. */
  readonly reviewTranslationPath?: string;
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
  basePath: string | undefined,
  locale: SiteLocale,
): Promise<void> {
  const outputPath = pageOutputPath(outputDirectory, page.route);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    renderPage(page, {
      benchmark: artifacts.benchmark,
      ...(siteUrl === undefined ? {} : { siteUrl }),
      ...(basePath === undefined ? {} : { basePath }),
      locale,
    }),
    "utf8",
  );
}

async function copyBrandAssets(outputDirectory: string): Promise<void> {
  const outputBrandRoot = join(outputDirectory, "assets", "brand", "tutorbench");
  for (const relativePath of TUTORBENCH_BRAND_ASSET_PATHS) {
    const sourcePath = join(brandAssetRoot, relativePath);
    const outputPath = join(outputBrandRoot, relativePath);
    await mkdir(dirname(outputPath), { recursive: true });
    await copyFile(sourcePath, outputPath);
  }
}

interface LocalAuditBuildData {
  readonly artifact: TutorEvaluationAuditArtifact;
  readonly dataset: Awaited<ReturnType<typeof loadTutorEvalDataset>>;
  readonly locale: SiteLocale;
  readonly reviewTranslation?: ReviewTranslationArtifact;
}

function routePages(
  artifacts: PublicBenchmarkArtifacts,
  audit: LocalAuditBuildData | undefined,
): readonly RoutePage[] {
  const reviewTranslationLookup: ReviewTranslationLookup | undefined = audit === undefined
    ? undefined
    : createReviewTranslationLookup(audit.artifact.evaluation, audit.reviewTranslation);
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
  const routePages = [
    ...pages,
    ...artifacts.cases.cases.map((caseArtifact) => ({
      outputRoute: `/data/cases/${encodeURIComponent(caseArtifact.id)}/`,
      page: renderCaseDetailPage(artifacts, caseArtifact),
    })),
  ];
  if (audit !== undefined) {
    routePages.push({
      outputRoute: `/audit/runs/${encodeURIComponent(audit.artifact.evaluation.runId)}/`,
      page: renderTutorEvaluationAuditIndexPage({
        artifact: audit.artifact,
        dataset: audit.dataset,
        locale: audit.locale,
        ...(reviewTranslationLookup === undefined ? {} : { reviewTranslation: reviewTranslationLookup }),
      }),
    });
    for (const caseResult of audit.artifact.evaluation.caseResults) {
      routePages.push({
        outputRoute: auditRoute(
          audit.artifact.evaluation.runId,
          caseResult.caseId,
          caseResult.runIndex,
        ),
        page: renderTutorEvaluationAuditPage({
          artifact: audit.artifact,
          dataset: audit.dataset,
          caseId: caseResult.caseId,
          runIndex: caseResult.runIndex,
          locale: audit.locale,
          ...(reviewTranslationLookup === undefined ? {} : { reviewTranslation: reviewTranslationLookup }),
        }),
      });
    }
  }
  return routePages;
}

export async function buildWebsite(options: BuildOptions = {}): Promise<number> {
  const outputDirectory = options.outputDirectory ?? defaultOutputDirectory;
  if (options.evaluationPath !== undefined && !isWithinDirectory(outputDirectory, privateOutputDirectory)) {
    throw new Error("Evaluation artifacts can only be rendered under website/private-dist.");
  }
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const artifacts = buildPublicBenchmarkArtifacts(dataset);
  const locale = options.locale ?? "en";
  let audit: LocalAuditBuildData | undefined;
  if (options.evaluationPath !== undefined) {
    const evaluationValue = JSON.parse(
      await readFile(options.evaluationPath, "utf8"),
    ) as unknown;
    const artifact = parseTutorEvaluationAuditArtifact(evaluationValue);
    let reviewTranslation: ReviewTranslationArtifact | undefined;
    if (options.reviewTranslationPath !== undefined) {
      try {
        reviewTranslation = parseReviewTranslationArtifact(
          JSON.parse(await readFile(options.reviewTranslationPath, "utf8")) as unknown,
        );
      } catch {
        // Review translation is optional review evidence; invalid or missing
        // sidecars must leave the original audit artifact fully readable.
        reviewTranslation = undefined;
      }
    }
    audit = {
      artifact,
      dataset: await loadTutorEvalDataset(
        artifact.evaluation.datasetId,
        requestedDatasetVersion(
          artifact.evaluation.datasetId,
          artifact.evaluation.datasetVersion,
        ),
      ),
      locale,
      ...(reviewTranslation === undefined ? {} : { reviewTranslation }),
    };
  }
  const stylesheet = await readFile(join(websiteRoot, "src", "styles.css"), "utf8");
  const clientScript = await readFile(join(websiteRoot, "src", "site.js"), "utf8");

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(join(outputDirectory, "assets"), { recursive: true });
  await writeFile(join(outputDirectory, "assets", "styles.css"), stylesheet, "utf8");
  await writeFile(join(outputDirectory, "assets", "site.js"), clientScript, "utf8");
  await copyBrandAssets(outputDirectory);
  await writeJson(outputDirectory, "benchmark.json", artifacts.benchmark);
  await writeJson(outputDirectory, "cases.json", artifacts.cases);
  await writeJson(outputDirectory, "models.json", artifacts.models);
  await writeJson(outputDirectory, "trials.json", artifacts.trials);

  const pages = routePages(artifacts, audit);
  for (const routePage of pages) {
    await writePage(
      outputDirectory,
      routePage.page,
      artifacts,
      options.siteUrl,
      options.basePath,
      locale,
    );
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
      {
        benchmark: artifacts.benchmark,
        ...(options.siteUrl === undefined ? {} : { siteUrl: options.siteUrl }),
        ...(options.basePath === undefined ? {} : { basePath: options.basePath }),
        locale,
      },
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
  const evaluationArgumentIndex = args.indexOf("--evaluation");
  const evaluationArgument = evaluationArgumentIndex === -1
    ? undefined
    : args[evaluationArgumentIndex + 1];
  if (
    evaluationArgumentIndex !== -1 &&
    (evaluationArgument === undefined || evaluationArgument.startsWith("--"))
  ) {
    throw new Error("Evaluation artifact path is required after --evaluation.");
  }
  const reviewTranslationArgumentIndex = args.indexOf("--review-translation");
  const reviewTranslationArgument = reviewTranslationArgumentIndex === -1
    ? undefined
    : args[reviewTranslationArgumentIndex + 1];
  if (
    reviewTranslationArgumentIndex !== -1 &&
    (reviewTranslationArgument === undefined || reviewTranslationArgument.startsWith("--"))
  ) {
    throw new Error("Review translation sidecar path is required after --review-translation.");
  }
  if (reviewTranslationArgument !== undefined && evaluationArgument === undefined) {
    throw new Error("--review-translation requires --evaluation.");
  }
  const localeArgumentIndex = args.indexOf("--locale");
  const localeArgument = localeArgumentIndex === -1
    ? undefined
    : args[localeArgumentIndex + 1];
  if (
    localeArgumentIndex !== -1 &&
    (localeArgument === undefined || localeArgument.startsWith("--"))
  ) {
    throw new Error("Locale is required after --locale.");
  }
  const websitePrefix = `${websiteRoot}${process.platform === "win32" ? "\\" : "/"}`;
  if (
    outputDirectory !== websiteRoot &&
    !outputDirectory.startsWith(websitePrefix)
  ) {
    throw new Error("Website output must stay inside the website directory.");
  }
  if (
    evaluationArgument !== undefined &&
    !isWithinDirectory(outputDirectory, privateOutputDirectory)
  ) {
    throw new Error("--evaluation requires an output directory under website/private-dist.");
  }
  const siteUrl = process.env.TUTOR_BENCHMARK_SITE_URL?.trim() || undefined;
  const basePath = process.env.TUTOR_BENCHMARK_SITE_BASE_PATH?.trim() || undefined;
  const routeCount = await buildWebsite({
    outputDirectory,
    locale: resolveSiteLocale(localeArgument),
    ...(evaluationArgument === undefined
      ? {}
      : { evaluationPath: resolve(process.cwd(), evaluationArgument) }),
    ...(reviewTranslationArgument === undefined
      ? {}
      : { reviewTranslationPath: resolve(process.cwd(), reviewTranslationArgument) }),
    ...(siteUrl === undefined ? {} : { siteUrl }),
    ...(basePath === undefined ? {} : { basePath }),
  });
  console.log(`Built Tutor Benchmark website: ${outputDirectory}`);
  console.log(`Routes: ${routeCount}`);
  console.log(`UI locale: ${resolveSiteLocale(localeArgument)}`);
  if (evaluationArgument !== undefined) {
    console.log("Local audit pages: enabled (private-dist only)");
  }
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
