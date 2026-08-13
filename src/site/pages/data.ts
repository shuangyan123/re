import type {
  PublicBenchmarkArtifacts,
  TutorEvalPublicCase,
} from "../../datasets/public.js";
import {
  escapeHtml,
  formatDifficulty,
  humanize,
  renderDimensionPills,
  renderEmptyState,
  renderKeyValueList,
  renderStatusBadge,
  type SitePage,
} from "../html.js";
import { renderCaseSummary } from "./overview.js";

function page(
  title: string,
  description: string,
  route: string,
  content: string,
): SitePage {
  return { title, description, route, content };
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function selectOptions(values: readonly string[], emptyLabel: string): string {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(humanize(value))}</option>`),
  ].join("");
}

function difficultyValues(
  cases: readonly TutorEvalPublicCase[],
  key: "learnerLevel" | "taskDifficulty" | "pedagogicalDifficulty",
): readonly string[] {
  return uniqueSorted(
    cases.flatMap((item) => {
      const difficulty = item.metadata.difficulty;
      if (typeof difficulty !== "object" || difficulty === null) {
        return [];
      }
      return [String(difficulty[key])];
    }),
  );
}

export function renderCasesPage(artifacts: PublicBenchmarkArtifacts): SitePage {
  const publicCases = artifacts.cases.cases;
  const subjects = uniqueSorted(publicCases.map((item) => item.metadata.subject));
  const capabilities = uniqueSorted(
    publicCases.flatMap((item) => item.metadata.capabilityTags ?? []),
  );
  const studentStates = uniqueSorted(
    publicCases
      .map((item) => item.metadata.studentState)
      .filter((value): value is string => value !== undefined),
  );
  const disclosurePolicies = uniqueSorted(
    publicCases
      .map((item) => item.disclosurePolicy)
      .filter((value): value is NonNullable<typeof value> => value !== undefined),
  );
  return page(
    "Cases — Tutor Benchmark",
    "Explore the public TutorEval development cases and their observable tutoring metadata.",
    "/data/cases/",
    `<section class="page-intro">
      <div class="shell narrow-shell">
        <div class="eyebrow-row">${renderStatusBadge("Public development set", "preview")}<span class="eyebrow">${escapeHtml(artifacts.cases.datasetId)}@${escapeHtml(artifacts.cases.datasetVersion)}</span></div>
        <h1>Case explorer</h1>
        <p class="lede">Browse the cases a Tutor sees: learning objective, student context, current message, difficulty, capability tags, and the public disclosure policy. Evaluator-only answers and rubrics are kept out of this artifact.</p>
      </div>
    </section>
    <section class="section section-muted">
      <div class="shell">
        <form class="filter-bar" id="case-filters" aria-label="Filter public cases">
          <div class="filter-bar-head"><div><p class="eyebrow">Explore ${escapeHtml(String(publicCases.length))} cases</p><p id="case-result-count" class="filter-result" aria-live="polite">Showing ${escapeHtml(String(publicCases.length))} cases</p></div><button class="button button-quiet" type="reset" id="case-filter-reset">Reset filters</button></div>
          <div class="filter-grid">
            <label>Subject<select data-case-filter="subject">${selectOptions(subjects, "All subjects")}</select></label>
            <label>Learner level<select data-case-filter="learnerLevel">${selectOptions(difficultyValues(publicCases, "learnerLevel"), "All levels")}</select></label>
            <label>Task difficulty<select data-case-filter="taskDifficulty">${selectOptions(difficultyValues(publicCases, "taskDifficulty"), "All levels")}</select></label>
            <label>Pedagogical difficulty<select data-case-filter="pedagogicalDifficulty">${selectOptions(difficultyValues(publicCases, "pedagogicalDifficulty"), "All levels")}</select></label>
            <label>Capability<select data-case-filter="capability">${selectOptions(capabilities, "All capabilities")}</select></label>
            <label>Student state<select data-case-filter="studentState">${selectOptions(studentStates, "All states")}</select></label>
            <label>Disclosure policy<select data-case-filter="disclosurePolicy">${selectOptions(disclosurePolicies, "All policies")}</select></label>
          </div>
        </form>
      </div>
    </section>
    <section class="section" aria-labelledby="cases-grid-title">
      <div class="shell">
        <h2 class="visually-hidden" id="cases-grid-title">Public cases</h2>
        <div class="case-grid">${publicCases.map(renderCaseSummary).join("")}</div>
        <div class="filter-no-results" id="case-filter-empty" hidden>
          ${renderEmptyState("No cases match these filters.", "Reset the filters to return to the full public development set.")}
        </div>
      </div>
    </section>`,
  );
}

function renderProfile(profile: TutorEvalPublicCase["tutorInput"]["studentProfile"]): string {
  if (profile === undefined) {
    return `<p class="muted">No additional public profile metadata.</p>`;
  }
  const items: Array<[string, string]> = [];
  if (profile.level !== undefined) {
    items.push(["Level", humanize(profile.level)]);
  }
  if (profile.goal !== undefined) {
    items.push(["Goal", profile.goal]);
  }
  if (profile.knownConcepts !== undefined && profile.knownConcepts.length > 0) {
    items.push(["Known concepts", profile.knownConcepts.join(", ")]);
  }
  return renderKeyValueList(items);
}

function renderConversation(
  conversation: TutorEvalPublicCase["tutorInput"]["conversationHistory"],
): string {
  if (conversation === undefined || conversation.length === 0) {
    return `<p class="muted">No prior conversation. This case starts with the current student message.</p>`;
  }
  return `<ol class="conversation-list">${conversation
    .map(
      (message) => `<li><span class="conversation-role">${escapeHtml(humanize(message.role))}</span><p>${escapeHtml(message.text)}</p></li>`,
    )
    .join("")}</ol>`;
}

export function renderCaseDetailPage(
  artifacts: PublicBenchmarkArtifacts,
  caseArtifact: TutorEvalPublicCase,
): SitePage {
  const difficulty = formatDifficulty(caseArtifact.metadata.difficulty);
  const capabilityTags = caseArtifact.metadata.capabilityTags ?? [];
  return page(
    `${humanize(caseArtifact.metadata.topic)} — Tutor Benchmark`,
    `Public TutorEval case ${caseArtifact.id}: ${caseArtifact.tutorInput.learningObjective}`,
    `/data/cases/${encodeURIComponent(caseArtifact.id)}/`,
    `<section class="page-intro">
      <div class="shell narrow-shell">
        <a class="back-link" href="/data/cases/">← Back to case explorer</a>
        <div class="eyebrow-row">${renderStatusBadge("Public case", "preview")}<span class="eyebrow">${escapeHtml(caseArtifact.id)}</span></div>
        <h1>${escapeHtml(humanize(caseArtifact.metadata.topic))}</h1>
        <p class="lede">${escapeHtml(caseArtifact.tutorInput.learningObjective)}</p>
      </div>
    </section>
    <section class="section">
      <div class="shell detail-grid">
        <div class="detail-main">
          <section class="panel detail-section" aria-labelledby="student-context-title">
            <div class="panel-heading"><div><p class="eyebrow">Tutor-visible context</p><h2 id="student-context-title">Student context</h2></div>${renderStatusBadge(humanize(caseArtifact.metadata.studentState ?? "Unspecified"), "muted")}</div>
            <div class="student-message"><p class="quote-label">Current student message</p><p>“${escapeHtml(caseArtifact.tutorInput.studentMessage)}”</p></div>
            ${caseArtifact.tutorInput.problemContext === undefined ? "" : `<div class="context-copy"><p class="quote-label">Problem context</p><p>${escapeHtml(caseArtifact.tutorInput.problemContext)}</p></div>`}
            <div class="context-copy"><p class="quote-label">Learning objective</p><p>${escapeHtml(caseArtifact.tutorInput.learningObjective)}</p></div>
          </section>
          <section class="panel detail-section" aria-labelledby="conversation-title">
            <p class="eyebrow">Context window</p><h2 id="conversation-title">Conversation history</h2>
            ${renderConversation(caseArtifact.tutorInput.conversationHistory)}
          </section>
          <section class="panel detail-section" aria-labelledby="privacy-title">
            <p class="eyebrow">Public boundary</p><h2 id="privacy-title">What this page does not expose</h2>
            <p>This public development artifact intentionally excludes ground truth answers, known-misconception annotations, rubrics, and evaluator-only evidence. A future hidden challenge dataset must use the same fail-closed serialization boundary.</p>
          </section>
        </div>
        <aside class="detail-side">
          <section class="panel detail-section" aria-labelledby="case-meta-title">
            <p class="eyebrow">Case metadata</p><h2 id="case-meta-title">Identity &amp; scope</h2>
            ${renderKeyValueList([
              ["Case ID", caseArtifact.id],
              ["Case version", caseArtifact.version],
              ["Dataset", `${artifacts.cases.datasetId}@${artifacts.cases.datasetVersion}`],
              ["Subject", humanize(caseArtifact.metadata.subject)],
              ["Topic", humanize(caseArtifact.metadata.topic)],
              ["Difficulty", difficulty],
              ["Disclosure policy", humanize(caseArtifact.disclosurePolicy ?? "Not specified")],
            ])}
          </section>
          <section class="panel detail-section" aria-labelledby="profile-title">
            <p class="eyebrow">Student profile</p><h2 id="profile-title">Known public context</h2>
            ${renderProfile(caseArtifact.tutorInput.studentProfile)}
          </section>
          <section class="panel detail-section" aria-labelledby="capabilities-title">
            <p class="eyebrow">Taxonomy</p><h2 id="capabilities-title">Capability tags</h2>
            ${renderDimensionPills(capabilityTags)}
          </section>
        </aside>
      </div>
    </section>`,
  );
}

export function renderHeatmapPage(artifacts: PublicBenchmarkArtifacts): SitePage {
  const { benchmark, trials } = artifacts;
  return page(
    "Heatmap — Tutor Benchmark",
    "A case-by-model trial matrix for future Tutor Benchmark public results.",
    "/data/heatmap/",
    `<section class="page-intro"><div class="shell narrow-shell"><div class="eyebrow-row">${renderStatusBadge(benchmark.statusLabel, "preview")}<span class="eyebrow">Case × model runs</span></div><h1>Heatmap</h1><p class="lede">A reusable matrix contract for comparing case-level outcomes. The first public release does not manufacture cells for models that have not been run.</p></div></section>
    <section class="section"><div class="shell"><div class="panel">${renderEmptyState("No public model trials available yet.", trials.notice, "Rows will be cases; columns will be versioned model runs; each cell will link to a trial detail record.")}
      <div class="matrix-contract"><p class="eyebrow">Future matrix</p><div class="matrix"><div class="matrix-corner">Cases / Runs</div><div class="matrix-head">Model run A</div><div class="matrix-head">Model run B</div><div class="matrix-row-label">case-id</div><div class="matrix-cell">score / pass / failure</div><div class="matrix-cell">score / pass / failure</div></div></div>
    </div></div></section>`,
  );
}

export function renderTrialsPage(artifacts: PublicBenchmarkArtifacts): SitePage {
  const { benchmark, trials } = artifacts;
  return page(
    "Trials — Tutor Benchmark",
    "Audit-ready trial records for future Tutor Benchmark results.",
    "/data/trials/",
    `<section class="page-intro"><div class="shell narrow-shell"><div class="eyebrow-row">${renderStatusBadge(benchmark.statusLabel, "preview")}<span class="eyebrow">Audit trail</span></div><h1>Trials</h1><p class="lede">A leaderboard number should eventually trace to a model identity, case version, Tutor response, rubric evidence, and sanitized operational metrics.</p></div></section>
    <section class="section"><div class="shell"><div class="panel">${renderEmptyState("No public trials available yet.", trials.notice, "Trial detail pages are reserved for public result artifacts; this website never calls a Judge from the browser.")}
      <div class="traceability"><p class="eyebrow">Traceability contract</p><div class="trace-line"><span>Leaderboard</span><b>→</b><span>Model</span><b>→</b><span>Trial</span><b>→</b><span>Tutor response</span><b>→</b><span>Rubric evidence</span></div></div>
      <div class="field-list"><p class="eyebrow">Future trial fields</p>${renderDimensionPills(trials.fields)}</div>
    </div></div></section>`,
  );
}

export function renderTrialDetailPage(artifacts: PublicBenchmarkArtifacts): SitePage {
  return page(
    "Trial Detail — Tutor Benchmark",
    "Reserved trial detail route for future public Tutor Benchmark result artifacts.",
    "/data/trials/[trialId]/",
    `<section class="page-intro"><div class="shell narrow-shell"><a class="back-link" href="/data/trials/">← Back to trials</a><div class="eyebrow-row">${renderStatusBadge(artifacts.benchmark.statusLabel, "preview")}<span class="eyebrow">Trial detail contract</span></div><h1>Trial detail</h1><p class="lede">Trial pages are the future audit path from a leaderboard number to a case, Tutor response, rubric evidence, and sanitized metrics.</p></div></section><section class="section"><div class="shell">${renderEmptyState("No trial selected", "A future /data/trials/[trialId] route will be populated only from public, validated trial artifacts. The website will never execute a Judge to fill this page.")}</div></section>`,
  );
}
