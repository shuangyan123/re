# npm publication and Trusted Publishing (P2B only)

This document describes the controlled P2B publication design. It is not an
active publish workflow. P2A does not run `npm publish`, `npm stage publish`,
`npm access`, `npm owner`, `npm dist-tag`, or any other registry mutation.

## v0.1.0 bootstrap boundary

The unscoped `tutor-benchmark` package must exist before npm can configure a
Trusted Publisher for it. Therefore v0.1.0 is published first as an explicitly
authorized interactive maintainer bootstrap with account-level 2FA. The
maintainer publishes only the exact tarball from the successful tag validation
workflow, then performs registry metadata, fresh-install, CLI, Quickstart, and
payload-fingerprint readback before creating the GitHub Release.

The bootstrap must not create or use a long-lived `NPM_TOKEN`,
`NODE_AUTH_TOKEN`, or a granular access token with bypass-2FA. Do not put an OTP
in command arguments or persist credentials in logs or files. Because this is
an interactive local 2FA publication rather than a supported cloud OIDC
publication, the release evidence must say that npm provenance for v0.1.0 is
not claimed.

The controlled handoff is:

```text
approved source SHA
  -> annotated v0.1.0 tag
  -> tag validation workflow
  -> exact validated tutor-benchmark-0.1.0.tgz and report
  -> interactive npm publish with account 2FA
  -> registry readback and fresh install/Quickstart
  -> GitHub Release and asset readback
  -> post-release Trusted Publisher setup
```

## Post-release Trusted Publisher prerequisites

After the bootstrap package exists, a maintainer may configure a Trusted
Publisher for future releases. Before doing so, verify:

1. The unscoped `tutor-benchmark` name and ownership context are still clear.
2. The npm account has the required 2FA and package governance settings.
3. The future publish workflow exists and its Trusted Publisher configuration
   names the exact `shuangyan123/re` repository and workflow filename,
   including the `.yml` or `.yaml` suffix, not a full path.
4. The workflow runs on a GitHub-hosted runner and uses the supported Node/npm
   versions. Current npm guidance requires npm CLI `11.5.1+` and Node `22.14.0+`
   for Trusted Publishing; the project package engine remains `>=22 <23`.
5. The future publish job has only the additional permission it needs:

   ```yaml
   permissions:
     contents: read
     id-token: write
   ```

The current `.github/workflows/release.yml` validation workflow must not
receive `id-token: write`. It validates artifacts only and has no npm
authentication environment. Adding a future publish workflow and configuring
its Trusted Publisher is a separate post-release hardening change; it must not
rewrite the immutable v0.1.0 tag or republish that version.

## Future token and provenance boundary

Future releases should use npm Trusted Publishing/OIDC and should not add a
long-lived `NPM_TOKEN` or `NODE_AUTH_TOKEN`. When trusted publishing is used
from a public GitHub repository for a public package, npm can generate
provenance attestations automatically. That future behavior does not retroactively
create or prove provenance for the interactive v0.1.0 bootstrap.

The future publish workflow should be a dedicated workflow such as
`.github/workflows/npm-publish.yml`, use a GitHub-hosted runner, and grant only
`contents: read` and `id-token: write`. It must checkout the exact approved
tag/ref, verify package/tag versions, run the full release validation, rebuild
or repack as required, compare the package file list and per-file SHA-256
manifest with the approved payload, and publish only a matching payload. It
must not publish merely because an arbitrary tag or `workflow_dispatch` input
exists. A maintainer-approved release gate and the required CI result must be
explicit.

When configuring the relationship, choose only the actual publication action
needed by the future workflow. Do not enable both direct `npm publish` and
`npm stage publish` without a separately reviewed reason. If the npm CLI is
used to manage the relationship, its current requirement is npm `11.15.0+`;
the Trusted Publishing runtime requirement remains npm `11.5.1+` and Node
`22.14.0+`. Verify the saved relationship with `npm trust list tutor-benchmark`
and confirm the exact repository, workflow filename, and allowed permission.

## Build-once handoff

The tag validation workflow produces:

```text
approved source SHA
  -> validated package payload manifest
  -> retained tutor-benchmark-0.1.0.tgz
  -> release-candidate-report.json
```

For v0.1.0, the interactive bootstrap and the GitHub Release must use the
retained tarball from that exact tag validation workflow run. The registry
payload and GitHub Release asset must be compared with the validated package
file list and per-file SHA-256 manifest; a changed payload is a hard stop.
Raw `.tgz` bytes may differ only when the verifier establishes a non-semantic
wrapper-metadata difference and the payload manifest remains identical.

For future Trusted Publishing, if the job must repack inside CI, it must first
rebuild from the same source SHA and compare the payload manifest with the
approved report. Only a matching payload may be published.

After publication, verify the registry package metadata, published version,
payload identity, install behavior, and Quickstart non-official flags. Record
the exact source SHA, workflow run, GitHub Release, registry version, and
fingerprints in the release evidence. For the bootstrap, record the
publication method as `interactive_2fa_bootstrap` and
`npmProvenanceForV010: false` unless independently proven otherwise.

## Official references

- [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm provenance statements](https://docs.npmjs.com/generating-provenance-statements/)
- [npm publish](https://docs.npmjs.com/cli/commands/npm-publish/)
