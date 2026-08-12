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

## 0.2 Rubric & Dataset Design — NOT STARTED (beyond synthetic Foundation)

- Pedagogical dimensions beyond the initial TutorEval contract
- Broader dataset taxonomy and scenario difficulty
- Leakage, correctness, and guidance calibration
- [ ] Independent rubric review and calibration

## 0.3 LLM-as-Judge Calibration — PARTIAL: prompt contract only

- [x] Versioned v0.1 judge system prompt
- [x] Provider-independent judge input/output contracts
- [x] Pure pedagogy score and quality-gate calculations
- [x] Runtime validation for judge input and result JSON
- [ ] Judge provider adapter or real model calls
- [ ] Pairwise evaluation
- [ ] Calibration and human agreement

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
