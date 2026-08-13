# TutorEval 0.3B: Real Judge Provider Integration

TutorEval 0.3B adds one real, opt-in Judge provider while preserving the
provider-independent TutorEval contracts and the 0.3A hybrid routing boundary.
The supported flow is:

```text
runner -> TutorEvalJudge -> OpenAI Responses adapter -> validated Judge result
```

This is provider integration, not calibration. A provider result is evidence
from an external Judge and is stored only after it passes the existing
`parseTutorEvalJudgeResult()` contract and the existing rubric ownership
checks. It is not evidence that the benchmark measures learning impact.

## Request boundary

The adapter is the only source file that imports the official `openai` SDK.
Core contracts, deterministic evaluators, runner orchestration, and reporting
remain provider-independent. The adapter receives a `TutorEvalJudgeInput`
already built by the runner, containing only the Judge-owned rubrics for the
current case. It does not reload the full dataset case or evaluator-only
annotations.

Requests use the Responses API with:

- the existing versioned system prompt loaded by the shared prompt loader;
- a tagged, serialized `TutorEvalJudgeInput` user payload;
- strict JSON Schema Structured Outputs;
- `store: false`;
- no streaming or background execution;
- an explicit model selected by `OPENAI_JUDGE_MODEL`.

The schema is built at the Judge boundary and is versioned as
`tutor_eval_judge_result_v1`. It requires the complete case-scoped result,
restricts enums, and rejects unknown properties. The response is still parsed
by the core result parser; the JSON returned by the provider is never copied
to benchmark output as a raw provider payload.

## Configuration and privacy

Live execution reads the API key only from `OPENAI_API_KEY` at process runtime.
The key is not accepted as a CLI argument, printed, persisted, included in
errors, or added to result metadata. The model is required explicitly and
aliases such as `latest`, `auto`, and `recommended` are rejected. A provider
model version is not fabricated when the adapter cannot resolve one.

Optional environment variables are:

```text
OPENAI_JUDGE_MODEL              required for dry-run and live execution
OPENAI_JUDGE_TIMEOUT_MS         default 30000
OPENAI_JUDGE_MAX_ATTEMPTS       default 2, bounded at 3
OPENAI_JUDGE_TEMPERATURE        optional; recorded only when used
OPENAI_JUDGE_REASONING_EFFORT   optional; recorded only when used
```

The generic descriptor records provider, model, prompt identity, and actual
generation configuration. Metrics separate Judge latency from Tutor latency;
they contain sanitized latency, attempts, token counts when supplied, and a
null cost because this adapter does not invent pricing.

## Failure semantics

Refusal, incomplete output, failed response status, empty output, malformed
JSON, and schema-invalid output are Judge execution failures. They do not
become a Tutor `FAIL`. The stable mapping is:

| Condition | Benchmark code |
| --- | --- |
| Missing runtime key or disabled provider | `judge_unavailable` |
| Explicit timeout | `judge_timeout` |
| Network, rate-limit, or server failure after bounded retry | `judge_transport_error` |
| Refusal, incomplete, empty, malformed, or schema-invalid result | `judge_result_invalid` |
| Parsed result omits or invents rubric ownership | existing missing/unexpected rubric errors |

Only transient transport failures are retried. Schema failures, refusals,
incomplete responses, and Tutor execution are not retried or regenerated.
The SDK's own retry loop is disabled so the adapter owns the attempt bound.
Provider errors are converted to stable, privacy-safe error objects without
retaining raw SDK payloads, URLs, prompts, or exception text.

## CLI and tests

The live entry point is intentionally separate from the deterministic
benchmark command:

```text
npm run judge:openai -- -- --dry-run --case hint-only-linear-equation-001
npm run judge:openai -- -- --dry-run --limit 3
npm run judge:openai -- -- --live --case hint-only-linear-equation-001
```

`--dry-run` is the default and makes no network request. `--live` requires an
explicit model and runtime key. Selection is a single case, a bounded subset,
or the full checked-in synthetic dataset with `--all`; live smoke execution is
off unless explicitly requested. CI invokes no live mode and needs no secret.

The provider tests inject a small fake Responses client rather than patching
globals. They cover strict schema construction, request data minimization,
valid output, malformed/refused/incomplete output, timeout, bounded retry,
missing key, deterministic-only no-network behavior, rubric mismatch, runner
metric isolation, raw payload isolation, and provider independence.

## Deliberate boundary

0.3B does not add Anthropic or Gemini adapters, multi-provider fallback,
provider-specific core contracts, real Tutor integrations, pairwise scoring,
human calibration claims, statistical analysis, dashboards, databases, or
student simulation. The next priority is human reference calibration against
the existing 0.2B infrastructure.
