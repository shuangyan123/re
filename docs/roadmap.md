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

## 0.2 Rubric & Dataset Design — PARTIAL: 0.2A dataset + 0.2B calibration infrastructure + critical-failure extension

- [x] Versioned pedagogical taxonomy and structured scenario difficulty
- [x] Curated 24-case synthetic dataset across five subjects
- [x] Atomic rubric authoring metadata and double-counting rules
- [x] Disclosure-policy coverage and counterfactual adaptation pairs
- [x] Dataset integrity validation and deterministic coverage report
- [x] Calibration contracts, blind packet export, agreement metrics, and adjudication boundary
- [x] Separate human critical-failure calibration contract, target registry, agreement, adjudication, and synthetic pipeline fixtures
- [ ] Independent human rubric review using real reviewers
- [ ] Independent human critical-failure review using real reviewers
- [ ] Adjudication and human reference generation using real reviewer data

## 0.3 LLM-as-Judge Calibration — PARTIAL: 0.3A hybrid + 0.3B OpenAI provider

- [x] Versioned v0.1 judge system prompt retained for compatibility
- [x] Versioned v0.2 Judge prompt contract
- [x] Provider-independent judge input/output contracts
- [x] Pure pedagogy score and quality-gate calculations
- [x] Runtime validation for judge input and result JSON
- [x] Rubric-owned deterministic/Judge routing
- [x] Provider-independent Judge execution boundary
- [x] Deterministic and Judge result merge with partial-evidence preservation
- [x] Opt-in OpenAI Responses API Judge provider with Structured Outputs
- [x] Bounded transport retry, timeout, refusal, and invalid-result handling
- [x] Dry-run/live CLI selection with no live calls in CI
- [ ] Pairwise evaluation
- [ ] Judge-vs-human calibration using a real 0.2B reference set

See [the 0.3A hybrid orchestration guide](tutor-eval-v0.3a.md) and [the 0.3B
provider guide](tutor-eval-v0.3b.md). The phase remains partial: the provider
is single-provider and opt-in, Judge results are not human-calibrated, and no
pairwise or statistical evaluation claim is included.

## 0.4 Tutor Integration Layer — PARTIAL: public runner + portable reproducibility + HTTP adapter

- [x] Stable versioned Tutor response corpus contract
- [x] Canonical TutorGenerationSpec with prompt SHA-256 identity and output limit
- [x] Canonical TutorExecutionPacket with deterministic messages and hidden-data firewall
- [x] Portable baseline-native-default generation profile without unsupported shared controls
- [x] Dry host executor for packet-to-corpus proof
- [x] Recorded/replay Tutor adapter
- [x] Tutor-visible case packet export and hidden-data firewall
- [x] Existing 0.2B calibration conversion
- [x] Direct generic Tutor runner and stable package-root public API
- [x] Provider-neutral external Tutor protocol documented and implemented as HTTP v1
- [x] Generic external HTTP adapter, `tutorbench run` CLI, and cross-language example
- [x] Product Tutor response collection with explicit product provenance and absent generation identity
- [x] Canonical model evidence execution boundary with exact packet transport and support attestation
- [ ] Optional Review Workspace integration
- [ ] Actual reviewed real-model baseline artifacts
- [ ] Broader model adapters if required

See [the 0.4A.2 generation and response corpus guide](tutor-eval-v0.4a.md) and
[the real-model evidence guide](real-model-baselines.md). The repository
remains independent from Review Workspace. Product collection and canonical
model collection consume separate provider-neutral boundaries; neither path
creates public model results automatically.
See [the product-boundary note](benchmark-product-boundary.md) for the
dependency map and public API classification.

## Public Delivery — PARTIAL

This is a separate package and website productization track. It consumes the
provider-independent benchmark through stable package and static, secret-free
artifact boundaries and does not change the methodology phases above.

- [x] Stable package-root API and `tutorbench` CLI
- [x] Generic external HTTP Tutor adapter and cross-language example
- [x] Package tarball allow-list and local consumer smoke without OpenAI
- [x] Release validation workflow with tag/version checking and artifacts
- [x] Static website build and GitHub Pages deployment workflow
- [x] Project-site base path support and generated artifact firewall
- [x] Read-only static website shell and Developer Preview status
- [x] Public TutorEval case serializer with evaluator-only field exclusion
- [x] Coverage-backed case explorer and responsive route layout
- [x] Empty leaderboard, model, heatmap, and trial contracts without fake runs
- [x] Local adapter/corpus run guide and methodology limitations
- [ ] Public result artifact pipeline for reproducible model runs
- [ ] Public submission/review workflow (separate phase)
- [ ] First intentional npm package publication
- [ ] Reproducible real-model response collection

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
