# First real bilingual Tutor baseline

This procedure records the historical local, preliminary, uncalibrated Tutor
corpus for `tutor-eval-v0.2a@0.2a.3`: 24 English cases plus 24 `zh-CN` cases.
It does not change the dataset, generation profile, evaluator,
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
$env:TUTOR_MODEL_REASONING_SPLIT = "disabled"
$env:TUTOR_MODEL_REQUIRE_REASONING_SEPARATION = "false"
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
$env:TUTOR_MODEL_REASONING_SPLIT = "enabled"
$env:TUTOR_MODEL_REQUIRE_REASONING_SEPARATION = "true"
$env:TUTOR_MODEL_TIMEOUT_MS = "60000"
node examples/canonical-model-host/chat-completions-server.mjs
```

For MiniMax reasoning models, `reasoning_split=true` is a safety boundary:
the bridge records only final `message.content`, while provider thinking stays
outside `TutorResponseCorpus`. `TUTOR_MODEL_REQUIRE_REASONING_SEPARATION=true`
fails closed if a provider still puts a `<think>...</think>` wrapper in
`message.content`; it never tries to extract a guessed final answer. DeepSeek
already returns `reasoning_content` separately, so its host configuration keeps
the optional MiniMax field disabled and still reads only `message.content`.

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

Resume reuses only successful responses whose dataset, case version, model,
model version, prompt identity, generation spec, corpus identity, and run
index still match. Missing or previously failed case-runs are attempted once
in the new invocation. A mismatch fails closed before any host call. After the
smoke is reviewed, continue the *same* corpus path without any `--case` or
`--limit` selection flags:

```powershell
$fullCorpus = $smokeCorpus
$fullReport = $smokeReport

node dist/src/cli/tutorbench.js collect-model `
  --http http://127.0.0.1:9001/generate `
  --provider minimax `
  --model $env:TUTOR_MODEL `
  --resume $smokeCorpus `
  --output $fullCorpus `
  --report $fullReport

node dist/src/cli/tutor-corpus-validate.js --corpus $fullCorpus --full
node dist/src/cli/tutorbench.js evaluate `
  --corpus $fullCorpus `
  --full `
  --report-locale en `
  --output artifacts/real-model/preliminary-minimax-tutor-bilingual-001.evaluation.json
```

For a successful four-case smoke this prints `Reused responses: 4`,
`Model calls made: 44`, and `Responses: 48/48`. The four smoke responses and
the forty-four newly completed responses remain under one corpus ID and one
response-identity scheme; this command does not create a second full corpus.
Full coverage means 48 planned calls, 48 successful responses, zero
collection failures, and `coverage: "full"`. Evaluation replays the frozen
corpus through `RecordedTutor`; it never regenerates Tutor text.
Because this historical corpus records `tutor-eval-v0.2a@0.2a.3`, the evaluate
command resolves and validates it against the immutable `0.2a.3` snapshot. The
`--allow-compatible-replay` flag is only for an explicitly audited later target
identity, not for this same-identity historical evaluation.

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
$env:CHAT_COMPLETIONS_JUDGE_MAX_TOKENS = "2048"
$env:CHAT_COMPLETIONS_JUDGE_REASONING_SPLIT = "enabled"
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

The MiniMax OpenAI-compatible documentation currently lists
`max_completion_tokens` maximums of 524288 for MiniMax-M3 and 204800 for the
listed M2.x models. The example uses `2048` as a conservative cross-model
Judge cap; it is not a new generic Judge limit. Confirm the exact model's
current limit before increasing it. With reasoning models, the enabled
`CHAT_COMPLETIONS_JUDGE_REASONING_SPLIT` setting keeps thinking out of the
JSON parser: the Judge parses only final `message.content` and never stores
`reasoning_content`, `reasoning_details`, or provider metadata.

The Tutor provider, Judge provider, and optional Review Translation provider
are recorded as separate descriptors. The result remains preliminary and
uncalibrated; it is not a leaderboard or model ranking.

## Observed DeepSeek V4-Pro Judge run and strict recovery

The first full bilingual Judge run used the frozen 48-response corpus,
`deepseek-v4-pro`, the repository's
`tutor-eval-pedagogy-judge-system@0.3` prompt, thinking enabled, high reasoning
effort, and an 8192-token output cap:

```powershell
$env:DEEPSEEK_API_KEY = "<local secret>"
$env:DEEPSEEK_JUDGE_MODEL = "deepseek-v4-pro"
$env:DEEPSEEK_JUDGE_THINKING = "enabled"
$env:DEEPSEEK_JUDGE_REASONING_EFFORT = "high"
$env:DEEPSEEK_JUDGE_MAX_TOKENS = "8192"
$env:DEEPSEEK_JUDGE_TIMEOUT_MS = "60000"
$env:DEEPSEEK_JUDGE_MAX_ATTEMPTS = "2"

$judgeEvaluation = "artifacts/real-model/preliminary-minimax-m27-tutor-bilingual-001.evaluation.json"
node dist/src/cli/tutorbench.js evaluate `
  --corpus $fullCorpus `
  --full `
  --judge-deepseek `
  --report-locale zh-CN `
  --output $judgeEvaluation
```

That observed run completed with 21 passed, 24 failed, and 3
`judge_timeout` errors. The timeout case-runs were
`language-word-context-001-zh-CN`, `programming-loop-diagnosis-001`, and
`programming-loop-diagnosis-001-zh-CN`. They were recovered with a
conservative 180-second timeout for this real V4-Pro baseline after observed
latencies above 60 seconds; this is not a claim that DeepSeek always needs 180
seconds:

```powershell
$env:DEEPSEEK_JUDGE_TIMEOUT_MS = "180000"
$recoveredEvaluation = "artifacts/real-model/preliminary-minimax-m27-tutor-bilingual-001.evaluation-recovered.json"
node dist/src/cli/tutorbench.js evaluate `
  --corpus $fullCorpus `
  --full `
  --judge-deepseek `
  --resume-evaluation $judgeEvaluation `
  --report-locale zh-CN `
  --output $recoveredEvaluation
```

`--resume-evaluation` validates the previous artifact and its corpus, dataset,
Tutor, case, frozen-response, evaluator, and Judge semantic identities before
any Judge call. Valid `passed` and `failed` case-runs are reused; `error`
case-runs are evaluated again through `RecordedTutor`, without regenerating
Tutor responses. The expected recovery telemetry is 45 reused evaluation
case-runs, 3 Judge calls, and 48 final case-runs. This is operator-controlled
recovery, not an automatic retry policy, and changing timeout or max-attempt
execution policy does not change the Judge scoring identity.

This remains a preliminary, uncalibrated result and is not eligible for a
public leaderboard or model-ranking claim.

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
