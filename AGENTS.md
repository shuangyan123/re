# Tutor Benchmark Repository Rules

## Product boundary

Tutor Benchmark is an independent evaluation framework. It evaluates a `TutorUnderTest`; it is not a tutor implementation, chat product, prompt playground, model leaderboard, or Review Workspace submodule.

Review Workspace (`shuangyan123/demo`) may become an adapter in a later phase, but this repository must remain independent and must not import its internal services, repositories, UI, Electron code, or Dexie database.

## Architecture

Keep the dependency flow:

```text
Scenario -> TutorUnderTest adapter -> Tutor output -> evaluator -> result -> report
```

Core contracts are provider-independent. Provider-specific metadata belongs in an adapter and must not leak into core result contracts.

## Data and privacy

- Commit only synthetic, public, properly licensed, or reviewed anonymized evaluation assets.
- Never commit real user data, production chat logs, API keys, cookies, tokens, private system prompts, commercial prompts, production database exports, or identifiable datasets.
- Use ignored local data or a separate private repository/storage for future private evaluations.
- Do not persist raw provider payloads, credentials, or hidden chain-of-thought in benchmark results.
- `.env`, results, build output, and `data/private/` are ignored. Do not create real private data in this repository.

## Benchmark integrity

Benchmark failures are evidence to investigate, not reasons to weaken the benchmark. Do not delete failing scenarios, lower thresholds, change expected answers to match a model, add model-specific exceptions, skip failing cases, or weaken assertions merely to improve scores or CI.

Change a scenario or rubric only with independent evidence that the benchmark itself is wrong. Explain why the new criterion is more correct, not why a score becomes higher. Deterministic string/keyword evaluators are proxies and must not be presented as complete measures of teaching quality.

## Git branch invariant

The first bootstrap commit is the one-time exception for an actually empty repository: it may be committed directly to `main` because there is no base history for a feature branch and pull request.

After bootstrap, every new write task must follow:

```text
clean main -> fetch -> fresh feature branch -> implementation -> PR -> CI -> merge
```

- Do not implement directly on `main` after bootstrap.
- Continue an existing PR on its exact branch.
- If an unknown dirty tree or worktree conflict is found, stop and report it. Do not stash, reset, clean, delete, or overwrite user work.
- Never force-push.
- Merge only after required CI is green, review is unblocked, and the verified HEAD is unchanged.
- Do not configure GitHub branch protection in the Foundation phase; document the invariant here instead.

## Scope and phase boundary

The 0.1 Foundation phase is synthetic, deterministic, typed, testable, and reproducible. It does not include LLM-as-Judge, real model/API calls, Review Workspace integration, real user data, databases, dashboards, large datasets, or complex statistical evaluation.

Stop when the explicitly requested phase is complete. Do not start the next roadmap phase without a new scoped task.
