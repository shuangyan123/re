import type {
  PublicBenchmarkArtifact,
  TutorEvalPublicCase,
} from "../datasets/public.js";

export const SITE_GITHUB_URL = "https://github.com/shuangyan123/re";

type SiteFooterBenchmark = Pick<PublicBenchmarkArtifact, "statusLabel"> & {
  readonly dataset: Pick<PublicBenchmarkArtifact["dataset"], "id" | "version">;
};

export interface SiteRenderContext {
  readonly siteUrl?: string;
  readonly basePath?: string;
  readonly benchmark?: SiteFooterBenchmark;
}

export interface SitePage {
  readonly title: string;
  readonly description: string;
  readonly route: string;
  readonly content: string;
}

/**
 * Normalizes the path under which a project site is hosted, such as `/re`.
 * GitHub Pages supplies this value separately from the full canonical URL.
 */
export function normalizeSiteBasePath(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0 || trimmed === "/") {
    return "";
  }
  if (
    !trimmed.startsWith("/") ||
    trimmed.includes("//") ||
    /[\\?#\s<>"']/.test(trimmed) ||
    !/^\/[A-Za-z0-9._~!$&()*+,;=:@/-]+$/.test(trimmed)
  ) {
    throw new Error("Site base path must be a URL path such as /re.");
  }
  return trimmed.replace(/\/+$/, "");
}

function sitePath(basePath: string, route: string): string {
  if (!route.startsWith("/")) {
    return route;
  }
  return `${basePath}${route}`;
}

/** Prefixes generated internal href/src attributes without touching external URLs or code text. */
function prefixInternalPaths(markup: string, basePath: string): string {
  if (basePath.length === 0) {
    return markup;
  }
  return markup.replace(
    /((?:href|src)=['"])(\/[^'"]*)/g,
    (match, attribute, path) =>
      path === basePath || path.startsWith(`${basePath}/`)
        ? match
        : `${attribute}${basePath}${path}`,
  );
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDifficulty(value: TutorEvalPublicCase["metadata"]["difficulty"]): string {
  if (typeof value !== "object" || value === null) {
    return value === undefined ? "Not specified" : humanize(String(value));
  }
  return `Learner: ${humanize(value.learnerLevel)} · Task ${value.taskDifficulty}/5 · Pedagogy ${value.pedagogicalDifficulty}/5`;
}

export function renderStatusBadge(label: string, tone = "neutral"): string {
  return `<span class="status-badge status-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

export function renderDimensionPills(values: readonly string[]): string {
  return `<div class="pill-row">${values
    .map((value) => `<span class="dimension-pill">${escapeHtml(humanize(value))}</span>`)
    .join("")}</div>`;
}

export function renderMetric(label: string, value: string, detail?: string): string {
  return `<div class="metric"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>${
    detail === undefined ? "" : `<p>${escapeHtml(detail)}</p>`
  }</div>`;
}

export function renderEmptyState(title: string, message: string, action?: string): string {
  return `<section class="empty-state" aria-label="${escapeHtml(title)}">
    <span class="empty-mark" aria-hidden="true">—</span>
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(message)}</p>
    ${action === undefined ? "" : `<span class="empty-action">${escapeHtml(action)}</span>`}
  </section>`;
}

export function renderCodeBlock(code: string, language = "text"): string {
  return `<pre class="code-block"><code data-language="${escapeHtml(language)}">${escapeHtml(code)}</code></pre>`;
}

export function renderKeyValueList(items: readonly [string, string][]): string {
  return `<dl class="key-value-list">${items
    .map(
      ([key, value]) =>
        `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join("")}</dl>`;
}

function navLink(
  label: string,
  route: string,
  activeRoute: string,
  basePath: string,
): string {
  const active =
    activeRoute === route ||
    (route === "/data/" && activeRoute.startsWith("/data/"));
  return `<a href="${escapeHtml(sitePath(basePath, route))}"${active ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`;
}

function renderHeader(activeRoute: string, basePath: string): string {
  return `<header class="site-header">
    <div class="shell header-inner">
      <a class="wordmark" href="${escapeHtml(sitePath(basePath, "/"))}" aria-label="Tutor Benchmark home">
        <span class="wordmark-mark" aria-hidden="true">TB</span>
        <span>Tutor Benchmark</span>
      </a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-navigation">Menu</button>
      <nav id="primary-navigation" class="nav-links" aria-label="Primary navigation">
        ${navLink("Leaderboard", "/leaderboard/", activeRoute, basePath)}
        ${navLink("Data", "/data/", activeRoute, basePath)}
        ${navLink("Run", "/run/", activeRoute, basePath)}
        ${navLink("Methodology", "/methodology/", activeRoute, basePath)}
        ${navLink("Docs", "/docs/", activeRoute, basePath)}
        <a href="${escapeHtml(SITE_GITHUB_URL)}" rel="noreferrer">GitHub ↗</a>
      </nav>
    </div>
  </header>`;
}

function renderFooter(
  benchmark: SiteFooterBenchmark,
): string {
  return `<footer class="site-footer">
    <div class="shell footer-grid">
      <div>
        <p class="footer-title">Tutor Benchmark</p>
        <p class="muted">A public, provider-independent explorer for observable tutoring behavior.</p>
      </div>
      <div>
        <p class="footer-title">Status</p>
        <p>${renderStatusBadge(benchmark.statusLabel, "preview")}</p>
        <p class="muted">Licensing is not finalized yet.</p>
      </div>
      <div>
        <p class="footer-title">Source</p>
        <a class="text-link" href="${escapeHtml(SITE_GITHUB_URL)}" rel="noreferrer">Read the repository ↗</a>
        <p class="muted">Dataset ${escapeHtml(benchmark.dataset.id)}@${escapeHtml(benchmark.dataset.version)}</p>
      </div>
    </div>
  </footer>`;
}

export function renderPage(page: SitePage, context: SiteRenderContext = {}): string {
  const basePath = normalizeSiteBasePath(context.basePath);
  const siteUrl = context.siteUrl?.replace(/\/$/, "");
  const canonicalUrl = siteUrl === undefined ? undefined : `${siteUrl}${page.route}`;
  const pageMarkup = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(page.title)}">
    <meta property="og:description" content="${escapeHtml(page.description)}">
    ${canonicalUrl === undefined ? "" : `<meta property="og:url" content="${escapeHtml(canonicalUrl)}"><link rel="canonical" href="${escapeHtml(canonicalUrl)}">`}
    <link rel="stylesheet" href="${escapeHtml(sitePath(basePath, "/assets/styles.css"))}">
    <script src="${escapeHtml(sitePath(basePath, "/assets/site.js"))}" defer></script>
  </head>
  <body>
    <a class="skip-link" href="#main-content">Skip to content</a>
    ${renderHeader(page.route, basePath)}
    <main id="main-content">${page.content}</main>
    ${renderFooter(context.benchmark ?? ({
      statusLabel: "Developer Preview",
      dataset: { id: "tutor-eval-v0.2a", version: "0.2a" },
    }))}
  </body>
</html>
`;
  return prefixInternalPaths(pageMarkup, basePath);
}
