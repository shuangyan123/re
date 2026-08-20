# Material Requirement Judge calibration experiment

## Status and motivation

This is an opt-in, provider-independent calibration experiment. It does not
replace the production TutorEval Judge or change normal `tutorbench evaluate`.

The motivating DeepSeek V4-Flash non-thinking, temperature-zero diagnostic
produced these valid observations with the production
`tutor-eval-pedagogy-judge-system@0.9` prompt:

| Fixture | Expected | Valid observed labels |
| --- | --- | --- |
| A | `PASS` | `PASS` x2 |
| B | `PARTIAL` | `PASS` x2 |
| C | `FAIL` | `PARTIAL` x3 |

Two additional attempts ended in transient `judge_transport_error`; comparison
observability keeps those execution failures separate from semantic labels.
The valid results show stable severity leniency, so repeated majority voting
over the same direct-label Judge cannot correct the systematic boundary.

This experiment therefore does not create a wording-only production prompt
`0.10`, add more repetitions, or introduce a word-context lexical exception.

## Architecture

The production path remains:

```text
criterion
-> LLM directly chooses PASS / PARTIAL / FAIL
```

The experimental path is:

```text
criterion
-> developer-authored explicit MaterialRequirement[]
-> LLM assesses each requirement atomically
-> strict ownership-aware parser
-> deterministic aggregation
-> PASS / PARTIAL / FAIL
```

The LLM may return only:

- `SATISFIED`
- `OMITTED_OR_INCOMPLETE`
- `EXPLICIT_CONFLICT`

It cannot return or override the final rubric label. Requirement decomposition
is not performed by a runtime LLM: requirements are developer-authored fixture
data or must be supplied explicitly by a caller.

## Contract and deterministic policy

`MaterialRequirement` has a stable, non-empty `id` and a non-empty
`description`. IDs must be unique within their owning rubric. The independent
`MaterialRequirementJudgeResult` uses schema version `1` and contains only the
case ID, rubric ownership, requirement IDs, atomic statuses, and optional short
visible-response evidence. That constant versions the result schema, so adding
required input context does not change it.

`MaterialRequirementJudgeInput` carries the same relevant case-scoped evidence
as production `TutorEvalJudgeInput`: learning objective, serialized student
profile and conversation history, student message, problem context, serialized
ground truth, known misconception, and disclosure policy. The experimental
rubric remains limited to `id`, `criterion`, and explicit `requirements`; it
does not copy production grading metadata.

The parser fails closed when a rubric or requirement is missing, duplicated,
unexpected, assigned to the wrong rubric, or has an invalid status. Extra
fields are rejected, so provider reasoning, hidden chain of thought, and raw
provider payloads cannot enter this artifact.

Aggregation is a pure function:

1. Any `EXPLICIT_CONFLICT` derives `FAIL`.
2. All `SATISFIED` derives `PASS`.
3. A mixture of `SATISFIED` and `OMITTED_OR_INCOMPLETE`, with no conflict,
   derives `PARTIAL`.
4. Zero `SATISFIED`, with no conflict, derives `FAIL`.

The final rule prevents a response that satisfies none of a criterion's
material requirements from receiving `PARTIAL` merely because every defect was
classified as omission.

## Synthetic fixtures and report semantics

The `word-context@0.1.1` fixture explicitly defines four requirements for the
current correctness criterion. Atomic expectations derive:

- A: all satisfied -> `PASS`
- B: limitation omitted, other requirements satisfied -> `PARTIAL`
- C: the required limitation and the non-conclusive interpretation boundary are
  explicitly contradicted -> `FAIL`

The C annotation now marks both R3 and R4 `EXPLICIT_CONFLICT`. The response's
claim that reluctant "definitely means unwilling here" reaches a definitive
lexical conclusion: it conclusively displaces the student's proposed
interpretation instead of keeping the underdetermined context boundary open.
R3 already independently derived `FAIL`, so this developer-authored diagnostic
expectation correction does not change the derived label or benchmark semantics.

The independent `measurement-trend@0.1.1` fixture proves the same generic
pattern outside language learning:

- comparison + limitation + another-observation request -> `PASS`
- limitation omitted -> `PARTIAL`
- claim that two observations prove a trend -> `FAIL`

Reports show each expected and observed atomic status, atomic agreement or
disagreement, and the separately derived expected and observed rubric labels.
These are developer-authored `synthetic-fixture` expectations with
`calibrationStatus: uncalibrated`; agreement is not accuracy, human verification,
or gold-label evidence.

The provider-free structural harness is available through:

```text
tutorbench judge-material-requirement-discrimination
```

It injects atomic fixture results and exercises parsing plus aggregation. It
makes no live provider calls and is a contract regression, not semantic model
evidence. This provider-free structural harness can use simplified injected
logic, but live semantic assessment requires context-complete input. The
word-context fixture therefore loads the canonical
`tutor-eval-v0.2a@0.2a.5` `language-word-context-001@1.1.1` case and uses the
production Judge serialization convention; the measurement fixture declares
its complete minimal synthetic context explicitly.

## Preserved production boundaries

This experiment does not change:

- production Judge prompt `tutor-eval-pedagogy-judge-system@0.9`
- production `TutorEvalJudgeResult` schema version `1`
- TutorEval dataset `tutor-eval-v0.2a@0.2a.5`
- word-context case version `1.1.1`
- evaluator `0.3a.4`
- candidate comparison `0.1.1`
- scoring, thresholds, answer leakage, factual-error, insufficient-information,
  or critical-failure semantics

In particular, an ordinary rubric-level material conflict derives rubric
`FAIL`; it does not synthesize a policy-level critical failure.

The new experimental identities are:

- Material Requirement Judge result schema: `1`
- prompt: `tutor-eval-material-requirement-judge-system@0.1`
- diagnostic and both synthetic fixtures: `0.1.1`

## Low-cost live follow-up

A later, separately scoped probe may add a provider adapter only after verifying
that the experimental input carries the same relevant case-scoped evidence as
the production Judge input. The smallest useful live check is one
temperature-zero, non-thinking V4-Flash pass over the six fixed responses
(A/B/C plus the three measurement/trend cases), with the explicit requirements
supplied unchanged. It should record only validated atomic statuses and short
visible-response evidence, then derive labels locally. Transport failures must
remain separate from semantic results. Repetition should be added only after
this single pass shows whether atomic semantic recognition is the remaining
failure mode.
