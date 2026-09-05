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
  const quickstartCommands = `git clone ${SITE_GITHUB_URL}.git
cd re
npm ci
npm run quickstart

# After the v0.1.0 package is published in P2B:
npm install tutor-benchmark
tutorbench quickstart`;
  const fullBenchmarkCommands = `npm run benchmark`;
  const corpusCommands = `npm run tutor:export-execution -- -- --case fraction-misconception-001
npm run tutor:export-cases
npm run tutor:corpus:validate -- -- --corpus path/to/corpus.json
npm run benchmark:corpus -- -- --corpus path/to/corpus.json`;
  const collectionCommands = `tutorbench collect \\
  --http http://127.0.0.1:8000/respond \\
  --provider <provider> \\
  --model <actual-model-id> \\
  --prompt-version product-config-v3 \\
  --provenance external \\
  --limit 3 \\
  --output artifacts/product/product.json

tutorbench collect-model \\
  --http http://127.0.0.1:9000/generate \\
  --provider <provider> \\
  --model <actual-model-id> \\
  --limit 3 \\
  --output artifacts/real-model/model.json

tutorbench evaluate \\
  --corpus artifacts/real-model/model.json`;
  return page(
    "Run the Benchmark — Tutor Benchmark",
    "Run Tutor Benchmark locally with an adapter or a frozen Tutor response corpus.",
    "/run/",
    `<section class="page-intro"><div class="shell narrow-shell"><div class="eyebrow-row">${renderStatusBadge(artifacts.benchmark.statusLabel, "preview")}<span class="eyebrow">Developer workflow</span></div><h1>Run TutorBench locally</h1><p class="lede">Start with a five-minute deterministic demonstration, then move to the full benchmark or the advanced evidence paths when you need them.</p></div></section>
    <section class="section"><div class="shell run-grid"><div><p class="eyebrow">Quickstart</p><h2>Run the provider-free demo</h2><p>Quickstart needs no API key, Judge, or network connection. It runs four fixed cases from <code>tutor-eval-v0.1@0.1</code>, an existing development/smoke subset, and reports deterministic checks without an official score.</p>${renderCodeBlock(quickstartCommands, "bash")}</div><aside class="panel run-aside"><p class="eyebrow">Quickstart boundary</p>${renderKeyValueList([["Dataset", "tutor-eval-v0.1@0.1 (development smoke)"],["Cases", "4 fixed cases"],["Judge", "Not required"],["Network", "Disabled"],["Official score", "No"],["Leaderboard", "Not eligible"]])}<a class="text-link" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/docs/quickstart.md" rel="noreferrer">Read the Quickstart guide ↗</a></aside></div></section>
    <section class="section section-muted"><div class="shell run-grid"><div><p class="eyebrow">Full benchmark</p><h2>Run the canonical evaluation path</h2><p><code>npm run benchmark</code> remains the full local benchmark for <code>${escapeHtml(`${artifacts.benchmark.dataset.id}@${artifacts.benchmark.dataset.version}`)}</code>. Its semantic boundary includes Judge-required rubrics. Without an explicitly configured Judge, those criteria remain unresolved and the normal run reports errors with no score; Quickstart does not replace or weaken that behavior.</p>${renderCodeBlock(fullBenchmarkCommands, "bash")}</div><aside class="panel run-aside"><p class="eyebrow">Canonical status</p>${renderKeyValueList([["Dataset", `${artifacts.benchmark.dataset.id}@${artifacts.benchmark.dataset.version}`],["Cases", String(artifacts.benchmark.dataset.caseCount)],["Judge", "Explicitly configured when needed"],["No-Judge result", "Unresolved errors; no score"]])}<a class="text-link" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/docs/release.md" rel="noreferrer">Read the release boundary ↗</a></aside></div></section>
    <section class="section section-muted"><div class="shell run-grid"><div><p class="eyebrow">Use any language</p><h2>Connect an external Tutor over HTTP</h2><p>Any runtime that accepts JSON and serves <code>POST /respond</code> can implement the Tutor boundary. The adapter sends Tutor-visible input only and keeps Judge evidence on the evaluator side.</p>${renderCodeBlock(`python examples/http-python-tutor/server.py\n\n# After npm publication in P2B and installing the package:\ntutorbench run \\\n  --http http://127.0.0.1:8000/respond \\\n  --limit 3\n\n# From a clone after npm run build:\nnode dist/src/cli/tutorbench.js run \\\n  --http http://127.0.0.1:8000/respond \\\n  --limit 3`, "bash")}</div><aside class="panel run-aside"><p class="eyebrow">HTTP v1</p><p><code>TutorTurnInput</code> JSON in; <code>{ text, metrics? }</code> JSON out. The default timeout is 30 seconds and the adapter does not retry external requests.</p><a class="text-link" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/examples/http-python-tutor/README.md" rel="noreferrer">Open the Python example ↗</a></aside></div></section>
    <section class="section"><div class="shell run-grid"><div><p class="eyebrow">Real-model evidence</p><h2>Separate Product Tutor and canonical model evidence</h2><p>The Product path freezes TutorTurnInput responses without a generation spec. The canonical model path freezes exact execution-packet responses with a generation spec. Both keep failed case/runs in a sanitized report and replay offline; neither discovers credentials, retries calls, or writes website public data.</p>${renderCodeBlock(collectionCommands, "bash")}</div><aside class="panel run-aside"><p class="eyebrow">Preliminary only</p><p>Real-model artifacts are local and ignored by default. They remain preliminary, uncalibrated, and ineligible for the public leaderboard until host review, human/Judge calibration, and a publication review exist.</p><a class="text-link" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/docs/real-model-baselines.md" rel="noreferrer">Read the collection guide ↗</a></aside></div></section>
    <section class="section section-muted"><div class="shell"><p class="eyebrow">Canonical execution mode</p><h2>Freeze the benchmark conditions first</h2><p class="section-copy">Export a <code>TutorExecutionPacket</code> with the versioned <code>TutorGenerationSpec</code>, exact prompt identity, canonical messages, and output cap. The default <code>baseline-native-default</code> profile leaves optional temperature, reasoning, and seed controls unconstrained so provider-native behavior is not misrepresented as identical across vendors.</p>${renderCodeBlock(corpusCommands, "bash")}<div class="callout"><strong>Controlled optional generation parameters: none</strong><p><code>tutor:export-cases</code> is the semantic Tutor-visible adapter packet. <code>tutor:export-execution</code> is the canonical benchmark packet used to make model runs comparable. Neither packet includes evaluator-only annotations. The same benchmark does not imply that every provider exposes identical inference knobs.</p></div></div></section>
    <section class="section"><div class="shell adapter-grid"><div><p class="eyebrow">Minimal adapter shape</p><h2>Keep the provider at the edge</h2><p class="section-copy">The adapter receives a typed, Tutor-visible input and returns a text response. Provider metadata stays outside the core benchmark result contract.</p></div>${renderCodeBlock(`import type { TutorUnderTest } from "./src/contracts/tutor.js";

const tutor: TutorUnderTest = {
  id: "my-tutor",
  async respond(input) {
    return {
      text: await myTutor(input.currentStudentMessage),
    };
  },
};`, "ts")}</div></section>
    <section class="section section-dark"><div class="shell"><p class="eyebrow">Optional Judge path</p><h2>Explicit, offline by default</h2><p class="section-copy">The repository has separate opt-in OpenAI Responses and DeepSeek Chat Completions Judge providers. Dry-run/request tests stay offline; live execution requires explicit local configuration. The website build never calls a Judge provider and the browser never receives credentials.</p>${renderCodeBlock(`npm run judge:openai -- -- --dry-run

# Frozen-corpus DeepSeek Judge subset:
node dist/src/cli/tutorbench.js evaluate \\
  --corpus artifacts/real-model/baseline.json \\
  --limit 1 \\
  --judge-deepseek`, "bash")}</div></section>`,
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
    <section class="section section-muted"><div class="shell"><p class="eyebrow">Reproducible generation</p><h2>Case, spec, packet, corpus</h2><p class="section-copy">The benchmark case supplies visible semantic input. A versioned generation spec pins prompt identity, SHA-256 digest, and output limits. The public baseline uses provider-native sampling and reasoning behavior rather than claiming shared temperature, reasoning budget, or seed controls. Canonical messages are exported into a host-facing execution packet, and the resulting corpus records benchmark-controlled identity separately from host/model execution identity. The same benchmark does not imply identical inference knobs across vendors.</p></div></section>
    <section class="section section-muted"><div class="shell limits-grid"><div><p class="eyebrow">What we do not measure</p><h2>Do not overread a benchmark score.</h2></div><div><ul class="plain-list"><li>Actual long-term learning</li><li>Retention</li><li>Transfer</li><li>Student satisfaction</li><li>Real classroom outcomes</li></ul><p class="section-copy">Those questions require a separate LearningEval or human outcome evaluation program.</p></div></div></section>
    <section class="section"><div class="shell"><p class="eyebrow">Evaluation architecture</p><h2>From response to result</h2><div class="evaluation-flow" aria-label="Evaluation architecture diagram"><div class="flow-node">Tutor response</div><div class="flow-branch"><div class="flow-node">Deterministic evaluators</div><div class="flow-node">Semantic Judge</div></div><div class="flow-arrow" aria-hidden="true">↓</div><div class="flow-node">Atomic rubrics</div><div class="flow-arrow" aria-hidden="true">↓</div><div class="flow-node">Category aggregation</div><div class="flow-arrow" aria-hidden="true">↓</div><div class="flow-node flow-result">Benchmark result</div></div><p class="caption">The Judge is one evaluator boundary, not ground truth. Deterministic checks are useful proxies and are not a complete measurement of teaching quality.</p></div></section>
    <section class="section section-dark"><div class="shell"><p class="eyebrow">Calibration status</p><h2>Infrastructure exists; validation is still open.</h2><div class="status-grid"><div><span class="status-dot status-dot-positive"></span><strong>Calibration infrastructure</strong><p>Available as provider-independent contracts and synthetic pipeline fixtures.</p></div><div><span class="status-dot status-dot-pending"></span><strong>Independent real human calibration</strong><p>Not completed.</p></div><div><span class="status-dot status-dot-pending"></span><strong>Judge-vs-human validation</strong><p>Not completed.</p></div><div><span class="status-dot status-dot-pending"></span><strong>Statistical validation</strong><p>Not completed.</p></div></div></div></section>`,
  );
}

