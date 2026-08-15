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

The local `examples/canonical-model-host/server.py` server is a synthetic
protocol fixture only. It contains no provider SDK or credentials and must not
be used to claim a real baseline. The same directory also contains an
OpenAI-specific `openai-server.mjs` example. That host is intentionally local
integration code, not Benchmark Core or a package runtime dependency; it reads
credentials from `OPENAI_API_KEY`, requires `OPENAI_MODEL`, and is never
invoked by CI. See [the first real baseline procedure](first-real-baseline.md)
for its dry-run, smoke, full-collection, validation, replay, and review order.

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

## Judge a frozen corpus with DeepSeek

Judge execution is a separate, explicit evaluation step. It does not call the
Tutor or Nemotron host again. The DeepSeek integration uses the provider's
OpenAI-compatible `POST /chat/completions` transport and is not the OpenAI
Responses provider; its result descriptor is `provider: "deepseek"` with the
exact configured model ID. Chat Completions JSON mode is object-only, not an
equivalent claim of strict Structured Outputs. The existing Judge parser and
rubric-ownership validation remain the final trust boundary.

Use Node 22 in the authoritative CI environment. A local Node 26 development
shell may run the commands if the repository currently works, but it is
outside the declared `>=22 <23` engine range. Configure credentials only in
the local process environment:

```powershell
$env:DEEPSEEK_API_KEY = "<local secret>"
$env:DEEPSEEK_JUDGE_MODEL = "<exact provider-accepted model id>"
$env:DEEPSEEK_JUDGE_TIMEOUT_MS = "60000"
$env:DEEPSEEK_JUDGE_MAX_ATTEMPTS = "2"
# Optional generation controls:
# $env:DEEPSEEK_JUDGE_THINKING = "enabled" # enabled (default) or disabled
# $env:DEEPSEEK_JUDGE_REASONING_EFFORT = "high" # high (default) or max
# $env:DEEPSEEK_JUDGE_MAX_TOKENS = "4096" # positive integer; 4096 (default)
# Temperature is allowed only when thinking is disabled:
# $env:DEEPSEEK_JUDGE_THINKING = "disabled"
# $env:DEEPSEEK_JUDGE_TEMPERATURE = "0"
```

The DeepSeek V4 Judge profile is explicit and repository-owned: thinking is
`enabled`, reasoning effort is `high`, the maximum output is `4096` tokens,
JSON mode is `json_object`, streaming is disabled, the execution timeout is
`60000` milliseconds, and the transport attempt limit is `2`. The timeout and
attempt values are environment overrides, with positive-integer timeout
validation and the existing `1..3` attempt validation. These effective values
are recorded in Judge provenance as `timeoutMs` and `maxAttempts`, separately
from each call's observed `judgeMetrics.latencyMs` and `attempts`.

Timeouts remain `judge_timeout` errors with a null score and no timeout retry.
Transient HTTP retry behavior is unchanged. Thinking-enabled runs reject
temperature; thinking-disabled runs omit reasoning effort unless it was
explicitly configured. Provider `reasoning_content` is private execution data
and is not benchmark evidence: it is not persisted, logged, placed in
diagnostics or metrics, or copied into artifacts. DeepSeek JSON mode requests
an object but is not OpenAI strict JSON Schema Structured Outputs.

The 60000ms default is evidence-based, not a completion guarantee. In a
previous 23-case run, 2 cases timed out at about 30 seconds; replaying those
same two frozen responses with a 60000ms timeout produced 0 errors, 2 failures,
and 34084ms observed Judge latency. The evaluator version remains `0.3a.2`;
the profile changes execution configuration without changing scoring
semantics.

After building, run a one-case Judge smoke over the existing ignored corpus:

```powershell
npm run build
node dist/src/cli/tutorbench.js evaluate `
  --corpus "artifacts/real-model/preliminary-openrouter-nemotron-baseline-001.json" `
  --case "hint-only-linear-equation-001" `
  --judge-deepseek `
  --output "artifacts/real-model/nemotron-deepseek-judge-smoke-001.json"
```

Then run the first three available cases:

```powershell
node dist/src/cli/tutorbench.js evaluate `
  --corpus "artifacts/real-model/preliminary-openrouter-nemotron-baseline-001.json" `
  --limit 3 `
  --judge-deepseek `
  --output "artifacts/real-model/nemotron-deepseek-judge-smoke-003.json"
```

Finally, omit both selection flags for the complete available corpus:

```powershell
node dist/src/cli/tutorbench.js evaluate `
  --corpus "artifacts/real-model/preliminary-openrouter-nemotron-baseline-001.json" `
  --judge-deepseek `
  --output "artifacts/real-model/preliminary-openrouter-nemotron-baseline-001.deepseek-judged.json"
```

`--case` values are resolved against the dataset and the current corpus before
`--limit` truncates stable case-ID order. The output keeps the original corpus
ID/version and source `coverage`, available-response count, and missing-case
count; `evaluationSelection` records the actual subset and selected response
count. A partial 23/24 corpus remains partial even when one selected case is
evaluated. Missing credentials produce `judge_unavailable` without a network
request; timeouts and transient 429/5xx transport failures use bounded retries;
malformed or ownership-invalid Judge output fails closed. DeepSeek Judge
evidence is preliminary LLM-as-Judge evidence, not human calibration or a
learning-outcome measurement, and it does not make this corpus leaderboard
eligible.

## Dry-run and publication boundary

Both commands support `--dry-run`. Product dry-run reports `generation spec =
none`; canonical dry-run prepares the canonical cases/messages and reports
`0` host calls. Neither dry-run reads provider credentials or makes network
requests.

Artifacts are written under ignored local paths by default, remain
`preliminary`, `uncalibrated`, and `publicLeaderboardEligible: false`, and are
never copied into website public data automatically. This repository does not
call a commercial model during normal builds, tests, CI, website generation,
or package smoke; the optional local host requires an intentional credentialed
run. It does not publish a leaderboard or claim that a synthetic fixture is
real-model evidence.
