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

## Engineering workflow

`re` uses `.agents/skills/tutor-benchmark-engineering/SKILL.md` as the required repo-local engineering Skill for implementation, refactor, maintenance, rules, documentation, tests, and release tasks. Before any repository write, read that Skill and select its workflow mode. Read-only questions do not create a branch.

The repo-local Skill owns architecture audit, implementation, validation, GitHub delivery, CI/review, merge, cleanup, and final reporting. Keep procedural workflow there; do not duplicate it in this file.

### Hard invariants and routing

- After bootstrap, new write tasks start from clean `main` synchronized to latest `origin/main` and enter a fresh short-lived `feature/`, `fix/`, `refactor/`, or `chore/` branch before the first edit. Existing PR work continues on the exact verified PR head branch.
- Preserve unrelated user changes, WIP branches, and worktrees. STOP on unknown dirty changes, detached HEAD, unfinished merge/rebase, ambiguous ownership, or conflicting worktree. Never stash, reset, restore, clean, `git checkout -- .`, delete or prune user work, overwrite WIP, or commit unrelated changes.
- Unless the user explicitly limits the phase, normal scoped delivery is authorized through commit, push, PR creation, task-related CI fixes, healthy merge, and post-merge cleanup. Safety STOP conditions and unrelated CI blockers remain hard stops.
- Merge requires green required checks, unblocked review, no conflict, unchanged verified PR HEAD, no sensitive files, and no scope expansion. Do not force-push, direct-push `main`, admin-bypass protections, or merge an unverified PR. Do not configure GitHub branch protection in the Foundation phase.
- The repo-local Skill directly owns the complete GitHub delivery lifecycle. The available GitHub connector and local `git`/`gh` commands are execution tools, not an additional mandatory workflow layer.
- Prefer the GitHub connector for structured remote metadata, PRs, issues, patches, comments, reviews, and labels. Use local `git` for checkout and local history operations, and `gh` for authentication, current-PR discovery, Actions checks/logs, and connector gaps.

### Project-specific facts

- The Foundation phase is synthetic, deterministic, typed, reproducible, and independent of Review Workspace. Keep its product, privacy, benchmark-integrity, and provider-independent contract boundaries intact.
- Use Node 22 in CI and run the repository's applicable quality gates from the repo-local Skill, normally `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run benchmark`, and `git diff --check`.
- Stop at the explicitly requested phase; do not start a later roadmap phase without a new scoped task.

## Scope and phase boundary

The 0.1 Foundation phase is synthetic, deterministic, typed, testable, and reproducible. It does not include LLM-as-Judge, real model/API calls, Review Workspace integration, real user data, databases, dashboards, large datasets, or complex statistical evaluation.

An explicitly scoped follow-up may add a versioned judge prompt, provider-independent judge input/output contracts, and pure result validation or score calculations. Real model calls, provider SDKs, calibration claims, and hidden reasoning persistence remain prohibited unless separately authorized.

Stop when the explicitly requested phase is complete. Do not start the next roadmap phase without a new scoped task.
