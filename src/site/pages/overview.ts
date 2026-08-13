import {
  PUBLIC_BENCHMARK_GENERATION_TRACEABILITY_FIELDS,
  type PublicBenchmarkArtifacts,
  type PublicBenchmarkArtifact,
  type PublicCaseArtifact,
} from "../../datasets/public.js";
import {
  escapeHtml,
  formatDifficulty,
  humanize,
  renderDimensionPills,
  renderEmptyState,
  renderKeyValueList,
  renderMetric,
  renderStatusBadge,
  SITE_GITHUB_URL,
  type SitePage,
} from "../html.js";

function page(
  title: string,
  description: string,
  route: string,
  content: string,
): SitePage {
  return { title, description, route, content };
}

function renderSectionHeading(
  eyebrow: string,
  title: string,
  copy?: string,
  headingId?: string,
): string {
  return `<div class="section-heading">
    <p class="eyebrow">${escapeHtml(eyebrow)}</p>
    <h2${headingId === undefined ? "" : ` id="${escapeHtml(headingId)}"`}>${escapeHtml(title)}</h2>
    ${copy === undefined ? "" : `<p class="section-copy">${escapeHtml(copy)}</p>`}
  </div>`;
}

function renderCoverageSnapshot(benchmark: PublicBenchmarkArtifact): string {
  const { dataset, coverage } = benchmark;
  const topSubjects = Object.entries(coverage.casesBySubject)
    .map(([subject, count]) => `${humanize(subject)} ${count}`)
    .join(" · ");
  return `<section class="section section-muted" aria-labelledby="dataset-snapshot-heading">
    <div class="shell">
      ${renderSectionHeading("Dataset snapshot", "A real synthetic development set", "The explorer is backed by the checked-in TutorEval 0.2A cases. It does not invent model runs.", "dataset-snapshot-heading")}
      <div class="metric-grid">
        ${renderMetric("Cases", String(dataset.caseCount), "Public development cases")}
        ${renderMetric("Subjects", String(dataset.subjectCount), topSubjects)}
        ${renderMetric("Capabilities", String(dataset.capabilityCount), "Taxonomy tags covered")}
        ${renderMetric("Adaptation pairs", String(dataset.counterfactualPairCount), "Counterfactual case pairs")}
      </div>
      <div class="snapshot-note">
        <span class="eyebrow">Coverage</span>
        <p>${escapeHtml(Object.keys(coverage.casesByDisclosurePolicy).length)} disclosure policies · ${escapeHtml(String(dataset.rubricCount))} authored rubrics · ${escapeHtml(String(coverage.judgeRequiredRubricCount))} Judge-required rubrics reserved for the semantic boundary.</p>
        <a class="text-link" href="/data/">Explore the data layer ↗</a>
      </div>
    </div>
  </section>`;
}

function renderExampleCase(caseArtifact: PublicCaseArtifact["cases"][number]): string {
  const challenge = caseArtifact.tutorInput.learningObjective;
  const capabilityTags = caseArtifact.metadata.capabilityTags ?? [];
  return `<section class="section" aria-labelledby="example-case-title">
    <div class="shell example-grid">
      <div>
        ${renderSectionHeading("Example case", "Teaching is more than returning the answer", "A case can ask a Tutor to diagnose a misconception, preserve student agency, and choose an appropriate amount of help.", "example-case-title")}
        <div class="case-quote">
          <p class="quote-label">Student</p>
          <blockquote>“${escapeHtml(caseArtifact.tutorInput.studentMessage)}”</blockquote>
          <p class="quote-label">Tutor challenge</p>
          <p>${escapeHtml(challenge)}</p>
        </div>
        <a class="button button-secondary" href="/data/cases/${encodeURIComponent(caseArtifact.id)}/">Open case ${escapeHtml(caseArtifact.id)} ↗</a>
      </div>
      <aside class="panel example-aside" aria-label="Case capabilities">
        <p class="eyebrow">What this case exposes</p>
        <ul class="feature-list">
          <li><span>Diagnosis</span><span>Identify the learner’s error</span></li>
          <li><span>Guidance</span><span>Point toward a common denominator</span></li>
          <li><span>Answer leakage</span><span>Track whether the final answer is disclosed</span></li>
        </ul>
        <div class="tag-list">
          ${capabilityTags.map((tag) => `<span class="tag">${escapeHtml(humanize(tag))}</span>`).join("")}
        </div>
      </aside>
    </div>
  </section>`;
}

