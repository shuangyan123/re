# TutorEval 0.3A — Hybrid Evaluation Orchestration

TutorEval 0.3A establishes the execution model for cases that contain both
deterministic and semantic Judge rubrics. It evaluates observed Tutor output;
it does not prove student learning, human calibration, provider quality, or
model robustness.

This phase adds no real model call, provider SDK, API key handling, Review
Workspace adapter, database, dashboard, pairwise comparison, or statistical
calibration.

## The corrected execution boundary

The previous runner selected one evaluator for the whole case:

```text
Judge configured  -> all case rubrics sent to Judge
Judge absent      -> all case rubrics sent to deterministic evaluation
```

That behavior was incorrect for 0.2A. A Judge could be asked to re-evaluate
deterministic answer or leakage proxies, while Judge-only rubrics were sent to
the deterministic evaluator when no Judge was configured and became
`judge_evaluation_unavailable` errors. A valid Judge result was also checked
only for unexpected rubric IDs; missing IDs were converted into rubric errors,
which could make an incomplete provider result look like a pedagogical FAIL.

The 0.3A flow is case-scoped but rubric-owned:

```text
Tutor response
      ├── deterministic rubrics -> deterministic evaluator
      └── Judge rubrics         -> one Judge request
                                  -> validated Judge result
      deterministic + Judge results
                    -> stable case-rubric merge
                    -> aggregate and quality gate
```

`partitionTutorEvalRubrics()` is a pure function. Every rubric has exactly one
authoritative path:

```text
evaluationType = deterministic -> evaluatorId + deterministic evaluator
evaluationType = judge         -> Judge only
```

The merge follows the original case rubric order, regardless of how the two
evaluation paths complete. Deterministic evaluators are proxies; they are not
semantic substitutes for the Judge.

The current evaluator revision is recorded as evaluator version `0.3a.3` in
new `TutorEvalRunResult` values. The `0.3a.2` revision records the audited
critical-failure quality-gate policy before the disclosure/diagnosis semantic
audit; it remains a historical evaluator identity. The `0.3a.3` revision
records the clarified disclosure and diagnosis boundaries and is separate from
dataset and case identity so an immutable response corpus can be replayed
without rewriting its evidence. The full audits are in the
[`disclosure and critical-failure semantics audit`](tutor-eval-disclosure-critical-semantics-audit.md)
and [`critical-failure quality-gate audit`](critical-failure-quality-gate-audit.md).

## Judge input and hidden context

`buildTutorEvalJudgeInput()` sends only the partition's Judge rubrics. It does
not ask the Judge to score deterministic correctness, exact matches, or
deterministic answer leakage again. The Judge still receives the evaluator
context needed for semantic evaluation:

- ground truth;
- known misconception;
- disclosure policy;
- student profile and visible case context;
- the candidate Tutor response.

`evaluatorOnly` remains outside `TutorUnderTest` input. The only conversion to
the Tutor boundary is `toTutorTurnInput()`, which contains visible learning
context and does not contain hidden annotations.

## Judge execution and descriptor boundaries

The injected execution boundary is the provider-independent `TutorEvalJudge`
interface:

```ts
interface TutorEvalJudge {
  evaluate(input: TutorEvalJudgeInput): Promise<unknown>;
}
```

The runner validates the returned value before it becomes a core result. The
Judge descriptor remains metadata only (`provider`, `model`, model version,
prompt ID/version, temperature, and seed); it does not execute a model. A
provider execution may also record optional effective `timeoutMs` and
`maxAttempts` values. Those configured values are distinct from per-call
`judgeMetrics.latencyMs` and `attempts` observations. Provider transport,
provider-specific retries, and response sanitization stay outside this core
runner. The core runner never retries a Tutor response or performs an
unbounded Judge retry.

The versioned prompt asset is
`prompts/tutor-eval-pedagogy-judge-system-v0.3.md`. The v0.1 and v0.2 assets
remain unchanged for historical compatibility. v0.3 explicitly limits the Judge to
the rubrics supplied in the current request, treats evaluated content as
untrusted data, requires atomic `PASS`/`PARTIAL`/`FAIL` results, emits only
short observable evidence, forbids hidden reasoning and score calculation, and
defines all five disclosure policies plus the wrong/incomplete/no-diagnosis
critical-failure boundary.

