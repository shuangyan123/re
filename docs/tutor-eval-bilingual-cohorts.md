# TutorEval bilingual cohort design

The current canonical dataset is an authored bilingual development cohort:

```text
tutor-eval-v0.2a@0.2a.6
  24 English cases
  24 zh-CN cases
  24 cross-locale cohort groups
```

The current `.6` dataset is composed from immutable `0.2a.5` English / zh-CN
snapshots plus a versioned two-case override for the
`fraction-misconception-001` pair. The current visible cohort remains available
through the canonical loader and the historical snapshots remain separately
addressable.

## Cohort identity and content boundary

`TutorEvalCase.crossLocaleGroupId` is the smallest additive identity needed to
join authored counterparts for grouping, audit, coverage, and future analysis.
The strict current loader requires each group to contain exactly one resolved
`en` case and one `zh-CN` case. A group means that the authors targeted the same
pedagogical construct across language contexts. After the semantic audit, the
pair is intended to represent a comparable learner state, but this is not
evidence of psychometric equivalence, measurement invariance, or human
validation.

English case IDs keep their existing identities. Their omitted `locale`
continues to resolve to `en`, preserving the legacy fallback. Chinese case IDs
use a `-zh-CN` identity suffix, and Chinese rubric IDs use the same suffix so
the existing dataset-wide rubric uniqueness guard remains strict.
Counterfactual adaptation pairs are also locale-local: for example,
`fraction-counterfactual-001` and `fraction-counterfactual-001-zh-CN` are
separate authoring pairs.

Chinese Tutor-visible content is authored as natural Simplified Chinese:
learning objectives, profile text, student messages, context, and any stored
conversation text. Machine-readable enums, capability tags, disclosure
policies, evaluator IDs, critical-failure types, deterministic configs, and
rubric structure remain aligned by construct rather than by literal wording.
Rubric criteria are localized for the Judge and human audit surface.

The language/verb case is an explicit language-specific boundary. Its Chinese
counterpart keeps an English subject-verb agreement sentence inside a natural
Chinese student question, because translating the grammar target into Chinese
would test a different linguistic construct. It is an authored counterpart for
the same broad language-teaching capability, not a claim of literal translation
equivalence.

The `0.2a.6` fraction correction makes one construct boundary explicit in both
locales. Diagnosis identifies the learner's direct addition of unlike
fraction denominators. Conceptual Guidance explains why the fraction units are
not directly compatible, and procedural Guidance scaffolds the learner toward
a common denominator. The prior Guidance weight `2` is split into conceptual
`1` and procedural `1`, preserving total Guidance weight for that case. This is
an **uncalibrated minimal structural choice**, not a validated educational
weighting.

## Interpretation boundary

The English cohort is used to observe tutoring performance in an
English-language context. The `zh-CN` cohort is used to observe tutoring
performance in a Chinese-language context. This is a language-context
breakdown, not a pure English-ability or Chinese-ability test: locale changes
student input, context, profile wording, subject terminology, diagnostic cues,
and response language. Score differences can also reflect Judge language
effects, residual case differences, sampling noise, and model stochasticity.

The `0.2a.6` correction is an owner-approved project design decision informed
by the research audit and Issue #109. It is not independent qualified bilingual
human validation, psychometric calibration, or evidence that prior locale
scores were statistically inequivalent.

## Versioning

