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

This mode requires the hard preflight in section 2 and a task-specific fresh branch from the latest origin/main before the first file edit. Rules-only changes are still write tasks.

### C. Existing PR continuation

If the user explicitly asks to continue an existing open PR or to address its review, CI, or stabilization work, inspect and continue that PR's exact head branch. Do not create another branch or a second PR. Verify the PR head branch, local branch, and PR HEAD SHA before writing.

For roadmap work, read only the relevant Foundation or project documentation and do not begin a later phase without explicit scope.

---

# 2. HARD PREFLIGHT BEFORE WRITING

For mode B, before editing, run:

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

The preflight must establish:

* the current worktree is clean
* the current branch is main
* HEAD equals origin/main
* there are no unknown local changes
* no other worktree must be modified or resolved to begin this task

If any condition fails, STOP. Do not stash, reset, restore, clean, checkout away local changes, commit unrelated changes, delete or prune worktrees, or alter WIP branches.

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

For mode B, after the hard preflight create and switch to a fresh task-specific branch from the validated origin/main:

Use:

~~~text
feature/<scope>
fix/<scope>
refactor/<scope>
chore/<scope>
~~~

Example:

~~~bash
git switch -c chore/<scope> origin/main
~~~

Confirm the branch and clean state before the first file edit. If the desired branch name already exists locally or remotely, inspect its history and ownership; never overwrite unknown history.

If Git reports that the branch is already used by another worktree, STOP and report the conflicting branch, worktree path, current HEAD, and current branch. Do not switch to detached HEAD, silently use an unrelated branch, delete the worktree, or force the operation.

For mode C, continue the verified exact PR head branch instead of creating a new branch. Read-only mode requires no branch.

Never perform a new write task directly on main, detached HEAD, an unrelated feature branch, or a WIP branch.

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

# 22. Branch cleanup

After successful Merge:

check whether another open PR depends on the branch.

If not:

delete the merged remote work branch.

Do not delete a branch that is still used as the base of stacked work.

---

# 23. Sync final main

After Merge:

~~~bash
git fetch origin
git switch main
git pull --ff-only origin main
git status
~~~

Do not use reset --hard as the default sync mechanism.

---

# 24. Post-merge verification

Run lightweight checks against final main.

For rules or Skill-only changes run the applicable structural checks and git diff --check.

For ordinary Foundation changes run the relevant project gates, normally:

~~~bash
npm run typecheck
npm test
npm run benchmark
~~~

When appropriate also run npm run lint or npm run build explicitly.

This confirms the actual merged commit, not merely the feature branch, is healthy.

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

If push, PR, CI, or Merge cannot complete, identify the actual blocker.

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

Otherwise stop at the last safe state.

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
- branch
- commits

Pull Request
- number
- title
- URL
- remote checks

Merge
- method
- result
- final main SHA

Post-merge
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
Clean branch
->
Sync main
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
