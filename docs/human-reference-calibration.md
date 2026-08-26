# Material atomic human-reference calibration

## Status and protocol identity

This document defines the provider-independent calibration layer for the
experimental Material Requirement Judge. The protocol is:

```text
human-reference-material-calibration@0.1.0
```

The Material Requirement Judge prompt `@0.4` is frozen for this work. This
layer does not create prompt v0.5, call a provider, or convert the existing
developer-authored synthetic expectations into human reference data.

The contracts are implemented in
[`src/contracts/human-reference-calibration.ts`](../src/contracts/human-reference-calibration.ts)
and its strict parser in
[`src/contracts/human-reference-calibration-validation.ts`](../src/contracts/human-reference-calibration-validation.ts).
Deterministic agreement, reference construction, and Judge comparison live in
the material human-reference modules under
[`src/calibration`](../src/calibration).

## Shared visible evidence boundary

`HumanReferenceAnnotationTask` is the Material Requirement Judge input with a
calibration schema wrapper. It carries the same case ID, learning objective,
student profile, conversation history, student message, problem context,
ground truth context, known misconception, disclosure policy, Tutor response,
and explicit material rubrics/requirements.

It contains no expected atomic status, derived label, prior Judge result, Judge
evidence, previous annotation, or adjudicated reference. The strict parser
delegates the task body to the existing `MaterialRequirementJudgeInput`
parser, so a human annotator and the experimental Judge receive the same
visible semantic evidence boundary.

The optional `assertHumanAnnotatorTaskComplete()` check is strict for a single
annotator stream: every supplied rubric and requirement must occur exactly
once under its original owner. Batch ingestion may intentionally retain a
partial stream so missing availability can be reported separately.

## Atomic annotation contract

`HumanAtomicAnnotation` contains:

- schema version `1`;
- `caseId`, `rubricId`, and `requirementId`;
- an opaque stable `annotatorId`;
- exactly one of `SATISFIED`, `OMITTED_OR_INCOMPLETE`, or
  `EXPLICIT_CONFLICT`;
- optional short evidence, capped at 500 characters.

There is no fourth semantic status. If an annotator cannot complete a task,
that is represented by missing annotation availability, not by an `UNKNOWN`
status. Evidence is limited to brief, auditable text grounded in the visible
Tutor response. Names, email addresses, hidden reasoning, provider metadata,
and raw payloads are not accepted by the parser.

`HumanAnnotationBatch` records a batch ID, calibration protocol ID/version, tasks, and
annotations. Synthetic tests use `dataKind: "synthetic-fixture"` together
with `{ "synthetic": true, "notHumanCalibrationData": true }`; that marker is
never treated as human calibration evidence.

## Strict JSON persistence and local workflow

The pilot input files are ordinary JSON, but they are untrusted runtime data.
`parseHumanReferenceAnnotationFile()` and
`parseHumanReferenceAdjudicationFile()` reject malformed protocol identity,
unknown fields, duplicate identities, invalid statuses, wrong rubric owners,
hidden/provider fields, and invalid synthetic markers. A persisted
`HumanReferenceSet` is accepted only after the parser reconstructs every task
atom and verifies that references, unresolved disagreements, and missing
annotations form an exact non-overlapping partition. Coverage counts and
`referenceCoverageShare` are recomputed from the task requirements; supplied
totals are never trusted.

The provider-free local command is:

```text
tutorbench human-reference-calibration \
  --annotations fixtures/human-reference-calibration/synthetic-annotations.json \
  --adjudications fixtures/human-reference-calibration/synthetic-adjudications.json \
  --output artifacts/human-reference-calibration-report.json
```

It performs no Tutor or Judge call. The report contains human-human agreement,
reference coverage, resolved references, unresolved disagreements, missing
annotations, and labels derived only from fully resolved rubrics. It does not
claim accuracy or emit a calibrated score. `humanReferenceDataPresent` is the
clear report-level provenance field. The existing
`HumanReferenceSet.humanCalibrationAvailable` field is retained for contract
compatibility, but is provenance-only (`dataKind === "human-reference"`); it
does not mean complete coverage, readiness, or Judge calibration.

These states remain distinct:

```text
valid JSON set -> may be incomplete -> complete coverage -> separate Judge/reference agreement
```

