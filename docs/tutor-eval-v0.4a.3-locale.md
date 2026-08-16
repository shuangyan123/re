# Tutor Benchmark 0.4A.3: Case Locale and Local Audit Views

0.4A.3 keeps the 0.4A.2 portable baseline profile available for historical
replay and adds an explicit case-locale instruction to new Tutor generation.
It does not translate Tutor or Judge output and does not change evaluator
scoring semantics.

## Case locale

`TutorEvalCase.locale` is an optional BCP-47-like tag. The first supported
locales are `zh-CN` and `en`; the contract accepts future tags such as `ja-JP`
without another core schema redesign. Cases authored before this field existed
resolve to `en`, because the checked-in v0.1 and v0.2A case text is English.
That fallback is explicit in `resolveTutorCaseLocale()` and is not inferred
from the developer UI locale.

The resolved locale is carried through `toTutorTurnInput()`, the visible case
packet, and each canonical execution-packet case. The canonical visible
context contains a stable `targetLocale=...` line. The v0.2 baseline system
prompt instructs the Tutor to follow that value: `zh-CN` means natural,
clear Simplified Chinese and `en` means natural, clear English. Proper nouns,
code, formulas, and necessary quotations may remain in their original form.

The public case serializer exposes the resolved locale. Existing corpus,
execution-packet, and public-artifact readers accept the field as optional, so
legacy artifacts remain readable and resolve missing locale to English at the
visible-input boundary.

## Generation identity

The current baseline uses:

```text
specId: tutor-baseline-generation
specVersion: 0.4a.3
prompt: tutor-baseline-system@0.2 plus SHA-256
maxOutputTokens: 1024
```

The old `tutor-baseline-system@0.1` prompt and 0.4A.1/0.4A.2 generation
builders remain available for historical artifacts. A new case locale changes
the visible generation input; case or dataset versioning must therefore be
updated when an existing case's target locale changes.

## Developer UI locale

The static site has a small `en` / `zh-CN` interface dictionary. The selector
is independent of case locale, persists the developer choice in browser
`localStorage`, and never rewrites Tutor response text or Judge free text.

The default public build continues to emit only the secret-free Developer
Preview. A validated local evaluation artifact can be viewed through the
explicit private build:

```powershell
npm run website:build -- -- --evaluation artifacts/real-model/example.evaluation.json `
  --output website/private-dist `
  --locale zh-CN
```

This creates one audit index and one case/run page per stored evaluation case
run. The view joins the existing evaluation result with the dataset's real
case context and evaluator-only rubrics. It uses stored diagnostics and Judge
evidence only; missing fields are shown as unavailable. It is not used by the
GitHub Pages workflow and does not call a provider or Judge.
