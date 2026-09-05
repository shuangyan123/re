# Contributing to TutorBench

Thank you for helping improve TutorBench. This repository evaluates a
`TutorUnderTest`; it is not a tutor product, chat application, prompt
playground, or Review Workspace module. Keep changes provider-independent,
synthetic or properly licensed, reproducible, and explicit about evidence.

## Contribution categories

Issues and pull requests may propose:

- Software bugs or fixes.
- Benchmark case proposals.
- Rubric or methodology proposals.
- Documentation improvements.
- Provider or integration adapters.
- Website implementation or presentation changes.
- Calibration methodology and audit infrastructure.

Use the closest issue form, then link the relevant issue from a pull request.
The Community Review protocol is defined in P3, but the P4 service is not
deployed and this repository is not yet accepting official public review
submissions, reviewer identities, or qualification data. See the
[Community Review protocol](docs/community-review-protocol.md) for the exact
boundary.

## Before opening a pull request

1. Read the [product boundary](docs/benchmark-product-boundary.md) and the
   [licensing scope](docs/licensing.md).
2. Keep the change focused and preserve unrelated work.
3. Use Node 22 (`>=22 <23`) and run the applicable repository checks.
4. Explain versioning, reproducibility, privacy, and licensing impact.
5. Never commit secrets, real user data, private provider payloads, hidden
   reasoning, or ignored local artifacts.

Normal local checks are:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run benchmark
npm run website:build
npm run test:website
npm run test:package
git diff --check
```

The default synthetic benchmark may report Judge-unavailable errors when no
Judge is configured. Preserve that evidence; do not add provider calls or
weaken assertions to make the score look better.

## Benchmark-content proposals

Treat a new case, rubric, prompt, or methodology rule as a semantic proposal,
not as an ordinary typo fix. Include:

- The clear pedagogical construct being tested.
- The separation between Tutor-visible input and evaluator-only evidence.
- An explicit locale and learner state.
- Subject and pedagogical purpose.
- Synthetic, public, or properly licensed provenance.
- Confirmation that no identifiable student data is present.
- The expected versioning impact and historical-identity behavior.
- Tests and, when semantics change, a methodology rationale.

Do not change dataset meaning, rubric meaning, Judge semantics, scoring,
critical-failure semantics, answer-leakage semantics, the Human Reference
protocol, or public leaderboard comparability through a silent same-version
edit. Such changes require explicit version review, rationale,
reproducibility consideration, and preservation of historical fingerprints.

## Contribution license notice

By contributing software, you agree that your contribution is available under
the applicable Apache-2.0 project scope.

By contributing benchmark, dataset, evaluation, or benchmark-methodology
documentation content, you agree that your contribution is available under
the applicable CC BY 4.0 project scope. Software and software-usage
documentation remain subject to the applicable software scope.

This notice is not a Contributor License Agreement (CLA), and it does not
claim that a contributor has signed a CLA. If your contribution contains
third-party material, disclose its provenance and applicable terms before it
is accepted.

## Brand assets

Do not replace, redraw, recolor, stretch, crop, or relicense TutorBench brand
assets through an ordinary code or content contribution. The name and assets
follow the [TutorBench Brand Policy](LICENSES/BRAND-POLICY.md). A third-party
project may accurately say “Derived from TutorBench” or “Compatible with
TutorBench,” but must not imply official status or endorsement.

## Code review and release boundaries

Reviewers distinguish implementation changes from benchmark semantic changes.
Package and website changes must preserve the public-data firewall. Provider
calls are never required for ordinary CI and must be explicitly disclosed if
used for an authorized diagnostic. Maintainers decide when a versioned,
reviewed artifact is suitable for public release; a local score is not a
scientific validation or an official ranking.
