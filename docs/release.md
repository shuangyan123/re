# Release and Public Delivery

Tutor Benchmark is a public Developer Preview. Its package metadata and
artifacts are release-ready, but this repository does not automatically publish
to npm or claim a stable, scientifically validated benchmark release.

## Validation

The maintainer smoke command builds the package, creates a local tarball,
installs it into a temporary empty consumer without the optional OpenAI peer,
imports the package-root API, loads the canonical dataset asset, and runs the
installed `tutorbench --help` command:

```bash
npm run test:package
```

The public website artifact has a separate secret-free check:

```bash
npm run test:website
```

The normal CI workflow runs both checks. The release validation workflow is
manual or tag-triggered and also runs the typecheck, lint, tests, build,
synthetic benchmark, website build, package smoke, and artifact checks.

The installed `tutorbench` executable also exposes `collect` and `evaluate`.
Package smoke checks the collection help path without making a live Tutor call.
Real-model response files remain local/ignored evidence until they pass a
separate privacy, license, provider-terms, and publication review.

## License and governance artifacts

Every package or release validation must retain the project's public
governance boundary:

- `LICENSE` — complete Apache License 2.0 text for software scope.
- `LICENSES/CC-BY-4.0.txt` — CC BY 4.0 canonical legal-code pointer for
  authored benchmark content.
- `LICENSES/BRAND-POLICY.md` — separate TutorBench brand policy.
- `LICENSES.md`, `NOTICE`, and `docs/licensing.md` — the machine-readable,
  informational, and detailed scope maps.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md` — contribution,
  conduct, and security entry points.

`npm run test:governance` validates the required repository files, the
multi-license package metadata, and the README governance links. The package
smoke additionally verifies that the applicable license, notice, scope, and
brand-policy files are present in the tarball. The release workflow runs both
checks before retaining a package artifact. Tag/version validation semantics
remain unchanged.

## Version and tags

Package versions follow Semantic Versioning intent while the project remains a
Developer Preview. A release tag uses the `vX.Y.Z` form, with an optional
SemVer prerelease suffix such as `v0.2.0-beta.1`. The tag version must exactly
match `package.json`; the validation workflow fails on a mismatch and never
changes the package version automatically.

For example:

```text
package.json: 0.1.0
release tag:  v0.1.0
```

## Artifacts and publishing boundary

Tag validation produces a downloadable
`tutor-benchmark-<version>.tgz` Actions artifact after all gates pass. A
website artifact is retained separately. No `npm publish`, npm token,
`NODE_AUTH_TOKEN`, or automatic GitHub Release job is configured. A future
intentional authenticated publish step should consume these already-validated
build and pack steps rather than redesigning them.

## Website deployment

`.github/workflows/pages.yml` builds `website/dist` from the current source,
checks its routes and public-data firewall, and deploys it to GitHub Pages only
from `main`. The Pages workflow supplies the project base path and canonical
base URL at build time, so local builds remain root-based while a project site
can be served under `/<repo>/`. It uses no model, API, database, or deployment
secret.

The website continues to show no calibrated public model runs. Public result
submission, verification, ingestion, and reproducible real-model results are
future work.

## Repository settings follow-up

This P0 task does not change GitHub repository administration or branch
protection. Before a broader public launch, maintainers should verify that
`main` requires the Tutor Benchmark CI status check while preserving a
practical solo-maintainer workflow; an arbitrary external reviewer count is
not required by this policy.