Complete coverage is still not a calibration claim. Only a separately approved
human pilot with documented reviewers, adjudication, and validation can support
calibration readiness; readiness is not inferred by any automatic coverage
threshold. The checked-in files under
`fixtures/human-reference-calibration/` are synthetic regression fixtures, not
human annotations.

## Running the first blind human pilot (historical and frozen)

The first pilot is intentionally limited to the fixed three-response
word-context diagnostic: three visible Tutor responses and twelve atomic
requirements, completed independently by two annotators. Export it with:

```text
npm run build
node dist/src/cli/tutorbench.js human-reference-pilot-export \
  --fixture word-context \
  --annotator annotator-a \
  --annotator annotator-b \
  --output-dir artifacts/human-reference-pilot/word-context-001
```

The command writes two packets, two matching editable submission templates,
and one shared guide:

```text
artifacts/human-reference-pilot/word-context-001/annotator-a.packet.json
artifacts/human-reference-pilot/word-context-001/annotator-a.submission-template.json
artifacts/human-reference-pilot/word-context-001/annotator-b.packet.json
artifacts/human-reference-pilot/word-context-001/annotator-b.submission-template.json
artifacts/human-reference-pilot/word-context-001/ANNOTATION_GUIDE.md
```

Give only the A packet and matching A template to annotator A, and only the B
packet and matching B template to annotator B. Both annotators receive the same
`ANNOTATION_GUIDE.md`. The packets have the same allowlisted visible evidence:
case identity, learning objective, learner/context fields, Tutor response,
rubric, and explicit atomic requirements. Packets do not contain developer
expected labels, Judge output/evidence/reasoning, provider metadata, prior
annotation, or adjudication. The task-set fingerprint binds a completed
submission to the exported packet set.

The submission templates are editable working documents, not canonical
`HumanReferencePilotSubmission` values. They already contain the pilot, batch,
protocol, fingerprint, annotator identity, and one empty-status slot for every
visible atomic requirement. The strict completed-submission parser must reject
an untouched template because `status` is empty; do not change that parser or
use a template as imported evidence.

Each annotator should:

1. receive only their matching packet and submission template;
2. read the shared `ANNOTATION_GUIDE.md`;
3. inspect each visible atomic requirement independently;
4. replace every empty `status` with `SATISFIED`, `OMITTED_OR_INCOMPLETE`, or
   `EXPLICIT_CONFLICT` according to the guide;
5. optionally add a short `evidence` field grounded only in the visible Tutor
   response; and
6. save the completed file as
   `annotator-a.completed.json` or `annotator-b.completed.json`.

No technical IDs need to be copied by hand. Evidence is optional and capped at
500 characters; leave the optional field absent when no evidence is recorded.
For a real pilot keep `dataKind: "human-annotation"` and do not add a synthetic
fixture marker. Synthetic provider-free tests may instead use
`dataKind: "synthetic-fixture"` plus both marker fields, and their output is
never human-reference evidence. Do not exchange completed files until both
annotators have finished.

After both annotators finish, import only the two submissions:

```text
node dist/src/cli/tutorbench.js human-reference-pilot-import \
  --packet-dir artifacts/human-reference-pilot/word-context-001 \
  --submission artifacts/human-reference-pilot/word-context-001/annotator-a.completed.json \
  --submission artifacts/human-reference-pilot/word-context-001/annotator-b.completed.json \
  --output artifacts/human-reference-pilot/word-context-001/human-reference-annotations.json
```

Import fails closed for missing, duplicate, unexpected, stale, or wrong-owner
atoms; mismatched pilot/protocol/fingerprint; wrong annotator identity; extra
fields; unsupported statuses; and oversized evidence. It converts the two
complete submissions to the existing `HumanReferenceAnnotationFile` and
re-parses that canonical file before writing it. Import does not adjudicate,
majority-vote, consult developer expectations, or derive a semantic winner.

Run the existing calibration workflow without adjudications first:

```text
node dist/src/cli/tutorbench.js human-reference-calibration \
  --annotations artifacts/human-reference-pilot/word-context-001/human-reference-annotations.json \
  --output artifacts/human-reference-pilot/word-context-001/human-reference-report.json
```

The operational lifecycle is:

