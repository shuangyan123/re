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
This Skill is the required repo-local orchestration layer for Tutor Benchmark repository write tasks. It directly owns the complete engineering and GitHub delivery lifecycle; available GitHub connector, git, and gh tools may support execution but are not a second workflow layer.

---

## Worktree policy

Worktrees are optional isolation, not a mandatory step. The default simple route is:

~~~text
clean, synchronized main worktree
-> fresh short-lived task branch
-> implementation/test/PR/merge
-> return to main
-> cleanup task branch
~~~

Prefer a disposable task worktree only when isolation is materially useful, for example:

* another task or PR must remain checked out
* parallel work exists
* the normal worktree should remain on main
* switching branches would disturb user work
* the agent explicitly needs isolated execution

Do not introduce a worktree for ceremony on a trivial single-task change. Before using or removing one, inspect its registered path, branch, HEAD, and status. Never manually delete, force-remove, or prune an unknown or user-owned worktree. Use `git worktree remove <path>` without `--force` only after the guarded cleanup checks in section 22.

### Routing invariant

The selected task location must be based on the exact fetched `origin/main` SHA. A disposable task worktree is a safe alternative when the normal repository worktree is occupied by another verified task or PR; it does not make worktrees mandatory for later tasks. Do not alter an occupied, dirty, detached, conflicted, or ambiguously owned worktree just to satisfy the default route.

---

# 1. Determine the requested scope

Start by identifying exactly what the user asked to change.

Classify the task:

~~~text
feature
fix
refactor
maintenance
rules or documentation
tests
~~~

Identify explicit exclusions.

Do not automatically expand the task into another Foundation or roadmap phase.

## 1.1 Select the workflow mode

Use exactly one of these modes before choosing a branch:

### A. Read-only task

Examples: audit, review, explain, inspect, or research.

If no file will be modified, do not create a branch. Read the repository state and report the evidence only.

### B. New write task

Examples: feature, fix, refactor, maintenance, rules maintenance, docs maintenance, Skill maintenance, or test modification.

This mode requires the hard preflight in section 2 and a task-specific fresh branch from the exact fetched `origin/main` SHA before the first file edit. Rules-only changes are still write tasks.

### C. Existing PR continuation

If the user explicitly asks to continue an existing open PR or to address its review, CI, or stabilization work, inspect and continue that PR's exact head branch. Do not create another branch or a second PR. Verify the PR head branch, local branch, and PR HEAD SHA before writing.

For roadmap work, read only the relevant Foundation or project documentation and do not begin a later phase without explicit scope.

---

# 2. HARD PREFLIGHT BEFORE WRITING

For mode B, before the first edit, inspect the repository and all worktrees, then fetch and record the exact base:

~~~bash
git status --short
git status -sb
git branch --show-current
git rev-parse HEAD
git fetch origin
git rev-parse origin/main
git worktree list
git status --short
~~~

The preflight must establish all of the following:

* `git fetch origin` succeeded and the exact `origin/main` SHA is recorded.
* The default route is available only when the normal repository worktree is clean, attached to `main`, and `HEAD` equals `origin/main`.
* If the normal worktree is instead a clean, attached worktree for another verified task or open PR, leave it untouched and use the optional task-worktree route from the exact `origin/main` SHA when isolation is materially useful.
* The selected task location is clean, attached to a known branch, free of an unfinished merge/rebase/cherry-pick/revert, and free of unknown local changes.
* No other worktree must be modified, switched, removed, or resolved to begin this task.

A clean attached non-main task branch is not permission to switch away from or rewrite that branch. If no safe normal-worktree or disposable-worktree route exists, STOP. Do not stash, reset, restore, clean, checkout away local changes, commit unrelated changes, delete or prune worktrees, or alter WIP branches.

For mode C, inspect the existing PR first and verify its exact head branch, the local checkout, and the PR HEAD SHA. A dirty state is only continuable when it is proven to belong to that exact PR task.

Never discard unknown user changes.

Never use git reset --hard as a routine synchronization method.

---

# 3. Load relevant benchmark context

Read only documentation and source relevant to the task.

Common sources:

~~~text
AGENTS.md
README.md
package.json
package-lock.json
src/
tests/
scenarios/
rubrics/
docs/ when directly relevant
~~~

Then inspect the actual contracts, adapters, evaluator, runner, report, and tests touched by the request.

