# Tutor Benchmark

Tutor Benchmark is an independent evaluation framework for Tutor behavior. It evaluates a `TutorUnderTest` through a stable adapter contract and produces reproducible, typed benchmark results.

This repository is not:

- a tutor implementation;
- a chat product or prompt playground;
- a Review Workspace submodule;
- a model leaderboard or a complete measure of teaching quality.

## 0.1 Foundation and TutorEval

The current release is a small foundation proving the path:

```text
Scenario -> TutorUnderTest adapter -> Tutor output -> deterministic evaluators -> benchmark result -> report
```

It contains runtime-validated JSON scenarios and rubrics, a scripted synthetic tutor adapter, pure deterministic evaluators, a failure-isolating runner, human-readable output, and a JSON report writer.

TutorEval v0.1 adds case-scoped visible Tutor input, evaluator-only hidden annotations, disclosure policies, atomic correctness/diagnosis/guidance/adaptation/actionability rubrics, centralized aggregation, critical-failure gates, dataset/case versioning, repeated runs, complete run metadata, and a typed Judge boundary. See [the TutorEval guide](docs/tutor-eval-v0.1.md).

TutorEval 0.2A extends that contract with a versioned pedagogical taxonomy,
structured difficulty, a curated 24-case synthetic dataset, rubric behavior and
capability metadata, counterfactual pairs, disclosure-policy coverage, runtime
integrity checks, and a deterministic coverage report. See [the 0.2A design
guide](docs/tutor-eval-v0.2a.md).

The contract tests compare a deliberately bad scripted tutor with a guided scripted tutor; the lower score comes from the same rubric and evaluator logic, without tutor-specific exceptions.

## AI Tutor Judge v0.1

The repository also retains the earlier provider-independent Judge v0.1 contract described in [the legacy system prompt](prompts/ai-tutor-judge-system-v0.1.md) for compatibility. TutorEval's canonical Judge result is the case-scoped `TutorEvalJudgeResult` contract.

The TutorEval Judge boundary is injection-only. This release does not call an LLM, include a provider SDK, perform calibration, or claim that a judge result proves learning impact.

Deterministic checks such as answer-leakage and keyword coverage are useful proxies, not a scientific measurement of full tutoring quality. LLM judging, human calibration, variance/statistical analysis across repeated runs, and richer pedagogical dimensions are future work.

## Quick start

Requirements: Node 22 (`>=22 <23`).

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run benchmark
```

`npm run benchmark` runs the synthetic guided tutor against the checked-in
TutorEval 0.2A cases, prints category scores and leakage/failure rates, and
writes `artifacts/tutor-eval-v0.2a-result.json`. Criteria reserved for the
future Judge are reported as unavailable because 0.2A makes no real Judge
calls. `npm run coverage` prints the dataset coverage JSON. Generated results
are ignored by Git. A pedagogical scenario failure is reported but does not
make the CLI fail; an uncaught setup or runner exception returns a non-zero
exit code.

## Repository privacy

This is a public repository. Only synthetic, public, properly licensed, or reviewed anonymized evaluation assets are allowed. Do not commit real user data, production chat logs, API keys, cookies, tokens, private system prompts, commercial prompts, production database exports, or identifiable datasets. Future private evaluations must use ignored local data or separate private storage.

CI does not require secrets and the Foundation implementation makes no network or real model calls.

## Benchmark integrity

Do not change scenarios or rubrics merely to make a Tutor score higher. In particular, do not delete failing cases, lower thresholds, rewrite expected answers to match a model, add model-specific exceptions, skip failures, or weaken assertions. A failure is evidence to investigate. A scenario or rubric change requires independent evidence that the benchmark itself is incorrect and must explain why the revised standard is more accurate.

## Relationship with Review Workspace

Review Workspace (`shuangyan123/demo`) is one possible future `TutorUnderTest` adapter. This repository intentionally does not import Review Workspace internals, Dexie, Electron, UI code, or repositories. A later integration must use the stable adapter and contract boundary.

## Roadmap

See [docs/roadmap.md](docs/roadmap.md). The 0.1 execution foundation and 0.2A
dataset-design foundation are separate from independent rubric calibration,
real provider/Judge integration, and learning-impact phases.

## License

License: not specified yet.