1. export the pilot, templates, and shared guide;
2. give A's packet/template only to annotator A;
3. give B's packet/template only to annotator B;
4. have both annotators complete submissions independently;
5. import and merge the two submissions;
6. run `human-reference-calibration` without adjudications;
7. inspect human-human agreement first;
8. adjudicate disagreements separately;
9. rerun calibration with explicit adjudications;
10. only after human reference exists, compare Material Requirement Judge v0.4 against that reference.

Human-human agreement comes before Judge agreement. High agreement with
developer-expected labels is not evidence of calibration. Complete reference
coverage is not automatically calibration readiness, and no automatic
threshold turns this pilot into “calibrated”. This workflow provides packet
export, editable submission templates, a neutral shared annotation guide, and
strict submission import; a dedicated disagreement-only adjudication template
is a separate follow-up.

Pilot #1 is a frozen historical experiment. Its source remains
`word-context@0.2.0`, its three A/B/C Tutor responses and twelve atomics remain
unchanged, and re-export continues to use blind-pilot protocol `@0.1.0` plus
the original guide semantics. Existing v0.1.0 packets and completed
submissions remain valid; they are not rewritten to include later guide fields.

## Running boundary-focused Human Reference Pilot #2

Pilot #2 tests whether two independent annotators apply atomic annotation
boundaries consistently. It does not test or tune the Judge. Its independent
synthetic source is:

```text
word-context-human-boundaries@0.1.0
```

The pilot uses six short Tutor-response cases, the same four visible R1–R4
atomic requirement descriptions per case, and therefore 24 decisions per
annotator (48 for two annotators). The cases isolate these boundaries:

- explicit evaluation of the student's proposed meaning against context;
- clue discussion without a relation back to the proposed meaning;
- clue support separated from an explicit overstatement of sufficiency;
- omission of the evidence-sufficiency limitation without an explicit conflict;
- context-grounded correction, which is not automatic rejection; and
- an unsupported direct verdict, which can explicitly conflict with R4.

Pilot #2 uses blind-pilot protocol `@0.2.0`. Its packet, editable template, and
completed submission bind the clarified neutral guide as:

```text
human-reference-material-annotation-guide@0.2.0
```

That binding prevents a guide from being silently replaced under the same
pilot identity. The historical v0.1.0 envelope is unchanged and deliberately
has no retroactively added guide fields.

Export Pilot #2 with:

```text
npm run build
node dist/src/cli/tutorbench.js human-reference-pilot-export \
  --fixture word-context-human-boundaries \
  --annotator annotator-a \
  --annotator annotator-b \
  --pilot-id human-reference-word-context-boundaries-002 \
  --output-dir artifacts/human-reference-pilot/word-context-boundaries-002
```

The command writes the same five file roles as Pilot #1: two identical-task
packets with different opaque annotator owners, two empty-status submission
templates, and one shared `ANNOTATION_GUIDE.md`. The blindness allowlist is
unchanged: no developer expected status, derived benchmark label, Judge
result/evidence/reasoning, provider metadata, other annotator data, or
adjudication enters a packet, template, or guide.

After both annotators finish independently, import exactly two complete files:

```text
node dist/src/cli/tutorbench.js human-reference-pilot-import \
  --packet-dir artifacts/human-reference-pilot/word-context-boundaries-002 \
  --submission artifacts/human-reference-pilot/word-context-boundaries-002/annotator-a.completed.json \
  --submission artifacts/human-reference-pilot/word-context-boundaries-002/annotator-b.completed.json \
  --output artifacts/human-reference-pilot/word-context-boundaries-002/human-reference-annotations.json
```

Import remains fail-closed for stale or cross-pilot files, wrong pilot/source/
protocol/guide/fingerprint/annotator identity, and duplicate, missing, extra, or
wrong-owner atomics. It does not adjudicate, majority-vote, read Judge results,
or consult developer expectations.

Inspect human-human agreement first, adjudicate disagreements explicitly, and
only then compare the frozen Material Requirement Judge v0.4 with the resolved
human reference. There is no automatic agreement threshold. Pilot #2 is not a
gold standard, and neither complete coverage nor agreement makes the Judge
calibrated. Real packets, submissions, reports, adjudications, and provider
comparison artifacts remain local, private, and ignored; no real human
annotation values are committed.

