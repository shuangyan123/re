# Judge word-context discrimination diagnostic

This is a small, provider-free fixture and an optional live probe for the
current `language-word-context-001@1.1.1` case in
`tutor-eval-v0.2a@0.2a.5`. It tests whether the Judge distinguishes three
fixed Tutor responses against the correctness limitation clause. The first
real probe audited the previous current prompt `0.7`; the fixture now remains
the regression boundary for current prompt `0.8`.

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

## Operator-attested v0.7 probe evidence

Before the v0.8 prompt change, a real DeepSeek V4-Pro three-call probe produced
the following operator-attested diagnostic evidence. Raw provider payloads,
credentials, request IDs, hidden reasoning, and local result artifacts are not
stored in this repository.

| Fixture | Expected correctness | Observed correctness | Expected actionability | Observed actionability |
| --- | --- | --- | --- | --- |
| A | `PASS` | `PASS` | `PASS` | `PASS` |
| B | `PARTIAL` | `PASS` | `PASS` | `PASS` |
| C | `FAIL` | `PARTIAL` | `PASS` | `PASS` |

All three calls reported no answer leakage, no critical failure, no
insufficient-information flag, and no execution error. The observable Judge
evidence was diagnostically specific: A recognized that the pause could
support hesitation without establishing unwillingness; B recognized the
unwilling/hesitant distinction and used the clue but still received `PASS`
without satisfying the limitation clause; C explicitly recognized the omitted
limitation and the Tutor's `definitely` overclaim but received only `PARTIAL`.

This is a three-case purposive diagnostic with developer-authored expectations,
not human calibration gold. It is not general Judge accuracy, calibration,
recall, or evidence of model-wide bias. It is sufficient to motivate a generic
composite-rubric clarification because the same criterion exposes both sides
of one semantic gap: a material limitation can be omitted while the core
direction remains correct, or it can be explicitly contradicted by an
overclaim. It is not sufficient to claim that the Judge is calibrated.

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
- the v0.8 material-requirement prompt contract and a provider-free generic
  composite criterion whose synthetic `PASS`/`PARTIAL`/`FAIL` outputs pass
  through parser, rubric ownership, runner, and scorer.

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

The report includes expected/observed correctness and actionability, sanitized
Judge rubric evidence, critical failures, answer leakage,
`insufficientInformation`, factual errors, Judge prompt identity, evaluator
version, and the actual call count. It does not include raw provider payloads
or hidden reasoning.

Interpretation is deliberately narrow:

- The historical v0.7 result was A `PASS`, B `PASS`, C `PARTIAL`, which is
  evidence that the previous instructions did not consistently map material
  omission and explicit overclaim to the intended statuses.
- Under v0.8, A `PASS`, B `PARTIAL`, C `FAIL` is consistent with the clarified
  material-requirement semantics. It remains diagnostic evidence only.
- Any other pattern is diagnostic evidence to inspect, not a calibration or
  benchmark-quality conclusion.

This task changes only the current Judge prompt from `0.7` to `0.8` and does
not change dataset `0.2a.5`, case `1.1.1`, evaluator `0.3a.4`, rubric wording,
thresholds, scoring semantics, adapters, transport, result schema, or
real-model artifacts. The v0.8 change is a generic composite-rubric grading
clarification, not a `language-word-context` special case and not an attempt
to force a particular live-model output.
