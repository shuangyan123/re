# Real-model baseline collection

Tutor Benchmark has two deliberately separate frozen-evidence paths. Both
produce the same `TutorResponseCorpus`, can be replayed and evaluated offline,
and remain preliminary until independently reviewed and calibrated.

| Path | Transport body | Evidence meaning | Corpus generation identity |
| --- | --- | --- | --- |
| Product Tutor | `TutorTurnInput` | A product or external Tutor response | absent |
| Canonical model | `TutorExecutionPacketFile` with one case | A response from the exact canonical request and generation spec sent to a model host | `baseline-native-default` |

## Product Tutor evidence

`tutorbench collect` is the Product / External Tutor path. It sends the
provider-independent Tutor HTTP v1 request:

```text
POST /respond
body: TutorTurnInput
```

The body contains Tutor-visible case context such as `currentStudentMessage`,
`studentState`, conversation, and the learning objective. It does not contain
evaluator-only annotations. The external product may use persona, memory,
tools, hidden product prompts, or product-specific model routing; those are
part of what is being evaluated.

The Product Tutor descriptor must identify the actual configuration:

```bash
tutorbench collect \
  --http http://127.0.0.1:8000/respond \
  --provider my-product \
  --model tutor-product \
  --model-version product-release-2026-08 \
  --prompt-id product-tutor-config \
  --prompt-version product-config-v3 \
  --provenance external \
  --output artifacts/product/product.json \
  --report artifacts/product/product.report.json
```

`--prompt-version` is a stable Product Tutor/orchestration configuration
identity. It is not the benchmark baseline prompt. Product collection writes
no `generationSpec`, and its ordinary provenance is `external` or
`review_workspace`. `synthetic` remains available for local fixtures. Passing
`--provenance recorded_model` fails with:

```text
recorded_model requires canonical model collection
```

## Canonical model evidence

`tutorbench collect-model` is the only path that can write
`recorded_model` provenance and `baseline-native-default` generation identity:

```bash
tutorbench collect-model \
  --http http://127.0.0.1:9000/generate \
  --provider example-provider \
  --model example-model \
  --model-version example-snapshot \
  --limit 3 \
  --runs 1 \
  --output artifacts/real-model/model.json \
  --report artifacts/real-model/model.report.json
```

For each case/run, the collector calls the existing
`buildTutorExecutionPacketFile()` and sends one validated packet directly to
the host. The request has this shape and no Product Tutor fields:

```json
{
  "schemaVersion": 1,
  "datasetId": "tutor-eval-v0.2a",
  "datasetVersion": "...",
  "generationSpec": {
    "specId": "tutor-baseline-generation",
    "specVersion": "0.4a.2",
    "prompt": { "id": "tutor-baseline-system", "version": "0.1", "sha256": "..." },
    "maxOutputTokens": 1024
  },
  "cases": [{ "caseId": "...", "caseVersion": "...", "messages": [] }]
}
```

The packet builder is the source of truth for the canonical system prompt,
prompt SHA, visible context, conversation messages, and message order. The
collector does not prepend a prompt, inject memory/persona, rewrite or
truncate messages, or add a second hidden-data sanitizer. The packet firewall
excludes evaluator-only annotations, ground truth, misconceptions, rubrics,
critical failures, Judge prompts, reference answers, human annotations, and
disclosure-policy fields.

The canonical host returns a small provider-neutral envelope:

```json
{
  "output": { "text": "...", "metrics": {} },
  "executionSupport": { "maxOutputTokens": true }
}
```

The response is runtime-validated. `executionSupport` must be present and
declare the required `maxOutputTokens` control. Any optional control specified
by a future generation spec (`temperature`, `reasoningEffort`, or `seed`) must
also be attested as supported. The collector reuses
`assertTutorGenerationSpecExecutionSupport()` and fails closed before recording
a response when a required control is unsupported or the attestation is
missing/invalid.

The canonical Tutor descriptor derives `promptId` and `promptVersion` from the
generation spec. `recorded_model` is fixed by `collect-model`; there is no
`--provenance` or `--prompt-version` flag on that command.

## What the protocol proves

The HTTP protocol proves what the benchmark serialized and sent: the exact
validated packet, messages, generation spec, and the host's explicit support
attestation. It cannot cryptographically prove that a remote server did not
silently modify the request internally after receipt. Reviewed canonical
evidence therefore still requires a trusted host implementation, provider-
direct integration, or a publication attestation. The evidence levels are:

```text
Product evidence
  Product-defined orchestration received TutorTurnInput.

Canonical-request evidence
  The benchmark sent the exact TutorExecutionPacket and generation spec.

Reviewed canonical evidence
  The host implementation and provider forwarding were independently reviewed.
```

The local `examples/canonical-model-host/` server is a synthetic protocol
fixture only. It contains no provider SDK or credentials and must not be used
to claim a real baseline.

## Failure, retry, and coverage semantics

Collection is sequential and performs no automatic retry. A network failure,
timeout, non-2xx response, invalid JSON, invalid output, invalid support
attestation, or unsupported generation control is an execution failure, not a
Tutor response containing an error string. Successful responses are retained
on partial failure; failure reports contain only case/version/run identity and
a stable failure code.

Coverage is `full` only when all selected executions succeed and the selection
covers the complete dataset. A subset or any failed execution is `partial`.
Both corpus modes validate, replay through `RecordedTutor`, and evaluate with
the existing `tutorbench evaluate` path. The evaluator and scoring contracts do
not infer evidence mode from provenance.

`responseId` continues to use `deriveTutorResponseId()` as the identity source
of truth. Product responses omit generation identity; canonical responses
include the complete generation spec identity. Existing generation-bound and
legacy corpora remain readable.

## Dry-run and publication boundary

Both commands support `--dry-run`. Product dry-run reports `generation spec =
none`; canonical dry-run prepares the canonical cases/messages and reports
`0` host calls. Neither dry-run reads provider credentials or makes network
requests.

Artifacts are written under ignored local paths by default, remain
`preliminary`, `uncalibrated`, and `publicLeaderboardEligible: false`, and are
never copied into website public data automatically. This repository does not
call a commercial model, require provider credentials, publish a leaderboard,
or claim that a synthetic fixture is real-model evidence.
