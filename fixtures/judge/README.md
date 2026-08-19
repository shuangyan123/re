# Judge semantic regression fixtures

These fixtures are provider-independent, deterministic examples for prompt
and structured-result contract tests. They are not human calibration data and
do not implement a local substitute for the model-based Judge. No provider
payload, credential, hidden reasoning, or live response is stored here.

The word-context discrimination fixture is defined in
`src/judge/word-context-discrimination.ts`. Its optional live probe is
documented in `docs/judge-word-context-discrimination.md`; the generated
three-run corpus stays in memory and the diagnostic report remains an ignored
local artifact.
