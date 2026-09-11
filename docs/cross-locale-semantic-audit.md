# TutorEval cross-locale semantic audit

This is a manual, case-by-case audit of the 24 authored `en` / `zh-CN`
`crossLocaleGroupId` pairs. It checks the Tutor-visible task, learner state,
ground truth, disclosure policy, rubric meaning, and critical-failure mapping.
It is a dataset-integrity record, not evidence of psychometric equivalence,
measurement invariance, human calibration, or statistical comparability.

## Interpretation boundary

The cohorts are intended to observe:

- tutoring performance in an English-language context; and
- tutoring performance in a Chinese-language context.

They are not pure English-ability or Chinese-ability tests. A locale can change
the student's input language, context, profile wording, subject terminology,
diagnostic cues, teaching strategy, and final response language. Differences in
scores may also reflect Judge language effects, residual case differences,
sampling noise, or model stochasticity.

`crossLocaleGroupId` means that the cases were authored to target the same
pedagogical construct across language contexts. After this audit, the pairs are
semantically audited and intended to represent comparable learner states; this
still does not claim scientific or human-validated equivalence.

The maintenance boundary is:

- strict invariants: numeric expressions, equations, code semantics, named
  factual objects, target answers, disclosure policy, rubric structure, and
  critical-failure type;
- semantic invariants: misconception, learner state, pedagogical objective,
  problem information, and rubric meaning; and
- allowed localization: natural wording, grade-level phrasing, translated
  terminology, and language-specific examples when the teaching target itself
  requires them.

## Audit outcome

The primary dispositions below are mutually exclusive. The P0 pair also had a
learner-state/context drift, but its primary disposition is factual/numeric.

| Primary disposition | Groups |
| --- | ---: |
| No substantive correction required | 9 |
| Minor wording or intentional language-specific adaptation | 4 |
| Learner-state or Tutor-visible information drift corrected | 10 |
| Factual/numeric inconsistency corrected | 1 |
| **Total** | **24** |

| Group | Outcome |
| --- | --- |
| `fraction-misconception-001` | Corrected the Chinese arithmetic task, profile, and context to match the English teaching construct. Ground truth remains `7/12`. See the `0.2a.6` amendment below for the later diagnosis/guidance rubric-boundary correction. |
| `hint-only-linear-equation-001` | Removed extra Chinese learner-state hints and aligned visible request/context and required steps. |
| `correct-answer-wrong-reasoning-001` | No correction; the arithmetic reasoning error and learner state align. |
| `paired-fraction-procedural-001` | No correction; operands, local procedural error, and next-step teaching target align. |
| `paired-fraction-conceptual-001` | No correction; the denominator/unit misconception and scaffolding target align. |
| `weak-foundation-fractions-001` | No correction; the part-whole learner state and concrete explanation target align. |
| `full-solution-check-001` | No correction; equation, answer-check request, and full-solution policy align. |
| `paired-multiplication-procedural-001` | Minor notation localization (`x` / `×`) without a semantic change. |
| `paired-multiplication-conceptual-001` | No correction; equal-groups construct and full-solution requirement align. |
| `science-density-knowledge-001` | Removed extra prior knowledge and an extra context constraint from the Chinese case. |
| `science-force-transfer-001` | Restored the same book-on-table example, learner state, and balanced-force truth target. |
| `science-photosynthesis-concept-001` | Aligned prior knowledge, explanation context, and required concepts while retaining the natural Chinese misconception wording. |
| `science-graph-error-001` | Aligned the Chinese graph claim and context with the English amount-axis/rate misconception. |
| `language-evidence-argument-001` | Removed an extra Chinese misconception and missing-source constraint; aligned the evidence truth anchor. |
| `language-verb-check-001` | Intentional language-specific adaptation: the English target sentence remains visible because translating it would change the grammar construct. |
| `language-word-context-001` | The English target word remains intentionally visible; surrounding-context wording is equivalent. |
| `history-source-context-001` | No correction; source perspective, chronology, and context target align. |
| `history-cause-check-001` | No correction; contributing-cause reasoning and evidence request align. |
| `history-source-bias-001` | Removed an extra Chinese instruction about separating fact from perspective. |
| `programming-loop-diagnosis-001` | Removed an extra Chinese instruction to trace state before the Tutor responds. |
| `programming-function-recall-001` | Removed an extra Chinese instruction about examples and programming-language choice. |
| `programming-test-failure-001` | Minor natural wording only; missing-output learner state and debugging request align. |
| `programming-off-by-one-001` | No correction; zero-based indexing, length, and learner misconception align. |
| `programming-abstraction-transfer-001` | Removed an extra Chinese prescription to start at the smallest reusable boundary. |