| Identity | Current decision | Reason |
| --- | --- | --- |
| Dataset | `tutor-eval-v0.2a@0.2a.6` | Separates fraction misconception diagnosis, conceptual fraction-unit guidance, and procedural scaffolding while aligning Tutor-visible objective specificity. |
| Historical dataset | `tutor-eval-v0.2a@0.2a.5` | Immediate immutable bilingual snapshot retained before the fraction rubric-boundary correction. |
| Historical dataset | `tutor-eval-v0.2a@0.2a.4` | Previous canonical snapshot retained with the first word-context correction. |
| Historical dataset | `tutor-eval-v0.2a@0.2a.3` | Previous corrected bilingual snapshot retained for historical baselines. |
| Historical dataset | `tutor-eval-v0.2a@0.2a.2` | Explicit immutable bilingual snapshot retained for historical artifacts. |
| Historical dataset | `tutor-eval-v0.2a@0.2a.1` | Explicit loader path for the previous English-only snapshot. |
| Fraction pair | English and Chinese `fraction-misconception-001@1.2.0` | Rubric construct boundary and Tutor-visible objective changed in both locales. |
| Word-context pair | English and Chinese `language-word-context-001@1.1.1` | The rubric requires context-based checking, including what the pause clue supports and cannot establish, without assuming the proposal is correct or incorrect. |
| Other English case versions | Existing identities retained, including `language-verb-check-001@1.0.1` | No unrelated case semantics were changed. |
| Other Chinese case versions | Existing corrected identities retained (`1.1.0` where previously corrected, otherwise `1.0.0`) | No unrelated locale case semantics were changed. |
| Tutor prompt | `tutor-baseline-system@0.2` unchanged | The locale-aware prompt already consumes `targetLocale`. |
| Generation spec | `tutor-baseline-generation@0.4a.3` unchanged | No new generation controls or profile semantics were introduced. |
| Evaluator | `0.3a.4` unchanged | No scoring algorithm, threshold, category weighting, or quality-gate semantics changed. |
| Judge prompt | `tutor-eval-pedagogy-judge-system@0.9` unchanged | Existing material-requirement and critical-failure semantics are preserved. |
| Corpus schema | `1` unchanged | No corpus is rewritten or synthesized for this correction. |
| Evaluation/result schema | `1` unchanged | No result-schema change is required. |
| Public artifact | benchmark version `0.1`, artifact schema `1` unchanged | Dataset identity advances without changing the public artifact schema. |

Historical snapshots can be loaded explicitly:

```ts
const historicalEnglish = await loadTutorEvalDataset(
  "tutor-eval-v0.2a",
  "0.2a.1",
);
const historicalBilingual = await loadTutorEvalDataset(
  "tutor-eval-v0.2a",
  "0.2a.2",
);
const historicalCorrected = await loadTutorEvalDataset(
  "tutor-eval-v0.2a",
  "0.2a.3",
);
const historicalWordContextV1 = await loadTutorEvalDataset(
  "tutor-eval-v0.2a",
  "0.2a.4",
);
const historicalPreFractionBoundary = await loadTutorEvalDataset(
  "tutor-eval-v0.2a",
  "0.2a.5",
);
```

The loader does not infer a semantic migration from a historical snapshot to
`0.2a.6`.

## Reporting and auditability

The existing overall aggregation is unchanged. `buildTutorEvalLocaleBreakdowns`
groups the already-produced case results by resolved case locale and reuses the
existing category and overall aggregation helpers. It reports case count,
pass/fail/error, all five category scores, critical-failure rate, and answer
leakage rate for each locale. It does not compute a hidden 50/50 bilingual
score or replace the existing overall score.

Coverage reports expose `casesByLocale` and `crossLocaleGroupCount`. The public
Case Explorer exposes a locale filter with `All` / `English-language context` /
`Chinese-language context` (and `全部` / `英文语境` / `中文语境` in the
interface locale), and cards/details show the resolved target locale and
authored cohort group. The private audit index shows the same locale breakdown
and the audit detail preserves the actual stored Chinese Tutor response, Judge
evidence, raw Judge JSON, criteria, and critical failure fields. No automatic
translation is performed.

The developer-interface locale is independent from case locale. Switching the
website UI to Chinese does not filter English cases or translate their raw
responses; switching it to English does not translate Chinese responses.

## Compatibility and evidence limits

Historical corpus responses, response IDs, evaluation artifacts, and
calibration fixtures are not rewritten. The existing replay registry remains
the audited `0.2a -> 0.2a.1` language-case transition. With explicit replay
opt-in, old corpus and critical-calibration preparation resolve the historical
`.2a.1` target; they are never promoted into the corrected bilingual current
dataset.

No `0.2a.5 -> 0.2a.6` replay rule is added. The fraction correction changes
Tutor-visible learning-objective text, so historical `.5` responses remain
bound to `.5` by default. Earlier corrected bilingual snapshots likewise are
not silently migrated into `.6`, and no Chinese corpus or baseline result is
fabricated.

The cohort is synthetic and authored to target shared constructs. It has not
received independent human rubric review, Judge-vs-human calibration, or
statistical validation. A real Chinese corpus must be produced by a separately
authorized Tutor generation run. Public reporting must therefore preserve the
locale, dataset version, case version, evaluator version, Judge identity, and
coverage boundaries rather than treating the two locale cohorts as a validated
common scale.
