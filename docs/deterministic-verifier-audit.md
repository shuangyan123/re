# Deterministic Verifier Audit and Hardening

This document records the offline audit of the TutorEval v0.2a deterministic
rubrics. It is a verifier-correctness change, not model score tuning. The audit
used the checked-in synthetic dataset and the ignored local frozen response
corpus; no Tutor provider or Judge call is part of this work.

## Scope and identity

The audited path is:

```text
TutorResponseCorpus -> RecordedTutor -> TutorEval rubric partition
  -> deterministic evaluator / Judge-owned rubric -> result and quality gate
```

The audit reviewed all 26 v0.2a deterministic rubrics, all four rubrics marked
`critical`, the scoring and critical-failure path, and all 23 available
responses in the local partial corpus. The corpus remains immutable and ignored.

The dataset and case identity remain `tutor-eval-v0.2a@0.2a`; visible inputs,
case versions, rubric IDs, and criterion text are unchanged. Evaluation
semantics are explicitly identified by `evaluatorVersion: 0.3a.1` in new run
results. This lets the old evaluation artifact remain a historical pre-audit
result while the same frozen response evidence is replayed under a named
verifier revision. It must not be silently compared with an unversioned legacy
result or old calibration labels.

## Audit matrix

Before this audit, `contains_required_concept` performed a lowercased substring
check and `structured_keyword_coverage` counted lowercased substrings. A
`direct_answer_leak` was also a lowercased substring check, except that a full
solution policy short-circuited to PASS. The matrix describes those executable
conditions, not the rubric prose alone.

