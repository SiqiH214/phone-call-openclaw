# persona/

Drop your agent's grounding files here:

- `IDENTITY.md` — who the agent is
- `SOUL.md` — voice, taste, personality
- `MEMORY.md` — long-term memory / facts

The call server reads these as a fallback when `OPENCLAW_*_MD` / `OPENCLAW_*_FILE` env vars are not set.

All `*.md` in this directory are gitignored — each install brings its own.