## Optional independent post-pilot semantic audit

After a Human Reference has been frozen, a separate reviewer may independently
annotate the complete visible task set using protocol:

```text
human-reference-semantic-audit@0.1.0
```

This is methodology QA for possible reference-construction anomalies. It is
not another adjudication round, a correction pass, a Judge-tuning input, or a
gold/accuracy measurement. Human-human agreement does not establish semantic
correctness, consensus does not guarantee correctness, and adjudication does
not create gold. Conversely, one independent audit disagreement identifies a
`referenceReviewCandidate`; it does not prove that the frozen reference is
wrong and never replaces it automatically.

Export one full-task packet for an opaque third reviewer:

```text
node dist/src/cli/tutorbench.js human-reference-semantic-audit-export \
  --annotations artifacts/human-reference-pilot/word-context-boundaries-002/human-reference-annotations.json \
  --reviewer reviewer-c \
  --guide artifacts/human-reference-pilot/word-context-boundaries-002/ANNOTATION_GUIDE.md \
  --output-dir artifacts/human-reference-pilot/word-context-boundaries-002/semantic-audit
```

The export binds the source calibration batch, visible-task fingerprint, and
the frozen `human-reference-material-annotation-guide@0.2.0` byte hash. It
writes `reviewer-c.packet.json`, an empty-status
`reviewer-c.submission-template.json`, and workflow-only
`AUDIT_INSTRUCTIONS.md`. It does not create a new semantic guide. The packet
contains every visible task and atomic requirement, selected without reference
or Judge results. It contains no A/B identity or status, consensus/adjudicated
status, disagreement history, adjudication, derived label, developer expected
status, Judge output/evidence/reasoning, provider output, or comparison result.
The reviewer therefore assigns statuses independently instead of reviewing an
existing answer.

After every template status has been completed, import it strictly:

```text
node dist/src/cli/tutorbench.js human-reference-semantic-audit-import \
  --packet artifacts/human-reference-pilot/word-context-boundaries-002/semantic-audit/reviewer-c.packet.json \
  --submission artifacts/human-reference-pilot/word-context-boundaries-002/semantic-audit/reviewer-c.completed.json \
  --output artifacts/human-reference-pilot/word-context-boundaries-002/semantic-audit/reviewer-c.audit-annotations.json
```

Import fails closed for wrong protocol, reviewer, guide, task fingerprint,
source batch, case/rubric/requirement ownership, invalid status, unknown field,
or missing, duplicate, and extra atomics. It reads no frozen reference status
and only canonicalizes the independent reviewer stream.

Comparison is the first stage allowed to rebuild and inspect the frozen Human
Reference:

```text
node dist/src/cli/tutorbench.js human-reference-semantic-audit \
  --annotations artifacts/human-reference-pilot/word-context-boundaries-002/human-reference-annotations.json \
  --adjudications artifacts/human-reference-pilot/word-context-boundaries-002/human-reference-adjudications.json \
  --audit artifacts/human-reference-pilot/word-context-boundaries-002/semantic-audit/reviewer-c.audit-annotations.json \
  --output artifacts/human-reference-pilot/word-context-boundaries-002/semantic-audit/reviewer-c.semantic-audit-report.json
```

The provider-free report uses `semanticAuditAgreement`, never accuracy. It
contains the directional frozen-reference-row/audit-reviewer-column 3 x 3
matrix, disagreement candidates, dynamic per-requirement and per-case slices,
separate `human_consensus` and `human_adjudicated` slices, and derived-label
agreement after reusing `aggregateMaterialRequirementAssessments()`. It does
not read a Judge comparison artifact. The original experiment, annotations,
adjudications, reports, and frozen `HumanReferenceSet` remain immutable.

The lifecycle is therefore:

```text
blind annotation
→ human-human agreement
→ disagreement adjudication
→ frozen Human Reference
→ optional independent semantic audit
→ frozen Judge comparison / interpretation
```

The optional audit may be conducted before or after a Judge comparison, but
packet selection and reviewer annotation must remain full-task, Judge-blind,
and independent in either order.

### Qualified localized semantic audit @0.2.0 and @0.2.1