| Case / rubric | Category | Critical | Criterion | Evaluator and config | Executable proxy before audit | Criterion/proxy | FN / FP risk | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `correct-answer-wrong-reasoning-001` / `wrong-reasoning-answer-001` | correctness | no | Preserve the factually correct answer 12. | `matches_ground_truth`; accepted answer from hidden ground truth | Token-boundary presence of an accepted answer | Limited equivalence for answer presence, not assertion truth | negated answer / unrelated answer context | KEEP; harden answer matching against negation |
| `correct-answer-wrong-reasoning-001` / `wrong-reasoning-concept-001` | correctness | no | Explain multiplication with equal groups or repeated addition. | `structured_keyword_coverage`; `groups`, `repeated`, minimum 1 | At least one literal keyword | no | missing synonym or explanation; unrelated use of keyword | MOVE_TO_JUDGE |
| `correct-answer-wrong-reasoning-001` / `wrong-reasoning-diagnosis-001` | diagnosis | yes | Name that the correct answer has invalid multiplication reasoning. | `contains_required_concept`; `reasoning` | Literal `reasoning` substring | no | response uses explanation/method; any use of `reasoning` can pass | MOVE_TO_JUDGE |
| `fraction-misconception-001` / `fraction-actionability-001` | actionability | no | End with an independently executable next step. | `structured_keyword_coverage`; `find`, `first`, minimum 1 | One literal keyword is present | no | many valid next steps miss both words; filler can pass | MOVE_TO_JUDGE |
| `fraction-misconception-001` / `fraction-diagnosis-001` | diagnosis | no | Identify direct addition of unlike denominators. | `contains_required_concept`; `denominator` | Literal concept presence | no | concept can be mentioned without diagnosing the error | MOVE_TO_JUDGE |
| `fraction-misconception-001` / `fraction-guidance-001` | guidance | yes | Guide the student to seek a common denominator before computing. | `contains_required_concept`; `common denominator` | Exact phrase presence | no | valid explanation may defer the phrase; phrase alone does not prove guidance/order | MOVE_TO_JUDGE |
| `fraction-misconception-001` / `fraction-no-leak-001` | guidance | no | Do not reveal `7/12` under `hint_only`. | `direct_answer_leak`; forbidden `7/12` | Lowercased substring | no for spaced/formatted fraction; possible boundary ambiguity | NORMALIZE; bounded fraction/equation matching |
| `full-solution-check-001` / `full-solution-check-001` | actionability | no | Show a concrete substitution or verification step. | `contains_required_concept`; `check` | Literal `check` substring | no | `check` can be a filler word; substitution can omit it | MOVE_TO_JUDGE |
| `full-solution-check-001` / `full-solution-correctness-001` | correctness | no | State or verify `x=4`. | `contains_required_concept`; `x=4` | Exact substring | no | `x = 4` is missed; `x=40`/`2x=4` needs boundaries | NEW_DETERMINISTIC_CHECK |
| `full-solution-check-001` / `full-solution-disclosure-001` | guidance | no | Give the requested full solution when allowed. | `direct_answer_leak`; forbidden `x=4` | Under `full_solution_allowed`, unconditional PASS | no | empty or incomplete response can pass | MOVE_TO_JUDGE |
| `hint-only-linear-equation-001` / `equation-hint-no-leak-001` | guidance | yes | Give a first-step hint without stating `x=4`. | `direct_answer_leak`; forbidden `x=4` | Lowercased substring | formatting false negative; near-equation/negation ambiguity | NORMALIZE; conservative bounded expression leak check |
| `hint-only-linear-equation-001` / `equation-hint-next-step-001` | actionability | no | Tell exactly which reversible operation comes first. | `contains_required_concept`; `subtract` | Literal operation word | no | “undo” can be valid; unrelated use can pass | MOVE_TO_JUDGE |
| `history-source-context-001` / `history-source-concept-001` | correctness | no | Explain how perspective and context shape an account. | `contains_required_concept`; `perspective`, `context` | Both literal concepts present | no | no relation or explanation is checked | MOVE_TO_JUDGE |
| `language-word-context-001` / `language-word-context-001` | correctness | no | Explain how surrounding context supports meaning. | `contains_required_concept`; `context` | Literal concept presence | no | no contextual reasoning is checked | MOVE_TO_JUDGE |
| `paired-fraction-conceptual-001` / `paired-fraction-conceptual-action-001` | actionability | no | Give one concrete next step instead of a full solution. | `contains_required_concept`; `try` | Literal word presence | no | valid imperative can omit it; filler can pass | MOVE_TO_JUDGE |
| `paired-fraction-conceptual-001` / `paired-fraction-conceptual-guidance-001` | guidance | no | Use a comparison that supports reasoning about equal units. | `structured_keyword_coverage`; `unit`, `whole`, `question`, minimum 2 | Two literal keywords present | no | no comparison or reasoning relation is checked | MOVE_TO_JUDGE |
| `paired-fraction-procedural-001` / `paired-fraction-procedural-action-001` | actionability | no | Give one executable next operation. | `contains_required_concept`; `add` | Literal word presence | no | operation may be unrelated or absent under valid wording | MOVE_TO_JUDGE |
| `paired-fraction-procedural-001` / `paired-fraction-procedural-guidance-001` | guidance | no | Ask for the numerator operation as the next small step. | `contains_required_concept`; `numerator` | Literal concept presence | no | no request, ordering, or operation is checked | MOVE_TO_JUDGE |
| `programming-function-recall-001` / `programming-function-correctness-001` | correctness | no | Distinguish passed-in values from returned values. | `contains_required_concept`; `input`, `return` | Both literal concepts present | no | terms can be listed without distinction | MOVE_TO_JUDGE |
| `programming-off-by-one-001` / `programming-off-by-one-check-001` | guidance | no | Ask the student to check index against array length. | `contains_required_concept`; `check` | Literal concept presence | no | no index/length relation or request is checked | MOVE_TO_JUDGE |
| `programming-off-by-one-001` / `programming-off-by-one-diagnosis-001` | diagnosis | no | Identify last valid zero-based index as length minus one. | `contains_required_concept`; `zero`, `length` | Both literal concepts present | no | no arithmetic relation is checked | MOVE_TO_JUDGE |
| `science-density-knowledge-001` / `science-density-correctness-001` | correctness | no | State the density relation between mass and volume. | `contains_required_concept`; `mass`, `volume` | Both literal concepts present | no | no relation, formula, or direction is checked | MOVE_TO_JUDGE |
| `science-photosynthesis-concept-001` / `science-photosynthesis-concept-001` | correctness | no | Explain light as energy for a process using carbon dioxide. | `structured_keyword_coverage`; `light`, `carbon dioxide`, minimum 2 | Both literal concepts present | no | no causal relation or process correctness is checked | MOVE_TO_JUDGE |
| `weak-foundation-fractions-001` / `weak-foundation-actionability-001` | actionability | no | Ask for one concrete check or drawing next. | `structured_keyword_coverage`; `draw`, `check`, minimum 1 | One literal keyword present | no | valid action wording can miss both; filler can pass | MOVE_TO_JUDGE |
| `weak-foundation-fractions-001` / `weak-foundation-adaptation-001` | adaptation | no | Use beginner-friendly concrete whole/equal-parts language. | `structured_keyword_coverage`; `whole`, `equal`, minimum 2 | Both literal keywords present | no | no beginner suitability or explanation quality is checked | MOVE_TO_JUDGE |
| `weak-foundation-fractions-001` / `weak-foundation-guidance-001` | guidance | no | Break the explanation into understandable steps. | `contains_required_concept`; `step` | Literal `step` substring | no | structured explanation can omit the word; `stepmother` can match before hardening | MOVE_TO_JUDGE |

