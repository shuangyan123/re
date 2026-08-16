# First real bilingual Tutor baseline

This procedure creates a local, preliminary, uncalibrated Tutor corpus for
the current `tutor-eval-v0.2a@0.2a.3` dataset: 24 English cases plus 24
`zh-CN` cases. It does not change the dataset, generation profile, evaluator,
Judge rubrics, scoring, response identity, or public website. Codex and CI do
not make provider calls; the commands below are manual operator commands.

The three provider boundaries remain separate:

```text
Tutor provider -> canonical model host -> TutorResponseCorpus
TutorResponseCorpus -> evaluator / Judge provider -> evaluation artifact
evaluation artifact -> optional local Review Translation sidecar -> private Audit
```

## Configure the Tutor host

Build with the repository-supported Node 22 runtime first:

```powershell
npm ci
npm run build
```

The provider-neutral bridge reads credentials only from the local process
environment. It sends one non-streaming Chat Completions request per
`/generate` call, makes no provider retry, and returns only final visible
`message.content` plus sanitized latency/token metrics. Reasoning content,
tool traces, provider payloads, request IDs, and error bodies never enter the
benchmark envelope.

DeepSeek example:

```powershell
$env:TUTOR_MODEL_API_KEY = "<local secret>"
$env:TUTOR_MODEL_BASE_URL = "https://api.deepseek.com"
$env:TUTOR_MODEL = "<exact model id>"
$env:TUTOR_MODEL_API_PATH = "/chat/completions"
$env:TUTOR_MODEL_MAX_OUTPUT_TOKENS_FIELD = "max_tokens"
$env:TUTOR_MODEL_TIMEOUT_MS = "60000"
node examples/canonical-model-host/chat-completions-server.mjs
```

MiniMax-compatible example:

```powershell
$env:TUTOR_MODEL_API_KEY = "<local secret>"
$env:TUTOR_MODEL_BASE_URL = "https://api.minimax.io/v1"
$env:TUTOR_MODEL = "<exact model id>"
$env:TUTOR_MODEL_API_PATH = "/chat/completions"
$env:TUTOR_MODEL_MAX_OUTPUT_TOKENS_FIELD = "max_completion_tokens"
$env:TUTOR_MODEL_TIMEOUT_MS = "60000"
node examples/canonical-model-host/chat-completions-server.mjs
```

