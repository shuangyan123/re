# TutorEval bilingual cohort design

The current canonical dataset is an authored bilingual development cohort:

```text
tutor-eval-v0.2a@0.2a.2
  24 English cases
  24 zh-CN cases
  24 cross-locale cohort groups
```

The English cases remain in
`scenarios/tutor-eval-v0.2a/cases.json`. The new Chinese cases are independent
entries in `cases.zh-CN.json`; they do not replace an English case, reuse its
case ID, or create a Chinese frozen response for it.

## Cohort identity and content boundary

`TutorEvalCase.crossLocaleGroupId` is the smallest additive identity needed to
join authored counterparts for grouping, audit, coverage, and future analysis.
The strict current loader requires each group to contain exactly one resolved
`en` case and one `zh-CN` case. A group means that the authors targeted the same
pedagogical construct; it is not evidence that the two cases are scientifically
equivalent or that human reviewers have validated the pairing.

The English case IDs and visible text are unchanged. Their omitted `locale`
continues to resolve to `en`, preserving the legacy fallback and visible-input
fingerprints. Chinese case IDs use a `-zh-CN` identity suffix, and Chinese
rubric IDs use the same suffix so the existing dataset-wide rubric uniqueness
guard remains strict. Counterfactual adaptation pairs are also locale-local:
for example, `fraction-counterfactual-001` and
`fraction-counterfactual-001-zh-CN` are separate authoring pairs.

Chinese Tutor-visible content is authored as natural Simplified Chinese:
learning objectives, profile text, student messages, context, and any stored
conversation text. Machine-readable enums, capability tags, disclosure
policies, evaluator IDs, critical-failure types, deterministic configs, and
rubric structure remain stable. Rubric criteria are localized for the Judge and
human audit surface, while their category, weight, behavior, capability,
evaluator ownership, and critical mapping remain aligned with the English
counterpart.

The language/verb case is an explicit language-specific boundary. Its Chinese
counterpart keeps an English subject-verb agreement sentence inside a natural
Chinese student question, because translating the grammar target into Chinese
would test a different linguistic construct. It is an authored counterpart for
the same broad language-teaching capability, not a claim of literal translation
equivalence.

## Versioning

| Identity | Current decision | Reason |
| --- | --- | --- |
| Dataset | `tutor-eval-v0.2a@0.2a.2` | New locale-specific cases and cohort metadata change the canonical dataset content. |
| Historical dataset | `tutor-eval-v0.2a@0.2a.1` | Explicit loader path for the previous English-only snapshot. |
| English case versions | Unchanged, including `language-verb-check-001@1.0.1` | Existing case semantics and Tutor-visible input remain intact. |
| Chinese case versions | `1.0.0` | New independent case identities; no historical Chinese responses exist. |
| Tutor prompt | `tutor-baseline-system@0.2` unchanged | The locale-aware prompt already consumes `targetLocale`. |
| Generation spec | `tutor-baseline-generation@0.4a.3` unchanged | No new generation controls or profile semantics were introduced. |
| Evaluator | `0.3a.3` unchanged | Scoring, rubric ownership, and quality-gate semantics are reused. |
| Judge prompt | `tutor-eval-pedagogy-judge-system@0.3` unchanged | Chinese criteria are an authored case input, not a new provider or prompt contract. |
| Corpus schema | `1` unchanged | No corpus is rewritten or synthesized for the Chinese cohort. |
| Evaluation/result schema | `1` unchanged | `caseResults[].locale` is an optional additive field for v1 artifact readers. |
| Public artifact | benchmark version `0.1`, artifact schema `1` unchanged | Public serialization adds locale/cohort metadata within the existing read layer. |

The current dataset loader accepts the previous version only when requested
explicitly:

```ts
const historical = await loadTutorEvalDataset(
  "tutor-eval-v0.2a",
  "0.2a.1",
);
```

The loader does not infer a semantic migration from `0.2a.1` to `0.2a.2`.

## Reporting and auditability

The existing overall aggregation is unchanged. `buildTutorEvalLocaleBreakdowns`
groups the already-produced case results by resolved case locale and reuses the
existing category and overall aggregation helpers. It reports case count,
pass/fail/error, all five category scores, critical-failure rate, and answer
leakage rate for each locale. It does not compute a hidden 50/50 bilingual
score or replace the existing overall score.

Coverage reports expose `casesByLocale` and `crossLocaleGroupCount`. The public
Case Explorer exposes a locale filter with `All` / `English` / `Chinese` (and
`全部` / `英文` / `中文` in the interface locale), and cards/details show the
resolved target locale and authored cohort group. The private audit index shows
the same locale breakdown and the audit detail preserves the actual stored
Chinese Tutor response, Judge evidence, raw Judge JSON, criteria, and critical
failure fields. No automatic translation is performed.

The developer-interface locale is independent from case locale. Switching the
website UI to Chinese does not filter English cases or translate their raw
responses; switching it to English does not translate Chinese responses.

## Compatibility and evidence limits

Historical English corpus responses, response IDs, evaluation artifacts, and
calibration fixtures are not rewritten. The existing replay registry remains
exactly the audited `0.2a -> 0.2a.1` language-case transition. With explicit
replay opt-in, old corpus and critical-calibration preparation resolve the
historical `.2a.1` target; they are never promoted into the new bilingual
`.2a.2` target. No `.2a.1 -> .2a.2` replay rule was added, and no Chinese corpus
or baseline result was fabricated.

The cohort is synthetic and authored to target shared constructs. It has not
received independent human rubric review, cross-locale equivalence validation,
Judge-vs-human calibration, or statistical validation. A real Chinese corpus
must be produced by a separately authorized Tutor generation run. The public
website's full-copy localization remains follow-up work; this change localizes
the benchmark content, locale filter, reporting labels, and audit affordances
needed for this cohort.
