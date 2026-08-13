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
