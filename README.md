<p align="center">
  <img src="assets/brand/tutorbench/web/tutorbench-mark.svg" alt="TutorBench T1 trajectory mark" width="128">
</p>

# TutorBench

AI Tutor 评测基准

Tutor Benchmark measures how well AI models teach, not just whether they know
the answer.

The approved T1 trajectory mark and its usage rules are documented in
[`assets/brand/tutorbench/README.md`](assets/brand/tutorbench/README.md).

- 48 synthetic TutorEval cases (24 English + 24 zh-CN)
- 5 subjects
- 5 tutoring capability categories
- deterministic evaluators plus an optional semantic Judge boundary

This repository evaluates a `TutorUnderTest`. It is not a tutor product, chat
application, prompt playground, model leaderboard, or Review Workspace
module.

## Install

Requirements: Node 22 (`>=22 <23`).

The published `tutor-benchmark@0.1.0` Developer Preview and the repository
clone are both supported installation paths. The clone path is:

```bash
git clone https://github.com/shuangyan123/re.git
cd re
npm ci
npm run quickstart
```

Quickstart is a provider-free, network-free deterministic demonstration. It
needs no API key or Judge, prints four fixed development/smoke cases, and
shows case-level checks without producing an official benchmark score. One
bundled example response is intentionally weak so the output includes a clear
pedagogical `FAIL`; that expected demo outcome still exits successfully. The
default path prints only a concise summary. Use `--output <path>` if you also
want an explicitly marked local `QuickstartSummary` JSON artifact.

The published package exposes the same first-run command:

```bash
npm install tutor-benchmark
tutorbench quickstart
```

See [`docs/quickstart.md`](docs/quickstart.md) for the exact subset identity,
eligibility boundary, and failure semantics.

## Run the full benchmark

The canonical full benchmark remains a separate path:

```bash
npm run benchmark
```

It runs the current `tutor-eval-v0.2a@0.2a.5` dataset with the existing
`0.3a.4` evaluator semantics. The canonical cases include Judge-required
semantic rubrics. Without an explicitly configured Judge, those criteria stay
unresolved and the normal run reports Judge-unavailable errors with no score;
it never silently turns missing evidence into a pass. Quickstart does not
replace or weaken this full-benchmark behavior.

The intended package install command is:

```bash
npm install tutor-benchmark
```

The first `tutor-benchmark@0.1.0` Developer Preview is published through the
documented P2B release path. The package publication, GitHub Release, and
artifact identity remain separate, read-back-verified release facts.

## Use your Tutor

The default developer path is a small provider-neutral contract:

```ts
import {
  runTutorBenchmark,
  type TutorUnderTest,
} from "tutor-benchmark";

const tutor: TutorUnderTest = {
  id: "my-tutor",
  async respond(input) {
    return {
      text: await myTutor(input.currentStudentMessage),
    };
  },
};

const result = await runTutorBenchmark({ tutor });
```

`TutorUnderTest` receives only Tutor-visible input. Hidden ground truth,
misconceptions, disclosure policies, and rubrics stay on the evaluator side.
The result preserves case-level evidence, errors, critical failures, and
category scores.

For a deterministic-only smoke run, provide a selected dataset or use the
legacy seven-case dataset while developing an adapter:

```ts
import { loadTutorEvalDataset, runTutorBenchmark } from "tutor-benchmark";

const dataset = await loadTutorEvalDataset("tutor-eval-v0.1");
const result = await runTutorBenchmark({ tutor, dataset });
```

The canonical 0.2A dataset is the default. It intentionally contains both
deterministic and Judge-required rubrics; a Judge is optional, but unresolved
Judge evidence is reported as an error rather than silently omitted.
The current snapshot is `tutor-eval-v0.2a@0.2a.5`: the original English
cohort remains in `scenarios/tutor-eval-v0.2a/cases.json`, and the authored
Simplified Chinese cohort is in `cases.zh-CN.json`. The previous English-only
`0.2a.1` snapshot, the previous bilingual `0.2a.2` snapshot, and the previous
corrected bilingual `0.2a.3` and `0.2a.4` snapshots can be loaded explicitly
for historical corpus and audit work; none is silently treated as the current
corrected bilingual dataset.

