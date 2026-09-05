# Release and Public Delivery

Tutor Benchmark is a public Developer Preview. The v0.1.0 package and GitHub
Release were published through the completed interactive maintainer bootstrap.
That release used npm account 2FA; it did not use Trusted Publishing, GitHub
OIDC publication, or a claimed npm provenance statement.

P2B-H1A is repository-side hardening for future releases. It adds a dedicated
stage-only workflow, generalizes the release-candidate package identity, and
updates the release policy. It does not configure npm, dispatch the workflow,
stage a package, approve a stage, change package settings, or alter v0.1.0.

## Release candidate validation

Run release validation from the exact source commit intended for review. The
source checkout must be clean; the command fails before packaging if tracked or
untracked source changes are present. It builds once, packs twice for a
reproducibility comparison, audits the package allowlist, installs the retained
tarball into a temporary empty consumer without the optional OpenAI peer, runs
the installed public API and CLI, validates the canonical dataset and
Quickstart identities, builds the website, and writes ignored artifacts:

```bash
npm ci
npm run release:verify
```

The retained files are versioned from `package.json`:

```text
artifacts/release/tutor-benchmark-${package.json.version}.tgz
artifacts/release/release-candidate-report.json
```

The report binds the exact source commit, runtime versions, package file list
and SHA-256 payload fingerprint, observed raw tarball fingerprint, Quickstart
and canonical identities, Judge/prompt identities, license and brand-policy
identities, website payload fingerprint, and verification flags. It contains no
absolute local path, username, credential, provider payload, reviewer evidence,
or timestamp. The payload fingerprint is the reproducibility boundary; raw
`.tgz` byte reproducibility is recorded only when observed.

The broader repository gates remain required before staging:

```bash
npm run test:governance
npm run typecheck
npm run lint
npm test
npm run build
npm run quickstart
npm run benchmark
npm run website:build
node scripts/website-artifact-smoke.mjs
git diff --check
```

The canonical no-Judge benchmark remains fail-closed: Judge-owned criteria
produce unavailable errors and no official score. The Quickstart remains the
separate `tutorbench-quickstart@0.1.0` development/smoke demonstration and is
not an official score or leaderboard result.

## Release identity and tag policy

The historical v0.1.0 release identity is frozen:

```text
package: tutor-benchmark@0.1.0
tag: v0.1.0
source: c837251b4ffbd70df40928ab7fd8f547cbebf5d3
canonical payload: sha256:aad3cdc3ce913122425cc6929cbd7288975ade4cb0230a5a64c0d73777fb4cc2
```

Future package release identities are derived from the checked-out
`package.json` and must match exactly:

```text
package version: X.Y.Z or X.Y.Z-prerelease
annotated tag: v${package version}
tarball: tutor-benchmark-${package version}.tgz
```

`scripts/validate-release-version.mjs` is the shared tag grammar gate. The
release-candidate report repeats the runtime checks for a valid package version,
the exact proposed tag, and the exact tarball filename. This package-release
generalization does not change the frozen Quickstart, dataset, evaluator, Judge
prompt, Human Reference, qualification, license, or brand identities.

Formal release tags must be annotated tags bound to the approved exact release
commit. A workflow must never create, move, or force-update a tag.

## Validation workflow boundary

`.github/workflows/release.yml` remains artifact validation only. It uses
`contents: read`, validates the requested tag, runs the repository gates, and
uploads the exact package, website, and release-candidate report artifacts. It
does not receive `id-token: write`, has no npm authentication environment, and
does not stage or publish packages.

## Completed v0.1.0 bootstrap

The first publication of the unscoped `tutor-benchmark` package required the
package to exist before a Trusted Publisher could be configured. The completed
bootstrap therefore used an explicitly authorized interactive maintainer
publication protected by account-level 2FA. It did not use a long-lived
`NPM_TOKEN`, `NODE_AUTH_TOKEN`, or a granular bypass-2FA token, and it does not
claim npm provenance.

Its historical sequence was:

1. Validate the clean approved source, annotated `v0.1.0` tag, package payload,
   and release-candidate report.
2. Publish the exact retained `tutor-benchmark-0.1.0.tgz` interactively with
   account 2FA.
3. Read back registry metadata, install behavior, CLI behavior, Quickstart
   non-official flags, and the payload identity.
