# HTTP Python Tutor example

Integration example only. It uses Python's standard library and is not a
benchmark score baseline or a production Tutor implementation.

Start the server:

```bash
python examples/http-python-tutor/server.py
```

In another terminal, after installing Tutor Benchmark, run:

```bash
tutorbench run \
  --http http://127.0.0.1:8000/respond \
  --limit 3
```

From a repository clone after `npm run build`, use
`node dist/src/cli/tutorbench.js` in place of `tutorbench`.

The server accepts `TutorTurnInput` JSON at `POST /respond` and returns the
minimal public Tutor response shape: `{ "text": "..." }`.
