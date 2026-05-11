# Contributing

Thanks for helping make Phone Call OpenClaw easier to run on other OpenClaw installs.

## Local Setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Pull Requests

- Keep personal prompts, names, API keys, gateway URLs, and generated build output out of commits.
- Prefer environment variables for deployment-specific behavior.
- Run `npm run build` before opening a pull request.
- Include screenshots or short notes for UI changes.
- Keep OpenClaw gateway behavior narrowly scoped and document any new capability in `README.md`.