The two cohorts are authored to target the same pedagogical constructs across
language contexts. A locale breakdown observes tutoring performance in an
English-language context or Chinese-language context; it is not a pure language
ability test and is not a claim of scientific equivalence or completed human
validation. See
[`docs/tutor-eval-bilingual-cohorts.md`](docs/tutor-eval-bilingual-cohorts.md)
for the boundaries and locale-aware reporting behavior.

## Use any language

An external Tutor can implement the same boundary over HTTP without importing
this package. The repository includes a Python standard-library integration
example:

```bash
python examples/http-python-tutor/server.py
```

In another terminal, use the published package command:

```bash
tutorbench run \
  --http http://127.0.0.1:8000/respond \
  --limit 3
```

The three CLI paths are deliberately distinct:

```text
Repository clone:       node dist/src/cli/tutorbench.js ...
Installed package:      tutorbench ...
npx package runner:     npx tutor-benchmark ...
```

From a repository clone, use `node dist/src/cli/tutorbench.js` after
`npm run build`.

The HTTP v1 contract is deliberately small:

```text
POST /respond
request:  TutorTurnInput JSON
response: { "text": string, "metrics"?: { latencyMs?, tokenUsage?, cost? } }
```

Only Tutor-visible input is sent. The adapter validates and sanitizes the
response, uses a 30-second timeout by default, accepts only `http`/`https`
endpoints without embedded credentials, and performs no automatic retry.
`--dataset`, repeated `--case`, `--limit`, `--runs`, `--timeout-ms`, and
`--output` are available on `tutorbench run`. Judge-required rubrics remain
unresolved when no Judge is configured; the HTTP command never requires or
reads `OPENAI_API_KEY`.

## Human review translation

The private/local Audit path also supports an optional Chinese review
translation sidecar. This is a reading aid for English or other source text,
not a Chinese benchmark case and not part of Tutor generation, Judge input,
scoring, corpus identity, replay, or public artifacts.

```bash
node dist/src/cli/tutorbench.js review-translate \
  --evaluation artifacts/real-model/example.evaluation.json \
  --target-locale zh-CN \
  --http http://127.0.0.1:9000/translate \
  --output artifacts/review/example.zh-CN.review.json

node dist/src/cli/website-build.js \
  --evaluation artifacts/real-model/example.evaluation.json \
  --review-translation artifacts/review/example.zh-CN.review.json \
  --locale zh-CN \
  --output website/private-dist/example
```

The Audit page shows Chinese assistance first for student context, rubric
criteria, Tutor response, and Judge evidence, while keeping the original text
available under `View original` / `查看原文`. The sidecar is source-hash-bound,
incrementally reusable, provider-neutral, and local-only. See
[`docs/review-translation.md`](docs/review-translation.md) for the schema,
isolation boundary, provider contract, and stale-translation behavior.

## Community Review protocol (P3)

`community-review-protocol@0.1.0` defines a provider-independent contract for
future independent human review: qualification receipt envelopes, sealed blind
packets, exact atomic submissions, close/freeze semantics, descriptive
human-human agreement, and explicit-policy public evidence. The protocol is
implemented. Status: **Protocol defined; Community Review service not yet
open.** It is **READY FOR P4 COMMUNITY REVIEW SERVICE**; no P4 service is
deployed, no public reviewer intake is open, and no real qualification or
review campaign is running.

P3 does not turn the historical Human Reference qualification fixture or Pilot
artifacts into secure public evidence. Agreement is consistency evidence, not
correctness, calibration, or a leaderboard result. See
[`docs/community-review-protocol.md`](docs/community-review-protocol.md) for
the versioning, privacy, blindness, disclosure, and P4 boundary.

## What it measures

The core flow is:

```text
Scenario -> TutorUnderTest -> Tutor output -> evaluator/Judge -> result -> report
```

