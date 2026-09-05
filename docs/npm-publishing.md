# Future npm publication (P2B only)

This document describes the future publication design. It is not an active
publish workflow. P2A does not run `npm publish`, `npm stage publish`,
`npm access`, `npm owner`, `npm dist-tag`, or any other registry mutation.

## Trusted Publisher prerequisites

Before an explicitly authorized P2B publication, a maintainer must verify:

1. The unscoped `tutor-benchmark` name and ownership context are still clear.
2. The npm account has the required 2FA and package governance settings.
3. npm Trusted Publishing is configured for GitHub Actions with the exact
   `shuangyan123/re` repository and exact future workflow filename, including
   its `.yml` or `.yaml` suffix.
4. The workflow runs on a GitHub-hosted runner and uses the supported Node/npm
   versions. Current npm guidance requires npm CLI `11.5.1+` and Node `22.14.0+`
   for Trusted Publishing; the project package engine remains `>=22 <23`.
5. The future publish job has only the additional permission it needs:

   ```yaml
   permissions:
     contents: read
     id-token: write
   ```

The current release validation workflow must not receive `id-token: write`.
It validates artifacts only and has no npm authentication environment.

## Token and provenance boundary

P2B should use npm Trusted Publishing/OIDC and should not add a long-lived
`NPM_TOKEN` or `NODE_AUTH_TOKEN`. When trusted publishing is used from a public
GitHub repository for a public package, npm can generate provenance
attestations automatically. P2A records source and payload identities only; it
does not create or claim a provenance attestation.

The future publish workflow should use a dedicated publish job, a GitHub-hosted
runner, the exact approved source commit, and an exact validated payload. It
must not publish merely because an arbitrary tag or `workflow_dispatch` input
exists. A maintainer-approved tag/release gate and the required CI result must
be explicit.

## Build-once handoff

P2A produces:

```text
approved source SHA
  -> validated package payload manifest
  -> retained tutor-benchmark-0.1.0.tgz
  -> release-candidate-report.json
```

The GitHub Release package asset must be the retained tarball from the
validated workflow run. If npm Trusted Publishing requires `npm publish` to
pack again in the trusted job, the job must first rebuild from the same source
SHA and compare the package file list and per-file SHA-256 payload manifest with
the P2A report. Only a matching payload may be published. A changed payload is
a hard stop requiring a new validation run; do not rely on a raw `.tgz` hash
when npm/tar wrapper metadata differs.

After publication, verify the registry package metadata, published version,
payload identity, install behavior, Quickstart non-official flags, and npm
provenance evidence. Record the exact source SHA, workflow run, GitHub Release,
registry version, and fingerprints in the release evidence.

## Official references

- [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm provenance statements](https://docs.npmjs.com/generating-provenance-statements/)
- [npm publish](https://docs.npmjs.com/cli/commands/npm-publish/)
