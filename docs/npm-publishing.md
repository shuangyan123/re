# npm publication and Trusted Publishing (P2B / H1A)

This document records the frozen v0.1.0 publication history and the
repository-side hardening for future releases. H1A adds the dedicated
`.github/workflows/npm-publish.yml` workflow, but it does not configure the npm
Trusted Publisher, change npm package settings, dispatch the workflow, or make
any registry mutation.

## v0.1.0 historical bootstrap boundary

The first public package already exists. Its historical identity is frozen:

```text
tag: v0.1.0
source: c837251b4ffbd70df40928ab7fd8f547cbebf5d3
npm: tutor-benchmark@0.1.0
GitHub Release: published
canonical payload: sha256:aad3cdc3ce913122425cc6929cbd7288975ade4cb0230a5a64c0d73777fb4cc2
publication method: interactive maintainer bootstrap protected by npm account 2FA
```

v0.1.0 did not use Trusted Publishing, GitHub OIDC publication, or a claimed
npm provenance statement. These facts must not be rewritten by future release
hardening. The v0.1.0 tag, GitHub Release asset, and npm package are not
recreated or replaced by H1A.

The historical handoff was:

```text
approved source SHA
  -> annotated v0.1.0 tag
  -> tag validation workflow
  -> exact validated tutor-benchmark-0.1.0.tgz and report
  -> interactive npm publication with account 2FA
  -> registry and fresh-install/Quickstart readback
  -> GitHub Release and asset readback
```

The bootstrap did not use a long-lived `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or a
granular access token with 2FA bypass. OTP values are never put in command
arguments, logs, or files.

## H1A repository-side hardening status

The future workflow is ready in the repository, while the external relationship
is intentionally not configured:

```text
workflow ready
Trusted Publisher: NOT YET CONFIGURED
npm Publishing access: NOT CHANGED
registry mutation in H1A: none
```

The workflow is `workflow_dispatch` only. It accepts only an annotated release
`tag` and its exact peeled `expected_commit`, checks out `refs/tags/<tag>`, and
fails closed on a missing/lightweight tag or any commit mismatch. It reads the
package name and version from the checked-out `package.json`, verifies the
package/tag relationship, checks that the live registry does not already expose
that package version, runs the full repository release gates, and retains the
release verifier's exact tarball and report.

The publication job uses a GitHub-hosted `ubuntu-latest` runner with only:

```yaml
permissions:
  contents: read
  id-token: write
```

It pins Node `22.23.2` and npm `11.19.1`. The package engine remains
`>=22 <23`; npm staged publishing requires npm `11.15.0+` and Node `22.14.0+`.
No npm token or secret-based npm authentication is configured.

The only registry mutation in the workflow is staging the retained artifact:

```text
npm stage publish artifacts/release/tutor-benchmark-${version}.tgz
```

Stable versions use the `latest` dist-tag and prereleases use `next`, both
derived from the checked-out package version. The workflow never performs a
direct publish or an approval/rejection action. A version collision reported by
npm is a hard stop; the workflow has no destructive recovery path.

## Future stage-only release flow

The complete future flow is:

```text
approved source
  -> annotated tag
  -> release validation
  -> maintainer manually dispatches npm-publish.yml
  -> GitHub OIDC authenticates with npm
  -> exact validated .tgz is staged
  -> workflow stops: PACKAGE STAGED — AWAITING MAINTAINER 2FA APPROVAL
  -> maintainer reviews with npm stage view/download or npmjs.com
  -> maintainer approves with npm stage approve <stage-id> and interactive 2FA
  -> package becomes live
  -> registry readback and payload identity verification
  -> GitHub Release and release-asset equality verification
```

The workflow does not automatically approve the staged package. Staged
publishing deliberately keeps the proof-of-presence step with the maintainer.
The stage-only path must be tested on a future release after the Trusted
Publisher relationship has been configured.

## Trusted Publisher configuration gate (H1B, not completed)

After H1A is merged, the maintainer may configure the relationship in a
separate gate with:

```text
Package: tutor-benchmark
Provider: GitHub Actions
GitHub user/org: shuangyan123
Repository: re
Workflow filename in npm UI: npm-publish.yml
Allowed action: npm stage publish only
```

The npm UI expects the filename only, not
`.github/workflows/npm-publish.yml`. Do not configure this relationship or open
the npm UI as part of H1A.

After the relationship is configured and its stage-only behavior is verified,
consider the separate package setting `Require two-factor authentication and
disallow tokens`. H1A does not change that setting.

## Future token and provenance boundary

Future releases are designed for npm Trusted Publishing/OIDC and must not add a
long-lived `NPM_TOKEN` or `NODE_AUTH_TOKEN`. npm documents that supported public
GitHub Actions trusted publishing can produce provenance, but no future release
may be described as having provenance until registry evidence verifies it. This
does not create or prove provenance retroactively for the interactive v0.1.0
bootstrap.

## Build-once handoff and release identity

The release verifier retains:

```text
approved source SHA
  -> validated package payload manifest
  -> tutor-benchmark-${version}.tgz
  -> release-candidate-report.json
```

The package release identity is derived from the checked-out package version:
`vX.Y.Z` or `vX.Y.Z-prerelease`, with the exact matching tag and
`tutor-benchmark-${version}.tgz` filename. This generalization does not change
the frozen Quickstart, canonical dataset, evaluator, Judge prompt, Human
Reference, qualification, license, or brand identities in the report.

The retained tarball is the publication payload. The workflow does not silently
repack the repository or stage `.`. After human approval, registry metadata,
payload identity, install behavior, Quickstart non-official flags, provenance
evidence, and the GitHub Release asset must be read back and recorded.

## Official references

- [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm staged publishing](https://docs.npmjs.com/staged-publishing/)
- [npm stage](https://docs.npmjs.com/cli/v11/commands/npm-stage/)
- [npm provenance statements](https://docs.npmjs.com/generating-provenance-statements/)