TutorEval keeps atomic rubrics across correctness, diagnosis, guidance,
adaptation, and actionability. Deterministic checks are useful observable
proxies, not a scientific measurement of full tutoring quality. Semantic
rubrics remain available through the provider-independent Judge contract.
The overall rubric score and the critical-failure quality gate are independent
dimensions: a high rubric score does not override a gated critical failure.
The default gate treats `major` and `critical` instances of every declared
critical-failure type as case failures; `minor` findings remain diagnostic.
Gated critical failures produce `status: "failed"`, not an evaluator error.
Disclosure failures are interpreted against each case's policy, so a complete
answer is not leakage when `full_solution_allowed` or `full_solution_required`
applies. Concept explanations under `no_answer` are not automatically leakage
when the case has no concrete final answer. See the [disclosure and
critical-failure semantics audit](docs/tutor-eval-disclosure-critical-semantics-audit.md)
and the [critical-failure quality-gate audit](docs/critical-failure-quality-gate-audit.md).

## Public API

The package root is the stable local-evaluation surface:

- `TutorUnderTest`, `TutorTurnInput`, and `TutorTurnOutput`
- `runTutorBenchmark` for the small default runner
- `runTutorEval` for explicit dataset and runner control
- `loadTutorEvalDataset` for the checked-in public datasets
- `createHttpTutor` for a provider-neutral HTTP Tutor adapter
- typed TutorEval dataset and result contracts

Corpus/replay, generation packets, calibration, site generation, and provider
implementations remain explicit advanced modules. They are not prerequisites
for the first local run and are not re-exported from the package root.

## Dataset and privacy boundary

The canonical dataset lives in `scenarios/tutor-eval-v0.2a/cases.json` and is
synthetic. Each case separates Tutor-visible `tutorInput` from
`evaluatorOnly` evidence. Runtime parsing and integrity checks protect that
boundary. Legacy `tutor-eval-v0.1` remains readable for compatibility.

Only synthetic, public, properly licensed, or reviewed anonymized assets may
be committed. Never add real chats, production exports, credentials, cookies,
private prompts, database dumps, or identifiable data.

## Advanced workflows

The repository retains three intentionally separate levels:

1. Local evaluation: call a `TutorUnderTest` directly and score the result.
2. Reproducible evaluation: record a `TutorResponseCorpus`, replay it, and
   compare evaluator versions offline.
3. Official/public evaluation: use a canonical `TutorExecutionPacket`,
   repeated runs, validated corpus evidence, and calibrated reporting.

Useful commands for the advanced layers include:

```bash
npm run tutor:export-cases
npm run tutor:export-execution
npm run tutor:corpus:validate -- -- --corpus path/to/corpus.json
npm run benchmark:corpus -- -- --corpus path/to/corpus.json
npm run calibration:export
npm run calibration:validate
npm run calibration:report
npm run calibration:aggregate
npm run calibration:critical:export
npm run calibration:critical:prepare
npm run calibration:critical:validate
npm run calibration:critical:report
npm run calibration:critical:aggregate
```

Critical-failure calibration is a separate provider-independent contract from
rubric calibration. Its committed inputs are synthetic-only; real reviewer
files stay in ignored private storage, and the workflow performs no live Judge
or Tutor calls. See
[`docs/tutor-eval-critical-failure-calibration.md`](docs/tutor-eval-critical-failure-calibration.md).

Corpus replay is offline. The OpenAI Responses Judge and DeepSeek Chat
Completions Judge are separate optional evaluator integrations; live calls
require an explicit provider flag and are not part of CI. `--judge-openai` and
`--judge-deepseek`, and `--judge-chat-completions` are mutually exclusive.
Judge output always passes through the existing runtime parser and
rubric-ownership validation. The generic Chat Completions path supports
provider-configured DeepSeek/MiniMax-compatible endpoints without requiring
OpenAI quota.
For fixed diagnostic work, `judge-candidate-comparison` compares explicitly
configured DeepSeek V4-Flash and MiniMax candidates across repeated runs,
reports stability and sanitized token/latency measurements, and never infers
an automatic winner. See
[`docs/judge-candidate-comparison.md`](docs/judge-candidate-comparison.md).
The repository keeps `openai@7.4.0` as a development dependency and exposes it
as an optional peer so stable package-root and HTTP usage do not install or
load OpenAI. Consumers explicitly using the OpenAI provider must install that
optional peer.

### Real-model evidence

The two collection commands have different evidence semantics. Product Tutor
collection sends `TutorTurnInput` to an external orchestration and leaves
`generationSpec` absent. Canonical model collection sends the exact
`TutorExecutionPacket` and `baseline-native-default` generation spec to a model
execution host; only that path uses `recorded_model` provenance.

