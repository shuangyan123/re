# TutorBench brand assets

Public-facing brand: **TutorBench**
Chinese descriptor: **AI Tutor 评测基准**

This directory contains the approved T1 trajectory mark from
`source/tutorbench_final_brand_assets.zip` (SHA-256:
`85AF85C31B9B7A55ED3C4E46A01C0D81F308B03464A28860B0708B75DBCBA4C6`). The
source archive and its supplied specification are retained for provenance.
The active web and favicon files are copied byte-for-byte from that package;
their geometry and endpoint treatment are not edited.

## Active files

- `web/tutorbench-mark.svg` — primary blue-to-violet T1 mark for README and docs
- `web/tutorbench-mark-mono-dark.svg` — monochrome dark treatment for light surfaces
- `web/tutorbench-mark-mono-light.svg` — monochrome light treatment for dark surfaces
- `web/tutorbench-mark-small.svg` — optical variant for approximately 16–32 px
- `web/tutorbench-app-icon.svg` — supplied rounded-square app icon
- `raster/favicon.ico`, `raster/favicon-16.png`, `raster/favicon-32.png` — supplied website favicon files

The generated website copies the active files to
`website/dist/assets/brand/tutorbench/` and references the small optical mark
in its header plus the supplied favicon files in each page head. The package
metadata includes the active web and favicon directories so the README mark
remains available in the packaged artifact.

Technical identifiers such as the npm package name, import paths, CLI commands,
dataset IDs, corpus IDs, schema IDs, and artifact fields remain unchanged.
