# TutorEval v0.1

TutorEval is the case-scoped evaluation layer for this independent Tutor
Benchmark. Its Foundation flow is:

```text
TutorEval case (visible input + hidden annotations)
  -> TutorUnderTest adapter (visible input only)
  -> Tutor response
  -> deterministic rubric evaluators or an injected Judge boundary
  -> atomic rubric results
  -> category aggregation and quality gate
  -> versioned run report
```

The result describes observed Tutor behavior. It does not prove that a real
student learned, retained, transferred, or can solve a new problem
independently.

## Data model

Cases live in `scenarios/tutor-eval-v0.1/cases.json`. Each case has a stable
`id` and immutable-in-place `version`, visible `tutorInput`, and
`evaluatorOnly` annotations. `toTutorTurnInput()` is the only conversion used
by the Tutor runner; hidden ground truth, misconceptions, disclosure policy,
and rubrics are not part of the Tutor request.

Rubrics are atomic and belong to one of:

- `correctness`
- `diagnosis`
- `guidance`
- `adaptation`
- `actionability`

Foundation deterministic evaluators are proxies. A future Judge can evaluate
rubrics with `PASS`, `PARTIAL`, or `FAIL` and short evidence through the typed
`TutorEvalJudgeResult` contract. Judge output is runtime-validated before it
contributes to a result. No provider SDK or real model call is included in
this phase.

`disclosurePolicy` is case-specific. A direct-answer proxy fails under
`hint_only` but is explicitly allowed under `full_solution_allowed` and
`full_solution_required`.

## Running the synthetic benchmark

```bash
npm run benchmark
```

This loads `tutor-eval-v0.1`, runs the synthetic guided Tutor once per case,
prints category scores, failure/leakage rates, and writes the complete result
to `artifacts/tutor-eval-v0.1-result.json`. The generated artifact is ignored
by Git.

Programmatic callers can run a full dataset, a selected case list, or repeated
runs:

```ts
const result = await runTutorEval({
  dataset: "tutor-eval-v0.1",
  datasetLoader: loadTutorEvalDataset,
  tutor,
  tutorDescriptor: {
    provider: "synthetic",
    model: "example-tutor",
    promptVersion: "1.0.0",
  },
  runsPerCase: 3,
});
```

To add a case, add a new versioned object to the JSON dataset, keep all
evaluation-only information under `evaluatorOnly`, define at least one atomic
rubric, and add a synthetic Tutor response only if the CLI fixture should
exercise it. Do not change an existing case's content while retaining its
version.

## Paired cases and extensions

`paired-fraction-procedural-001` and `paired-fraction-conceptual-001` share
`adaptationPairId` but intentionally do not implement a pairwise adaptation
metric yet. The fields reserve the comparison boundary for a later phase.

The result keeps model, model version, Tutor prompt version, Judge descriptor,
temperature, seed, raw Tutor text, validated Judge result, rubric results,
failures, latency, token usage, cost, dataset version, and case version. This
allows later model/prompt comparisons without collapsing the evidence into a
single opaque score.

## Deliberate limits

TutorEval v0.1 does not add real provider calls, LLM-as-Judge providers,
student simulation, human learning experiments, pre/post or retention tests,
transfer tests, Elo/pairwise ranking, databases, dashboards, or statistical
significance analysis. Those are separate phases.
