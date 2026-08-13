# Tutor Benchmark 0.4A: Real Tutor Response Corpus Boundary

0.4A establishes the provider-independent boundary for recorded Tutor
responses. It does not implement a Tutor, call a real Tutor provider, or
claim that the checked-in synthetic fixtures represent production Tutor
behavior.

The lifecycle is deliberately separated:

```text
generate -> freeze -> evaluate -> annotate -> calibrate
```

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
and raw provider payloads.

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

## Future Review Workspace bridge

The next phase is 0.4B in `shuangyan123/demo`, not in this repository. Its
adapter should consume the Tutor-visible case packet, map it to the existing
Review Workspace generation request, execute the selected provider/model using
the host's credential boundary, capture only final Tutor text and sanitized
metrics, and emit a `TutorResponseCorpus` JSON file.

```text
re exports visible case packet
  -> demo host generates response
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

0.4 is partial and only its response-corpus boundary is implemented:

```text
0.4 Tutor Adapter Layer — PARTIAL: response corpus boundary

[x] stable Tutor response corpus contract
[x] recorded/replay Tutor adapter
[x] Tutor-visible case export
[x] calibration integration
[x] Review Workspace adapter protocol
[ ] Review Workspace implementation
[ ] real model response collection
[ ] broader model adapters if required
```

0.4A does not add another Judge provider, pairwise evaluation, Elo, human
review, databases, dashboards, MCP, a student simulator, or learning-impact
experiments.
