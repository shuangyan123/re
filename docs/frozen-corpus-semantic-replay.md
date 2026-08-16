# Frozen Corpus Semantic Replay

## Purpose

This bridge permits a previously collected `TutorResponseCorpus` to be
evaluated under a later canonical evaluator identity only when a checked-in,
reviewed compatibility rule proves that the Tutor-visible case input is
unchanged. It is a replay interpretation boundary, not Tutor regeneration,
corpus migration, Judge calibration, or a general version bypass.

## Strict identity remains the default

Corpus validation remains fail-closed. Without an explicit
`--allow-compatible-replay`, a corpus must match the target dataset identity
and every response must match the target case version. A mismatch remains
`tutor_response_corpus_invalid`; the old corpus is not silently relabeled.

The replay flag is deliberately narrow. It does not provide `--force`,
`--ignore-version`, semver inference, or a way to skip response integrity,
coverage, provenance, generation-spec, duplicate, or `responseId` checks.

## Source and target identities

Replay keeps two identities distinct:

```text
source corpus evidence
  dataset: tutor-eval-v0.2a@0.2a
  language-verb-check-001: 1.0.0

target evaluation semantics
  dataset: tutor-eval-v0.2a@0.2a.1
  evaluator: 0.3a.3
  Judge prompt: tutor-eval-pedagogy-judge-system@0.3
  language-verb-check-001: 1.0.1
```

The source corpus JSON, `responseId`, `responseText`, Tutor descriptor,
`generationSpec`, corpus identity, and source dataset/case metadata are never
rewritten.

## Approved compatibility rule

The machine-readable registry is
`src/contracts/tutor-response-replay.ts`. It currently contains exactly one
transition:

```text
tutor-eval-v0.2a@0.2a
  -> tutor-eval-v0.2a@0.2a.1

language-verb-check-001: 1.0.0 -> 1.0.1
```

The case change is approved because PR #26 removed only the evaluator-only
`incorrect_diagnosis:major` mapping from `language-verb-diagnosis-001`.
The rubric ID and criterion remain unchanged:

```text
Locate the agreement mismatch between the subject and verb.
```

The source and target Tutor-visible fingerprints are explicitly recorded in
the registry and must be equal. The runtime recomputes the target fingerprint
from `toTutorVisibleCasePacket()` over all Tutor-visible fields:

- `learningObjective`
- `studentProfile`
- `conversationHistory`
- `studentMessage`
- `problemContext`

The fingerprint excludes case version and evaluator-only annotations. If any
target visible field changes, the compatibility test and replay resolution
fail. The source fingerprint is reviewed historical evidence for the old
visible projection; no complete old dataset loader is restored.

## Validation order

Replay has two distinct validation layers:

1. Resolve the exact allowlisted source/target relation and verify the target
   visible fingerprint and every response's declared source case version.
2. Validate the corpus against a minimal source-identity view. This checks the
   old `datasetVersion`, source case versions, source-derived `responseId`,
   Tutor descriptor, generation spec, provenance, duplicates, and coverage.
3. Only after source validation succeeds, select target canonical cases and run
   evaluation with the target evaluator-only semantics.

The replay adapter maps a target case version back to the source version only
for frozen-response lookup. It does not modify the corpus or generate a new
response identity.

## CLI behavior

Use the explicit flag only for an approved transition:

```powershell
node dist/src/cli/tutorbench.js evaluate `
  --corpus "artifacts/real-model/preliminary-openrouter-nemotron-baseline-001.json" `
  --allow-compatible-replay `
  --output "artifacts/real-model/nemotron-semantic-replay-result.json"
```

The flag can be combined independently with `--case`, `--limit`, `--full`, or
an explicitly opted-in Judge provider. It does not call a Tutor provider. A partial source
corpus remains partial, and `--full` still fails when required responses are
missing. A historical corpus already at `0.2a.1` follows the explicit
historical-loader path and does not emit `semanticReplay` provenance. The
current bilingual dataset is `0.2a.2`; no automatic `.2a.1 -> .2a.2` replay
transition exists.

## Result provenance

Replay results keep the existing source corpus fields and add an optional
`semanticReplay` field:

```json
{
  "corpusId": "source-corpus-id",
  "corpusVersion": "source-corpus-version",
  "datasetId": "tutor-eval-v0.2a",
  "datasetVersion": "0.2a.1",
  "semanticReplay": {
    "compatibilityId": "...",
    "sourceDatasetId": "tutor-eval-v0.2a",
    "sourceDatasetVersion": "0.2a",
    "targetDatasetId": "tutor-eval-v0.2a",
    "targetDatasetVersion": "0.2a.1",
    "caseVersionMappings": [
      {
        "caseId": "language-verb-check-001",
        "sourceVersion": "1.0.0",
        "targetVersion": "1.0.1"
      }
    ]
  }
}
```

The nested evaluation result records target dataset `0.2a.1`, evaluator
`0.3a.3`, and Judge prompt metadata supplied by the target execution path.
Non-replay results omit the optional field. Existing v1 artifacts without it
remain readable.

## Rejected transitions and recollection boundary

The following remain rejected:

- `0.2a` to any future `0.2a.x` not explicitly registered;
- a changed `learningObjective`, `studentProfile`, conversation, student
  message, or problem context;
- a changed case version without an exact case mapping;
- a mapping whose target fingerprint no longer matches the canonical case;
- a source response whose `responseId` was derived from target identity;
- any transition inferred only from semver or a patch-level convention.

Any Tutor-visible change requires recollection. Replay cannot make a historical
response evidence for a changed Tutor input.

## Historical evidence and privacy

The existing 23-response Nemotron corpus remains immutable historical evidence.
This PR does not edit, rename, re-sign, overwrite, or commit that ignored
provider corpus, and it performs no DeepSeek, OpenAI, OpenRouter, Nemotron,
Tutor, or Judge acceptance call. Replay artifacts remain preliminary and
uncalibrated. No provider payload, credential, hidden reasoning, or response
text is added to the compatibility registry.

## Registering a future rule

A future rule requires a separate reviewed change that records exact source and
target identities, explicit case mappings, source/target visible fingerprints,
and a rationale for an evaluator-only difference. It must add deterministic
tests for strict rejection, source identity validation, visible drift, result
provenance, selection, coverage, and error semantics. It must not turn this
registry into a migration engine or weaken the default strict path.
