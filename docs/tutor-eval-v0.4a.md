# Tutor Benchmark 0.4A.1: Canonical Tutor Generation Boundary

0.4A establishes the provider-independent boundary for recorded Tutor
responses. It does not implement a Tutor, call a real Tutor provider, or
claim that the checked-in synthetic fixtures represent production Tutor
behavior.

The lifecycle is deliberately separated:

```text
generate -> freeze -> evaluate -> annotate -> calibrate
```

0.4A.1 adds the missing benchmark generation rule between a case and a
response corpus:

```text
TutorEval case
  -> TutorGenerationSpec
  -> canonical Tutor messages
  -> TutorExecutionPacket
  -> execution host/model
  -> TutorResponseCorpus
```

The earlier 0.4A visible packet remains supported. It is a semantic adapter
packet; it is not a complete model-execution specification.

## Why the earlier 0.4A boundary was not enough

`TutorVisibleCasePacket` defined the visible semantic input, but it did not
pin the prompt bytes, output limit, or the exact message construction. Two
hosts could therefore receive the same case while choosing different system
prompts, serializations, conversation mappings, or generation limits. Those
runs would not be strict reproductions of one model benchmark.

Live Tutor generation is different from recorded response evaluation. Once a
`TutorResponseCorpus` is frozen, the same candidate response can be evaluated
by deterministic evaluators, an OpenAI Judge, and human reviewers without
calling the Tutor again.

## Corpus contract

The versioned `TutorResponseCorpus` contains:

- `corpusId` and `corpusVersion`;
- `datasetId` and `datasetVersion`;
- creation time and explicit `full`/`partial` coverage;
- the bounded `runsPerCase` value;
- optional canonical `TutorGenerationSpec` identity for legacy compatibility;
- one sanitized `TutorEvalTutorDescriptor` for the actual provider/model
  configuration;
- immutable candidate records with explicit `responseId`, case identity,
  one-based `runIndex`, response text, provenance, and sanitized metrics.

Provider-specific SDK objects, credentials, URLs, raw payloads, full prompts,
and hidden reasoning are not part of the contract. Corpus parsing rejects
credential-like and raw-payload field names instead of silently retaining
them.

Supported response provenance values are:

```text
synthetic | recorded_model | review_workspace | external
```

`synthetic` is reserved for synthetic fixtures. A recorded Review Workspace
response is represented as `review_workspace`, so it cannot be mistaken for a
synthetic pipeline fixture.

## Identity and versioning

`responseId` is explicit and is never assigned from array position. The
`deriveTutorResponseId()` helper can deterministically derive an ID from
corpus/dataset/case versions, the sanitized Tutor descriptor, and `runIndex`.
The hash allow-list intentionally excludes credentials, complete prompt text,
and raw provider payloads. When a corpus carries a generation spec, the
response identity also includes the spec ID/version, prompt ID/version/digest,
and benchmark-controlled output/runtime values. `maxOutputTokens` therefore
cannot silently change while retaining the same response identity.

## TutorGenerationSpec

The canonical baseline spec is versioned and provider-independent:

```text
schemaVersion
specId
specVersion
prompt.id
prompt.version
prompt.sha256
maxOutputTokens
temperature?
reasoningEffort?
seed?
```

The checked-in source of truth is
`prompts/tutor-baseline-system-v0.1.md`. `digestTutorPrompt()` hashes its
exact UTF-8 bytes with SHA-256. Identical bytes produce the same 64-character
lowercase digest; any byte change produces a different digest. The prompt
identity is the combination of ID, version, and digest, so changing prompt
content without updating the version is still detectable.

`maxOutputTokens` is part of benchmark identity because it affects truncation,
verbosity, completeness, answer leakage, and actionability. Provider/model,
API keys, credential IDs, base URLs, connection IDs, and raw provider options
remain execution-host concerns and are not included in this contract.

## Canonical messages and execution packet

`buildTutorGenerationMessages()` emits the same provider-independent sequence
for every host:

```text
system    <- baseline prompt asset
user      <- stable visible benchmark context
user      <- prior student message
assistant <- prior Tutor message
user      <- current student message
```

The visible context uses an explicit field order for `learningObjective`,
`studentProfile`, and `problemContext`. Student profile fields are serialized
as `level`, `knownConcepts`, `misconceptions`, and `goal`; missing optional case
values become stable empty/default values through `toTutorTurnInput()`.

`TutorExecutionPacketFile` contains only dataset identity, the generation spec,
and stable case IDs/versions/messages. It is host input; it does not contain
`TutorEvalCase`, `evaluatorOnly`, ground truth, known misconceptions, rubrics,
critical failures, rubric IDs, Judge prompts, human annotations, or reference
labels. The packet builder first calls the existing visible-input conversion,
so generation does not create a second hidden-data mapping path.

`npm run tutor:export-execution` exports this packet with stable case ordering
and supports repeated `--case`, `--limit`, and `--all`. The existing
`npm run tutor:export-cases` remains the semantic adapter packet command.

The repository also contains a dry executor that consumes only an execution
packet and emits a synthetic, generation-bound corpus. It does not call a
provider or inspect dataset internals, rubrics, or Judge configuration.

The corpus version is immutable evidence. If response text or its semantic
generation identity changes, create a new response/corpus version. Do not edit
frozen response text while retaining the same `corpusVersion` and
`responseId`.

## Tutor-visible case packet

`npm run tutor:export-cases` writes a JSON packet for a Tutor implementation.
Selection supports one case, repeated `--case` values, `--limit`, or the full
dataset. The exported fields are exactly the visible case context:

