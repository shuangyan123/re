import type { PublicBenchmarkArtifacts } from "../../datasets/public.js";
import {
  escapeHtml,
  humanize,
  renderCodeBlock,
  renderDimensionPills,
  renderKeyValueList,
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

export function renderRunPage(artifacts: PublicBenchmarkArtifacts): SitePage {
  const commands = `git clone ${SITE_GITHUB_URL}.git
git checkout main
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run benchmark`;
  const corpusCommands = `npm run tutor:export-execution -- -- --case fraction-misconception-001
npm run tutor:export-cases
npm run tutor:corpus:validate -- -- --corpus path/to/corpus.json
npm run benchmark:corpus -- -- --corpus path/to/corpus.json`;
  return page(
    "Run the Benchmark — Tutor Benchmark",
    "Run Tutor Benchmark locally with an adapter or a frozen Tutor response corpus.",
    "/run/",
    `<section class="page-intro"><div class="shell narrow-shell"><div class="eyebrow-row">${renderStatusBadge(artifacts.benchmark.statusLabel, "preview")}<span class="eyebrow">Developer workflow</span></div><h1>Run the benchmark</h1><p class="lede">Tutor Benchmark is designed to be run by developers, not just viewed as a leaderboard. Start locally, use the stable adapter contract, and keep evaluation replayable.</p></div></section>
    <section class="section"><div class="shell run-grid"><div><p class="eyebrow">Quick start</p><h2>Run the checked-in synthetic benchmark</h2><p>The default benchmark uses a deterministic synthetic Tutor and the canonical TutorEval 0.2A cases. It does not call a model API.</p>${renderCodeBlock(commands, "bash")}</div><aside class="panel run-aside"><p class="eyebrow">Current status</p>${renderKeyValueList([["Dataset", `${artifacts.benchmark.dataset.id}@${artifacts.benchmark.dataset.version}`],["Cases", String(artifacts.benchmark.dataset.caseCount)],["Judge calls in default run", "None"],["Website", "Read-only artifact explorer"]])}<a class="text-link" href="${escapeHtml(SITE_GITHUB_URL)}" rel="noreferrer">Open source repository ↗</a></aside></div></section>
    <section class="section section-muted"><div class="shell"><p class="eyebrow">Canonical execution mode</p><h2>Freeze the benchmark conditions first</h2><p class="section-copy">Export a <code>TutorExecutionPacket</code> containing the versioned <code>TutorGenerationSpec</code> and canonical messages. A future host executes those exact messages and returns a generation-bound <code>TutorResponseCorpus</code>; it does not rebuild the case or choose a private prompt.</p>${renderCodeBlock(corpusCommands, "bash")}<div class="callout"><strong>Two packet boundaries</strong><p><code>tutor:export-cases</code> is the semantic Tutor-visible adapter packet. <code>tutor:export-execution</code> is the canonical benchmark packet used to make model runs comparable. Neither packet includes evaluator-only annotations.</p></div></div></section>
    <section class="section"><div class="shell adapter-grid"><div><p class="eyebrow">Minimal adapter shape</p><h2>Keep the provider at the edge</h2><p class="section-copy">The adapter receives a typed, Tutor-visible input and returns a text response. Provider metadata stays outside the core benchmark result contract.</p></div>${renderCodeBlock(`import type { TutorUnderTest } from "./src/contracts/tutor.js";

const tutor: TutorUnderTest = {
  id: "my-tutor",
  async respond(input) {
    return {
      text: await myTutor(input.currentStudentMessage),
    };
  },
};`, "ts")}</div></section>
    <section class="section section-dark"><div class="shell"><p class="eyebrow">Optional Judge path</p><h2>Explicit, offline by default</h2><p class="section-copy">The repository has an opt-in OpenAI Judge provider. A dry run validates selection and request construction; live execution requires explicit runtime configuration. It is not part of this website build and the browser never calls it.</p>${renderCodeBlock(`npm run judge:openai -- -- --dry-run
# Live execution is an explicit, local-only opt-in:
npm run judge:openai -- -- --live`, "bash")}</div></section>`,
  );
}

export function renderMethodologyPage(artifacts: PublicBenchmarkArtifacts): SitePage {
  const scoreDimensions = artifacts.benchmark.dimensions.score;
  return page(
    "Methodology — Tutor Benchmark",
    "What Tutor Benchmark measures, what it does not measure, and the current calibration status.",
    "/methodology/",
    `<section class="page-intro"><div class="shell narrow-shell"><div class="eyebrow-row">${renderStatusBadge(artifacts.benchmark.statusLabel, "preview")}<span class="eyebrow">Transparent scope</span></div><h1>Methodology</h1><p class="lede">Tutor Benchmark evaluates observable tutoring behavior in structured cases. It is a benchmark foundation, not a claim about a learner’s long-term outcome.</p></div></section>
    <section class="section"><div class="shell"><div class="two-column"><div><p class="eyebrow">What we measure</p><h2>Five capabilities</h2><p class="section-copy">Each case can assign atomic rubrics to one primary capability, preserving category-level evidence alongside any future overall score.</p></div><div>${renderDimensionPills(scoreDimensions)}</div></div><div class="method-card-grid">${scoreDimensions.map((dimension) => `<article class="method-card"><h3>${escapeHtml(humanize(dimension))}</h3><p>${escapeHtml(
      {
        correctness: "Whether the Tutor stays factually and conceptually correct.",
        diagnosis: "Whether it identifies the learner’s actual error, gap, or reasoning issue.",
        guidance: "Whether its explanation or hint helps the learner make progress.",
        adaptation: "Whether it changes its help for the learner’s state and context.",
        actionability: "Whether it leaves the learner with a clear, executable next step.",
      }[dimension],
    )}</p></article>`).join("")}</div></div></section>
    <section class="section section-muted"><div class="shell"><p class="eyebrow">Reproducible generation</p><h2>Case, spec, packet, corpus</h2><p class="section-copy">The benchmark case supplies visible semantic input. A versioned generation spec pins prompt identity, SHA-256 digest, and output limits. Canonical messages are exported into a host-facing execution packet, and the resulting corpus records that same generation identity separately from provider/model identity.</p></div></section>
    <section class="section section-muted"><div class="shell limits-grid"><div><p class="eyebrow">What we do not measure</p><h2>Do not overread a benchmark score.</h2></div><div><ul class="plain-list"><li>Actual long-term learning</li><li>Retention</li><li>Transfer</li><li>Student satisfaction</li><li>Real classroom outcomes</li></ul><p class="section-copy">Those questions require a separate LearningEval or human outcome evaluation program.</p></div></div></section>
    <section class="section"><div class="shell"><p class="eyebrow">Evaluation architecture</p><h2>From response to result</h2><div class="evaluation-flow" aria-label="Evaluation architecture diagram"><div class="flow-node">Tutor response</div><div class="flow-branch"><div class="flow-node">Deterministic evaluators</div><div class="flow-node">Semantic Judge</div></div><div class="flow-arrow" aria-hidden="true">↓</div><div class="flow-node">Atomic rubrics</div><div class="flow-arrow" aria-hidden="true">↓</div><div class="flow-node">Category aggregation</div><div class="flow-arrow" aria-hidden="true">↓</div><div class="flow-node flow-result">Benchmark result</div></div><p class="caption">The Judge is one evaluator boundary, not ground truth. Deterministic checks are useful proxies and are not a complete measurement of teaching quality.</p></div></section>
    <section class="section section-dark"><div class="shell"><p class="eyebrow">Calibration status</p><h2>Infrastructure exists; validation is still open.</h2><div class="status-grid"><div><span class="status-dot status-dot-positive"></span><strong>Calibration infrastructure</strong><p>Available as provider-independent contracts and synthetic pipeline fixtures.</p></div><div><span class="status-dot status-dot-pending"></span><strong>Independent real human calibration</strong><p>Not completed.</p></div><div><span class="status-dot status-dot-pending"></span><strong>Judge-vs-human validation</strong><p>Not completed.</p></div><div><span class="status-dot status-dot-pending"></span><strong>Statistical validation</strong><p>Not completed.</p></div></div></div></section>`,
  );
}

export function renderDocsPage(artifacts: PublicBenchmarkArtifacts): SitePage {
  return page(
    "Docs — Tutor Benchmark",
    "Repository guides for TutorEval, adapters, corpora, Judge boundaries, and the public Developer Preview.",
    "/docs/",
    `<section class="page-intro"><div class="shell narrow-shell"><div class="eyebrow-row">${renderStatusBadge(artifacts.benchmark.statusLabel, "preview")}<span class="eyebrow">Repository guides</span></div><h1>Docs</h1><p class="lede">The website is a map into the repository’s existing contracts and guides. It does not replace the source documentation.</p></div></section>
    <section class="section"><div class="shell doc-grid">
      <a class="route-card" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/README.md" rel="noreferrer"><span class="eyebrow">Start here</span><h2>README</h2><p>Architecture, quick start, privacy, benchmark integrity, and current roadmap position.</p><span class="text-link">Read README ↗</span></a>
      <a class="route-card" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/docs/tutor-eval-v0.2a.md" rel="noreferrer"><span class="eyebrow">Dataset</span><h2>TutorEval 0.2A</h2><p>Taxonomy, case design, disclosure policies, counterfactual pairs, and integrity checks.</p><span class="text-link">Read dataset guide ↗</span></a>
      <a class="route-card" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/docs/tutor-eval-v0.4a.md" rel="noreferrer"><span class="eyebrow">Adapters</span><h2>Response corpus</h2><p>Stable Tutor response corpus boundaries and offline replay behavior.</p><span class="text-link">Read corpus guide ↗</span></a>
      <a class="route-card" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/docs/roadmap.md" rel="noreferrer"><span class="eyebrow">Status</span><h2>Roadmap</h2><p>Methodology phases and the separate public website/productization track.</p><span class="text-link">Read roadmap ↗</span></a>
    </div></section>
    <section class="section section-muted"><div class="shell two-column"><div><p class="eyebrow">Licensing</p><h2>Not finalized yet.</h2></div><p class="section-copy">The repository currently says “License: not specified yet.” The Developer Preview does not claim MIT, Apache-2.0, or another license without explicit authorization.</p></div></section>`,
  );
}

export function renderAboutPage(artifacts: PublicBenchmarkArtifacts): SitePage {
  return page(
    "About — Tutor Benchmark",
    "The philosophy and public status of Tutor Benchmark.",
    "/about/",
    `<section class="page-intro"><div class="shell narrow-shell"><div class="eyebrow-row">${renderStatusBadge(artifacts.benchmark.statusLabel, "preview")}<span class="eyebrow">Philosophy</span></div><h1>A model can know the answer without being a good tutor.</h1><p class="lede">Tutor Benchmark asks what a model does with a learner’s actual state—not only whether it can produce a correct answer.</p></div></section>
    <section class="section"><div class="shell quote-section"><blockquote>“A model can know the answer without being a good tutor.”</blockquote><p>That is why this project focuses on observable tutoring behavior: diagnosis, guidance, adaptation, and the learner’s next action, alongside correctness.</p></div></section>
    <section class="section section-muted"><div class="shell two-column"><div><p class="eyebrow">Independent by design</p><h2>Benchmark, not tutor product.</h2></div><div><p class="section-copy">Tutor Benchmark evaluates a <code>TutorUnderTest</code>. It is not a chat application, a prompt playground, an admin dashboard, or a Review Workspace module. Provider-specific behavior enters through an adapter boundary.</p><a class="text-link" href="${escapeHtml(SITE_GITHUB_URL)}" rel="noreferrer">Inspect the source ↗</a></div></div></section>
    <section class="section"><div class="shell about-grid"><div class="panel"><p class="eyebrow">Current release posture</p>${renderKeyValueList([["Website", "Developer Preview"],["Dataset", `${artifacts.benchmark.dataset.id}@${artifacts.benchmark.dataset.version}`],["Leaderboard", "No calibrated public runs"],["License", "Not finalized yet"]])}</div><div class="panel"><p class="eyebrow">Public boundary</p><p>The site is read-only and secret-free. It packages public development metadata, not credentials, raw provider payloads, private calibration files, production conversations, or hidden reasoning.</p></div></div></section>`,
  );
}