export function renderHomePage(artifacts: PublicBenchmarkArtifacts): SitePage {
  const { benchmark, cases } = artifacts;
  const exampleCase = cases.cases.find((item) => item.id === "fraction-misconception-001") ?? cases.cases[0];
  const categories = benchmark.dimensions.score;
  return page(
    "Tutor Benchmark — Developer Preview",
    "Explore a public benchmark for observable tutoring behavior: correctness, diagnosis, guidance, adaptation, and actionability.",
    "/",
    `<section class="hero-section">
      <div class="shell hero-grid">
        <div class="hero-copy">
          <div class="eyebrow-row">
            ${renderStatusBadge(benchmark.statusLabel, "preview")}
            <span class="eyebrow">${escapeHtml(benchmark.dataset.id)} · ${escapeHtml(benchmark.dataset.version)}</span>
          </div>
          <h1>Measuring how well AI models teach, <em>not just whether they know the answer.</em></h1>
          <p class="hero-lede">Tutor Benchmark makes tutoring behavior inspectable: can a model recognize what a learner needs, guide the next step, adapt its help, and preserve the learner’s chance to think?</p>
          <div class="button-row">
            <a class="button button-primary" href="/leaderboard/">Explore leaderboard</a>
            <a class="button button-secondary" href="/data/cases/">Browse cases</a>
            <a class="button button-quiet" href="/run/">Run the benchmark</a>
          </div>
          <p class="hero-note">${escapeHtml(benchmark.notice)}</p>
        </div>
        <aside class="hero-aside panel" aria-label="Benchmark position">
          <p class="eyebrow">The distinction</p>
          <p class="equation"><span>Can it answer?</span><strong>≠</strong><span>Can it teach?</span></p>
          <div class="rule"></div>
          <p class="muted">The first release is a read-only explorer. Public rankings remain empty until reproducible, versioned model runs and calibration evidence are available.</p>
        </aside>
      </div>
    </section>

    <section class="section" aria-labelledby="leaderboard-preview-title">
      <div class="shell">
        <div class="section-heading split-heading">
          <div>
            <p class="eyebrow">Public results</p>
            <h2 id="leaderboard-preview-title">Leaderboard preview</h2>
          </div>
          <a class="text-link" href="/leaderboard/">See the full schema ↗</a>
        </div>
        <div class="preview-panel panel">
          <div class="preview-panel-head">
            ${renderStatusBadge("No calibrated runs", "muted")}
            <span class="muted">Ranking is intentionally unavailable</span>
          </div>
          ${renderEmptyState("No calibrated public model runs yet.", "The leaderboard will show versioned model results only after reproducible runs and independent validation are available.")}
          <div class="schema-strip">
            <span class="eyebrow">Future score dimensions</span>
            ${renderDimensionPills(categories)}
          </div>
        </div>
      </div>
    </section>

    <section class="section section-dark" aria-labelledby="measure-title">
      <div class="shell">
        ${renderSectionHeading("What we measure", "Five observable tutoring capabilities", "The overall score is never intended to hide the category-level behavior behind it.", "measure-title")}
        <div class="dimension-grid">
          ${categories
            .map(
              (category, index) => `<article class="dimension-card">
                <span class="dimension-index">0${index + 1}</span>
                <h3>${escapeHtml(humanize(category))}</h3>
                <p>${escapeHtml(
                  [
                    "Accurate content and reasoning, without introducing new errors.",
                    "Recognize the learner’s gap, misconception, or reasoning issue.",
                    "Offer a useful explanation or hint that moves thinking forward.",
                    "Adjust help to the learner’s state, task, and prior context.",
                    "Give the learner a concrete next action they can execute.",
                  ][index] ?? "An observable tutoring behavior evaluated against a case rubric.",
                )}</p>
              </article>`,
            )
            .join("")}
        </div>
      </div>
    </section>

    ${renderCoverageSnapshot(benchmark)}
    ${exampleCase === undefined ? "" : renderExampleCase(exampleCase)}

    <section class="section section-muted" aria-labelledby="developer-title">
      <div class="shell developer-cta">
        <div>
          ${renderSectionHeading("For developers", "Bring your own Tutor", "Use the stable TutorUnderTest adapter or freeze responses into a corpus and replay the benchmark offline.", "developer-title")}
        </div>
        <div class="button-row">
          <a class="button button-primary" href="/run/">Read the run guide</a>
          <a class="button button-secondary" href="${escapeHtml(SITE_GITHUB_URL)}" rel="noreferrer">View source on GitHub ↗</a>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="limits-title">
      <div class="shell limits-grid">
        <div>
          <p class="eyebrow">Transparent by design</p>
          <h2 id="limits-title">Developer Preview, not a scientific conclusion.</h2>
        </div>
        <div>
          <p class="section-copy">Calibration infrastructure exists, but independent human calibration, Judge-vs-human validation, and statistical evaluation are still in progress. Tutor Benchmark measures observable tutoring behavior in benchmark cases; it does not measure long-term learning, retention, transfer, satisfaction, or classroom outcomes.</p>
          <a class="text-link" href="/methodology/">Read methodology and limits ↗</a>
        </div>
      </div>
    </section>`,
  );
}

