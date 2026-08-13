# Tutor Benchmark

Tutor Benchmark measures how well AI models teach, not just whether they know
the answer.

- 24 synthetic TutorEval cases
- 5 subjects
- 5 tutoring capability categories
- deterministic evaluators plus an optional semantic Judge boundary

This repository evaluates a `TutorUnderTest`. It is not a tutor product, chat
application, prompt playground, model leaderboard, or Review Workspace
module.

## Install

Requirements: Node 22 (`>=22 <23`).

The package is not published to npm yet. The current verified installation
path is a repository clone:

```bash
git clone https://github.com/shuangyan123/re.git
cd re
npm ci
npm run benchmark
```

The built-in command runs a synthetic Tutor against the checked-in dataset,
prints a summary, and writes an ignored JSON result under `artifacts/`.
Judge-required rubrics remain explicitly unresolved when no Judge is supplied;
the runner never turns missing evidence into a passing score.

When distributed as a package, the intended install command is:

```bash
npm install tutor-benchmark
```

Package artifacts are release-ready, but npm registry availability and package
publication are intentionally separate maintainer decisions.

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

## Use any language

An external Tutor can implement the same boundary over HTTP without importing
this package. The repository includes a Python standard-library integration
example:

```bash
python examples/http-python-tutor/server.py
```

In another terminal, use the installed package command when the package has been
intentionally published:

```bash
tutorbench run \
  --http http://127.0.0.1:8000/respond \
  --limit 3
```

The three CLI paths are deliberately distinct:

```text
Repository clone:       node dist/src/cli/tutorbench.js ...
Installed package:      tutorbench ...
After npm publication:  npx tutor-benchmark ...
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

## What it measures

The core flow is:

```text
Scenario -> TutorUnderTest -> Tutor output -> evaluator/Judge -> result -> report
```

TutorEval keeps atomic rubrics across correctness, diagnosis, guidance,
adaptation, and actionability. Deterministic checks are useful observable
proxies, not a scientific measurement of full tutoring quality. Semantic
rubrics remain available through the provider-independent Judge contract.

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
```

Corpus replay is offline. The OpenAI Judge adapter is an optional evaluator
integration; live calls require explicit opt-in and are not part of CI.
The repository keeps `openai@7.4.0` as a development dependency and exposes it
as an optional peer so stable package-root and HTTP usage do not install or
load OpenAI. Consumers explicitly using the OpenAI provider must install that
optional peer.

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
git diff --check
```

See [the roadmap](docs/roadmap.md), [release notes](docs/release.md), and the
versioned TutorEval guides under `docs/` for delivery and methodology phase
boundaries.

## License

License: not specified yet. This is a public Developer Preview.
