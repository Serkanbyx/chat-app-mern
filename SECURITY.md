# Security Policy

We take the security of **Chat App MERN** seriously. This document explains
how to report a vulnerability and what to expect after disclosure.

## Supported Versions

Only the latest `main` branch receives security fixes.

| Version | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |
| Older   | :x:                |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security-related reports.**

For security concerns, please contact: **serkanbyx1@gmail.com**

When reporting, please include:

- A clear description of the vulnerability and its impact.
- Steps to reproduce, or a minimal proof-of-concept.
- Affected versions, commits, or routes.
- Any suggested mitigation, if known.

## Response Timeline

- **Acknowledgement**: within **72 hours** of receiving the report.
- **Triage and assessment**: within **7 days**.
- **Fix and coordinated disclosure**: target **30 days** depending on severity.

## Scope

In-scope:

- The Express REST API under `server/`.
- The Socket.io real-time surface.
- Authentication (JWT), authorization, rate limiting, and input validation.
- The React client under `client/`.

Out-of-scope:

- Vulnerabilities requiring a compromised user device or browser.
- Denial-of-service attacks against the public demo deployment.
- Reports from automated scanners without a working proof-of-concept.

## Safe Harbor

Good-faith research that respects this policy will not be pursued legally.
Thank you for helping keep the project and its users safe.