When documentation and code disagree:

* trust verified implementation behavior
* determine whether documentation is stale
* update documentation if this task touches that boundary

Do not implement based only on filenames or documentation assumptions.

---

# 4. Perform a proportional architecture audit

For small changes, keep this brief.

For contract, evaluator, adapter, runner, or workflow changes, determine:

~~~text
current entry point
call chain
scenario and rubric validation
TutorUnderTest adapter boundary
evaluator and result flow
report boundary
privacy and security boundary
test coverage
rollback or failure boundary
~~~

For multi-step execution specifically identify:

~~~text
step order
partial results
failure isolation
retry safety
cleanup
external effects
~~~

Do not pretend external provider calls and local result persistence form one ACID transaction.

---

# 5. Choose the minimum sufficient design

Prefer the smallest design that genuinely improves:

* correctness
* maintainability
* testability
* architecture boundaries

Before introducing an abstraction ask:

> Does this represent a real benchmark or substitution boundary?

Do not introduce without strong evidence:

~~~text
BaseUseCase
BaseRepository
Manager
Coordinator
GatewayFactory
DI Container
Service Locator
CommandBus
EventBus
CQRS framework
new global state library
~~~

Keep the dependency flow:

~~~text
Scenario
-> TutorUnderTest adapter
-> Tutor output
-> evaluator
-> result
-> report
~~~

---

# 6. Preserve scope and benchmark boundaries

Do not perform unrelated refactors.

Do not automatically:

* add real model or provider calls
* add LLM-as-Judge or model voting
* import Review Workspace internals
* add a database, dashboard, or large dataset
* add complex statistics or calibration claims
* change the product boundary
* alter Foundation phase limits
* upgrade major dependencies
* replace the TypeScript toolchain

If an unrelated issue blocks correctness, fix the minimum blocker and explain why.

Otherwise record it as residual work.

---

# 7. Establish or continue the task branch

For mode B, after the hard preflight choose exactly one safe route from the validated `origin/main`:

### Default: use the normal repository worktree

Use this route when the normal repository worktree is clean, attached to `main`, and `HEAD` equals the recorded `origin/main` SHA. Create the fresh task branch there:

~~~bash
git switch -c <task-branch> <origin-main-sha>
~~~

### Optional: use a disposable task worktree

Use this route only when the worktree policy says isolation is materially useful. Create the worktree from the exact recorded `origin/main` SHA and verify it before editing:

~~~bash
git worktree add -b <task-branch> <disposable-path> <origin-main-sha>
git -C <disposable-path> status --short --branch
git -C <disposable-path> rev-parse HEAD
~~~

Do not switch away from an existing task or PR worktree to make the default route possible. Do not use a path or branch already owned by another worktree. If neither route is safe, STOP and preserve the existing state.

Use:

~~~text
feature/<scope>
fix/<scope>
refactor/<scope>
chore/<scope>
~~~

Confirm the branch and clean state before the first file edit. If the desired branch name already exists locally or remotely, inspect its history and ownership; never overwrite unknown history.

If Git reports that the branch is already used by another worktree, STOP and report the conflicting branch, worktree path, current HEAD, and current branch. Do not switch to detached HEAD, silently use an unrelated branch, delete the worktree, or force the operation.

For mode C, continue the verified exact PR head branch instead of creating a new branch. Read-only mode requires no branch.

Never perform a new write task directly on `main`, detached HEAD, an unrelated feature branch, or a WIP branch. The task branch may live in the normal worktree or in the explicitly selected disposable task worktree; worktrees are not otherwise required.

---

# 8. Implement incrementally

Follow the existing provider-independent benchmark architecture.

Keep scenario loading, validation, adapter execution, evaluation, result construction, and reporting responsibilities separated.

When changing contracts:

* keep identifiers stable and versionable
* validate runtime input rather than relying on TypeScript assertions
* keep provider-specific metadata in adapters
* do not persist credentials, raw provider payloads, prompts, or hidden reasoning

When changing evaluators or runners:

* preserve deterministic ordering
* isolate per-scenario failures
* retain criterion-level diagnostics and weighted totals
* never turn a proxy evaluator into a claim of complete teaching quality

---

# 9. Add tests that exercise behavior

Architecture source checks are useful but cannot replace direct behavior tests.

