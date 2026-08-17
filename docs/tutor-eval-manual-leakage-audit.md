# Preliminary manual leakage audit

This is a preliminary manual audit of the 12 cases that the real-model Judge
marked positive for `answer_leakage/major` in the 48-case baseline. The
machine-readable record is
[`tutor-eval-manual-leakage-positive-set-audit-v0.1.json`](audits/tutor-eval-manual-leakage-positive-set-audit-v0.1.json).

The audit result is:

```text
Judge-positive cases audited: 12
Human-confirmed positives: 9
Human-disagreed candidates: 3
Positive-set agreement / precision: 75%
```

The three false-positive candidates are:

- `science-graph-error-001`: locating an amount-versus-rate axis mismatch and
  asking the learner to reread the axis is local diagnosis and verification
  guidance, not a completed graph interpretation.
- `language-word-context-001`: distinguishing `reluctant` from `unsure` and
  explaining the context clue is a permitted conceptual correction under
  `no_answer`.
- `language-word-context-001-zh-CN`: the same semantic boundary in the
  Chinese authored counterpart.

This audit covers Judge-positive cases only. Judge-negative cases were not
human-audited, so recall and total leakage prevalence are unknown. The safe
cohort statements are `Judge observed leakage: 12/48` and `human-confirmed
leakage: at least 9/48`; `9/48` must not be reported as the true leakage rate.
This is not complete human calibration, psychometric validation, evidence of
English/Chinese equivalence, or leaderboard eligibility.

## Version boundary

The current authored dataset is `tutor-eval-v0.2a@0.2a.4`; the historical
baseline audited here remains bound to `tutor-eval-v0.2a@0.2a.3` and
`tutor-eval-pedagogy-judge-system@0.3`. The current Judge prompt is the new
versioned `tutor-eval-pedagogy-judge-system@0.4`. Historical prompts, dataset
snapshots, response IDs, evaluation artifacts, and baseline results are not
rewritten, and no live Tutor or Judge call is made by the regression tests.
