# Judge word-context discrimination diagnostic

This is a small, provider-free fixture and an optional live probe for the
current `language-word-context-001@1.1.1` case in
`tutor-eval-v0.2a@0.2a.5`. It tests whether the Judge distinguishes three
fixed Tutor responses against the current correctness limitation clause:

> Evaluate the student's proposed meaning against the surrounding context,
> explain what the pause-before-agreeing clue supports and what it cannot
> establish on its own, and do not treat the student's guess as automatically
> correct or incorrect.

The fixture is defined in
`src/judge/word-context-discrimination.ts`. A, B, and C are three runs of the
same case so the existing frozen-corpus runner can replay them deterministically:

| Fixture | Correctness expectation | Actionability expectation | Diagnostic boundary |
| --- | --- | --- | --- |
| A | `PASS` | `PASS` | States both what the clue supports and what it cannot establish, then asks for another clue. |
| B | `PARTIAL` | `PASS` | Uses context and asks a useful question, but overstates the evidential force of pausing before agreeing and omits the limitation. |
| C | `FAIL` | `PASS` | Treats the underdetermined clue as conclusive evidence while still asking the student to identify a clue. |

These labels are developer-authored diagnostic expectations, not human
calibration gold. The corpus is marked `synthetic`, has no `generationSpec`,
and is never `recorded_model`. It contains only the fixed Tutor response text;
provider payloads, credentials, request IDs, hidden reasoning, and real-model
artifacts are not stored. B preserves the complete supplied borderline
response text as diagnostic input, while deliberately omitting any provider
identity or transport metadata. The report presents expected and observed
labels side by side and never converts their agreement into a benchmark
pass/fail or general accuracy claim.

## Provider-free coverage

`tests/judge-word-context-discrimination.test.ts` verifies:

- exact dataset, case, rubric, criterion, prompt, and evaluator identities;
- A/B/C response and expected-label identity;
- synthetic corpus validation and three distinct case/run identities;
- the current Judge request shape and rubric ownership for all three inputs;
- separation of Tutor-visible input from evaluator-only Judge context; and
- report handling for observed labels, Judge evidence, critical failures,
  leakage, and `insufficientInformation` without changing scoring.

No MiniMax, DeepSeek, OpenAI, or other live call is made by these tests.

## Three-call DeepSeek probe

After building with the repository's Node 22 toolchain, set the local Judge
credentials and model selection, then run:

```powershell
$env:DEEPSEEK_API_KEY = "<local secret>"
$env:DEEPSEEK_JUDGE_MODEL = "deepseek-v4-pro"
npm run build
node dist/src/cli/tutorbench.js judge-word-context-discrimination `
  --judge-deepseek `
  --output artifacts/judge-word-context-discrimination.json
```

The command builds the three-run corpus in memory, reuses the existing
`runTutorResponseCorpus` and DeepSeek Judge path, and makes exactly three
Judge calls. It writes a derived, ignored diagnostic report and exits non-zero
only when a Judge/evaluation error occurs; an observed `PASS`, `PARTIAL`, or
`FAIL` is not itself treated as a command failure.

The report includes expected/observed correctness and actionability, raw
sanitized Judge rubric evidence, critical failures, answer leakage,
`insufficientInformation`, factual errors, Judge prompt identity, evaluator
version, and the actual call count. It does not include raw provider payloads
or hidden reasoning.

Interpretation is deliberately narrow:

- A `PASS`, B `PARTIAL`, C `FAIL` is consistent with basic discrimination of
  the limitation clause.
- A `PASS`, B `PASS`, C `PASS` is evidence that the current prompt may not be
  enforcing that limitation strongly enough; discuss any prompt change as a
  separate follow-up rather than changing v0.7 in this task.
- Any other pattern is diagnostic evidence to inspect, not a calibration or
  benchmark-quality conclusion.

This task does not change dataset `0.2a.5`, case `1.1.1`, evaluator `0.3a.4`,
Judge prompt `0.7`, rubric wording, thresholds, scoring semantics, adapters,
transport, or real-model artifacts.
