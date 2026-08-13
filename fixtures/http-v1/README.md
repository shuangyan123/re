# HTTP v1 contract fixtures

These small synthetic vectors pin the external Tutor transport boundary. They
contain only Tutor-visible request fields and the sanitized public response
shape; they are not a copy of the benchmark corpus.

- `valid-request.json`: complete `TutorTurnInput` wire example
- `valid-minimal-response.json`: smallest successful response
- `valid-metrics-response.json`: successful response with allowed metrics
- `invalid-response.json`: response missing the required `text` field