4. Publish the GitHub Release from the same tag and verify the release asset.

The v0.1.0 tag, npm package, GitHub Release, and release asset are historical
artifacts. H1A does not rebuild, replace, republish, or add provenance claims to
them.

## H1A future stage-only publication

The dedicated `.github/workflows/npm-publish.yml` workflow is manual
`workflow_dispatch` only. The maintainer supplies only:

```text
tag: vX.Y.Z or vX.Y.Z-prerelease
expected_commit: exact 40-character peeled release commit
```

The workflow checks out `refs/tags/<tag>`, requires an annotated tag, verifies
the peeled tag commit and `HEAD` against `expected_commit`, validates the tag
against the checked-out package version, and reads the package identity from
that checkout. It then proves that the live npm registry does not already
contain the package version, runs the full release gates, and validates the
release verifier's retained tarball/report identity.

The job runs on `ubuntu-latest` with only:

```yaml
permissions:
  contents: read
  id-token: write
```

It pins Node `22.23.2` and npm `11.19.1`. The only registry mutation is:

```text
npm stage publish artifacts/release/tutor-benchmark-${package version}.tgz
```

The path is the exact retained tarball; the workflow never stages `.` or
silently repacks a second publication payload. Stable versions use `latest`,
and prereleases use `next`, derived from the package version. The workflow ends
after staging with:

```text
PACKAGE STAGED — AWAITING MAINTAINER 2FA APPROVAL
```

Any live-version or npm-reported staged-version collision is a fail-closed
blocker. The workflow has no destructive recovery action. It never performs a
direct npm publish or an automated stage approval.

The complete future handoff is:

```text
approved source
  -> annotated tag
  -> release validation
  -> manual dispatch of npm-publish.yml
  -> OIDC stage of the exact validated tarball
  -> maintainer review with npm stage view/download or npmjs.com
  -> interactive npm stage approve <stage-id> with 2FA
  -> registry readback and payload identity verification
  -> GitHub Release and release-asset equality verification
```

## Trusted Publisher configuration gate

H1A leaves the external relationship in this state:

```text
workflow ready
Trusted Publisher: NOT YET CONFIGURED
npm Publishing access: NOT CHANGED
```

After this workflow is merged, a separate maintainer gate may configure:

```text
Package: tutor-benchmark
Provider: GitHub Actions
GitHub user/org: shuangyan123
Repository: re
Workflow filename in npm UI: npm-publish.yml
Allowed action: npm stage publish only
```

The npm UI expects only `npm-publish.yml`, not the full `.github/workflows/`
path. After the relationship and stage-only path are verified on a future
release, consider the separate package setting `Require two-factor
authentication and disallow tokens`. Neither setting is changed by H1A.

## Provenance boundary

Future releases are designed for npm Trusted Publishing/OIDC. npm documentation
indicates that supported public GitHub Actions trusted publishing can produce
provenance, but the repository must not claim provenance for a future version
until registry evidence verifies it. Staging alone is not final publication and
does not establish a final provenance claim.

## License and governance artifacts

Every package or release validation must retain the project's public governance
boundary:

- `LICENSE` — complete Apache License 2.0 text for software scope.
- `LICENSES/CC-BY-4.0.txt` — CC BY 4.0 legal-code pointer for authored
  benchmark content.
- `LICENSES/BRAND-POLICY.md` — separate TutorBench brand policy.
- `LICENSES.md`, `NOTICE`, and `docs/licensing.md` — scope maps and notices.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md` — project entry
  points.

`npm run test:governance` and the release-candidate package audit validate these
boundaries. No real-model response files, human reviewer evidence, credentials,
or private calibration submissions are release assets.

## Website deployment

`.github/workflows/pages.yml` builds `website/dist` from the current source,
checks its routes and public-data firewall, and deploys it to GitHub Pages only
from `main`. The website remains a static Developer Preview with no calibrated
public model runs. Release documentation must distinguish the published
v0.1.0 package from future release readiness; it must not invent a release date
or claim calibrated public results.

## Repository settings follow-up

H1A does not change GitHub repository administration, branch protection,
Discussions, or Private Vulnerability Reporting. Those settings remain separate
operational decisions from the npm Trusted Publisher configuration gate.
