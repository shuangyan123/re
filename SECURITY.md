# Security Policy

TutorBench is a public Developer Preview. Please treat a possible security
issue separately from a disagreement about a benchmark case, rubric, score,
or methodology.

## Report privately

Do not put credentials, tokens, cookies, private artifacts, or exploit details
in a public GitHub issue. Report privately when a private maintainer channel is
provided, especially for:

- Credential leaks or secret exposure.
- Unsafe external endpoint or URL handling.
- A bypass of the public-data or private-artifact firewall.
- Leakage of evaluator-only evidence or hidden Judge reasoning.
- Code execution, path traversal, injection, authentication, authorization,
  or other security bugs.

GitHub Private Vulnerability Reporting is not enabled for this repository at
the time of this policy. This document does not create a private reporting
channel or invent a security email address. If no private maintainer channel
is available, open a minimal issue titled `Private security contact request`
with no sensitive details and request a private route. Do not include the
secret, token, cookie, exploit payload, private path, or confidential artifact
in that issue.

If a secret may already be exposed, revoke or rotate it first when possible,
then request private coordination without repeating the secret. Include only
the minimum public reference needed for the maintainer to locate the issue.

## What is not a security vulnerability

Ordinary benchmark disagreement, an incorrect case, a rubric proposal, a
Judge-quality concern, or a request to change scoring belongs in the relevant
structured issue form or pull request. Do not use a public issue for sensitive
security evidence.

## Maintainer response

Maintainers will validate the report, limit disclosure, and coordinate a fix
or mitigation when appropriate. A report may be closed as non-security scope
when it does not affect confidentiality, integrity, availability, privacy,
or the public-data boundary.
