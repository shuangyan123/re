# TutorBench Evaluation Framework Research Audit — 2026-09

Status: external read-only research audit record

This record preserves the provenance and actionable conclusions of the external TutorBench Evaluation Framework / Pedagogy Taxonomy Research Audit completed on 2026-09-11. It does not modify evaluator semantics, datasets, rubrics, weights, thresholds, naming, or release behavior.

## Provenance

- Audited repository: `shuangyan123/tutorbench`
- Repository snapshot: `4f70545476267f46532477b3a23308d9052ed9ca`
- Audit date: 2026-09-11
- Source format: Markdown
- Source length: 697 lines
- Source SHA-256: `432c8027d44c0a7c6b6445459840eb59a8a307831f1e2db8e5b05305f2b0ed26`
- Scope: research and source audit only; no implementation changes were made by the auditor

The full source report contains 13 sections, a cross-disciplinary coverage review, scoring and psychometric analysis, validation planning, recent benchmark comparisons, and 40 research / standards references. This repository record intentionally preserves the audit as an external research input rather than silently converting all recommendations into project semantics.

## Executive conclusion preserved from the audit

The audit's central conclusion is that current TutorBench is best interpreted as a structured benchmark of **contextualized observable tutoring-response behavior**. It is not yet a validated general scale of AI tutoring competence and it is not a direct measure of learner outcomes.

The most defensible current use is to test whether a Tutor response, under a specified authored scenario and versioned evaluation procedure, satisfies specified pedagogical requirements and avoids specified critical failures.

Claims about general teaching competence, cross-domain ability, long-term personalization, or learning effectiveness require additional evidence.

## Confirmed implementation findings

The audit identified several implementation facts that should remain separately reviewable from future architecture proposals:

1. The historical AI Tutor Judge v0.1 and the current canonical TutorEval scoring path are distinct systems and must not be described as one shared weighting scheme.
2. The current public bilingual set contains 48 records representing 24 English / zh-CN concept pairs, not 48 independent concept designs.
3. The current public cases do not contain non-empty conversation histories, so the corpus does not directly test dynamic learner-state tracking or longitudinal adaptation.
4. Current semantic evaluation is primarily Judge-based, so Judge bias and human-reference validation remain material measurement risks.
5. A concrete English / zh-CN rubric mismatch exists for the `fraction-misconception-001` diagnosis requirement: the Chinese rubric adds a requirement to explain that the fraction units differ, while the English counterpart only requires identifying direct denominator addition. This is a confirmed text-level mismatch, not yet evidence of an observed score difference.
6. Current `groundTruth.finalAnswer` is optional; the framework does not require every task to have one unique final answer.
7. Current overall and PASS semantics are versioned benchmark rules rather than empirically calibrated educational scales.

## Methodological risks to track

The audit prioritizes five risks:

- construct / claim mismatch;
- unvalidated aggregation, compensation, and PASS thresholds;
- limited representativeness and evidence authenticity;
- common bias among rubric authors, Judges, and expected labels;
- unestablished cross-locale, cross-domain, and cross-stage comparability.

These risks should be treated as validation work, not as reasons to discard the current reproducible infrastructure.

## Design decisions worth preserving

The audit recommends retaining the following current design choices while their interpretation remains appropriately narrow:

- provider-independent scenario → adapter → evaluator → report boundaries;
- separation of Tutor-visible input and evaluator-only evidence;
- case-specific required / desirable / prohibited rubric structure;
- context-dependent disclosure policies rather than a universal hint-only rule;
- critical-failure gates reported separately from descriptive numeric scores;
- explicit ERROR, versioning, provenance, and human-review boundaries.

## Research candidates, not approved schema changes

The audit proposes several directions for future pilots, but these remain hypotheses / design candidates rather than approved TutorBench semantics:

- composable `DisciplineProfile` metadata for evidence and reasoning norms;
- broader epistemic-reliability evaluation for open or contested claims;
- multi-axis learner-stage and difficulty descriptions;
- splitting static learner/task fit from dynamic adaptation;
- distinguishing opportunities for student agency from observed learner agency;
- episode-level evidence contracts for multi-turn tutoring;
- profile-first reporting and psychometric validation before stronger overall-score interpretation.

These ideas must not be implemented merely because they appear in the audit.

## Explicit do-not-change-yet boundary

Pending independent validation, the audit recommends against:

- replacing current weights with a new fixed weighting scheme;
- merging or deleting dimensions solely because they correlate;
- globally removing agency, overhelping, or answer-leakage checks;
- forcing every task to be hint-only or every task to give a full solution;
- deleting optional `groundTruth` / `finalAnswer` fields;
- automatically rewriting bilingual cases without human review;
- converting every critical marker into a veto or every insufficient-information signal into failure;
- promoting experimental Material Requirement Judge behavior directly into production;
- substituting stronger or more numerous Judges for independent human references;
- applying complex IRT / MIRT to the current small paired corpus and treating fit statistics as validation;
- treating simulated learner progress as real learning outcomes;
- turning the audit's candidate "v0.3" architecture into an immediate repository-wide migration.

## Recommended validation sequence

The audit recommends progressing in stages:

1. construct and content review;
2. reviewer cognitive interviews and scoring-manual refinement;
3. independent blinded human-rating pilot;
4. bias and generalization stress tests;
5. structure and cross-group / cross-locale analysis;
6. real learner-outcome research for any learning-effect claims.

More cases alone cannot establish construct validity, criterion validity, measurement invariance, Judge calibration, or learning effectiveness.

## Current governance disposition

For the current project state:

- keep historical scoring semantics reproducible;
- treat `overallScore` as a versioned descriptive suite summary, not a validated general teaching-ability scale;
- prefer category / capability profiles, coverage, errors, gates, and raw rubric evidence in scientific interpretation;
- separate confirmed implementation issues from measurement hypotheses and future architecture proposals;
- resolve the confirmed bilingual rubric mismatch through an explicit human review rather than an automatic edit.

See also `docs/measurement-claim-specification.md` for the project-facing claim boundary derived from this audit.
