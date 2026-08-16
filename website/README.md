# Tutor Benchmark Public Website

The website is a static, read-only Developer Preview generated from the
canonical TutorEval 0.2A dataset.

```text
benchmark core
  -> public serializer
  -> public-data/*.json
  -> static HTML/CSS/JS
```

Build or serve it from the repository root:

```bash
npm run website:build
npm run website:dev
```

`website/dist/` is generated and ignored. The build does not require
`OPENAI_API_KEY`, does not call a Judge, and does not include model rankings or
trial data that are not present in a validated public artifact.

`.github/workflows/pages.yml` builds this directory and deploys it to GitHub
Pages only from `main`. GitHub Pages provides the project `base_path` and
canonical `base_url` to the generator, so project-site links work under
`/<repo>/` while local builds continue to use `/`. The workflow validates the
generated routes and public-data firewall before upload and requires no model,
API, database, or deployment secret.

The Run and Methodology pages describe the 0.4A.3 `baseline-native-default`
generation profile: the benchmark prompt/messages and 1024-token output cap
are fixed, while temperature, reasoning, and seed remain provider-native and
unconstrained. Future public cohorts must retain dataset and generation spec
identity instead of mixing different profiles.

The Run and Docs pages distinguish the local `tutorbench collect` Product
Tutor path from `tutorbench collect-model` canonical model evidence. Real-model
response artifacts are private and ignored by default, remain preliminary and
uncalibrated, and are never copied into website public data automatically.

The serializer defaults to excluding evaluator-only fields. The current
synthetic development dataset opts into its documented public disclosure and
adaptation metadata; ground truth, known misconceptions, rubrics, and hidden
evidence remain excluded.

Case target locale is independent from the developer UI locale. The public
case artifact records the resolved locale; legacy cases without the field
resolve to `en`. For a local, explicit audit view over an ignored evaluation
artifact, use `npm run website:build -- -- --evaluation <path> --output
website/private-dist --locale zh-CN`. The default Pages build never loads that
path and never emits private evaluation content.