## Result validation and failure ownership

For a Judge request, returned rubric IDs must equal the requested Judge rubric
IDs exactly. The runner rejects:

- missing requested Judge rubric IDs (`judge_rubric_missing`);
- deterministic or otherwise unexpected rubric IDs (`judge_rubric_unexpected`);
- duplicate IDs or malformed result data (`judge_result_invalid`).

These are evaluation-contract failures, not Tutor pedagogical failures. Other
stable Judge failure diagnostics distinguish unavailable execution,
timeouts, and transport failures:

```text
judge_unavailable
judge_result_invalid
judge_output_truncated
judge_timeout
judge_transport_error
judge_rubric_missing
judge_rubric_unexpected
```

When Judge execution is unavailable or invalid, deterministic results already
obtained are retained. Requested Judge rubrics are represented as unresolved
`ERROR` rubric results with the stable failure diagnostic; they are never
silently converted to `FAIL`. The case status is `error` and its
`overallScore` is `null`. Final aggregation does not produce a formal case
score until every requested rubric has a valid result. A run containing an
evaluation-error case also reports a null run-level score and category scores,
while preserving the complete case-level evidence.

For the Chat Completions transport, an explicit provider
`finish_reason = "length"` is a separate `judge_output_truncated` execution
failure. The partial message content is not parsed or treated as Judge
evidence, even if it happens to be JSON-parseable. Sanitized metrics already
available from that response remain attached to the execution error. Other
finish reasons retain the existing content/parser behavior unless the
provider response is otherwise invalid.

When all rubric results are valid, deterministic and Judge critical failures
are merged and deduplicated by failure type. A deterministic answer-leakage
failure cannot disappear because a Judge is present. Judge factual errors and
semantic critical failures remain owned by the validated Judge result.

The aggregate keeps the ordinary rubric score and the quality gate separate.
The default gate fails a valid case for any declared critical-failure type at
`major` or `critical` severity, including a disclosure-policy violation, even
when the overall rubric score is otherwise high. A gated critical failure is a
Tutor behavior failure (`status: "failed"`), not an infrastructure or Judge
evaluation error. Minor failures remain visible as diagnostics and do not gate
the case by default.

## Compatibility

The v0.1 seven-case dataset remains runtime-readable. The v0.2A dataset keeps
its existing case and rubric IDs and now executes its mixed rubric sets
according to `evaluationType`. The language diagnosis mapping was removed as a
semantic correction; that case is `1.0.1` and the dataset is `0.2a.1`. The
calibration identity chain is unchanged:

```text
datasetId + datasetVersion + caseId + caseVersion + responseId + rubricId
```

This preserves the future join from Judge labels to human reference labels.
No independent human review or Judge-vs-human calibration is claimed by this
phase.

Frozen corpus replay is a separate provenance boundary. The default corpus
identity check remains strict; the only approved source-to-target exception is
the machine-checked `tutor-eval-v0.2a@0.2a -> 0.2a.1` transition for
`language-verb-check-001@1.0.0 -> 1.0.1`. Replay evaluates target `0.3a.3`
semantics without changing source response identities and records both source
and target identities in the optional `semanticReplay` result field. See
[`frozen-corpus-semantic-replay.md`](frozen-corpus-semantic-replay.md).

## Test coverage

The orchestration tests cover:

- deterministic-only execution with a configured but unused Judge;
- Judge-only execution and one-request call count;
- mixed deterministic/Judge routing and stable merge order;
- Judge input rubric selection and prompt-injection-shaped Tutor text;
- missing, unexpected, and invalid Judge results;
- unavailable Judge execution with deterministic partial evidence;
- deterministic and Judge critical-failure merge/deduplication;
- legacy v0.1 and canonical v0.2A runtime compatibility through the existing
  contract and calibration tests.

## Scope status

0.3 remains partial. Versioned prompt contracts, Judge input/output contracts,
the execution boundary, hybrid routing, and deterministic merge are in place.
Real Judge providers, real model calls, independent human calibration, and
pairwise robustness evaluation remain future work.
