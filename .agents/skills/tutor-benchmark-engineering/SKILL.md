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

This Skill is the required repo-local orchestration layer for Tutor Benchmark repository write tasks. It owns the engineering sequence and delegates GitHub-specific operations to the installed specialist skills; it does not replace those plugins.

### 1. Determine scope and workflow mode

Classify the request before choosing a branch:

- Read-only: inspect, explain, or review without changing files. Do not create a branch.
- New write task: feature, fix, refactor, maintenance, rules, documentation, tests, or Skill changes. This requires the hard preflight and a fresh branch before the first edit.
- Existing PR continuation: explicitly continue an open PR or address its review, CI, or stabilization work. Continue that PR's exact head branch and do not create a second PR.

Rules-only changes are still write tasks. Respect an explicit user limit such as analysis-only, no commit, no push, no PR, or no merge; otherwise carry a scoped task through the full delivery workflow. Do not start a later Foundation or roadmap phase as follow-up work.

### 2. Hard preflight before writing

For a new write task, before editing any file, run:

```text
git status --short
git status -sb
git branch --show-current
git rev-parse HEAD
git fetch origin
git rev-parse origin/main
git worktree list
git status --short
```

The preflight must establish a clean current worktree on `main`, `HEAD` equal to `origin/main`, no detached HEAD, no unfinished merge/rebase, no unknown local changes, and no worktree ownership conflict. If any condition is false, STOP and report the actual state.

Never use `git stash`, `git reset`, `git restore`, `git clean`, `git checkout -- .`, worktree removal/prune, branch deletion, or unrelated commits to manufacture a clean checkout. Never overwrite WIP or stage unrelated changes. A dirty state may continue only when it is proven to belong to the exact existing PR task.

For an existing PR continuation, inspect and verify the PR head branch, local branch, and PR HEAD SHA before writing. If they do not correspond, STOP.

### 3. Fresh branch before the first write

For a new task, create and switch to a short-lived branch from the validated latest `origin/main` before editing:

```text
feature/<scope>
fix/<scope>
refactor/<scope>
chore/<scope>
```

Do not start a new independent task on `main`, detached HEAD, a stale task branch, an unrelated feature branch, or a WIP branch. If a desired branch already exists locally, remotely, or in another worktree, inspect its history and ownership; never overwrite unknown history or bypass a worktree conflict.

### 4. Audit, design, and implementation

Read the applicable `AGENTS.md`, README, package scripts, contracts, tests, and only the architecture context relevant to the task. Inspect the actual call chain, data flow, persistence boundary, external effects, error semantics, and test boundary before editing.

Keep the Foundation product boundary intact: synthetic, deterministic, typed, reproducible evaluation only. Do not add real model calls, provider SDKs, LLM judges, Review Workspace imports, databases, dashboards, large datasets, complex statistics, or unrelated product behavior without a separately scoped task.

Choose the smallest design that proves the requested behavior. Keep core contracts provider-independent, keep provider details in adapters, and never persist credentials, raw provider payloads, prompts, or hidden reasoning.

### 5. Validate and review the complete diff

Test behavior rather than weakening benchmark expectations. Cover validation, adapter behavior, deterministic evaluator semantics, per-scenario isolation, stable errors, result schema, and reproducibility as applicable.

For rules-only changes limited to repository instructions and this Skill, run at least `git diff --check` and any applicable rules or Markdown validation. For runtime changes, run the repository gates listed below and relevant targeted checks. Before committing, inspect `git status`, `git diff --check`, the complete diff, changed-file scope, secrets/private data, generated outputs, and benchmark-integrity boundaries.

Do not delete failing scenarios, lower thresholds, rewrite expected answers, add model-specific exceptions, skip tests, weaken assertions, disable lint/security checks, or use broad `any` merely to make validation pass.

### 6. Route GitHub work to installed specialist skills

