# Tutor Benchmark Product Boundary

This note records the architecture simplification motivated by
[DeepSWE](https://github.com/datacurve-ai/deep-swe). The useful lesson is the
separation between a benchmark definition, a generic execution path, and a
product-specific integration. Tutor Benchmark does not copy DeepSWE's coding
task format, Harbor/Pier runtime, sandbox, or agent workflow.

## Current dependency map

The repository already has the following responsibilities:

| Layer | Current implementation | Boundary |
| --- | --- | --- |
| Benchmark Definition | `src/contracts/`, `scenarios/`, `rubrics/`, `src/datasets/`, `src/evaluators/`, `src/scoring/` | Cases, visible/evaluator-only separation, rubrics, deterministic checks, Judge contracts, aggregation, and result validation |
| Generic Runner | `src/runner/`, `src/reporting/` | Executes a `TutorUnderTest`, evaluates cases in stable order, isolates failures, and emits typed results/reports |
| Tutor / Provider Integration | `src/adapters/`, `src/providers/openai/`, `src/cli/tutorbench.ts`, `examples/http-python-tutor/` | Adapts a product, model, callback, recorded response, or external HTTP service to the provider-independent boundary |
| Advanced Reproducibility | `src/corpus/`, `src/collection/`, `src/contracts/tutor-generation.ts`, `src/contracts/tutor-execution.ts`, `src/contracts/tutor-response-corpus.ts`, `src/cli/tutorbench-collect.ts`, `src/cli/tutorbench-collect-model.ts` | Separates Product Tutor collection from canonical model collection; records sanitized reports, replays frozen responses, and validates evidence |
| Calibration | `src/calibration/`, `fixtures/calibration/` | Provides provider-independent annotation packets, agreement metrics, and adjudication contracts; synthetic fixtures are not human calibration claims |
| Website | `src/site/`, `website/` | Consumes public benchmark artifacts and does not execute Tutors or change scoring |

The intended direction is one-way:

```text
                         Benchmark Cases
                              |
                 +------------+------------+
                 |                         |
                 v                         v
          Product Tutor path       Canonical Model path
          TutorTurnInput            ExecutionPacket/messages
                 |                         |
                 v                         v
          Product Tutor             Model Execution Host
                 |                         |
                 +------------+------------+
                              v
                    TutorResponseCorpus
                              v
                           evaluate

Advanced reproducibility and the website consume stable contracts;
they do not become prerequisites for local evaluation.
```

The core has no dependency on Review Workspace, Electron, Dexie, browser
state, credentials, product databases, or model discovery.

## Four-layer architecture

### Benchmark Core

The core owns TutorEval cases, the Tutor-visible/evaluator-only firewall,
atomic rubrics, deterministic evaluator contracts, the optional semantic Judge
contract, scoring, critical-failure semantics, dataset integrity, and typed
results.

Tutor evaluation cannot be reduced to `response == expectedAnswer`: teaching
quality includes diagnosis, guidance, adaptation, actionability, disclosure
policy, and criteria that require semantic judgment. Deterministic evaluators
remain honest proxies, while Judge-required criteria remain unresolved when no
Judge is configured.

### Generic Runner

The small public path is:

```ts
const result = await runTutorBenchmark({ tutor });
```

The package root also exposes `runTutorEval` for callers that need explicit
dataset, Judge, repeat-run, scoring, or clock controls. Both paths preserve
stable case ordering, per-case failure isolation, criterion-level evidence, and
the evaluator-only firewall.

### Integration

An integration only needs to implement:

```ts
interface TutorUnderTest {
  id: string;
  respond(input: TutorTurnInput): Promise<TutorTurnOutput>;
}

interface TutorTurnOutput {
  text: string;
  // Optional sanitized metrics only; raw provider payloads stay at the edge.
  metrics?: {
    latencyMs?: number;
    tokenUsage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
    cost?: number;
  };
}
```

This is intentionally transport-neutral. A JavaScript callback, local model,
product API, HTTP service, or another language can implement the boundary.
The repository now implements a stable v1 external HTTP integration. It is a
transport adapter, not a second benchmark runner or provider framework:

```text
POST /respond
request:  TutorTurnInput JSON
response: { "text": "..." }
```

For example, a non-TypeScript host can keep its transport adapter this small:

```http
POST /respond HTTP/1.1
Content-Type: application/json

{
  "scenarioId": "fraction-misconception-001",
  "caseId": "fraction-misconception-001",
  "caseVersion": "1.1.0",
  "runIndex": 1,
  "learningObjective": "Compare fractions with unlike denominators.",
  "initialContext": "",
  "conversation": [],
  "currentStudentMessage": "I think 1/3 + 1/4 = 2/7. Can you help me check it?",
  "studentState": {
    "knownConcepts": [],
    "misconceptions": ["Compare denominators directly."],
    "level": "developing",
    "goal": "Learn the next step."
  }
}
```

The host returns only the public Tutor output shape:

```json
{ "text": "First find a common denominator. What could you choose?" }
```

Authentication, timeouts, retries, provider metadata, and raw error handling
are intentionally constrained at the HTTP adapter boundary. v1 validates
`http`/`https` endpoint URLs, rejects embedded credentials, uses an explicit
finite timeout, does not retry requests, and retains only the sanitized
`TutorTurnOutput` fields. It does not implement authentication, credential
storage, or remote-service retry policy. Non-2xx responses, invalid JSON,
invalid output, timeouts, and network failures become per-case adapter
failures through the existing runner isolation.

### Advanced Reproducibility

`TutorResponseCorpus`, `TutorGenerationSpec`, and `TutorExecutionPacket` stay
in the repository. They are the frozen evidence and official-run layer, but
the two collection modes have different meanings:

```text
Product:   case -> TutorTurnInput -> Product Tutor -> corpus -> replay/evaluate
Canonical: case -> ExecutionPacket -> Model Host -> corpus -> replay/evaluate
```

`tutorbench collect` owns the first path and never writes a generation spec.
`tutorbench collect-model` owns the second path and is the only collector that
can write `recorded_model` plus `baseline-native-default`. The strict canonical
path is valuable for public comparability and cross-host replay; it is not a
provider SDK or a prerequisite for a developer's first smoke run.

The canonical HTTP adapter sends the validated `TutorExecutionPacketFile`
directly and is intentionally not a `TutorUnderTest` implementation. The
existing `HttpTutor` continues to send only `TutorTurnInput`. This transport
separation prevents Product Tutor orchestration evidence from being mislabeled
as canonical foundation-model evidence.

## Public API classification

The package root is the stable public surface:

- `TutorUnderTest`, `TutorTurnInput`, `TutorTurnOutput`
- `runTutorBenchmark`, `runTutorEval`
- `loadTutorEvalDataset`
- `createHttpTutor`
- TutorEval dataset and result types

Advanced or experimental modules remain explicit repository modules:

- Corpus/replay and generation/execution packets
- Calibration and synthetic calibration fixtures
- OpenAI Responses Judge and DeepSeek Chat Completions Judge providers
- Website artifact/build helpers
- Scripted, recorded, dry-run, and provider-specific adapters

Keeping these modules available preserves real use cases without making their
types part of the default import path.

## Developer modes

1. Local evaluation: direct `TutorUnderTest` execution and scoring.
2. Product evidence collection: `tutorbench collect`, Product Tutor
   orchestration, and a corpus without `generationSpec`.
3. Canonical model evidence collection: `tutorbench collect-model`, exact
   packet execution, validated support attestation, and a generation-bound
   corpus.
4. Public evaluation: reviewed and calibrated artifacts only after the earlier
   evidence boundaries are satisfied.

The modes are additive. A product integration is one possible Tutor, not the
execution host required by the benchmark.

## Review Workspace role

Review Workspace is one optional integration in a future adapter layer. It is
not the benchmark's core, default runner, credential manager, or model
catalogue. A future bridge may execute a canonical packet and emit a sanitized
corpus, but it belongs outside this repository's core contracts.

## Public adoption status

The technical boundary is provider-neutral and the default runner is available.
The former licensing blocker has been resolved by the project's explicit
multi-license policy:

- Software implementation is under Apache-2.0.
- Authored benchmark, dataset, and evaluation content is under CC BY 4.0.
- TutorBench names and brand assets follow the separate Brand Policy.

See [`docs/licensing.md`](licensing.md) for scope, mixed-file, generated
artifact, and attribution rules. This closes the licensing blocker only. The
project remains a public Developer Preview. Its five-minute first-run path is
the separate `tutorbench quickstart` demonstration: it wraps the existing
legacy deterministic smoke dataset, TutorUnderTest boundary, runner, and
deterministic evaluators, and emits an independent non-official summary. It is
not a new Benchmark Core, does not alter the canonical `0.2a.5` cohort, and
does not make community review infrastructure, public verified model
submissions, or a calibrated leaderboard available.
