# Roadmap

## 0.1 Benchmark Foundation and TutorEval — COMPLETE

- Typed provider-independent contracts
- Runtime validation for synthetic scenarios and rubrics
- Deterministic evaluators and direct-answer leakage proxy
- Scripted synthetic adapter
- Failure-isolating benchmark runner
- Console and JSON reporting
- TutorEval case/hidden-annotation separation
- Disclosure-aware answer-leakage proxy
- Atomic teaching rubrics and centralized category aggregation
- Critical-failure quality gates and complete versioned run records
- Repeated case runs and reserved counterfactual pair identity
- Contract tests, Node 22 CI, and repository rules

## 0.2 Rubric & Dataset Design — PARTIAL: 0.2A dataset + 0.2B calibration infrastructure

- [x] Versioned pedagogical taxonomy and structured scenario difficulty
- [x] Curated 24-case synthetic dataset across five subjects
- [x] Atomic rubric authoring metadata and double-counting rules
- [x] Disclosure-policy coverage and counterfactual adaptation pairs
- [x] Dataset integrity validation and deterministic coverage report
- [x] Calibration contracts, blind packet export, agreement metrics, and adjudication boundary
- [ ] Independent human rubric review using real reviewers
- [ ] Adjudication and human reference generation using real reviewer data

## 0.3 LLM-as-Judge Calibration — PARTIAL: prompt contract only

- [x] Versioned v0.1 judge system prompt
- [x] Provider-independent judge input/output contracts
- [x] Pure pedagogy score and quality-gate calculations
- [x] Runtime validation for judge input and result JSON
- [ ] Judge provider adapter or real model calls
- [ ] Pairwise evaluation
- [ ] Judge-vs-human calibration using a real 0.2B reference set

## 0.4 Tutor Adapter Layer — NOT STARTED

- Review Workspace adapter
- Baseline prompts
- Model adapters

## 0.5 Statistical Evaluation — NOT STARTED

- Repeated runs
- Variance and confidence intervals
- Significance analysis

## 0.6 Regression Gate — NOT STARTED

- Baseline comparison
- Thresholds
- CI artifacts

## 0.7 Human Evaluation — NOT STARTED

- Annotation guide
- Inter-rater agreement

## 0.8 Benchmark Release / Stabilization — NOT STARTED
