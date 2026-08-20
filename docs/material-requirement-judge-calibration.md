# Material Requirement Judge calibration experiment

## Status and motivation

This is an opt-in, provider-independent calibration experiment with an optional
explicitly configured live diagnostic. It does not replace the production
TutorEval Judge or change normal `tutorbench evaluate`.

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

## Pre-live wire-contract hardening

Prompt v0.1 established the atomic semantics and conflict precedence, but it
did not specify the wire JSON result shape that the model had to serialize.
That left a semantically correct response such as a flat `R1`/`R2` mapping
unable to pass the existing strict application parser.

Before the first paid live probe, prompt v0.2 adds the exact application-level
result contract: `schemaVersion`, the input `caseId`, one
`rubricAssessments` entry per supplied rubric, and one `requirements` entry per
supplied requirement under its original rubric. IDs must be copied exactly;
atomic statuses remain limited to the three values above; optional evidence is
limited to brief visible-Tutor-response evidence. Unknown fields, missing or
duplicate requirements, extra rubrics, Markdown fences, and prose outside the
single JSON object remain invalid.

This is interface hardening so the first live probe measures atomic semantic
recognition rather than an undocumented private serialization format. It is
not a change intended to move a model toward developer-expected atomic labels.
The runtime strict parser, deterministic aggregator, result schema, fixtures,
and expected statuses remain unchanged.

## First structured probe and v0.3 atomic boundary

The first structured Material Requirement probe used DeepSeek V4-Flash with
thinking disabled and temperature `0`. All six planned calls produced semantic
results, there were zero execution errors, and token usage was available for
all six calls with 7,633 total tokens. Against the developer-authored diagnostic
expectations, atomic agreement was 19/21 and derived-label agreement was 5/6:

| Fixture | Derived-label agreement |
| --- | --- |
| `word-context@0.1.1` | 2/3 |
| `measurement-trend@0.1.1` | 3/3 |

The two atomic disagreements exposed different generic classification errors:

- B-R3 was an inferred-satisfaction false positive. The Judge treated nearby
  comparison and conditional language as implying that the clue alone could
  not establish the exact meaning, although the Tutor response did not state
  that epistemic limitation or a clear semantic equivalent.
- C-R3 was a missed explicit conflict. The Tutor affirmatively claimed that the
  clue established unwillingness and "definitely" fixed the meaning, which
  cannot simultaneously be true with the required limitation. The Judge looked
  only for positive limitation wording and downgraded the contradiction to an
  omission.

Prompt v0.3 addresses only these two generic atomic boundaries. `SATISFIED`
requires explicit wording or a clear semantic equivalent and forbids supplying
a missing limitation from nearby comparisons, conditionals, hedging, requests,
or related cautions. Each requirement must be assessed against the entire
visible Tutor response; an affirmative conflict anywhere in that response is
`EXPLICIT_CONFLICT` even when the required positive wording is absent, and
conflict takes precedence over omission. No word-context lexical special case
is present.

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

The separate `atomic-boundaries@0.1.0` fixture isolates the v0.3 classification
boundary with one generic `M-LIMIT` requirement:

- a comparison plus conditional request for another check, without the
  insufficiency relation -> `OMITTED_OR_INCOMPLETE`
- an affirmative claim elsewhere that two observations prove a trend, followed
  by a request for another measurement -> `EXPLICIT_CONFLICT`
- an explicit statement that two observations are not enough to establish a
  trend -> `SATISFIED`

The synthetic Judge still returns only atomic statuses. Derived labels are
reported as secondary deterministic diagnostics, not supplied by the fixture
Judge or leaked in live Judge input.

Reports show each expected and observed atomic status, atomic agreement or
disagreement, and the separately derived expected and observed rubric labels.
These are developer-authored `synthetic-fixture` expectations with
`calibrationStatus: uncalibrated`; agreement is not accuracy, human verification,
or gold-label evidence.

The diagnostic has two explicit modes. The default provider-free structural
harness is available through:

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

The optional live mode is enabled only by `--judge-deepseek`:

```powershell
$env:DEEPSEEK_JUDGE_MODEL = "deepseek-v4-flash"
$env:DEEPSEEK_JUDGE_THINKING = "disabled"
$env:DEEPSEEK_JUDGE_TEMPERATURE = "0"
$env:DEEPSEEK_JUDGE_MAX_TOKENS = "4096"
node dist/src/cli/tutorbench.js judge-material-requirement-discrimination --fixture word-context --judge-deepseek --output artifacts/material-requirement-deepseek-flash-v0.3-word-context.json
```

Without that flag the command constructs no provider adapter and makes zero
provider calls. With it, the command fails before network activity when
`DEEPSEEK_API_KEY` or the concrete `DEEPSEEK_JUDGE_MODEL` is missing, prints
the provider/model and planned call count without secrets, and executes each
fixture case independently. A case-level execution error remains an error in
the report; it is never converted to an atomic status or `FAIL` label.

Live reports retain `dataKind: synthetic-fixture` and
`calibrationStatus: uncalibrated`. They include planned/completed calls,
semantic availability, execution-error counts by code, per-case latency and
sanitized token usage, plus known/complete token totals. Missing token usage is
unknown rather than zero, and a complete total is emitted only when every
planned call reports that field. Neither complete availability nor any live
result creates a calibration, accuracy, or winner claim.

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
- prompt: `tutor-eval-material-requirement-judge-system@0.3`
- diagnostic report: `0.2.0`
- existing `word-context` and `measurement-trend` fixtures: `0.1.1`
- new `atomic-boundaries` fixture: `0.1.0`

## Historical probe and next live strategy

The historical v0.2 structured probe made exactly six calls over the fixed
word-context A/B/C and measurement PASS/PARTIAL/FAIL cases. At that time,
`--fixture all` selected those six cases. Prompt v0.3 adds
`atomic-boundaries@0.1.0`, so `--fixture all` now plans nine calls and must not be
used accidentally as though it still represented the historical six-call
probe.

The minimum next live probe is three calls over only the word-context fixture:

```powershell
$env:DEEPSEEK_JUDGE_MODEL = "deepseek-v4-flash"
$env:DEEPSEEK_JUDGE_THINKING = "disabled"
$env:DEEPSEEK_JUDGE_TEMPERATURE = "0"
$env:DEEPSEEK_JUDGE_MAX_TOKENS = "4096"
node dist/src/cli/tutorbench.js judge-material-requirement-discrimination --fixture word-context --judge-deepseek --output artifacts/material-requirement-deepseek-flash-v0.3-word-context.json
```

If the next decision explicitly needs direct generic-boundary evidence, run
`--fixture atomic-boundaries` as a separate three-call targeted probe, for six
calls total across the two targeted commands. Do not automatically rerun all
nine cases or the full 48-case benchmark. This PR performs no live provider
call. The profile remains an operator diagnostic recommendation, not a
benchmark-wide model or generation mandate. Record only validated atomic
statuses, short visible-response evidence, sanitized telemetry, and locally
derived labels; transport failures remain separate from semantic results.
