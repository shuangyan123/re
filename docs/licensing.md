# TutorBench licensing and scope

TutorBench is a public Developer Preview with three deliberately separate
boundaries:

1. Software implementation — Apache License 2.0 (`Apache-2.0`).
2. Authored benchmark, dataset, and evaluation content — Creative Commons
   Attribution 4.0 International (`CC BY 4.0`).
3. TutorBench name and visual brand assets — the separate [TutorBench Brand
   Policy](../LICENSES/BRAND-POLICY.md).

These are scope boundaries, not a blanket `Apache-2.0 AND CC-BY-4.0` claim for
every file in the repository. Start with the file's subject and any
file-specific notice. When a file is ambiguous, preserve the narrower
boundary and ask a maintainer before redistributing it.

## Software scope: Apache-2.0

Apache-2.0 applies to the TutorBench software implementation, including:

- The TypeScript implementation under `src/`.
- `scripts/` and other build or release validation tooling.
- Software code in `examples/`.
- CLI implementation and package/runtime configuration.
- Website implementation code under `src/site/` and `website/src/`.
- Tests and test helpers that implement or exercise software behavior.

The full standard Apache License 2.0 text is in [`LICENSE`](../LICENSE).
Apache-2.0 grants the software permissions described by that license. It does
not grant unrestricted use of the TutorBench brand; see the brand policy.

## Authored benchmark-content scope: CC BY 4.0

CC BY 4.0 applies to authored benchmark and evaluation content, including:

- Authored case content under `scenarios/`.
- Authored rubric and evaluation text under `rubrics/`.
- Authored benchmark, Judge, or system-prompt textual content under
  `prompts/`.
- Benchmark methodology documentation and explanatory public benchmark data.
- Synthetic authored benchmark examples and fixtures where they are the
  substantive evaluation content rather than software implementation.

The canonical content license pointer is
[`LICENSES/CC-BY-4.0.txt`](../LICENSES/CC-BY-4.0.txt). Its complete legal code
is the unmodified Creative Commons text at
<https://creativecommons.org/licenses/by/4.0/legalcode>.

CC BY 4.0 permits research, reproduction, modification, redistribution, and
commercial evaluation, subject to the license's attribution and other terms.
Attribution should identify the source and disclose material modifications.
Do not add a non-commercial or no-derivatives restriction.

## Mixed files, embedded strings, and generated artifacts

Use the dominant subject and the following priority rules rather than a
blind directory-wide relabeling:

- A file that is primarily software implementation remains in the
  Apache-2.0 software scope even when it contains short user-facing strings,
  error messages, or fixture values needed to implement the software.
- A case, corpus, rubric, prompt, or methodology file whose body is the
  authored evaluation content is in the CC BY 4.0 content scope, even when a
  small loader or schema fragment is present.
- JSON schema, TypeScript contract definitions, parsers, validators, and
  other executable or structural contract code are software. Authored values
  embedded in a corpus or case file remain benchmark content.
- In a file that materially mixes implementation and authored content, apply
  the corresponding scope to each separable portion. Do not use the presence
  of a short string to relicense the surrounding implementation, and do not
  use an implementation wrapper to pull an authored corpus into Apache-2.0.
  If the portions are not separable, record the ambiguity in the file or ask
  a maintainer before redistribution.
- Generated output does not create a new license. It inherits the applicable
  scope of its source components. A generated public website may contain only
  secret-free public artifacts; private audit output and local result files
  are not made public by this policy.

The brand assets under `assets/brand/tutorbench/` are always subject to the
Brand Policy. Their presence in an Apache-2.0 software package or alongside
CC BY 4.0 content does not grant a brand license.

## Attribution example

A reasonable attribution for a reuse of the canonical benchmark content is:

```text
TutorBench / TutorEval dataset
Version: tutor-eval-v0.2a@0.2a.5
Source: https://github.com/shuangyan123/re
Licensed under CC BY 4.0.
Modified: yes/no
```

Citation metadata and a link to the source are encouraged, but they are not
additional advertising terms or extra conditions beyond CC BY 4.0. Follow the
license itself for the actual attribution requirements.

## Third-party material and privacy

Third-party material, if later accepted, remains under its own applicable
terms and must be identified before redistribution. Only synthetic, public,
properly licensed, or reviewed anonymized assets may be committed. Do not
commit real student data, production conversations, credentials, cookies,
private prompts, hidden reasoning, or private reviewer evidence.

## Related governance

- [Contribution guide](../CONTRIBUTING.md)
- [Code of Conduct](../CODE_OF_CONDUCT.md)
- [Security Policy](../SECURITY.md)
- [Brand Policy](../LICENSES/BRAND-POLICY.md)

This document records the maintainer's explicit project scope. It is not a
legal opinion and does not alter the standard license texts.
