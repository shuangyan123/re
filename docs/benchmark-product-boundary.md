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
| Tutor / Provider Integration | `src/adapters/`, `src/providers/openai/`, selected `src/cli/` commands | Adapts a product, model, callback, or recorded response to the provider-independent boundary |
| Advanced Reproducibility | `src/corpus/`, `src/contracts/tutor-generation.ts`, `src/contracts/tutor-execution.ts`, `src/contracts/tutor-response-corpus.ts` | Records, replays, freezes generation identity, and validates official-run evidence |
| Calibration | `src/calibration/`, `fixtures/calibration/` | Provides provider-independent annotation packets, agreement metrics, and adjudication contracts; synthetic fixtures are not human calibration claims |
| Website | `src/site/`, `website/` | Consumes public benchmark artifacts and does not execute Tutors or change scoring |

The intended direction is one-way:

```text
Benchmark Definition -> Generic Runner -> Tutor adapter
                                  \-> evaluator/Judge -> result/report

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
For an external HTTP integration, the smallest future protocol is:

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
belong to that integration, not to the benchmark core. This round documents
the protocol and tests a custom Tutor through the public package surface; it
does not add a second transport framework.

### Advanced Reproducibility

`TutorResponseCorpus`, `TutorGenerationSpec`, and `TutorExecutionPacket` stay
in the repository. They are the frozen evidence and official-run layer:

```text
Local:    case -> TutorUnderTest -> evaluator -> result
Official: case -> generation packet -> Tutor host -> corpus -> replay/Judge
```

The strict path is valuable for public comparability, cross-host replay, and
calibration. It is not a prerequisite for a developer's first smoke run.

## Public API classification

The package root is the stable public surface:

- `TutorUnderTest`, `TutorTurnInput`, `TutorTurnOutput`
- `runTutorBenchmark`, `runTutorEval`
- `loadTutorEvalDataset`
- TutorEval dataset and result types

Advanced or experimental modules remain explicit repository modules:

- Corpus/replay and generation/execution packets
- Calibration and synthetic calibration fixtures
- OpenAI Judge provider
- Website artifact/build helpers
- Scripted, recorded, dry-run, and provider-specific adapters

Keeping these modules available preserves real use cases without making their
types part of the default import path.

## Developer modes

1. Local evaluation: direct `TutorUnderTest` execution and scoring.
2. Reproducible evaluation: frozen response corpus, replay, and evaluator
   comparison.
3. Official/public evaluation: canonical generation profile, repeated runs,
   validated evidence, and calibrated public artifacts.

The modes are additive. A product integration is one possible Tutor, not the
execution host required by the benchmark.

## Review Workspace role

Review Workspace is one optional integration in a future adapter layer. It is
not the benchmark's core, default runner, credential manager, or model
catalogue. A future bridge may execute a canonical packet and emit a sanitized
corpus, but it belongs outside this repository's core contracts.

## Public adoption status

The technical boundary is provider-neutral and the default runner is available.
The repository still has a genuine public-adoption blocker: no license has
been specified. This note does not choose a license on the maintainer's
behalf.
