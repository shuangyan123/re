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

The serializer defaults to excluding evaluator-only fields. The current
synthetic development dataset opts into its documented public disclosure and
adaptation metadata; ground truth, known misconceptions, rubrics, and hidden
evidence remain excluded.