```text
caseId
caseVersion
learningObjective
studentProfile
conversationHistory
studentMessage
problemContext
```

The packet is built from the existing `toTutorTurnInput()` conversion. There
is no second mapping from `TutorEvalCase`, which keeps `evaluatorOnly`, ground
truth, known misconception, disclosure policy, rubrics, critical failures,
and Judge/human instructions behind the Tutor boundary. Tests assert both the
absence of these fields and the absence of representative hidden values.

The baseline prompt at
`prompts/tutor-baseline-system-v0.1.md` is a small, versioned behavior
reference. It describes tutoring behavior only; it contains no rubric,
ground-truth, Judge, or evaluator annotation. It is a known baseline, not a
prompt optimized against this benchmark.

## RecordedTutor and corpus evaluation

`RecordedTutor`/`ReplayTutor`/`CorpusTutor` implements the existing
`TutorUnderTest` contract. It looks up `(caseId, caseVersion, runIndex)` in an
immutable in-memory index and returns the frozen response text and sanitized
metrics. It never calls a model. Missing or ambiguous identities fail closed.

On Windows/npm, pass the CLI separator twice as shown below:

```bash
npm run tutor:export-cases -- -- --case fraction-misconception-001
npm run tutor:export-execution -- -- --case fraction-misconception-001
npm run tutor:corpus:validate -- -- --corpus path/to/corpus.json
npm run benchmark:corpus -- -- --corpus path/to/corpus.json
```

The validation command validates the corpus schema, dataset identity, case
identity/version, Tutor descriptor,
provenance, duplicate response IDs, duplicate case/run pairs, and coverage.
`--full` makes missing dataset cases an explicit error.

The `benchmark:corpus` command validates and then runs the current hybrid
evaluator over the frozen responses. The optional
`--judge-openai` flag uses the existing explicit OpenAI Judge provider; it does
not regenerate Tutor responses. The result records selected case count,
available response count, missing case count, corpus coverage, and the normal
TutorEval result.

Partial corpora are honest subsets. They do not become full benchmark claims:

```text
selected case count
available response count
missing case count
```

Repeated runs remain distinct candidate responses. For example, one case with
three runs has the same case identity but `runIndex` values 1, 2, and 3 and
three distinct response IDs. A missing run is a corpus validation error.

## 0.2B calibration consumption

`toCalibrationCandidateResponseFile()` converts a frozen corpus into the
existing 0.2B `CalibrationCandidateResponseFile` contract. The existing blind
packet builder then creates reviewer entries using the same:

```text
datasetId + datasetVersion + caseId + caseVersion + responseId + rubricId
```

identity. Corpus provenance and source corpus identity remain internal source
metadata; they are not copied into the reviewer-facing rubric context. Human
annotation still has not happened merely because a corpus is recorded.

The committed `fixtures/calibration/` files remain synthetic pipeline
fixtures. They are intentionally not replaced by fabricated real responses.

## Benchmark baseline and production Tutor are different benchmarks

The `benchmark_baseline` path defined here uses the same canonical prompt,
messages, and generation spec for model-level comparison. A future
`review_workspace_production` evaluation may include product persona, memory,
learner state, orchestration, and micro-assessment output. Those product
conditions must not be mixed into the same model leaderboard.

The future 0.4B bridge should use Review Workspace's low-level
`generateWithConnection()` with this packet. It must not use `requestTutorReply()`
as the baseline executor because that product path adds persona, personal
memory, learner state, a product system prompt, and structured micro-assessment
output. This repository does not modify `demo` in 0.4A.1.

## Future Review Workspace bridge

The next phase is 0.4B in `shuangyan123/demo`, not in this repository. Its
bridge should consume the `TutorExecutionPacket`, pass the exact canonical
messages to the existing low-level generation boundary, execute the selected
provider/model using the host's credential boundary, capture only final Tutor
text and sanitized metrics, and emit a `TutorResponseCorpus` JSON file.

```text
re exports canonical execution packet
  -> demo host executes exact messages
  -> demo/re bridge writes corpus
  -> re validates and evaluates frozen corpus
```

`re` must not import `demo` internals or store its API keys, encrypted
credentials, credential IDs, Dexie records, provider registry, or provider raw
payloads. This 0.4A change therefore does not copy
`app/server/ai/provider-adapter.ts`, `provider-transport.ts`,
`execute-provider-generate.ts`, or `model-directory.ts`.

The future bridge must also keep benchmark evaluator data out of the request:
the Tutor receives only the visible packet, never rubric IDs, rubric text,
capability tags, critical status, ground truth, known misconception, or Judge
prompt. Development/prompt tuning and any future held-out evaluation must be
separate workflows; Judge failures must never be fed back into the same test
packet as hidden Tutor instructions.

## Scope status

0.4 remains partial. 0.4A.1 completes the canonical generation-spec and
execution-packet contract, but it does not implement a real bridge or collect
real model responses:

```text
0.4 Tutor Adapter Layer — PARTIAL: canonical generation + response corpus boundary

[x] stable Tutor response corpus contract
[x] canonical Tutor generation spec with prompt digest and output limit
[x] canonical Tutor execution packet and dry executor
[x] recorded/replay Tutor adapter
[x] Tutor-visible case export
[x] calibration integration
[x] Review Workspace adapter protocol
[ ] Review Workspace execution bridge (0.4B)
[ ] real model response collection
[ ] broader model adapters if required
```

0.4A does not add another Judge provider, pairwise evaluation, Elo, human
review, databases, dashboards, MCP, a student simulator, or learning-impact
experiments.