export function renderDocsPage(artifacts: PublicBenchmarkArtifacts): SitePage {
  return page(
    "Docs — Tutor Benchmark",
    "Repository guides for TutorEval, adapters, corpora, Judge boundaries, licensing, and the public Developer Preview.",
    "/docs/",
    `<section class="page-intro"><div class="shell narrow-shell"><div class="eyebrow-row">${renderStatusBadge(artifacts.benchmark.statusLabel, "preview")}<span class="eyebrow">Repository guides</span></div><h1>Docs</h1><p class="lede">The website is a map into the repository’s existing contracts and guides. It does not replace the source documentation.</p></div></section>
    <section class="section"><div class="shell doc-grid">
      <a class="route-card" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/README.md" rel="noreferrer"><span class="eyebrow">Start here</span><h2>README</h2><p>Architecture, quick start, privacy, benchmark integrity, and current roadmap position.</p><span class="text-link">Read README ↗</span></a>
      <a class="route-card" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/docs/tutor-eval-v0.2a.md" rel="noreferrer"><span class="eyebrow">Dataset</span><h2>TutorEval 0.2A</h2><p>Taxonomy, case design, disclosure policies, counterfactual pairs, and integrity checks.</p><span class="text-link">Read dataset guide ↗</span></a>
      <a class="route-card" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/docs/tutor-eval-v0.4a.md" rel="noreferrer"><span class="eyebrow">Adapters</span><h2>Response corpus</h2><p>Stable Tutor response corpus boundaries and offline replay behavior.</p><span class="text-link">Read corpus guide ↗</span></a>
      <a class="route-card" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/docs/real-model-baselines.md" rel="noreferrer"><span class="eyebrow">Evidence</span><h2>Real-model baselines</h2><p>Collect, validate, replay, and evaluate local preliminary Tutor evidence without publishing it automatically.</p><span class="text-link">Read collection guide ↗</span></a>
      <a class="route-card" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/docs/roadmap.md" rel="noreferrer"><span class="eyebrow">Status</span><h2>Roadmap</h2><p>Methodology phases and the separate public website/productization track.</p><span class="text-link">Read roadmap ↗</span></a>
    </div></section>
    <section class="section section-muted"><div class="shell two-column"><div><p class="eyebrow">License & governance</p><h2>Defined for the Developer Preview.</h2></div><div><p class="section-copy"><strong>Software</strong> — Apache-2.0<br><strong>Benchmark content</strong> — CC BY 4.0<br><strong>Brand</strong> — TutorBench Brand Policy</p><p><a class="text-link" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/docs/licensing.md" rel="noreferrer">Read the licensing scope ↗</a><br><a class="text-link" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/LICENSE" rel="noreferrer">Read the software license ↗</a><br><a class="text-link" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/LICENSES/CC-BY-4.0.txt" rel="noreferrer">Read the content license pointer ↗</a><br><a class="text-link" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/LICENSES/BRAND-POLICY.md" rel="noreferrer">Read the TutorBench Brand Policy ↗</a></p><p><a class="text-link" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/CONTRIBUTING.md" rel="noreferrer">Contribute ↗</a> · <a class="text-link" href="${escapeHtml(SITE_GITHUB_URL)}/blob/main/SECURITY.md" rel="noreferrer">Security Policy ↗</a></p></div></div></section>`,
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
    <section class="section"><div class="shell about-grid"><div class="panel"><p class="eyebrow">Current release posture</p>${renderKeyValueList([["Website", "Developer Preview"],["Package", "v0.1.0 release candidate; not published"],["Dataset", `${artifacts.benchmark.dataset.id}@${artifacts.benchmark.dataset.version}`],["Leaderboard", "No calibrated public runs"],["License", "Apache-2.0 / CC BY 4.0 / Brand Policy"]])}</div><div class="panel"><p class="eyebrow">Public boundary</p><p>The site is read-only and secret-free. It packages public development metadata, not credentials, raw provider payloads, private calibration files, production conversations, or hidden reasoning.</p></div></div></section>`,
  );
}
