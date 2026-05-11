# Security Policy

## Supported Versions

This project is pre-1.0. Security fixes should target the latest `main` branch.

## Reporting A Vulnerability

Please report sensitive issues privately to the repository owner. Do not open a public issue for leaked credentials, authentication bypasses, gateway token exposure, or remote execution risks.

## Deployment Checklist

- Rotate any key that was shared outside your password manager or deployment provider.
- Store `OPENAI_API_KEY`, `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_BRIDGE_SECRET`, and `FAL_KEY` only as environment variables.
- Restrict your OpenClaw gateway to trusted origins.
- Set `OPENCLAW_CALL_SCOPES` to the smallest scope set you want phone calls to have. The default is `all`, matching normal OpenClaw chat behavior.
- Add authentication before exposing a site that can trigger privileged OpenClaw actions.
- Add request logging, rate limiting, and human confirmation for destructive or server-changing actions.
