# Judge candidate comparison

This workflow compares Judge candidates on a fixed, synthetic diagnostic
fixture. It exists to measure agreement and run-to-run stability before
spending more quota on prompt wording changes. It does not select a winner,
claim calibration, or turn developer-authored expectations into human gold.

## Why this is not another prompt iteration

The fixed A/B/C word-context fixture was evaluated three times with identical
input, the same `deepseek/deepseek-v4-pro` identity, and the unchanged
`tutor-eval-pedagogy-judge-system@0.9` prompt. The expected correctness labels
were A `PASS`, B `PARTIAL`, and C `FAIL`.

The observed v0.9 runs were:

| run | A | B | C | C `answer_leakage` |
| --- | --- | --- | --- | --- |
| 1 | PASS | PASS | PARTIAL | true |
| 2 | PASS | PARTIAL | FAIL | false |
| 3 | PARTIAL | PASS | PARTIAL | false |

That is A agreement `2/3`, B agreement `1/3`, C agreement `1/3`, and the full
expected A/B/C pattern in `1/3` runs. The critical leakage classification also
varied on identical input. This is enough evidence of material single-call
variance to stop chasing a single DeepSeek output with prompt v0.10 or v0.11.
It does not rule out systematic calibration bias; it changes the next
question from “which wording fixes this run?” to “which candidate is worth
further calibration, and how stable is it on this probe?”

The fixture remains purposive and narrow. Its expectations are
developer-authored diagnostic expectations, not human calibration gold. No
general Judge accuracy claim is valid from this report.

## Architecture and preserved semantics

The comparison engine is provider-independent:

```text
candidate definitions
        -> generic comparison runner
        -> TutorResponseCorpus replay
        -> provider-independent Judge contract
        -> fixture observation adapter
        -> comparison metrics/report
```

The initial fixture adapter is `word-context`, but the runner only consumes a
fixture's stable IDs and provider-independent observations. Candidate-specific
transport remains in the existing generic Chat Completions adapter and its
thin provider profiles.

This task does not change:

| identity | value |
| --- | --- |
| Judge prompt | `tutor-eval-pedagogy-judge-system@0.9` |
| dataset | `tutor-eval-v0.2a@0.2a.5` |
| diagnostic fixture | `judge-word-context-discrimination@0.1.0` |
| case | `language-word-context-001@1.1.1` |
| evaluator | `0.3a.4` |
| comparison artifact | independent `schemaVersion: 1` |

The existing `judge-word-context-discrimination` command remains compatible.
It still performs its original three-call DeepSeek diagnostic. The new
comparison command does not call a Tutor provider.

## Candidates

### DeepSeek V4-Flash

The comparison harness uses the explicitly configured
`DEEPSEEK_JUDGE_MODEL`; it does not default to V4-Pro and does not remove Pro
support. For this comparison, configure:

```powershell
$env:DEEPSEEK_API_KEY = "<local secret>"
$env:DEEPSEEK_JUDGE_MODEL = "deepseek-v4-flash"
```

The report records the effective thinking mode, reasoning effort when
applicable, temperature when applicable, max output tokens, and
`seedControl: unsupported`. DeepSeek's separately returned
`reasoning_content` is ignored and is never persisted.

### MiniMax Judge

MiniMax is a Judge-only adapter. It does not read `TUTOR_MODEL_API_KEY` and
does not share the Tutor credential boundary by default. Configure its own
environment variables:

```powershell
$env:MINIMAX_JUDGE_API_KEY = "<local secret>"
$env:MINIMAX_JUDGE_MODEL = "<exact model id returned by the model list>"
```

The default China canonical base is:

```text
https://api.minimaxi.com/v1/chat/completions
```

