# TutorBench Quickstart

The five-minute path is a local demonstration for a first run:

```bash
git clone https://github.com/shuangyan123/re.git
cd re
npm ci
npm run quickstart
```

Requirements: Node 22 (`>=22 <23`). Quickstart is provider-free,
network-free, and Judge-free. It does not read provider credentials, construct
an HTTP or model adapter, or contact a remote endpoint.

## What it runs

Quickstart has the stable identity `tutorbench-quickstart@0.1.0` and selection
`quickstart-v1`. It uses the existing deterministic development/smoke dataset
`tutor-eval-v0.1@0.1`, not the canonical scoring cohort. The fixed cases are:

| Case | Version |
| --- | --- |
| `fraction-misconception-001` | `1.0.0` |
| `correct-answer-wrong-reasoning-001` | `1.0.0` |
| `full-solution-check-001` | `1.0.0` |
| `paired-fraction-procedural-001` | `1.0.0` |

The canonical `tutor-eval-v0.2a@0.2a.5` snapshot remains unchanged. The
Quickstart uses the existing legacy dataset because an audit found no
complete deterministic-only case in the current canonical snapshot; every
canonical case retains at least one Judge-owned rubric. Quickstart therefore
fails closed if a selected case changes version, fingerprint, or evaluator
ownership.

The bundled example Tutor is the deterministic
`scripted-quickstart-tutor@1.0.0` (`quickstart-example@1.0.0`). It reuses the
existing scripted Tutor and evaluator pipeline. Three cases demonstrate
passing checks, while one response is intentionally weak so a pedagogical
`FAIL` is visible. This makes the first result explainable without pretending
that the example Tutor is perfect.

## Reading the result

The terminal summary reports case-level deterministic checks, plus:

- `Judge: not required`
- `Network: disabled`
- `Official benchmark score: no`
- `Leaderboard eligible: no`

There is no Quickstart overall score. By default the command prints only the
summary. To write the independent, explicitly non-official report contract:

```bash
npm run quickstart -- --output artifacts/quickstart.json
```

Or, after installing the package:

```bash
npm install tutor-benchmark
tutorbench quickstart
```

The JSON artifact has `mode: "quickstart-demo"`,
`officialBenchmarkScore: false`, and `publicLeaderboardEligible: false`.
Expected demonstration `FAIL` results do not make the command fail: exit 0
means the deterministic demo infrastructure completed. A non-zero exit means
an invariant, dataset, Tutor, or evaluator execution error occurred.

## Full benchmark and official evidence

The full local benchmark is intentionally separate:

```bash
npm run benchmark
```

It uses the canonical `tutor-eval-v0.2a@0.2a.5` dataset and evaluator
`0.3a.4`. Judge-required semantic criteria remain unresolved when no explicit
Judge is configured, so the normal no-Judge run reports Judge-unavailable
errors and no score. Quickstart does not suppress, reinterpret, or replace
that fail-closed behavior.

Official or reproducible evaluation still follows the advanced evidence
chain: canonical model collection, frozen versioned corpus, explicit Judge,
and calibration/review before any future public result eligibility. A
Quickstart run is not calibrated evidence, an official benchmark result, a
leaderboard submission, a substitute for a Judge, or evidence that
deterministic proxies capture full tutoring quality.
