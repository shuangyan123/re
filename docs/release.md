# Release and Public Delivery

Tutor Benchmark is a public Developer Preview. P2A prepares and verifies a
`tutor-benchmark@0.1.0` release candidate, but it does not publish to npm,
create a Git tag, or create a GitHub Release. Actual publication is P2B and
requires explicit maintainer authorization.

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

The retained files are:

```text
artifacts/release/tutor-benchmark-0.1.0.tgz
artifacts/release/release-candidate-report.json
```

The report contains the exact source commit, runtime versions, package file
list and SHA-256 payload fingerprint, observed raw tarball fingerprint,
Quickstart and canonical identities, Judge/prompt identities, license and
brand-policy identities, website payload fingerprint, and verification flags.
It intentionally contains no absolute local path, username, credential,
provider payload, reviewer evidence, or timestamp. The payload fingerprint is
the reproducibility boundary; raw `.tgz` byte reproducibility is recorded only
when it is observed, not assumed from npm/tar metadata.

The broader repository gates remain required for the release workflow:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run quickstart
npm run benchmark
npm run test:governance
npm run website:build
npm run test:website
npm run test:package
git diff --check
```

The canonical no-Judge benchmark remains fail-closed: Judge-owned criteria
produce unavailable errors and no official score. The Quickstart remains the
separate `tutorbench-quickstart@0.1.0` development/smoke demonstration and is
not an official score or leaderboard result.

## Release identity and conflict checks

The P2A candidate identity is:

```text
package: tutor-benchmark@0.1.0
future tag: v0.1.0
status: Developer Preview
```

Before P2B, perform these read-only operational checks again from the exact
release commit:

```bash
npm view tutor-benchmark --json
git ls-remote --tags origin refs/tags/v0.1.0 refs/tags/v0.1.0^{}
gh api repos/shuangyan123/re/releases/tags/v0.1.0
```

At P2A audit time, the npm command returned registry `E404 Not Found`, the tag
was absent, and the GitHub Release lookup returned `404`. A registry 404 is a
point-in-time availability result, not a permanent reservation of the name.
If the name is later owned by another project, or if the tag/release identity
appears, stop and obtain a maintainer naming or release decision; do not rename,
force-update, delete, or recreate anything automatically.

## Version and tag policy

The package version and future release tag must match exactly. The existing
`scripts/validate-release-version.mjs` rejects mismatches, prerelease suffixes
for this candidate, and malformed tags. The project policy for a formal
release is an annotated tag bound to the approved exact release commit, for
example `v0.1.0`; P2A defines that policy but does not create or push the tag.

## Artifacts and publishing boundary

The release validation workflow is manual or tag-triggered validation only. It
uses `contents: read`, uploads the exact package tarball, the static website
artifact, and the release-candidate report, and has no publish job, npm token,
OIDC publish permission, or automatic GitHub Release job. Each Actions run is
its own evidence source; no mutable `latest` artifact is used.

A release-validation workflow defect does not justify moving an immutable
release tag. After fixing the validation workflow on `main`, manually dispatch
the fixed workflow against the existing exact tag and verify its resolved
source commit.

The package and website artifacts are generated from the resolved checkout
commit. A future GitHub Release asset must come from the validated workflow
run, not from a new local `npm pack`. If P2B must repack inside a trusted
workflow, it must compare the new package payload file list and SHA-256
manifest with the validated report before publishing. Raw gzip bytes do not
need to be treated as stable when the payload is identical.

## P2B bootstrap publication sequence

The first publication of the unscoped `tutor-benchmark` package cannot begin
with npm Trusted Publishing: the package must already exist before a trusted
publisher relationship can be configured. The v0.1.0 bootstrap therefore uses
an explicitly authorized interactive maintainer publish with account-level
2FA. It does not use a long-lived `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or a
granular bypass-2FA token, and it does not claim npm provenance for this
bootstrap release.

P2B requires a separate explicit maintainer authorization and must complete the
following in order:

1. Approve the exact clean `main` source commit, rerun the required repository
   gates and release verifier, and freeze the source SHA and package payload
   fingerprint.
2. Recheck the npm package, `v0.1.0` tag, and GitHub Release identities
   read-only. Confirm the maintainer account and account-level 2FA without
   recording credentials or OTPs. Decide whether optional `main` protection
   and required Tutor Benchmark CI are ready.
3. After the exact tag authorization, create and push the annotated `v0.1.0`
   tag without force options.
4. Wait for the tag-triggered validation workflow, then inspect that specific
   run's tarball, website, and release-candidate report. The report must bind
   to the frozen source SHA and the package payload must match; do not use old
   PR/main artifacts or a mutable `latest` artifact.
5. Publish the exact validated
   `tutor-benchmark-0.1.0.tgz` interactively with `npm publish <path> --access
   public`; let npm present the 2FA challenge and do not put an OTP in command
   arguments, shell history, logs, or files.
6. Read back the registry metadata, install `tutor-benchmark@0.1.0` into a
   fresh temporary directory, run the installed CLI and provider-free
   Quickstart, and compare the registry payload fingerprint with the validated
   workflow payload.
7. Only after the npm readback passes, create the public GitHub Release from
   the same `v0.1.0` tag, attach the exact validated tarball and report, and
   verify that the release asset payload matches both the workflow and registry
   payloads.
8. Only after the package exists, configure and verify the npm Trusted
   Publisher for a separate future publish workflow. Keep the current release
   validation workflow validation-only and record the post-release setup as a
   separate hardening change.
9. Record the source SHA, tag workflow run, artifact fingerprints, registry
   metadata, GitHub Release, Quickstart result, and bootstrap publication
   method. Mark npm provenance for v0.1.0 as not claimed unless independent
   registry evidence proves otherwise.

Future releases should use OIDC Trusted Publishing and automatic npm
provenance rather than a long-lived token. Only the future publish job should
add `id-token: write`; the current validation workflow intentionally remains
`contents: read` only. See [the P2B npm plan](npm-publishing.md) for the
bootstrap boundary, future workflow requirements, and build-once handoff.

## License and governance artifacts

Every package or release validation must retain the project's public
governance boundary:

- `LICENSE` — complete Apache License 2.0 text for software scope.
- `LICENSES/CC-BY-4.0.txt` — CC BY 4.0 canonical legal-code pointer for
  authored benchmark content.
- `LICENSES/BRAND-POLICY.md` — separate TutorBench brand policy.
- `LICENSES.md`, `NOTICE`, and `docs/licensing.md` — machine-readable,
  informational, and detailed scope maps.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md` — contribution,
  conduct, and security entry points.

`npm run test:governance` and the RC package audit validate these boundaries.
No real-model response files, human reviewer evidence, credentials, or private
calibration submissions are release assets.

## Website deployment

`.github/workflows/pages.yml` builds `website/dist` from the current source,
checks its routes and public-data firewall, and deploys it to GitHub Pages only
from `main`. The website remains a static Developer Preview with no calibrated
public model runs. P2A may say that the v0.1.0 publication is prepared as a
release candidate; it must not say that npm or GitHub publication has already
occurred or invent a release date.

## Repository settings follow-up

P2A does not change GitHub repository administration, branch protection,
Discussions, or Private Vulnerability Reporting. Before P2B, maintainers should
verify that `main` requires the Tutor Benchmark CI status check while retaining
a practical solo-maintainer workflow; an arbitrary external reviewer count is
not required by this policy.