The repository includes a local OpenAI Responses API host example at
`examples/canonical-model-host/openai-server.mjs` and a provider-neutral
Chat Completions bridge at
`examples/canonical-model-host/chat-completions-server.mjs`. Both are outside
Benchmark Core and CI: credentials remain in environment variables, the hosts
disable provider retries, and real artifacts remain under ignored
`artifacts/real-model/` paths.
The dry-run, smoke, full-run, validation, replay, and review sequence is in
[`docs/first-real-baseline.md`](docs/first-real-baseline.md).

```bash
tutorbench collect \
  --http http://127.0.0.1:8000/respond \
  --provider my-product \
  --model tutor-product \
  --prompt-version product-config-v3 \
  --provenance external

tutorbench collect-model \
  --http http://127.0.0.1:9000/generate \
  --provider <provider> \
  --model <actual-model-id> \
  --locale zh-CN

tutorbench evaluate --corpus artifacts/real-model/baseline.json
```

For a frozen corpus, evaluation can select a deterministic subset without
calling the Tutor again. Repeated `--case` values select explicit available
cases; `--limit` then truncates that selection in stable case-ID order. An
explicit Judge run requires a concrete provider model ID in the local
environment. `--report-locale zh-CN` changes report labels only; it does not
change case selection, `targetLocale`, scoring, or artifact identity.

```powershell
$env:DEEPSEEK_API_KEY = "<local secret>"
$env:DEEPSEEK_JUDGE_MODEL = "<exact provider model id>"
```

DeepSeek V4 Judge generation is repository-owned and explicit rather than
provider-defaulted. Unless overridden, each request records and sends:

```text
thinking: enabled
reasoning effort: high
max output tokens: 8192
JSON mode: json_object
stream: false
```

The optional controls are `DEEPSEEK_JUDGE_THINKING` (`enabled` or `disabled`),
`DEEPSEEK_JUDGE_REASONING_EFFORT` (`high` or `max` when thinking is enabled),
and `DEEPSEEK_JUDGE_MAX_TOKENS` (a positive integer). Thinking-enabled runs
reject `DEEPSEEK_JUDGE_TEMPERATURE` because DeepSeek does not apply that
control in that mode. Thinking-disabled runs may set the existing temperature
variable, and omit reasoning effort when it is not explicitly configured.
Provider `reasoning_content` is private execution data, not benchmark
evidence, and is never persisted, logged, or included in metrics.

The DeepSeek execution profile uses a repository-owned
`DEEPSEEK_JUDGE_TIMEOUT_MS` default of `60000` milliseconds and keeps
`DEEPSEEK_JUDGE_MAX_ATTEMPTS` at its existing default of `2` (with the
existing maximum of `3`). Both values can be overridden through the
environment. The effective `timeoutMs` and `maxAttempts` are recorded in
Judge provenance, separately from each call's observed
`judgeMetrics.latencyMs` and `attempts`; a timeout remains a `judge_timeout`
error and is never retried. Transient HTTP retry behavior is unchanged.

This profile follows repository evidence from a historical 23-case DeepSeek Judge run
that had 14 passes, 7 failures, and 2 `judge_timeout` errors at about 30
seconds. Replaying those same two frozen responses with a 60000ms timeout
produced 0 errors, 2 failures, and 34084ms observed Judge latency. That
diagnostic supports the default but does not guarantee that every future
request will finish within it. That historical profile evidence used evaluator
version `0.3a.2`; the disclosure/diagnosis audit later used `0.3a.3`, while
current runs use `0.3a.4` for the separate case pass-eligibility semantics.
The execution configuration itself is unchanged by this PR.

```powershell
node dist/src/cli/tutorbench.js evaluate `
  --corpus "artifacts/real-model/preliminary-openrouter-nemotron-baseline-001.json" `
  --case "hint-only-linear-equation-001" `
  --judge-deepseek `
  --output "artifacts/real-model/nemotron-deepseek-judge-smoke-001.json"

node dist/src/cli/tutorbench.js evaluate `
  --corpus "artifacts/real-model/preliminary-openrouter-nemotron-baseline-001.json" `
  --limit 3 `
  --judge-deepseek `
  --output "artifacts/real-model/nemotron-deepseek-judge-smoke-003.json"
```

