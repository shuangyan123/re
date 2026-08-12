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

## GitHub delivery

For repository write tasks in `re`, this GitHub delivery workflow is the default project workflow and is not optional unless the user explicitly limits the requested phase.

The first bootstrap commit is the one-time exception for an actually empty repository: it may be committed directly to `main` because there is no base history for a feature branch and pull request. After bootstrap, repository write tasks—including rules, documentation, tests, and skill maintenance—use this default workflow unless the user explicitly limits the requested phase:

```text
preflight
-> fetch latest origin/main
-> fresh task branch
-> implementation
-> relevant validation
-> commit
-> push
-> pull request
-> inspect remote CI and review state
-> fix task-related CI failures
-> required checks pass
-> squash merge
-> sync main
-> post-merge verification
-> final report
```

Do not stop after implementation, commit, push, or pull request creation when the remaining delivery steps are in scope.

### GitHub skill routing

When an answer or action materially depends on the actual repository, branch, pull request, issue, review, CI, or remote GitHub state, read and follow the installed specialist skill that matches the work:

- General repository, pull request, or issue context: `github` (`skills://plugins/github/github/skill.md`).
- Review comments or requested changes: `gh-address-comments` (`skills://plugins/github/gh-address-comments/skill.md`).
- GitHub Actions failures: `gh-fix-ci` (`skills://plugins/github/gh-fix-ci/skill.md`).
- Commit, push, and pull request publication: `yeet` (`skills://plugins/github/yeet/skill.md`).

Use the GitHub connector first for structured repository, pull request, issue, review, and remote-state data. Use local `git` for checkout, branch, diff, staging, commit, and push operations, and use local `gh` for current-branch PR discovery, authentication, Actions checks, and logs where the connector does not cover the operation. Ordinary coding questions that do not depend on live repository state do not require a GitHub skill.

### New write task preflight

Before the first file edit for a new write task, run:

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

The preflight must establish that the current worktree is clean, the checkout is `main`, `HEAD` equals `origin/main`, the repository is not detached or in an unfinished merge/rebase, and no worktree ownership conflict must be resolved. Then create and switch to a task-specific branch from the validated `origin/main` before writing any file. Use the repository's short-lived `feature/`, `fix/`, `refactor/`, or `chore/` naming convention. Do not begin a new independent task on `main`, a stale task branch, an unrelated feature branch, or a WIP branch.

If the preflight finds unknown dirty changes, a detached HEAD, an unfinished merge/rebase, or a conflicting worktree, stop and report the actual state. Never run `git stash`, `git reset`, `git restore`, `git clean`, `git checkout -- .`, remove or prune a worktree, delete a user branch, overwrite WIP, or commit unrelated changes to manufacture a clean environment. Do not use `git add -A` when the worktree is mixed.

If the task explicitly continues an existing pull request, continue that PR's exact head branch instead of creating another branch or PR. Before writing, verify that the PR head branch, local branch, and PR HEAD SHA correspond; otherwise stop and report the mismatch.

### Commit, CI, merge, and cleanup invariants

After implementation, inspect the complete diff and `git diff --check`, stage only intended files, commit with a Conventional Commit, push without force, and create a pull request targeting `main`. The pull request must describe the change, compatibility, actual validation, and residual risks.

After opening or updating a pull request, inspect its HEAD SHA, mergeability, conflicts, required checks, Actions runs, reviews, requested changes, and unresolved blocking threads. If a GitHub Actions check fails, use `gh-fix-ci`, inspect the real check and logs, determine whether the failure is task-related, fix only the scoped cause, rerun relevant local validation, push the fix, and recheck CI. Treat unrelated or external failures as blockers to report rather than reasons to change unrelated code.

Merge only when the requested change and relevant local validation are complete, required checks are green, review is unblocked, there is no conflict, the verified PR HEAD is unchanged, and no sensitive file or scope expansion is present. Never bypass required checks, admin-merge, force-merge, force-push, direct-push `main`, or merge an unverified or conflicting PR. Prefer squash merge.

After merge, delete the task branch only after confirming no open PR depends on it, leave unrelated worktrees and WIP branches untouched, return to `main`, run `git pull --ff-only origin main`, confirm the worktree is clean, and run the required post-merge smoke checks. Do not configure GitHub branch protection in the Foundation phase; document the invariant here instead.

Normal completion is:

```text
implemented + validated + committed + pushed + PR created
+ CI inspected and task-related failures fixed
+ required checks passed + PR merged + post-merge verification
```

The final report must state the task branch, commit SHA, PR number and status, validation performed, CI status, merge status, and remaining blockers or intentionally deferred work. Never claim a step completed unless it was verified.

## Scope and phase boundary

The 0.1 Foundation phase is synthetic, deterministic, typed, testable, and reproducible. It does not include LLM-as-Judge, real model/API calls, Review Workspace integration, real user data, databases, dashboards, large datasets, or complex statistical evaluation.

An explicitly scoped follow-up may add a versioned judge prompt, provider-independent judge input/output contracts, and pure result validation or score calculations. Real model calls, provider SDKs, calibration claims, and hidden reasoning persistence remain prohibited unless separately authorized.

Stop when the explicitly requested phase is complete. Do not start the next roadmap phase without a new scoped task.
