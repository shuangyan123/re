# Review Translation Layer

The Review Translation Layer is an optional, review-only reading aid for the
private/local Audit pages. It is deliberately separate from the TutorEval
benchmark and must never be treated as a second case cohort.

## Three independent locales

These fields have different meanings:

| Field | Meaning |
| --- | --- |
| Case locale | The target language used when the Tutor is evaluated. |
| Developer UI locale | The language used by the Audit interface labels. |
| Review translation locale | The language used for optional human-reading assistance. |

For example, this is valid and is the primary use case:

```text
Case locale: en
Developer UI locale: zh-CN
Review translation locale: zh-CN
```

The existing 48-case bilingual dataset remains unchanged by this layer. An
English case receives a Chinese review translation without becoming a Chinese
benchmark case.

The same isolation applies to a preliminary real-model evaluation artifact:
both English and `zh-CN` case results, raw Tutor text, Judge evidence, and
critical-failure fields remain in the existing evaluation schema. Review
Translation is added only as a separate sidecar after evaluation; it does not
change generation, Judge routing, scoring, or corpus identity.

## Sidecar contract

The CLI writes an independent JSON artifact with schema `1`:

```text
review-translation@1
  reviewOnly: true
  targetLocale: zh-CN
  sourceEvaluationRunId
  sourceEvaluationDatasetId
  sourceEvaluationDatasetVersion
  translator metadata
  entries[]
```

Each entry records the case ID, optional run index, source type, field identity,
target locale, SHA-256 `sourceTextHash`, status, translated text or a stable
failure code, provider/model labels, and translation timestamp. The original
source text is intentionally not copied into the sidecar; the current Audit
source is authoritative and the hash prevents stale text from being shown.

Static case entries are shared across runs: student message, problem context,
learning objective, conversation history, student profile natural-language
fields, and rubric criteria. Dynamic entries are bound to the exact evaluation
run, case ID, and run index: Tutor response, Judge evidence, factual error
description, Judge or evaluator diagnostics, and critical-failure evidence.

When a source hash changes, the old translation is reported as stale and is not
rendered. Missing, failed, malformed, mismatched, or unavailable sidecars leave
the original Audit page usable and show an unavailable-translation state.

## Provider boundary and CLI

The core uses a provider-neutral `ReviewTranslator` interface. The included
HTTP adapter accepts a small JSON contract and does not assume OpenAI, DeepSeek,
MiniMax, OpenRouter, or any other vendor. Endpoint URLs, credentials, raw
provider payloads, and hidden reasoning are not persisted.

```powershell
npm run build
node dist/src/cli/tutorbench.js review-translate `
  --evaluation artifacts/real-model/example.evaluation.json `
  --target-locale zh-CN `
  --http http://127.0.0.1:9000/translate `
  --provider local-fixture `
  --model fixture-model `
  --output artifacts/review/example.zh-CN.review.json
```

Pass `--translation` with an existing sidecar to reuse entries whose source
hash is unchanged. Previously failed or missing entries are retried; changed
entries are translated again. Each field failure is isolated and recorded in
the sidecar instead of changing the official evaluation result.

To render a private/local Audit site with the optional sidecar:

```powershell
node dist/src/cli/website-build.js `
  --evaluation artifacts/real-model/example.evaluation.json `
  --review-translation artifacts/review/example.zh-CN.review.json `
  --locale zh-CN `
  --output website/private-dist/example
```

The evaluation and sidecar inputs are accepted only for the private output
boundary. The default public website build does not load or publish either
artifact.

## Audit behavior

In the Chinese Developer UI, the page presents translated reading assistance
first for:

- student message, problem context, learning objective, conversation history,
  and student profile text;
- rubric criteria while preserving rubric IDs, categories, evaluator IDs,
  disclosure policy, versions, and critical-failure types as technical values;
- Tutor response Markdown;
- Judge rubric evidence, factual-error descriptions, diagnostics, and critical
  failure evidence.

Every original remains available under `查看原文`. Original Tutor Markdown and
the complete raw Judge JSON remain unchanged audit evidence. Review translation
Markdown uses the same allow-list renderer as stored Tutor responses, so raw
HTML and unsafe links are not emitted.

The page marks the boundary explicitly:

```text
辅助翻译，仅供人工阅读，不参与评测。
```

Translated text is not a Tutor input, Judge input, score input, dataset field,
ground truth, human annotation, adjudication, calibration label, response ID
input, replay fingerprint, or public leaderboard result.

## Evidence limits

The translator is instructed to preserve meaning, numbers, formulas, code,
proper names, uncertainty, and errors without summarizing, correcting, or
adding conclusions. A translation is still an untrusted reading aid. Reviewers
must open the original when precision matters.

The cross-locale semantic audit corrected the known
`fraction-misconception-001-zh-CN` inconsistency in the historical
`tutor-eval-v0.2a@0.2a.3` snapshot: the visible task is now `1/3 + 1/4`, the
student's direct-addition mistake is `2/7`, and the ground truth is `7/12`.
The current dataset is `0.2a.5`; the immutable `0.2a.2`, `0.2a.3`, and `0.2a.4` snapshots
remain available for historical artifacts.
This Review Translation Layer remains separate from that benchmark-data fix and
does not supply translations for English cases.