After the change, only four rubrics remain deterministic: the accepted-answer
presence check, two answer-leakage checks, and the bounded normalized-expression
check. The dataset has 59 Judge-owned rubrics. This is an ownership correction,
not a synonym expansion.

## Frozen-response review

The local corpus contains 23 of 24 planned cases. All 23 response texts were
reviewed offline; the missing photosynthesis case was not treated as evidence.
The 12 selected cases that had deterministic rubrics before the audit were:

```text
correct-answer-wrong-reasoning-001
fraction-misconception-001
full-solution-check-001
hint-only-linear-equation-001
history-source-context-001
language-word-context-001
paired-fraction-conceptual-001
paired-fraction-procedural-001
programming-function-recall-001
programming-off-by-one-001
science-density-knowledge-001
weak-foundation-fractions-001
```

The remaining 11 available cases already had only Judge-owned rubrics and their
existing Judge-unavailable errors are unchanged by this audit:

```text
history-cause-check-001
history-source-bias-001
language-evidence-argument-001
language-verb-check-001
paired-multiplication-conceptual-001
paired-multiplication-procedural-001
programming-abstraction-transfer-001
programming-loop-diagnosis-001
programming-test-failure-001
science-force-transfer-001
science-graph-error-001
```

The four reported deterministic failures were interpreted as follows:

| Case | Offline conclusion |
| --- | --- |
| `full-solution-check-001` | Confirmed verifier false negative for `x = 4` versus configured `x=4`; the new expression evaluator passes harmless whitespace/wrapper variants and rejects `x=5`, `x=40`, `2x=4`, `x≠4`, and negated `not x=4`. |
| `weak-foundation-fractions-001` | The response provides concrete whole/equal-part explanation and a check without the literal word `step`; the old result was a proxy failure, not reliable evidence of missing scaffolding. Ownership is moved to Judge. |
| `correct-answer-wrong-reasoning-001` | The response preserves the correct answer and explains equal groups, but the critical proxy required the word `reasoning`; the critical failure was not a defensible deterministic conclusion. Ownership is moved to Judge while the exact answer check remains deterministic. |
| `fraction-misconception-001` | The response identifies different-sized fraction units but does not deterministically establish the full “common denominator before computing” guidance or an independently executable next action. Both semantic criteria are Judge-owned; the audit does not force either one to PASS. |

## Regression and boundary policy

- Natural concept matching applies Unicode NFKC, case folding, whitespace
  normalization, and Unicode word boundaries. It does not add synonyms.
- Mathematical normalization is separate and bounded to simple variable-equals-
  number expressions and numeric fractions, including harmless spaces and basic
  wrappers. It rejects decimal or arithmetic continuations such as `x=4.5`,
  `x=4+1`, and `2*7/12`; it does not implement algebraic equivalence or a CAS.
- Direct answer leakage is conservative: a formatted or negated occurrence of a
  configured exact answer is still disclosure evidence. Near expressions such
  as `x=40`, `2x=4`, and `x≠4` are not treated as `x=4`.
- Positive, negative, and adversarial fixtures are synthetic and provider-neutral;
  no real response text is committed.
- `toTutorTurnInput()`, corpus identity, generation specs, provenance, ignored
  artifacts, no-retry behavior, and the hidden-data firewall are unchanged.
- Judge-owned rubrics remain unresolved `ERROR` without an explicitly supplied
  Judge. They are never converted into Tutor `FAIL`, and no calibration claim is
  made.

## Offline comparison record

The pre-audit local artifact recorded `selected=23`, `available=23`,
`missing=1`, `passed=0`, `failed=4`, `errors=19`, `criticalFailureRate=4.35%`,
and `answerLeakageRate=0.00%`. The post-audit values are recorded below after
replaying the same corpus with the evaluator version shown above.

<!-- POST_AUDIT_RESULTS_BEGIN -->
Post-audit evaluation (`evaluatorVersion: 0.3a.1`): `selected=23`,
`available=23`, `missing=1`, `passed=0`, `failed=0`, `errors=23`,
`criticalFailureRate=0.00%`, and `answerLeakageRate=0.00%`. The four former
deterministic failures are now unresolved Judge-owned cases, except that
`full-solution-correctness-001` independently passes the normalized `x = 4`
check before the case becomes an error because its other semantic rubrics have
no Judge. No Tutor or Judge call occurred during this replay.
<!-- POST_AUDIT_RESULTS_END -->

The comparison is preliminary and uncalibrated. A 23/24 partial corpus is not a
full baseline, is not a stable model-performance estimate, and is not eligible
for a public leaderboard.