Recheck the account's current behavior against MiniMax's official
[OpenAI-compatible Chat Completions reference](https://platform.minimaxi.com/docs/api-reference/text-chat-openai)
and [model-list endpoint](https://platform.minimaxi.com/docs/api-reference/models/openai/list-models)
before a paid run.

The base can be explicitly overridden with `MINIMAX_JUDGE_BASE_URL`; the
effective non-secret base and canonical `/chat/completions` path are recorded
in the report. The implementation never defaults to
`https://api.minimax.io/v1` and never guesses `MiniMax-M3` or any other model
ID.

The remaining optional MiniMax controls are:

```powershell
$env:MINIMAX_JUDGE_BASE_URL = "https://api.minimaxi.com/v1" # default
$env:MINIMAX_JUDGE_TIMEOUT_MS = "60000"
$env:MINIMAX_JUDGE_MAX_ATTEMPTS = "2"
$env:MINIMAX_JUDGE_MAX_TOKENS = "2048"
$env:MINIMAX_JUDGE_TEMPERATURE = "<0..2>"
$env:MINIMAX_JUDGE_MAX_OUTPUT_TOKENS_FIELD = "max_completion_tokens"
$env:MINIMAX_JUDGE_REASONING_SPLIT = "enabled"
$env:MINIMAX_JUDGE_JSON_MODE = "disabled" # default; enable only if the account documents it
```

`MINIMAX_JUDGE_MODEL` is mandatory for execution. A missing model is a
configuration error before any Judge call. A missing key produces the
existing `judge_unavailable` failure without invoking the fetch transport.

Before selecting the model, an operator may inspect the IDs available to the
China account without the benchmark CLI making an extra discovery request:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "https://api.minimaxi.com/v1/models" `
  -Headers @{
    Authorization = "Bearer $env:MINIMAX_JUDGE_API_KEY"
  }

$env:MINIMAX_JUDGE_MODEL = "<actual returned M3 model id>"
```

The placeholder above is intentional: the account response is the authority
for the exact M3 model ID. The repository does not claim a fixed ID.

MiniMax requests enable `reasoning_split` by default and the final parser
consumes only `message.content`. JSON-mode request parameters are disabled by
default because the China OpenAI-compatible parameter list does not document
`response_format`; the local parser still requires a valid Judge JSON result.
If final content still contains a `<think>` wrapper, if reasoning and final
JSON cannot be separated, or if final JSON fails to parse, the Judge result is
rejected as `judge_result_invalid`.
Provider reasoning fields, raw payloads, authorization headers, and keys are
never written to the comparison artifact.

## Run the comparison

Build with the repository Node 22 runtime, configure one or both candidates,
and inspect the call budget printed before execution:

```powershell
npm run build

$env:DEEPSEEK_JUDGE_MODEL = "deepseek-v4-flash"
$env:MINIMAX_JUDGE_MODEL = "<actual returned M3 model id>"

node dist/src/cli/tutorbench.js judge-candidate-comparison `
  --fixture word-context `
  --judge-deepseek `
  --judge-minimax `
  --runs-per-candidate 3 `
  --output artifacts/judge-candidate-comparison.json
```

Before live calls, the command prints:

```text
Candidates: 2
Fixtures: 3
Runs per candidate: 3
Planned Judge calls: 18
```

The default is one repetition per candidate. Increase it explicitly when the
operator accepts the quota cost. The harness runs candidates and repetitions
sequentially so the call budget remains visible and bounded.

## Report interpretation

Each candidate records:

- provider/model identity, for example `deepseek/deepseek-v4-flash` and
  `minimax/<operator-supplied-model-id>`;
- prompt ID/version and the observable generation profile;
- effective timeout and bounded transport-attempt profile;
- every repetition's A/B/C observed correctness label;
- expected-label agreement by fixture and overall;
- exact expected A/B/C run agreement;
- PASS/PARTIAL/FAIL label counts and unavailable counts;
- per-fixture modal label, modal-label share among observed labels, and
  unanimous status;
- true/false/unavailable answer-leakage counts;
- per-fixture modal leakage and modal-leakage share when leakage is available;
- critical-failure signatures by fixture and the count outside each fixture's
  modal signature;
- `insufficientInformation` counts and execution errors by stable code;
- per-call latency, mean, median, and unavailable latency counts; and
- input/output/total token measurements, with unavailable fields left
  unavailable rather than estimated.

`criticalFailureDisagreementCount` is a stability diagnostic: for each fixture,
it counts known observations that differ from that fixture's modal
critical-failure signature. It is not a human-gold correctness score.

`stability.labelByFixture` reports the modal observed correctness label and its
share among non-error observed labels. Unavailable labels remain a separate
count and are not estimated. `stability.answerLeakageByFixture` applies the
same modal/share treatment to the boolean leakage signal. A modal share is a
descriptive stability measure for this fixture and repetition count, not an
accuracy or calibration estimate.

The report's `selectionStatement` is always:

```text
No winner is inferred automatically.
```

The pairwise summary can say that one candidate had higher agreement with this
diagnostic expectation set, lower observed variance on this probe, fewer
critical-failure disagreements, lower latency, or lower reported token use.
It cannot say that a candidate is calibrated, objectively better, or generally
accurate.

MiniMax Tutor plus MiniMax Judge is a same-provider/model-family comparison.
That can be a lower-cost candidate for follow-up, but correlated bias remains
a risk. High same-family agreement is not independent human calibration.

## Provider-free validation boundary

CI tests use fake fetch functions and synthetic Judge results. They cover both
provider request envelopes, repeated candidates, planned and exact call
counts, label/leakage/critical-failure distributions, unavailable metrics,
reasoning separation, malformed JSON, missing model/key, China default base,
and secret/reasoning exclusion. CI does not call DeepSeek, MiniMax, OpenAI, or
any remote model.

The normal local gates remain:

```text
npm run typecheck
npm run lint
npm test
npm run build
npm run benchmark
git diff --check
```

`npm run benchmark` without a configured Judge may finish with expected
`judge_unavailable` errors and no scores. That is not a benchmark pass and is
not changed by this comparison layer.