function renderLeaderboardSchema(benchmark: PublicBenchmarkArtifact): string {
  const scoreFields = benchmark.dimensions.score.map((field) => humanize(field));
  const operationalFields = benchmark.dimensions.operational.map((field) => humanize(field));
  return `<div class="schema-grid">
    <div><p class="eyebrow">Tutor capability score</p>${renderDimensionPills(benchmark.dimensions.score)}</div>
    <div><p class="eyebrow">Operational signals</p>${renderDimensionPills(benchmark.dimensions.operational)}</div>
    <div><p class="eyebrow">Traceability fields</p>${renderDimensionPills([...PUBLIC_BENCHMARK_GENERATION_TRACEABILITY_FIELDS, "promptSha256", "runs"])}</div>
    <p class="muted">The future table will show: ${escapeHtml(scoreFields.join(", "))}. Operational fields include ${escapeHtml(operationalFields.join(", "))}. Results from different generation profiles are separate cohorts and are not silently mixed.</p>
  </div>`;
}

function renderEmptyLeaderboardTable(): string {
  const columns = [
    "Rank",
    "Model",
    "Overall",
    "Correctness",
    "Diagnosis",
    "Guidance",
    "Adaptation",
    "Actionability",
    "Status",
  ];
  return `<div class="table-wrap"><table class="leaderboard-table"><caption>Future public model leaderboard</caption><thead><tr>${columns
    .map((column) => `<th scope="col">${escapeHtml(column)}</th>`)
    .join("")}</tr></thead><tbody><tr><td class="leaderboard-empty-cell" colspan="${columns.length}">No public model rows are available yet.</td></tr></tbody></table><div class="mobile-ranking-empty">No public model rows are available yet.</div></div>`;
}

export function renderLeaderboardPage(artifacts: PublicBenchmarkArtifacts): SitePage {
  const { benchmark, models } = artifacts;
  return page(
    "Leaderboard — Tutor Benchmark",
    "A transparent leaderboard schema for Tutor Benchmark. Public model rankings are not available yet.",
    "/leaderboard/",
    `<section class="page-intro">
      <div class="shell narrow-shell">
        <div class="eyebrow-row">${renderStatusBadge(benchmark.statusLabel, "preview")}<span class="eyebrow">Public result artifact</span></div>
        <h1>Leaderboard</h1>
        <p class="lede">A future ranking surface for versioned Tutor capability results. Until the corpus is reproducible and calibrated, this page stays explicit about what is not known.</p>
        <p class="notice-line">${escapeHtml(models.notice)} ${escapeHtml(benchmark.notice)}</p>
      </div>
    </section>
    <section class="section">
      <div class="shell">
        <div class="panel leaderboard-empty">
          ${renderEmptyState("Leaderboard coming soon", "No real model results are checked into the public artifact. Synthetic demonstrations are not presented as rankings.")}
          ${renderEmptyLeaderboardTable()}
          ${renderLeaderboardSchema(benchmark)}
        </div>
      </div>
    </section>
    <section class="section section-muted" aria-labelledby="leaderboard-fields-title">
      <div class="shell">
        ${renderSectionHeading("Future filters", "Designed for comparison without hiding context", "The v0.1 shell leaves room for benchmark, prompt, subject, provider, model, and metric sorting without implementing a complex filter engine yet.", "leaderboard-fields-title")}
        <div class="filter-preview">
          ${renderKeyValueList([
            ["Version", "Benchmark version · prompt version · dataset version"],
            ["Scope", "Subject · model provider · model"],
            ["Sort", "Overall · correctness · diagnosis · guidance · adaptation · actionability · cost · latency"],
          ])}
        </div>
      </div>
    </section>`,
  );
}

