# Canonical model host example

This is a tiny Python standard-library integration example for the advanced
canonical execution boundary. It accepts one `TutorExecutionPacket` request,
reads the exact messages and generation spec, and returns sanitized output plus
the existing execution-support attestation shape.

It contains no provider SDK, credentials, model call, or real-model evidence.
Responses from this fake host are synthetic protocol fixtures and must not be
published or described as `recorded_model` evidence.

Run it locally:

```bash
python examples/canonical-model-host/server.py
```

Use `tutorbench collect-model --dry-run` to inspect canonical packet selection.
If you exercise the endpoint with a local test, keep the resulting artifact
private and synthetic. A real baseline host must forward the exact packet
messages and controls to a reviewed model integration.