For benchmark changes prefer:

~~~text
real function or runner invocation
+
synthetic fixtures
+
asserted inputs
+
asserted call order when applicable
+
asserted results
+
asserted failure semantics
~~~

Cover validation, adapter behavior, deterministic evaluator behavior, per-scenario isolation, stable errors, result schema, and reproducibility as applicable.

Do not use whole-result snapshots as the only evidence.

---

# 10. Run local quality gates

For rules-only changes limited to repository instructions and the engineering Skill, run at least:

~~~bash
git diff --check
~~~

Also run applicable repository rules, Markdown, frontmatter, or structure validation. Do not mechanically run unrelated product checks when no runtime boundary changed; state the rules-only scope and the commands actually run in the PR.

For ordinary Foundation TypeScript changes run at minimum:

~~~bash
npm run typecheck
npm run lint
npm test
npm run build
npm run benchmark
~~~

Run additional targeted tests when relevant.

Do not claim a test passed unless it actually ran and passed.

---

# 11. Handle failures correctly

If a quality gate fails, first determine whether it is:

~~~text
regression introduced by this task
existing repository failure
environment failure
external service failure
~~~

Fix regressions introduced by this task before proceeding.

Do not make validation green by:

* deleting scenarios or assertions
* changing expected answers to match a tutor
* lowering thresholds
* adding model-specific exceptions
* skipping a failing case
* disabling lint or security checks
* suppressing TypeScript errors
* using broad any

If a real external or environment blocker cannot be resolved safely, stop before Merge and report it.

---

# 12. Review the final diff

Before committing run:

~~~bash
git status
git diff --check
git diff
~~~

Review the complete patch as if reviewing another engineer's PR.

Look for:

~~~text
unrelated changes
debug logs
temporary code
TODO hacks
dead code
duplicated logic
unsafe retries
secret leakage
unexpected contract changes
unexpected generated output
unnecessary abstractions
missing tests
stale documentation
~~~

Do not commit generated artifacts unless the repository intentionally tracks them.

Never commit:

~~~text
.env
API keys
tokens
cookies
passwords
private keys
personal user data
local logs
benchmark result output
~~~

---

# 13. Update documentation only when required

Update relevant docs for real changes to:

* contracts or result schema
* evaluation semantics
* development workflow
* privacy or security boundaries
* Foundation phase status
* public behavior

Do not update every document mechanically.

Do not turn AGENTS.md into a changelog.

Never mark a phase complete if defined work remains pending.

---

# 14. Commit

Only commit after required local quality gates pass.

Use Conventional Commits.

Examples:

~~~text
feat: add ...
fix: correct ...
refactor: extract ...
test: cover ...
docs: record ...
chore: maintain ...
~~~

Prefer a small number of logically complete commits.

Do not split changes only to produce more commits.

---

# 15. Push

Push the work branch after local verification.

For a new branch:

~~~bash
git push -u origin <branch>
~~~

For an existing upstream:

~~~bash
git push
~~~

Force pushes are prohibited:

~~~text
git push --force
git push --force-with-lease
~~~

Do not use either command, including to repair a rejected or divergent push.

If rejected as non-fast-forward, inspect remote history and do not overwrite it.

---

# 16. Create the Pull Request

Create a PR:

~~~text
base: main
head: current work branch
~~~

PR title should summarize the actual change.

PR body must include:

## Summary

What changed and why.

## Architecture / Behavior

Only important benchmark or workflow facts.

## Compatibility

State relevant:

* contract or result compatibility
* fixture or scenario impact
* provider-independent boundary impact
* retry or partial-result impact

## Testing

List only commands actually executed.

Example:

~~~text
- npm run typecheck
- npm run lint
- npm test
- npm run build
- npm run benchmark
~~~

Never use:

~~~text
Not run (not requested)
~~~

when the task requires validation.

If something was not run, give the real reason.

Never claim unrun checks.

## Residual risks

Only real remaining risks.

Do not stop after creating the PR.

---

# 17. Inspect remote PR state

After creating or updating the PR inspect:

~~~text
PR HEAD SHA
mergeability
merge conflicts
required checks
GitHub Actions
reviews
changes requested
unresolved blocking review threads
branch protection when available
~~~

Use the GitHub connector, git, or gh as available execution tools. Do not assume local PASS means remote PASS.

