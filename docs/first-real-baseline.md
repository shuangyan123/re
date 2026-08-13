# First real canonical model baseline

This procedure is for one intentional local run of the existing canonical
model boundary. It does not change the benchmark protocol, dataset, rubric,
generation profile, Judge, public website, or package runtime. The checked-in
host uses the OpenAI Responses API as one provider integration example; a
successful run is still preliminary, uncalibrated, and not leaderboard
eligible.

## Configure the local host

From the repository root, use Node 22 and configure the credential only in the
local process environment:

```powershell
npm run build
$env:OPENAI_API_KEY = "<local secret>"
$env:OPENAI_MODEL = "<exact provider-accepted model id>"
$env:OPENAI_TIMEOUT_MS = "30000"
node examples/canonical-model-host/openai-server.mjs
```

`OPENAI_BASE_URL` is optional and defaults to `https://api.openai.com/v1`.
`CANONICAL_MODEL_HOST_PORT` is optional and defaults to `9001`. The host
requires `OPENAI_MODEL` so the provider model is explicit; the collector also
requires the same exact value through `--model`, which becomes corpus
provenance. Do not put a key in source, `.env` committed files, command output,
corpus, report, result, or logs.

The host forwards only the one validated `packet.cases[0].messages` sequence.
It maps `generationSpec.maxOutputTokens` to OpenAI `max_output_tokens`, leaves
absent optional controls absent, uses `store: false`, disables SDK retries,
uses one non-streaming request, and does not configure tools, search, memory,
background generation, or a fallback model. Only Tutor-visible text and
sanitized provider usage/latency can cross back into the benchmark envelope.

## Dry-run and smoke

In a second terminal, use the same exact model identifier in the collector:

```powershell
node dist/src/cli/tutorbench.js collect-model `
  --http http://127.0.0.1:9001/generate `
  --provider openai `
  --model $env:OPENAI_MODEL `
  --limit 3 `
  --runs 1 `
  --dry-run
```

The dry-run must report `canonical_model`, `recorded_model`,
`baseline-native-default`, the selected cases, and zero model calls. It does
not read the credential or contact the host.

After that succeeds, run the 1–3 case smoke collection:

```powershell
node dist/src/cli/tutorbench.js collect-model `
  --http http://127.0.0.1:9001/generate `
  --provider openai `
  --model $env:OPENAI_MODEL `
  --limit 3 `
  --runs 1 `
  --output artifacts/real-model/preliminary-openai-smoke-001.json `
  --report artifacts/real-model/preliminary-openai-smoke-001.report.json

npm run tutor:corpus:validate -- --corpus artifacts/real-model/preliminary-openai-smoke-001.json
node dist/src/cli/tutorbench.js evaluate `
  --corpus artifacts/real-model/preliminary-openai-smoke-001.json `
  --output artifacts/real-model/preliminary-openai-smoke-001.evaluation.json
```

The smoke corpus should have successful real provider responses, partial
coverage because it is a subset, `recorded_model` provenance, the existing
`baseline-native-default` generation spec, and no collection failures. Review
the metadata and sample responses before spending calls on the full dataset.

## Complete single-run baseline

Only after the smoke passes, run exactly one complete 24-case collection:

```powershell
node dist/src/cli/tutorbench.js collect-model `
  --http http://127.0.0.1:9001/generate `
  --provider openai `
  --model $env:OPENAI_MODEL `
  --runs 1 `
  --corpus-id preliminary-openai-baseline-001 `
  --output artifacts/real-model/preliminary-openai-baseline-001.json `
  --report artifacts/real-model/preliminary-openai-baseline-001.report.json

npm run tutor:corpus:validate -- `
  --corpus artifacts/real-model/preliminary-openai-baseline-001.json `
  --full
node dist/src/cli/tutorbench.js evaluate `
  --corpus artifacts/real-model/preliminary-openai-baseline-001.json `
  --full `
  --output artifacts/real-model/preliminary-openai-baseline-001.evaluation.json
```

Full coverage means 24 planned calls, 24 successful responses, zero failures,
`coverage: "full"`, and a passing full-corpus validator. Evaluation replays
the frozen corpus through `RecordedTutor`; it does not call the model again.
Judge execution is intentionally omitted by default, so Judge-required rubrics
remain unresolved and the result must not be called calibrated.

## Evidence review and publication boundary

Before recording a baseline as reviewed, inspect the provider/model identity,
dataset and version, prompt identity, generation spec, response count,
coverage, provenance, metrics, and representative response text. Confirm that
no endpoint, credential, raw provider payload, request ID, hidden reasoning,
tool trace, debug response, or malformed provider error entered the artifacts.

All files under `artifacts/` are ignored. Do not edit or commit real provider
responses, reports, or evaluation results, and do not copy them into website
public data or model/trial registries. If a call fails, preserve the partial
corpus and report; do not retry automatically or manually merge a replacement
case into the corpus. Start a new intentional collection run if a complete
baseline is needed.
