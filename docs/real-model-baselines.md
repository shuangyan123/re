# Real-model baseline collection

Tutor Benchmark now has a local evidence-collection path for an externally
hosted Tutor. It freezes successful response text and the existing
`baseline-native-default` generation identity into the existing
`TutorResponseCorpus` contract. It does not add a provider SDK, credential
store, model registry, or another evaluator.

## What this is

There are two valid baseline conditions, and they must not be mixed:

- A model baseline sends the canonical benchmark-visible input to a model host.
- A product Tutor baseline sends the same benchmark case through a product's
  orchestration, persona, memory, or other product behavior.

The collection command records the declared Tutor descriptor and transport,
but it cannot prove what an external host added around the request. A host may
only be described as a canonical model baseline when it actually uses the
canonical benchmark messages and does not prepend hidden prompts, inject
memory, rewrite the student message, or truncate the case. Otherwise use
`external` or `review_workspace` provenance and describe it as a product Tutor
evaluation.

The first results are always:

```text
status: preliminary
calibrationStatus: uncalibrated
publicLeaderboardEligible: false
```

They are not scientifically validated rankings, stable scores, or public
leaderboard submissions. Human/Judge calibration, repeated-run variance,
confidence intervals, statistical comparison, and public review are separate
later work.

## Collect responses

The host owns provider credentials and model API behavior. The benchmark only
uses the provider-neutral HTTP Tutor adapter:

```bash
npm run build
node dist/src/cli/tutorbench.js collect \
  --http http://127.0.0.1:8000/respond \
  --provider openai \
  --model <actual-model-id> \
  --provenance recorded_model \
  --limit 3 \
  --runs 1 \
  --output artifacts/real-model/baseline.json \
  --report artifacts/real-model/baseline.report.json
```

`--provider` and `--model` are evidence metadata supplied by the caller. They
do not cause the benchmark to look for `OPENAI_API_KEY` or call a vendor API.
`--provenance` is explicit so an opaque product Tutor cannot be mislabeled as
a direct model recording. Use `recorded_model` only for a direct commercial or
foundation-model host, `external` for a generic external Tutor, and
`review_workspace` for that product integration.

The command supports `--dataset`, repeated `--case`, `--limit`, `--runs`,
`--timeout-ms`, `--model-version`, `--corpus-id`, `--output`, `--report`, and
`--dry-run`. Execution is sequential, has no automatic Tutor retry, and
prints the planned call count before making requests. `--dry-run` loads and
selects the dataset but makes zero Tutor calls.

The default output is under ignored `artifacts/real-model/`. Real output is
not automatically committed or copied into `website/public-data`.

## Failure and coverage semantics

Only successful Tutor outputs become corpus responses. A transport failure,
non-2xx response, invalid JSON, invalid Tutor output, or timeout is a failed
case/run, not a response containing an error string. Completed responses are
retained and the collection report records only sanitized failure identities:

```text
caseId, caseVersion, runIndex, stable failure code
```

The corpus is `full` only when every selected case and run succeeded and the
selection covers the complete canonical dataset. A subset or any failed
case/run is `partial`. Partial corpora may be validated and replayed as the
available evidence; `--full` evaluation still fails closed when canonical
coverage is incomplete.

Resume is intentionally not implemented in v0.1. A safe resume needs to
verify dataset, generation spec, Tutor descriptor, corpus identity, and each
missing `(caseId, runIndex)` before making another billable or stateful call.
One-shot collection keeps that boundary explicit.

## Validate, replay, and evaluate

Collection validates the generated corpus before reporting success. The same
file can be replayed without contacting the Tutor:

```bash
node dist/src/cli/tutorbench.js evaluate \
  --corpus artifacts/real-model/baseline.json \
  --output artifacts/real-model/baseline.result.json
```

`evaluate` reuses the existing `runTutorResponseCorpus` path and existing
`TutorEvalRunResult` scoring contract. Deterministic rubrics run locally;
Judge-required rubrics remain unresolved by default. `--judge-openai` is an
explicit opt-in to the existing OpenAI Judge provider, and any such result
still remains uncalibrated. The evaluation artifact adds only outer metadata;
the core result contract is unchanged.

The compatibility command remains available:

```bash
npm run benchmark:corpus -- -- --corpus artifacts/real-model/baseline.json
```

## Privacy and publication boundary

The corpus stores Tutor text, stable case/run identity, truthful Tutor
descriptor metadata, generation identity, provenance, and sanitized metrics
(`latencyMs`, `tokenUsage`, and `cost` when trustworthy). It never stores the
HTTP endpoint, authorization headers, cookies, API keys, credentials, raw
provider payloads, provider stack traces, hidden reasoning, or evaluator-only
annotations.

The HTTP endpoint may still return output containing URLs, personal-data-like
text, private prompts, or provider diagnostics. Before any intentional public
promotion, review copyright, provider terms, PII, private prompts,
credentials, and unexpected model disclosure. The sanitizer is not a complete
publication review.

No live endpoint or credentials are required in CI. Repository tests use a
local fake HTTP Tutor and synthetic fixtures. A fake response is never labeled
`recorded_model`; without an actual external model/product call there is no
real-model baseline artifact to report.