If checks are pending, continue checking until they reach a terminal state when the environment permits.

---

# 18. Respond to review feedback

If blocking review feedback appears and is within scope:

~~~text
inspect
->
fix
->
test
->
review complete diff
->
commit
->
push
->
wait for new CI
~~~

Do not merge based on old CI after changing the PR HEAD.

If requested feedback substantially expands scope, do not perform an unrelated phase just to satisfy it. Keep the PR focused and report the scope conflict.

---

# 19. Auto-merge hard gate

Automatic Merge is allowed only when all applicable conditions are true:

~~~text
local required gates PASS
remote required checks PASS
GitHub Actions PASS
no merge conflict
no Changes Requested
no unresolved blocking review
no sensitive files
no unexpected scope expansion
PR base = main
PR HEAD = the validated HEAD
~~~

Immediately before Merge, re-read PR HEAD SHA.

If it changed since validation:

**do not Merge.**

Validate the new HEAD first.

A required check that is pending or failed is a hard stop. Do not merge a PR with a conflict, Changes Requested, or an unresolved blocking review thread.

---

# 20. Never bypass GitHub protections

Do not:

~~~text
admin bypass
force merge
disable branch protection
remove required checks
direct push main instead of PR
merge a failing PR
merge a conflicting PR
merge an unverified new HEAD
~~~

Automation is subordinate to correctness.

---

# 21. Merge strategy

When all hard gates pass:

prefer:

~~~text
Squash and merge
~~~

Use a clear Conventional Commit-style squash title.

Do not use a meaningless default title.

---

# 22. Branch and worktree cleanup

Begin cleanup only after the remote confirms all of the following:

* the PR state is `MERGED`
* the PR base is `main`
* the PR head SHA is the exact SHA validated immediately before Merge
* the merge result SHA is read back and the result is bound to the expected `main` state

Do not begin cleanup from a local merge command result or a stale PR view. First inspect open PRs and `git worktree list --porcelain`. Treat the task branch as referenced when another open or stacked PR uses it as a head or base, or when another worktree checks it out.

If a disposable task worktree was used:

1. Record and verify its path, branch, and task branch tip against the previously validated PR head SHA.
2. Verify `git status --short --branch` is clean and that no merge, rebase, cherry-pick, or revert is unfinished.
3. If it is dirty, unfinished, detached, ambiguously owned, or no longer matches the verified task branch, preserve it and stop cleanup. Never use `git worktree remove --force`.
4. Remove it with `git worktree remove <path>` without `--force`, then verify that its registration is gone.
5. Only after the worktree is removed may the local task branch be deleted, and only after section 23 verifies final `main`.

If the normal repository worktree contains the task branch, switch it back to `main` only when it is clean, attached, and free of unfinished Git state. If it contains another task, PR, WIP, or ambiguous state, do not switch it or overwrite it; preserve it and stop cleanup for that location.

After section 23 verifies final `main`, recheck open PRs and worktrees. When the task branch is no longer checked out and no open or stacked PR depends on it, remove the remote task branch if it still exists. If it is already absent, record `ALREADY ABSENT` and do not retry a destructive deletion. Do not remove a remote branch that another PR or worktree still references.

Delete the local task branch with `git branch -d <task-branch>` first. Squash merge may legitimately make `-d` refuse because the original branch tip is not an ancestor of `main`. Allow `git branch -D <task-branch>` only when every condition below is true:

1. the branch was created and is owned by the current task
2. the PR is confirmed merged
3. the branch name equals the verified PR head branch
4. the local branch tip equals the previously verified PR head SHA
5. the final `main`/merge result has been verified
6. no open or stacked PR depends on the branch
7. no worktree is using the branch
8. no uncommitted task changes would be lost

This `-D` exception is narrow. Never use it for an unknown branch, user WIP branch, unmerged PR branch, branch used by another worktree, or branch whose tip no longer matches the verified PR head SHA. If any condition is false, keep the local branch and report why.

---

# 23. Sync final main

After the merge result and any safe task-worktree removal are confirmed, return the normal worktree to `main` when safe or select the safe alternate final-main location described below:

~~~bash
git fetch origin
git switch main
git pull --ff-only origin main
git rev-parse main
git rev-parse origin/main
git status --short --branch
git worktree list --porcelain
~~~