export function renderModelsPage(artifacts: PublicBenchmarkArtifacts): SitePage {
  const { benchmark, models } = artifacts;
  return page(
    "Models — Tutor Benchmark",
    "Model identity and versioning for future Tutor Benchmark result artifacts.",
    "/models/",
    `<section class="page-intro">
      <div class="shell narrow-shell">
        <div class="eyebrow-row">${renderStatusBadge(benchmark.statusLabel, "preview")}<span class="eyebrow">Model catalog</span></div>
        <h1>Models</h1>
        <p class="lede">Model pages will be derived from public, versioned result artifacts. They will not contain free-form AI summaries of strengths or weaknesses.</p>
      </div>
    </section>
    <section class="section">
      <div class="shell">
        ${renderEmptyState("No public model profiles yet.", models.notice, "A model detail page will appear only when its identity, snapshot, dataset, prompt, and trial records are available.")}
        <div class="panel schema-panel">
          <p class="eyebrow">Model detail contract</p>
          ${renderDimensionPills(["model identity", "provider", "snapshot/version", "overall score", "five category scores", "subject breakdown", "capability breakdown", "cost", "latency", "tokens"])}
          <p class="muted">Strengths and weaknesses will be computed from the highest and lowest verified categories, failure rates, and other stored metrics—not generated after the fact by an LLM.</p>
        </div>
      </div>
    </section>`,
  );
}

export function renderModelDetailPage(artifacts: PublicBenchmarkArtifacts): SitePage {
  return page(
    "Model Detail — Tutor Benchmark",
    "Reserved model detail route for future public Tutor Benchmark result artifacts.",
    "/models/[modelId]/",
    `<section class="page-intro"><div class="shell narrow-shell"><a class="back-link" href="/models/">← Back to models</a><div class="eyebrow-row">${renderStatusBadge(artifacts.benchmark.statusLabel, "preview")}<span class="eyebrow">Model detail contract</span></div><h1>Model detail</h1><p class="lede">Model-specific pages are reserved for versioned public result artifacts. No model identity or score is fabricated in the Developer Preview.</p></div></section><section class="section"><div class="shell">${renderEmptyState("No model selected", "A future /models/[modelId] route will resolve a model identity, snapshot, five category scores, and traceable trials from public data.")}</div></section>`,
  );
}

