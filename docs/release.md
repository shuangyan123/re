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

The package and website artifacts are generated from the resolved checkout
commit. A future GitHub Release asset must come from the validated workflow
run, not from a new local `npm pack`. If P2B must repack inside a trusted
workflow, it must compare the new package payload file list and SHA-256
manifest with the validated report before publishing. Raw gzip bytes do not
need to be treated as stable when the payload is identical.

## Future P2B sequence

P2B requires a separate explicit maintainer authorization and must complete the
following in order:

1. Confirm npm account, package ownership, public name, and account 2FA.
2. Configure and verify the npm Trusted Publisher for the exact repository and
   future publish workflow filename.
3. Decide whether `main` protection and required Tutor Benchmark CI are ready.
4. Approve the exact release commit and re-run validation against it.
5. Create the documented annotated `v0.1.0` tag.
6. Run the validation workflow and inspect the exact package, website, and
   report artifacts.
7. Create the GitHub Release with the reviewed draft notes and validated
   artifacts.
8. Publish the exact validated npm payload through npm Trusted Publishing.
9. Verify the published package with `npm view` and a clean install/Quickstart.
10. Record the source SHA, workflow run, artifact fingerprints, registry
    version, GitHub Release, and provenance evidence.

The future npm workflow should prefer OIDC Trusted Publishing and npm
provenance over a long-lived `NPM_TOKEN`. Only the future publish job should
add `id-token: write`; the current validation workflow intentionally remains
`contents: read` only. See [the P2B npm plan](npm-publishing.md) for the
current npm requirements and build-once handoff.

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
