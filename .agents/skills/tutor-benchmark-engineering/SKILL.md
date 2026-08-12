---
name: tutor-benchmark-engineering
description: Build and maintain the independent Tutor Benchmark framework, including contracts, synthetic scenarios, rubrics, deterministic evaluators, adapters, runners, reports, tests, and release-ready Git workflows.
---

# Tutor Benchmark Engineering

This skill governs changes to the public, provider-independent Tutor Benchmark. Keep the implementation small, typed, deterministic, and auditable. Treat benchmark integrity and privacy as release-blocking requirements.

## Scope and architecture

- Keep the product boundary explicit: this repository evaluates a `TutorUnderTest`; it is not a tutor product, chat UI, prompt playground, or Review Workspace module.
- Preserve the one-way flow `Scenario -> Adapter -> Tutor Output -> Evaluator -> Result -> Report`.
- Keep core contracts free of provider SDKs and product-internal imports. Integrate future tutors only through a stable adapter.
- Prefer pure functions, small orchestration functions, typed contracts, JSON fixtures, and zero or minimal dependencies.
- Keep provider-specific fields in adapters. Do not add vendor response IDs, model fields, token data, stop reasons, credentials, prompts, or hidden reasoning to core results.

## Workflow

1. Audit before editing: run `git status --short`, `git status -sb`, `git branch --show-current`, `git rev-parse HEAD`, and `git remote -v`. Inspect applicable `AGENTS.md` files, package scripts, call chains, contracts, persistence boundaries, and tests.
2. Stop on unknown dirty work, conflicting worktrees, secrets, real user data, or an ambiguous scope that cannot be resolved safely. Never stash, reset, clean, overwrite, or delete user work to make a task easier.
3. For an actually empty repository, allow exactly one direct `main` bootstrap commit. Record the exception in `AGENTS.md`; after bootstrap, use clean `main -> fetch -> fresh feature branch -> implementation -> PR -> CI -> merge`.
4. Design the smallest change that proves the requested behavior. Keep runtime validation separate from orchestration and keep reporting separate from evaluation.
5. Implement synthetic-only behavior unless the task explicitly authorizes a real external adapter. Do not fetch OpenAI, Gemini, Ollama, or Review Workspace in Foundation work.
6. Test semantics, not whole-result snapshots. Cover validation, adapter behavior, deterministic evaluator behavior, per-scenario isolation, stable errors, result schema, and reproducibility.
7. Run relevant quality gates, inspect `git diff --check` and the complete diff, check for secrets/private data/generated results, and verify that no scope boundary was crossed.
8. For approved delivery, commit with a Conventional Commit, push without force, open/update the appropriate PR, poll CI to a terminal state, and merge only an unchanged, green, reviewed HEAD. After merge, sync `main`, rerun the required smoke checks, and report exact evidence.

Use this audit -> design -> branch -> implementation -> tests -> benchmark-integrity review -> diff -> commit -> PR -> CI -> merge -> cleanup -> sync sequence for release-ready work. Stop immediately at the requested phase boundary; do not start a later roadmap phase as follow-up work.

## Contracts and results

- Use stable machine-readable IDs for tutors, scenarios, evaluators, and criteria.
- Keep `TutorUnderTest`, `TutorScenario`, `TutorTurnInput`, `TutorTurnOutput`, `TutorRubric`, `CriterionResult`, `ScenarioResult`, and `BenchmarkRunResult` small and versionable.
- Validate scenario and rubric JSON at runtime; do not replace parsing with TypeScript assertions.
- Preserve criterion-level scores and diagnostics in addition to weighted totals. Read pass thresholds from rubric/config, never from runner constants.
- Keep errors typed and privacy-safe (`scenario_invalid`, `adapter_failed`, `evaluation_failed`, or similarly stable categories). Do not persist raw provider payloads or raw credentials.
- Make runner ordering deterministic and isolate failures so one scenario cannot erase completed results for others.

## Benchmark integrity

- Never delete a failing scenario, lower a threshold, rewrite an expected answer to match a model, add a model-specific exception, skip a failing case, or weaken an assertion merely to improve a score or CI result.
- Change a scenario or rubric only when independent evidence shows the benchmark is wrong. Document why the revised criterion is more correct, not why a score increases.
- Keep deterministic evaluators honest: string or keyword checks are proxies, not complete measures of pedagogy. Do not label LLM-as-Judge, model voting, or human ratings deterministic.
- Keep bad-versus-guided tutor fixtures synthetic and generic. A benchmark failure is evidence to investigate.

## Privacy and scope gates

- Commit only synthetic, public, properly licensed, or reviewed anonymized assets. Never add real chats, production exports, API keys, cookies, tokens, private system prompts, commercial prompts, database dumps, or identifiable datasets.
- Ignore `.env`, `.env.*`, `node_modules`, `coverage`, `dist`, local result outputs, and `data/private/`. Do not create placeholder private data.
- Do not add LLM judges, real model calls, Review Workspace internal imports, databases, dashboards, large datasets, complex statistics, or unrelated product changes during the Foundation phase.

## Required gates

Run the scripts that exist in the repository, normally:

```text
npm run typecheck
npm run lint
npm test
npm run build
npm run benchmark
git diff --check
```

Use Node 22 in CI and keep `engines.node` at `>=22 <23`; do not weaken the requirement because a local shell has another Node version. Report any gate that could not be run instead of claiming it passed.