The final full available-corpus run omits both `--case` and `--limit`. These
commands replay the ignored frozen response corpus and never regenerate Tutor
or Nemotron responses. Source corpus `coverage`, available response count, and
missing case count remain distinct from the recorded `evaluationSelection`
metadata. DeepSeek JSON mode requests an object but does not claim OpenAI-style
strict Structured Outputs; malformed, incomplete, or ownership-invalid Judge
results fail closed. When Chat Completions explicitly returns
`finish_reason: "length"`, the run reports `judge_output_truncated` instead of
folding provider-confirmed output truncation into `judge_result_invalid`.

The 8192-token default is a reliability margin for thinking-enabled Judge
execution, not a scoring or model-quality adjustment. In one 23-case run over
the preliminary frozen corpus, `programming-test-failure-001` was the only
error, with `outputTokens` exactly `4096` and `judge_result_invalid`. A
diagnostic rerun at 8192 had 0 errors, while a subsequent rerun restored to
4096 also had 0 errors. This supports stochastic long-tail truncation risk;
it does not show that the case deterministically requires more than 4096
tokens.

Both paths are sequential, have no automatic retry, preserve successful
responses on partial failure, and validate the same `TutorResponseCorpus`
before success. A new `collect-model` run refuses to overwrite an existing
corpus; use `--resume <path> --output <same-path>` to reuse only successful
case-runs after identity validation. Results are preliminary and uncalibrated; they are not public
leaderboard runs. See [the real-model baseline guide](docs/real-model-baselines.md).

## Public website / Developer Preview

The static website consumes secret-free benchmark artifacts. It does not run a
Tutor, store API keys, or change scoring. Public model rankings remain empty
until reproducible and calibrated public artifacts exist:

```bash
npm run website:build
npm run website:dev
```

The website is deployed from `main` through GitHub Pages after a clean build;
the repository does not hard-code an unverified public URL. The Pages workflow
supplies the project base path at build time, while local preview remains
available at the root path. The generated `website/dist/` directory is ignored.

## Package and website validation

Maintainers can validate the public delivery surfaces without a registry,
OpenAI key, or live model:

```bash
npm run test:package
npm run test:website
```

The package smoke installs the local tarball into a temporary empty consumer,
imports `runTutorBenchmark`, `createHttpTutor`, and `loadTutorEvalDataset`,
executes one package-root run, and invokes the installed `tutorbench --help`.
The optional OpenAI peer is not installed by this smoke.

## Relationship with other products

Review Workspace (`shuangyan123/demo`) is one optional future Tutor adapter.
This repository does not import its services, repositories, UI, Electron,
Dexie, credentials, or browser state. Other products, local models, and
external services can participate through the same `TutorUnderTest` boundary.

The provider-neutral external protocol and the architecture rationale are in
[the product-boundary note](docs/benchmark-product-boundary.md).

## Repository development

The normal local gates are:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run benchmark
npm run website:build
npm run test:package
npm run test:website
npm run release:verify
git diff --check
```

`release:verify` requires a clean checkout and writes only ignored
`artifacts/release/` outputs. It binds the package payload and website artifact
to the resolved source commit for later maintainer review; it does not publish.

See [the roadmap](docs/roadmap.md), [release notes](docs/release.md), and the
versioned TutorEval guides under `docs/` for delivery and methodology phase
boundaries.

## License and governance

TutorBench is a multi-licensed public Developer Preview:

- Software code — [Apache-2.0](LICENSE).
- Benchmark, dataset, and authored evaluation content — [CC BY 4.0](LICENSES/CC-BY-4.0.txt).
- TutorBench name and brand assets — [TutorBench Brand Policy](LICENSES/BRAND-POLICY.md).

The [licensing scope](docs/licensing.md) explains mixed files, generated
artifacts, and attribution. Contribution and safety entry points are the
[contribution guide](CONTRIBUTING.md), [Code of Conduct](CODE_OF_CONDUCT.md),
and [Security Policy](SECURITY.md). The short machine-readable scope map is
[`LICENSES.md`](LICENSES.md).