Protocol `human-reference-semantic-audit@0.2.0` added formal localization
provenance and a reviewer-comprehension eligibility gate. Protocol `@0.2.1`
closes the qualification-definition provenance gap without reinterpreting
`@0.1.0` or `@0.2.0`: historical packets, submissions, results, annotations,
and reports remain accepted only under their original frozen identities.

The first official localization is:

```text
locale: zh-CN
localization: human-reference-semantic-audit-localization-zh-CN@0.1.0
localized guide: human-reference-material-annotation-guide-zh-CN@0.1.0
historical qualification: human-reference-semantic-audit-reviewer-comprehension@0.1.0
current qualification: human-reference-semantic-audit-reviewer-comprehension@0.1.1
```

The first release locks these exact SHA-256 identities:

```text
source task: sha256:2e73aa96062b00908fe9f329e744cf91cb3f127865bce02ea33356069bb09285
localized tasks: sha256:c8d5343fc1d41d42c1d1ad928967dd44de03afd8fc5fcc1dbc6328edabb53a18
localized presentation: sha256:e92fbc2182bfc544b2499e17673b9e1c2cf902eab8dc555388b6ee6fb3e1f661
source guide: sha256:dcf8ebba67250311a134788919984f13777a51516cb6294ed4c24742be65ff3a
localized guide: sha256:346a18d21cfdf6989081456481cdce7d257060c7ff8f1ff9d4e1d2a4f94d624f
qualification presentation: sha256:65f43e191a04301ef83b796af5395ffb46f3a6ae143bf4ea983d8a2439cdb291
qualification definition: sha256:3a86b044b7f7f5d06536092e649095512a7e983bb94a899d175b0dd77ba9dec7
```

The two qualification fingerprints prove different things:

```text
qualificationPresentationFingerprint != qualificationDefinitionFingerprint
```

`qualificationPresentationFingerprint` hashes exactly the synthetic exercise
rendered for the reviewer. `qualificationDefinitionFingerprint` hashes a
canonical, identity-sorted semantic definition containing the qualification ID
and version, the presentation fingerprint, every hidden expected atomic status,
and the exact pass rule `all_expected_atomics_exact`.

The definition is therefore:

```text
reviewer-visible qualification fixture
+ hidden expected atomic statuses
+ all-atomics-exact qualification rule
```

The definition fingerprint may appear in machine envelopes and bindings, but it
does not disclose the answer key. Expected statuses and the definition object
itself never enter reviewer-facing packets, templates, or Markdown. The same
visible exercise may be reused by a later qualification version only when the
semantic-definition identity is explicitly versioned. Historical `@0.1.0`
qualification results are never migrated or reinterpreted as `@0.1.1` results.

Localization provenance binds the canonical English task fingerprint, the
localized task fingerprint, the rendered reviewer-document fingerprint, the
frozen English guide identity and hash, and the independent zh-CN guide
identity and hash. A translation is a reviewer presentation, not canonical
source bytes; its fingerprint must never masquerade as the source task or
source guide fingerprint.

First export the localized, synthetic comprehension check:

```text
node dist/src/cli/tutorbench.js human-reference-semantic-audit-qualification-export \
  --annotations artifacts/human-reference-pilot/word-context-boundaries-002/human-reference-annotations.json \
  --reviewer <opaque-reviewer-id> \
  --output-dir artifacts/human-reference-pilot/word-context-boundaries-002/semantic-audit-v2/qualification
```

The export writes a human-readable `QUALIFICATION_REVIEW.zh-CN.md`, a strict
machine packet, and an empty-status submission template. Its neutral synthetic
items exercise omission versus explicit conflict, support versus sufficiency,
atomic independence, contextual correction, unsupported direct verdicts, and
negative-prohibition semantics. Neither the packet nor the reviewer document
contains the answer key or any real audit answer.

After the reviewer completes every synthetic atomic, evaluate it locally:

```text
node dist/src/cli/tutorbench.js human-reference-semantic-audit-qualification-import \
  --packet <qualification.packet.json> \
  --submission <qualification.completed.json> \
  --output <qualification.result.json>
```

All synthetic atomics are pass/fail qualification items and all must conform
to the frozen semantic rules. There is no percentage threshold. A result is
either `qualified` or `not_qualified`; missing, incomplete, stale, cross-reviewer,
or cross-localization evidence is invalid. Qualification is a comprehension
and eligibility check for this instrument only:

