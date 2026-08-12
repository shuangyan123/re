# Tutor Benchmark

Tutor Benchmark is an independent evaluation framework for Tutor behavior. It evaluates a `TutorUnderTest` through a stable adapter contract and produces reproducible, typed benchmark results.

This repository is not:

- a tutor implementation;
- a chat product or prompt playground;
- a Review Workspace submodule;
- a model leaderboard or a complete measure of teaching quality.

## 0.1 Foundation

The current release is a small foundation proving the path:

```text
Scenario -> TutorUnderTest adapter -> Tutor output -> deterministic evaluators -> benchmark result -> report
```

It contains runtime-validated JSON scenarios and rubrics, a scripted synthetic tutor adapter, pure deterministic evaluators, a failure-isolating runner, human-readable output, and a JSON report writer.

The contract tests compare a deliberately bad scripted tutor with a guided scripted tutor; the lower score comes from the same rubric and evaluator logic, without tutor-specific exceptions.

Deterministic checks such as answer-leakage and keyword coverage are useful proxies, not a scientific measurement of full tutoring quality. LLM judging, human calibration, repeated-run statistics, and richer pedagogical dimensions are future work.

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

`npm run benchmark` runs the synthetic guided tutor against the checked-in scenarios, prints a compact summary, and writes `artifacts/benchmark-result.json`. Generated results are ignored by Git. A pedagogical scenario failure is reported but does not make the CLI fail; configuration, adapter, or evaluation errors return a non-zero exit code.

## Repository privacy

This is a public repository. Only synthetic, public, properly licensed, or reviewed anonymized evaluation assets are allowed. Do not commit real user data, production chat logs, API keys, cookies, tokens, private system prompts, commercial prompts, production database exports, or identifiable datasets. Future private evaluations must use ignored local data or separate private storage.

CI does not require secrets and the Foundation implementation makes no network or real model calls.

## Benchmark integrity

Do not change scenarios or rubrics merely to make a Tutor score higher. In particular, do not delete failing cases, lower thresholds, rewrite expected answers to match a model, add model-specific exceptions, skip failures, or weaken assertions. A failure is evidence to investigate. A scenario or rubric change requires independent evidence that the benchmark itself is incorrect and must explain why the revised standard is more accurate.

## Relationship with Review Workspace

Review Workspace (`shuangyan123/demo`) is one possible future `TutorUnderTest` adapter. This repository intentionally does not import Review Workspace internals, Dexie, Electron, UI code, or repositories. A later integration must use the stable adapter and contract boundary.

## Roadmap

See [docs/roadmap.md](docs/roadmap.md). 0.1 is complete; later phases are not started.

## License

License: not specified yet.