export function renderDataIndexPage(artifacts: PublicBenchmarkArtifacts): SitePage {
  const { benchmark } = artifacts;
  return page(
    "Data Explorer — Tutor Benchmark",
    "Browse public TutorEval cases, coverage, heatmap contracts, and trial traceability.",
    "/data/",
    `<section class="page-intro">
      <div class="shell narrow-shell">
        <div class="eyebrow-row">${renderStatusBadge(benchmark.statusLabel, "preview")}<span class="eyebrow">Read-only benchmark data</span></div>
        <h1>Data explorer</h1>
        <p class="lede">The public data layer separates checked-in benchmark artifacts from the UI. Current cases are real synthetic development data; model results and trials remain empty until they can be published responsibly.</p>
      </div>
    </section>
    <section class="section">
      <div class="shell data-hub-grid">
        <a class="route-card" href="/data/cases/"><span class="eyebrow">01 · Dataset</span><h2>Cases</h2><p>${escapeHtml(String(benchmark.dataset.caseCount))} public cases with subject, difficulty, learner state, capability, and disclosure metadata.</p><span class="text-link">Browse cases ↗</span></a>
        <a class="route-card" href="/data/heatmap/"><span class="eyebrow">02 · Matrix</span><h2>Heatmap</h2><p>A reusable case × model-run contract, currently without public model trials.</p><span class="text-link">View heatmap status ↗</span></a>
        <a class="route-card" href="/data/trials/"><span class="eyebrow">03 · Audit trail</span><h2>Trials</h2><p>Trace future leaderboard numbers to a case, Tutor response, rubric evidence, and sanitized metrics.</p><span class="text-link">View trial status ↗</span></a>
      </div>
    </section>
    <section class="section section-muted">
      <div class="shell">
        ${renderSectionHeading("Coverage", "What is inside the current dataset", "Coverage is computed from the canonical dataset at build time, then serialized for the read-only website.")}
        <div class="metric-grid">
          ${renderMetric("Cases", String(benchmark.coverage.caseCount), "TutorEval 0.2A")}
          ${renderMetric("Subjects", String(Object.keys(benchmark.coverage.casesBySubject).length), Object.keys(benchmark.coverage.casesBySubject).map(humanize).join(" · "))}
          ${renderMetric("Capabilities", String(Object.keys(benchmark.coverage.casesByCapabilityTag).length), "Taxonomy tags")}
          ${renderMetric("Policies", String(Object.keys(benchmark.coverage.casesByDisclosurePolicy).length), "Disclosure-policy buckets")}
        </div>
      </div>
    </section>`,
  );
}

export function renderCaseSummary(caseArtifact: PublicCaseArtifact["cases"][number]): string {
  const difficulty = formatDifficulty(caseArtifact.metadata.difficulty);
  const tags = caseArtifact.metadata.capabilityTags ?? [];
  return `<article class="case-card" data-case-card data-case-subject="${escapeHtml(caseArtifact.metadata.subject)}" data-case-learner-level="${escapeHtml(
    typeof caseArtifact.metadata.difficulty === "object" && caseArtifact.metadata.difficulty !== null
      ? caseArtifact.metadata.difficulty.learnerLevel
      : "",
  )}" data-case-task-difficulty="${escapeHtml(
    typeof caseArtifact.metadata.difficulty === "object" && caseArtifact.metadata.difficulty !== null
      ? String(caseArtifact.metadata.difficulty.taskDifficulty)
      : "",
  )}" data-case-pedagogical-difficulty="${escapeHtml(
    typeof caseArtifact.metadata.difficulty === "object" && caseArtifact.metadata.difficulty !== null
      ? String(caseArtifact.metadata.difficulty.pedagogicalDifficulty)
      : "",
  )}" data-case-capabilities="${escapeHtml(tags.join(" "))}" data-case-disclosure-policy="${escapeHtml(
    caseArtifact.disclosurePolicy ?? "",
  )}" data-case-student-state="${escapeHtml(caseArtifact.metadata.studentState ?? "")}">
    <div class="case-card-head"><span class="eyebrow">${escapeHtml(caseArtifact.id)}</span>${renderStatusBadge(caseArtifact.metadata.subject, "muted")}</div>
    <h2>${escapeHtml(humanize(caseArtifact.metadata.topic))}</h2>
    <p>${escapeHtml(caseArtifact.tutorInput.learningObjective)}</p>
    <dl class="case-meta">
      <div><dt>Level</dt><dd>${escapeHtml(
        typeof caseArtifact.metadata.difficulty === "object" && caseArtifact.metadata.difficulty !== null
          ? humanize(caseArtifact.metadata.difficulty.learnerLevel)
          : "Not specified",
      )}</dd></div>
      <div><dt>Difficulty</dt><dd>${escapeHtml(difficulty)}</dd></div>
      <div><dt>Student state</dt><dd>${escapeHtml(humanize(caseArtifact.metadata.studentState ?? "Not specified"))}</dd></div>
      <div><dt>Disclosure</dt><dd>${escapeHtml(humanize(caseArtifact.disclosurePolicy ?? "Not specified"))}</dd></div>
    </dl>
    <div class="tag-list">${tags.slice(0, 4).map((tag) => `<span class="tag">${escapeHtml(humanize(tag))}</span>`).join("")}</div>
    <a class="card-link" href="/data/cases/${encodeURIComponent(caseArtifact.id)}/">View case <span aria-hidden="true">↗</span></a>
  </article>`;
}
