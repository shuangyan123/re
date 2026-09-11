# TutorBench Measurement Claim Specification

Status: research boundary / Developer Preview

This document defines what current TutorBench results may and may not be claimed to measure. It does not change evaluator semantics, case rubrics, scoring weights, thresholds, datasets, or release behavior.

The boundary is informed by the September 2026 external research audit of the framework and is intentionally narrower than a general claim of teaching effectiveness.

## Target construct

The current canonical TutorEval is best treated as a benchmark of **observable tutoring behavior in specified, authored scenarios**.

For a fixed benchmark version, case distribution, Tutor-visible input, evaluator version, and scoring procedure, TutorBench can describe the extent to which a Tutor response satisfies the observable pedagogical requirements encoded by the applicable case rubrics and whether specified critical failures are detected.

This is primarily evidence about **contextualized response behavior**. It is not yet a validated general scale of tutoring competence and it is not a direct measure of learning effectiveness.

## Unit of evidence

The current canonical runner evaluates one Tutor response for one authored case/run. A case may contain a preset conversation history, but the current public TutorEval 0.2A corpus does not provide non-empty conversation histories.

Repeated runs provide repeated response samples. They do not by themselves constitute a multi-turn instructional episode or evidence of longitudinal learner-state tracking.

English and zh-CN records linked by `crossLocaleGroupId` are paired versions of the same concept design. They must not be treated as independent concept items for claims that depend on item count or content coverage.

## Supported claims

Subject to the exact versions and evidence reported, statements of the following form are in scope:

- A model response satisfied or failed specified case rubric requirements under the declared evaluator and scoring procedure.
- A model exhibited or avoided specified observable behaviors represented by the applicable categories, capability tags, prohibited requirements, and critical-failure rules.
- Category, capability, gate, error, and overall outputs describe performance on the declared benchmark suite and configuration.
- Differences between runs, models, or evaluator versions may be reported as benchmark-result differences when provenance and coverage are preserved.

The current `overallScore` may be retained as a **versioned descriptive summary for the applicable benchmark suite**. It must not be presented as a validated latent measure of general teaching ability or expected learner gain.

A `qualityGate` PASS is a benchmark decision under the current rule set. It is not a certification of instructional safety, professional competence, or real-world learning effectiveness.

## Unsupported claims

Current TutorBench evidence does not by itself support claims that:

- a higher-scoring model causes students to learn more;
- a PASS result proves improved student agency, independence, retention, transfer, conceptual change, or metacognition;
- the benchmark establishes general tutoring competence across disciplines, learner stages, cultures, languages, or interaction horizons;
- independent repeated runs demonstrate multi-turn or longitudinal personalization;
- Judge-human agreement, repeated Judge stability, or expert preference is sufficient evidence of learning effectiveness;
- English and zh-CN scores are directly comparable as a common measurement scale merely because cases are translated or paired;
- a benchmark score is a professional qualification or safety certification in high-stakes domains.

Claims about immediate learning, near/far transfer, delayed retention, conceptual change, metacognition, or learner independence require learner outcome evidence appropriate to those constructs. Causal claims require an appropriate study design and cannot be inferred from transcript rubric scores alone.

## Scoring interpretation

The current scoring and gating rules are versioned benchmark semantics, not empirically calibrated educational laws.

In particular:

- `PASS / PARTIAL / FAIL` and their numeric aggregation remain historical benchmark rules unless separately validated for a new use;
- category aggregation and `overallScore` do not establish that categories are independent or commensurate latent traits;
- the required-only threshold is a compensatory benchmark rule and should not be re-described as a validated ability cut score;
- critical failures remain separately reported and must not be interpreted as a single homogeneous psychological construct;
- `ERROR` means the run could not be validly scored under the declared procedure and must not be silently converted into a low score or success.

No new fixed weights, thresholds, or psychometric model are authorized by this specification.

## Cross-domain and cross-locale boundary

Subject labels provide discovery and slicing but do not by themselves define what counts as valid evidence or reasoning in every discipline. Cross-domain comparability requires additional content and measurement evidence.

Cross-locale pairing is a useful design and audit mechanism, but semantic alignment is necessary before score comparison and measurement invariance requires separate evidence. A translation pair is not automatically an equivalent measurement item.

## Multi-turn and longitudinal boundary

Single-turn response quality, multi-turn tutoring quality, and longitudinal tutoring competence are distinct measurement targets.

A future multi-turn or longitudinal module must observe state transitions and subsequent learner evidence rather than treating a longer prompt history as sufficient proof of dynamic adaptation. Any future simulator outcome must remain explicitly distinct from observed human learner outcomes unless separately validated.

## Reporting requirements

Public or research-facing result summaries should identify, where applicable:

- dataset and taxonomy versions;
- evaluator / Judge version;
- model identity and snapshot;
- prompt / generation profile;
- applicable categories and coverage;
- error and quality-gate status;
- locale and relevant case grouping;
- known validation limitations.

Profile reporting, coverage, error/gate status, and raw rubric evidence should take precedence over an unqualified single-number interpretation.

## Change control

Changes to this measurement boundary should be reviewed separately from evaluator or dataset changes. New constructs such as `DisciplineProfile`, broader epistemic reliability, multi-axis difficulty, multi-turn episode evidence, or new aggregation models remain research candidates until independently piloted and validated.

The September 2026 external research audit should be read as a research input, not as an automatic schema migration or scoring specification.