Use the provider's current API documentation to confirm the endpoint and
output-token field before a paid run: [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)
and [MiniMax OpenAI-compatible Chat Completions](https://platform.minimax.io/docs/api-reference/text-chat-openai).
The collector's `--provider` value and `--model` value are provenance, not
credentials. Never put a key in source, `.env`, command output, corpus,
report, evaluation result, or logs.

## Dry-run and four-case bilingual smoke

In a second terminal, use the same exact model identity. The dry-run validates
the canonical packet and makes zero host calls:

```powershell
node dist/src/cli/tutorbench.js collect-model `
  --http http://127.0.0.1:9001/generate `
  --provider minimax `
  --model $env:TUTOR_MODEL `
  --locale zh-CN `
  --limit 2 `
  --dry-run
```

For one corpus containing two English and two Chinese cases, select four
explicit IDs. This keeps the smoke artifact bilingual while still exercising
the case-authoritative locale on every packet:

```powershell
$smokeCorpus = "artifacts/real-model/preliminary-minimax-$($env:TUTOR_MODEL)-tutor-bilingual-001.corpus.json"
$smokeReport = "$smokeCorpus.report.json"

node dist/src/cli/tutorbench.js collect-model `
  --http http://127.0.0.1:9001/generate `
  --provider minimax `
  --model $env:TUTOR_MODEL `
  --case fraction-misconception-001 `
  --case hint-only-linear-equation-001 `
  --case fraction-misconception-001-zh-CN `
  --case hint-only-linear-equation-001-zh-CN `
  --corpus-id preliminary-minimax-tutor-bilingual-001 `
  --output $smokeCorpus `
  --report $smokeReport

node dist/src/cli/tutor-corpus-validate.js --corpus $smokeCorpus
node dist/src/cli/tutorbench.js evaluate `
  --corpus $smokeCorpus `
  --report-locale zh-CN `
  --output artifacts/real-model/preliminary-minimax-tutor-bilingual-001.evaluation.json
```

The smoke corpus should have four successful `recorded_model` responses,
`coverage: "partial"`, the current `baseline-native-default` generation
identity, no failures, and no hidden/provider fields. The initial evaluation
does not call a Judge; Judge-required rubrics remain explicit errors. Inspect
the response text and metadata before spending quota on all 48 cases.

## Resume and complete the 48-case corpus

A new collection refuses to overwrite an existing corpus path. If a run is
interrupted or has failed/missing case-runs, resume the same path explicitly:

```powershell
node dist/src/cli/tutorbench.js collect-model `
  --http http://127.0.0.1:9001/generate `
  --provider minimax `
  --model $env:TUTOR_MODEL `
  --case fraction-misconception-001 `
  --case hint-only-linear-equation-001 `
  --case fraction-misconception-001-zh-CN `
  --case hint-only-linear-equation-001-zh-CN `
  --corpus-id preliminary-minimax-tutor-bilingual-001 `
  --resume $smokeCorpus `
  --output $smokeCorpus `
  --report $smokeReport
```

Resume reuses only successful responses whose dataset, case version, model,
model version, prompt identity, generation spec, corpus identity, and run
index still match. Missing or previously failed case-runs are attempted once
in the new invocation. A mismatch fails closed before any host call.

After the smoke is reviewed, collect the complete current dataset with one
run per case:

```powershell
$fullCorpus = "artifacts/real-model/preliminary-minimax-tutor-bilingual-001.corpus.json"
$fullReport = "$fullCorpus.report.json"

node dist/src/cli/tutorbench.js collect-model `
  --http http://127.0.0.1:9001/generate `
  --provider minimax `
  --model $env:TUTOR_MODEL `
  --corpus-id preliminary-minimax-tutor-bilingual-001 `
  --resume $fullCorpus `
  --output $fullCorpus `
  --report $fullReport

node dist/src/cli/tutor-corpus-validate.js --corpus $fullCorpus --full
node dist/src/cli/tutorbench.js evaluate `
  --corpus $fullCorpus `
  --full `
  --report-locale en `
  --output artifacts/real-model/preliminary-minimax-tutor-bilingual-001.evaluation.json
```

Full coverage means 48 planned calls, 48 successful responses, zero
collection failures, and `coverage: "full"`. Evaluation replays the frozen
corpus through `RecordedTutor`; it never regenerates Tutor text.

## Optional preliminary Judge

The generic Judge path is selected separately and is configured only through
environment variables. DeepSeek and MiniMax-compatible endpoints can use the
same path; provider-specific controls are not inferred from the provider
name. JSON mode may be disabled for a compatible endpoint, but the existing
runtime parser and rubric-ownership checks remain mandatory.

```powershell
$env:CHAT_COMPLETIONS_JUDGE_PROVIDER = "minimax"
$env:CHAT_COMPLETIONS_JUDGE_MODEL = "<exact judge model id>"
$env:CHAT_COMPLETIONS_JUDGE_BASE_URL = "https://api.minimax.io/v1"
$env:CHAT_COMPLETIONS_JUDGE_API_PATH = "/chat/completions"
$env:CHAT_COMPLETIONS_JUDGE_API_KEY = "<local secret>"
$env:CHAT_COMPLETIONS_JUDGE_MAX_OUTPUT_TOKENS_FIELD = "max_completion_tokens"
$env:CHAT_COMPLETIONS_JUDGE_MAX_TOKENS = "8192"
$env:CHAT_COMPLETIONS_JUDGE_JSON_MODE = "disabled"
$env:CHAT_COMPLETIONS_JUDGE_TIMEOUT_MS = "60000"
$env:CHAT_COMPLETIONS_JUDGE_MAX_ATTEMPTS = "2"

node dist/src/cli/tutorbench.js evaluate `
  --corpus $fullCorpus `
  --full `
  --judge-chat-completions `
  --report-locale zh-CN `
  --output artifacts/real-model/preliminary-minimax-tutor-bilingual-001.evaluation.json
```

The Tutor provider, Judge provider, and optional Review Translation provider
are recorded as separate descriptors. The result remains preliminary and
uncalibrated; it is not a leaderboard or model ranking.

## Private Review Translation and Audit

Review Translation is an after-evaluation reading aid. It is not part of
Tutor generation, Judge input, scoring, corpus identity, replay, or public
artifacts. Keep the original English/Chinese audit evidence and use only the
private website output:

```powershell
node dist/src/cli/tutorbench.js review-translate `
  --evaluation artifacts/real-model/preliminary-minimax-tutor-bilingual-001.evaluation.json `
  --target-locale zh-CN `
  --http http://127.0.0.1:9000/translate `
  --provider local-review-translator `
  --model <review-translator-model> `
  --output artifacts/real-model/preliminary-minimax-tutor-bilingual-001.review.zh-CN.json

node dist/src/cli/website-build.js `
  --evaluation artifacts/real-model/preliminary-minimax-tutor-bilingual-001.evaluation.json `
  --review-translation artifacts/real-model/preliminary-minimax-tutor-bilingual-001.review.zh-CN.json `
  --locale zh-CN `
  --output website/private-dist/preliminary-minimax-tutor-bilingual-001
```

The sidecar is source-hash-bound and local-only. Missing or failed
translations do not change evaluation results; the Audit keeps raw source
text available for human review.

All files under `artifacts/` and `website/private-dist/` are ignored. Do not
commit real provider responses, reports, credentials, raw payloads, hidden
reasoning, tool traces, or private user data.