No case in this cohort contains conversation history or a code snippet. The
programming pairs were therefore checked for the same language/runtime-neutral
concept, bug, learner state, and expected fix rather than token-level source
identity.

## P0 regression

`fraction-misconception-001-zh-CN` now uses the same arithmetic instance as its
English counterpart:

```text
visible expression:       1/3 + 1/4
student incorrect answer: 2/7
ground truth finalAnswer: 7/12
acceptedAnswers:          ["7/12"]
leakage target:           7/12
```

The exact-answer regression test parses the bounded fraction-addition anchor,
checks both locale members, checks rational equivalence of `finalAnswer` and
`acceptedAnswers`, and checks every `direct_answer_leak` target. It intentionally
does not attempt to parse arbitrary natural-language mathematics.

## 0.2a.6 amendment — fraction diagnosis/guidance boundary

A later research audit and Issue #109 identified a remaining authored
material-requirement mismatch in the diagnosis rubric of the
`fraction-misconception-001` pair. The English diagnosis required identifying
that the learner directly added unlike denominators, while the Chinese
criterion additionally required explaining that the fractions have different
unit sizes. Under Judge v0.9's material-requirement semantics, that difference
could change the rubric label for the same substantive response. This is a
confirmed text/requirement mismatch; it is not evidence of an observed or
statistically significant locale score difference.

For `tutor-eval-v0.2a@0.2a.6`, the owner-approved project correction is:

- narrow `diagnosis` in both locales to identifying the direct-denominator-
  addition misconception;
- make the fraction-unit explanation a separate required `guidance` rubric
  tagged `conceptual_prompting`;
- keep procedural common-denominator scaffolding as a separate required
  `guidance` rubric;
- split the previous guidance weight `2` into conceptual `1` plus procedural
  `1`, preserving total guidance weight for the case; and
- align the Tutor-visible learning-objective specificity across the two locale
  members.

Both affected cases advance to version `1.2.0`. The `1 + 1` split is an
**uncalibrated minimal structural choice** made to avoid silently moving the
entire previous guidance weight onto either new target. It is not an empirical
claim that conceptual explanation and procedural scaffolding have equal
educational importance.

This amendment records an owner-approved project design decision informed by
the research audit and Issue #109. It is **not** independent qualified bilingual
human validation, psychometric calibration, measurement invariance evidence,
or proof that prior English and Chinese scores were inequivalent. The
`0.2a.5` assets remain immutable historical snapshots.

Because the `0.2a.6` correction changes Tutor-visible learning-objective text,
no `0.2a.5 -> 0.2a.6` semantic-replay bridge is introduced. Historical frozen
responses remain bound to their original dataset/case identities.

## Versioning and compatibility

The corrected canonical identity for the original cross-locale audit was
`tutor-eval-v0.2a@0.2a.3`.

The current dataset is `tutor-eval-v0.2a@0.2a.6`. It composes the immutable
`0.2a.5` bilingual snapshot with a versioned override for the two affected
fraction cases. `0.2a.5` remains loadable as the immediate historical snapshot;
`.2a.3` and `.2a.4` remain available for their prior audit and baseline uses.

The following remain explicitly loadable:

- `0.2a.1`, the historical English-only snapshot;
- `0.2a.2`, the immutable bilingual snapshot stored in
  `scenarios/tutor-eval-v0.2a/cases.zh-CN.0.2a.2.json`;
- `0.2a.3`, the immutable corrected bilingual snapshot stored in the matching
  versioned English and Chinese case files;
- `0.2a.4`, the immutable canonical snapshot containing the first word-context
  rubric correction; and
- `0.2a.5`, the immutable bilingual snapshot containing the refined
  word-context rubric immediately before the fraction diagnosis/guidance
  boundary correction.

The 11 Chinese cases changed by the original audit have version `1.1.0` unless
superseded by a later case-specific change. The word-context pair is `1.1.1` in
`0.2a.5` and remains so in `0.2a.6`; the two `fraction-misconception-001` locale
members are `1.2.0` in `0.2a.6`. Historical files and frozen response artifacts
are not rewritten. No replay rule was added for `0.2a.3 -> 0.2a.4`,
`0.2a.4 -> 0.2a.5`, or `0.2a.5 -> 0.2a.6`; changed Tutor-visible content
remains incompatible with historical responses by default.

The Review Translation Layer remains separate from case locale, Tutor input,
Judge input, scoring, fingerprints, corpus identity, and response IDs.