```text
qualification != calibration
```

A qualified result owned by the same opaque reviewer then authorizes export of
the full localized audit:

```text
node dist/src/cli/tutorbench.js human-reference-semantic-audit-localized-export \
  --annotations <human-reference-annotations.json> \
  --reviewer <same-opaque-reviewer-id> \
  --qualification <qualification.result.json> \
  --output-dir <semantic-audit-v2-directory>
```

This writes `SEMANTIC_AUDIT_REVIEW.zh-CN.md` as the normal human review
interface, `ANNOTATION_GUIDE.zh-CN.md`, a strict machine packet, and an editable
machine submission template. Technical identities remain in the envelope and
hidden Markdown bindings, but the reviewer-facing document presents cases,
student/context evidence, Tutor responses, and atomic requirements directly.
The export always covers the complete task set supplied by the frozen source;
the implementation does not assume fixed case, rubric, requirement, or atomic
counts.

Import and compare only after all statuses are complete:

```text
node dist/src/cli/tutorbench.js human-reference-semantic-audit-localized-import \
  --packet <localized.packet.json> \
  --submission <localized.completed.json> \
  --qualification <qualification.result.json> \
  --output <qualified-audit-annotations.json>

node dist/src/cli/tutorbench.js human-reference-semantic-audit-localized \
  --annotations <human-reference-annotations.json> \
  --adjudications <human-reference-adjudications.json> \
  --audit <qualified-audit-annotations.json> \
  --qualification <qualification.result.json> \
  --output <qualified-semantic-audit-report.json>
```

Both stages fail closed on protocol, reviewer, locale, localization, source or
localized fingerprints, guide identities, source batch, qualification batch,
qualification presentation and definition fingerprints, qualification result,
task ownership, completeness, duplicate/extra atomics, and unknown or injected
fields. An unqualified or mismatched reviewer cannot produce an interpretable
`@0.2.1` comparison. A merely `qualified` status is insufficient: the result
fingerprint and every provenance binding must match exactly.

Comparison still rebuilds the frozen `HumanReferenceSet` from strict source
annotations plus adjudications. It retains the directional frozen-reference
row / reviewer column matrix, provenance slices, per-requirement and per-case
slices, disagreement candidates, and separately aggregated derived-label
agreement. The method boundaries are:

```text
semanticAuditAgreement != accuracy
qualification != calibration
localization != canonical source bytes
semanticAuditDisagreement != automatic reference error
```

Reviewer feedback is intentionally minimal: `reviewLocale` and
`instructionsClear` record whether the presented instrument was usable, but do
not change any atomic status. No PII, provider call, Judge output, real-reviewer
artifact, or hidden reasoning belongs in the repository.

The expanded lifecycle is:

```text
blind annotation
→ human-human agreement
→ disagreement adjudication
→ frozen Human Reference
→ optional semantic audit
    → formal localization when needed
    → reviewer comprehension qualification
    → full-task independent audit
    → diagnostic comparison
→ frozen Judge comparison / interpretation
```

## Human-human agreement

`calculateHumanPairwiseAgreement()` compares two explicitly named annotator
streams by `(caseId, rubricId, requirementId)`. The confusion matrix is
directional:

```text
row    = annotator A status
column = annotator B status
```

The report contains comparable atomic count, agreement/disagreement counts,
agreement share, the complete 3 x 3 matrix, per-status counts, and auditable
disagreement records with both statuses and optional evidence. An atom present
for only one annotator is listed under `missingForAnnotatorA` or
`missingForAnnotatorB`; it is not a semantic disagreement and is excluded from
the agreement denominator.

No kappa or other inferential statistic is required by this protocol. Raw
counts and the confusion matrix are the primary evidence.

## Explicit adjudication and reference provenance

`HumanAtomicAdjudication` records the unit, source annotator IDs, each source
status, the adjudicated status, and optional evidence/reason. The reference
builder never majority-votes and never calls the Judge or reads synthetic
expectations to break a tie.

For each supplied atomic requirement:

1. all required annotators agree → `human_consensus` reference;
2. annotators disagree and a valid explicit adjudication covers the source
   statuses → `human_adjudicated` reference;