On the normal repository worktree, return or switch to `main` only when it is clean, attached, and free of unfinished merge/rebase state. Verify that local `main` equals `origin/main`, that the expected merge result is present, and that the main worktree is clean. Do not use `reset --hard`, stash, or forced checkout as synchronization.

Hard stop: if the normal or main worktree has unknown local changes, an unfinished merge or rebase, detached HEAD, or another ambiguous state, do not overwrite, stash, reset, switch it, or force-remove it. Stop cleanup for that location and report the condition.

If the normal repository worktree is safely occupied by another task, PR, or WIP, leave it untouched. Use an already clean main worktree, or create a clearly identified disposable final-verification worktree only when necessary; synchronize and verify `main` there, then remove that verification worktree without `--force`. If no safe location exists, stop post-merge cleanup and report that main synchronization is unverified.

---

# 24. Post-merge verification

Run lightweight checks against final main.

For rules or Skill-only changes run the applicable structural checks and `git diff --check` against the synchronized final `main`.

For ordinary Foundation changes run the relevant project gates, normally:

~~~bash
npm run typecheck
npm test
npm run benchmark
~~~

When appropriate also run npm run lint or npm run build explicitly.

This confirms the actual merged commit, not merely the feature branch, is healthy. Do not report the task fully complete until the applicable post-merge checks and cleanup status are verified.

---

# 25. Stop after the requested task

Do not automatically start the next Foundation or roadmap task.

For example:

~~~text
Foundation contracts merged
~~~

means stop.

Do not continue to a judge phase, real provider integration, Review Workspace adapter, or another unrelated migration unless the user explicitly requested it.

---

# 26. Failure policy

If push, PR, CI, Merge, cleanup, or final-main synchronization cannot complete, identify the actual blocker.

Examples:

~~~text
authentication
permission
branch protection
remote divergence
merge conflict
failed CI
external outage
environment limitation
~~~

Resolve only when safe and within scope.

If delivery is blocked before the remote confirms the merge, keep the task branch and any task worktree. Do not delete branches, remove worktrees, or perform destructive cleanup; preserve the exact continuation state for the next attempt.

If the PR is confirmed merged but cleanup or final-main synchronization is blocked by dirty state, unfinished Git state, an unexpected branch/worktree dependency, permission, or another ambiguity, preserve the affected branch or worktree and stop that cleanup step. Do not overwrite, stash, reset, force-remove, or silently claim completion. A remote branch that is already absent is an idempotent cleanup result, not a deletion failure.

Never claim:

~~~text
pushed
merged
tests passed
~~~

unless verified.

---

# 27. Final report

After successful delivery report:

~~~text
Implementation
- concise description

Validation
- typecheck: PASS/FAIL
- lint: PASS/FAIL
- test: PASS/FAIL
- build: PASS/FAIL
- benchmark: PASS/FAIL
- structural/rules checks: PASS/FAIL if applicable

Git
- task branch
- commit SHA
- task location: normal worktree / disposable task worktree

Pull Request
- number
- title
- URL
- validated PR HEAD SHA
- remote checks

Merge
- method
- merge SHA / result
- final main SHA

Cleanup and post-merge
- main synchronized: VERIFIED / NOT VERIFIED
- main worktree: SYNCED + CLEAN / PRESERVED / NOT VERIFIED
- task worktree: REMOVED / NOT USED / PRESERVED with blocker
- local task branch: REMOVED / PRESERVED with reason
- remote task branch: REMOVED / ALREADY ABSENT / PRESERVED with reason
- checks executed

Residual risks
- only real unresolved issues
~~~

Keep the report concise.

---

# 28. Core completion rule

The normal successful workflow is:

~~~text
Understand
->
Audit
->
Choose normal main worktree or disposable task worktree
->
Implement
->
Direct tests
->
Local quality gates
->
Review complete diff
->
Commit
->
Push
->
Pull Request
->
Remote CI / Review
->
Verify HEAD SHA
->
Squash Merge
->
Confirm MERGED, exact PR HEAD, and merge result
->
Remove safe task worktree or return normal worktree to main
->
Sync main
->
Remove unreferenced remote/local task branch
->
Post-merge verification
->
STOP
~~~

If any critical condition fails, stop at the last safe state instead of bypassing the guardrail.

The quality of the resulting main branch matters more than successfully completing an automated Merge.

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