When the task materially depends on live repository, branch, pull request, issue, review, CI, or remote state, read and follow the matching installed skill:

- General repository, PR, or issue context: `github` (`skills://plugins/github/github/skill.md`).
- PR review comments or requested changes: `gh-address-comments` (`skills://plugins/github/gh-address-comments/skill.md`).
- GitHub Actions or CI failures: `gh-fix-ci` (`skills://plugins/github/gh-fix-ci/skill.md`).
- Commit, push, and PR publication: `yeet` (`skills://plugins/github/yeet/skill.md`).

The repo-local Skill owns project orchestration. The installed GitHub skills own specialist GitHub operations. Prefer the GitHub connector for repository metadata, PRs, issues, patches, comments, reviews, labels, and remote state. Use local `git` for status, branches, worktrees, diffs, staging, commits, and pushes. Use `gh` for authentication, current-branch PR discovery, Actions checks and logs, and connector coverage gaps. Ordinary coding questions with no live GitHub dependency do not require a GitHub skill.

### 7. Standing authorization and safe failure boundaries

Unless the user explicitly limits the phase, normal scoped delivery is authorized through commit, push, PR creation, inspection of CI/review state, fixes for task-related CI failures, merge of a healthy PR, and post-merge cleanup. A specialist skill's generic confirmation prompt must not turn an authorized repository workflow into an unnecessary intermediate stop.

STOP instead when there are unrelated dirty changes, unclear ownership, authentication or permission failure, dangerous merge conflict, an unverified or changed PR HEAD, a CI failure unrelated to this task, sensitive files, or requested scope expansion. Fix only task-related failures and report external or unrelated blockers without changing unrelated code.

### 8. Commit, push, and pull request

After local validation and complete-diff review:

1. Stage only intended files; never use `git add -A` on a mixed worktree.
2. Commit with a clear Conventional Commit message.
3. Push the task branch without force.
4. Create or update the PR targeting `main`.

The PR must describe the change, architecture or behavior, compatibility, actual validation, and residual risks. Do not stop after commit, push, or PR creation.

### 9. Inspect CI and review state

After opening or updating the PR, inspect the PR HEAD SHA, mergeability, conflicts, required checks, Actions runs, reviews, requested changes, and unresolved blocking threads. Wait for checks to reach a terminal state when the environment permits.

If a GitHub Actions check fails, use `gh-fix-ci`, retrieve the real check and logs, classify the root cause, fix only a task-related regression, run relevant local validation, commit and push the fix, and recheck the new PR HEAD. Never merge based on checks for an older HEAD.

### 10. Merge gate

Merge only when the requested change is complete, relevant local validation passes, required checks are green, review is unblocked, no conflict exists, no sensitive file or scope expansion is present, and the PR HEAD is unchanged since validation. Re-read the HEAD immediately before merge and bind the merge to that SHA when supported.

Prefer squash merge. Never force-push, direct-push `main`, admin-bypass protections, remove required checks, merge a failing/conflicting PR, or merge an unverified HEAD.

### 11. Cleanup, sync, and post-merge verification

After merge, confirm no open PR depends on the task branch before deleting it. Remove only the completed task branch/worktree created for this task; preserve unrelated worktrees, uncommitted changes, and WIP branches. Return to `main`, run `git pull --ff-only origin main`, confirm the worktree is clean, and run the required post-merge smoke or rules checks against the merged commit.

### 12. Final report

Report only verified facts:

- implementation and validation
- task branch and commit SHA
- PR number, URL, and status
- CI and review status
- merge method and final `main` SHA
- post-merge checks
- remaining blockers or intentionally deferred work

Use this sequence for release-ready work:

```text
scope -> preflight -> latest origin/main -> fresh branch
-> audit/design -> implementation -> tests -> benchmark-integrity review
-> complete diff -> commit -> push -> PR -> CI/review
-> verify HEAD -> squash merge -> cleanup -> sync main
-> post-merge verification -> final report
```

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