3. annotators disagree without adjudication → unresolved disagreement, with no
   reference status;
4. one or more annotations are missing → missing availability, with no
   reference status.

`ReferenceAtomicAssessment` permits only the two human provenance values above.
`developer_expected` is not a reference provenance. An unresolved disagreement
cannot be used to derive a reference label.

The builder reports:

- `plannedAtomicAssessments`;
- `resolvedAtomicAssessments`;
- `unresolvedAtomicAssessments`;
- `missingAtomicAssessments`;
- `referenceCoverageShare = resolved / planned`.

Coverage and agreement are separate dimensions. Missing annotations and
unresolved disagreements never become semantic failure labels.

## Shared deterministic severity layer

Resolved human atomic references are passed through the existing
`aggregateMaterialRequirementAssessments()` function. No second human scoring
policy is introduced:

```text
human atomic reference -> existing aggregator -> PASS / PARTIAL / FAIL
Judge atomic result     -> existing aggregator -> PASS / PARTIAL / FAIL
```

`deriveHumanReferenceRubricLabels()` emits labels only for rubrics whose every
material requirement has a resolved reference. Partial reference coverage does
not silently produce a rubric label.

## Judge-vs-reference comparison

`compareJudgeToHumanReference()` compares a validated Material Requirement Judge
result to resolved human consensus/adjudicated atoms. Its atomic section is
named `referenceAgreement` and contains comparable count, raw agreement,
disagreement, directional reference-row/Judge-column confusion matrix, and
disagreement records. Its derived section separately compares rubric labels
after both sides use the existing aggregator.

The report does not call this metric `accuracy`: `referenceAgreement != accuracy`.
A calibration protocol with
independent human reference data must be established before stronger claims
are considered. Judge execution availability is an upstream concern and is
not mixed into this semantic comparison denominator.

## Frozen Judge comparison lifecycle

The final lifecycle stage is now a formal batch comparison:

```text
blind human annotation
→ human-human agreement
→ explicit adjudication
→ complete Human Reference
→ optional independent semantic audit
→ frozen Judge comparison
```

Run the comparison only after the annotation and adjudication files have been
strictly parsed. The command rebuilds `HumanReferenceSet` from those two source
files; it never guesses a reference from a persisted post-adjudication report:

```text
node dist/src/cli/tutorbench.js human-reference-judge-comparison \
  --annotations artifacts/human-reference-pilot/word-context-boundaries-002/human-reference-annotations.json \
  --adjudications artifacts/human-reference-pilot/word-context-boundaries-002/human-reference-adjudications.json \
  --judge-deepseek \
  --output artifacts/human-reference-pilot/word-context-boundaries-002/material-requirement-judge-v0.4.reference-comparison.deepseek.json
```

`--judge-deepseek` is an explicit live/paid opt-in. Without an explicitly
selected provider the command stops with a usage error and makes no network
request. The runner calls the frozen Material Requirement Judge `@0.4` exactly
once for each Human Reference task. Each input is the task's visible Material
Requirement evidence only; human status, provenance, annotator identity,
adjudication, and expected labels stay outside the Judge boundary.

The persisted report uses `referenceAgreement` for atomic comparison and also
shows derived-label agreement, dynamic per-requirement slices, separate
`human_consensus` and `human_adjudicated` provenance slices, per-case status,
and safe token-usage coverage when available. Execution or availability errors
are reported separately and never enter a semantic denominator. A complete
reference is not calibration, Judge agreement is not calibration, and this
small pilot is not a gold standard.

## Synthetic regression fixture

Provider-free tests exercise three atomic examples:

1. A and B both mark `SATISFIED` → consensus reference;
2. A marks `OMITTED_OR_INCOMPLETE`, B marks `EXPLICIT_CONFLICT` → unresolved
   until an explicit adjudication resolves it to `EXPLICIT_CONFLICT`;
3. A is present and B is missing → missing availability, not disagreement.

The tests also assert a directional `SATISFIED` → `OMITTED_OR_INCOMPLETE`
confusion-matrix cell, strict ownership/completeness failures, evidence and
privacy boundaries, shared aggregation, coverage, provenance, and the absence
of synthetic expectation leakage. No real annotation data is committed.
