# Setup — install for your own agent

This repo is a self-hostable realtime voice-call surface. Anyone can fork it and stand up their own agent's call site in a few minutes.

## 1. Clone & install

```bash
git clone https://github.com/SiqiH214/phone-call-openclaw.git
cd phone-call-openclaw
npm install
```

## 2. Configure (interactive wizard)

```bash
./scripts/setup.sh
```

It prompts for:

- `OPENAI_API_KEY` — required, used to mint OpenAI Realtime client secrets.
- OpenClaw gateway URL + token — your local OpenClaw or a hosted one.
- `FAL_KEY` — optional, enables artifact generation and the avatar setup script.
- Agent display name, owner name, app name.

Result: a `.env.local` file (gitignored).

## 3. Tunnel your local gateway (optional)

If your OpenClaw gateway runs on `localhost`, expose it over HTTPS so the deployed call site can reach it:

```bash
./scripts/start-tunnel.sh
```

First run downloads `cloudflared` into `bin/`. The script prints a public `https://*.trycloudflare.com` URL — set that as `OPENCLAW_PUBLIC_URL` on your Vercel project (or in `.env.production`).

## 4. Generate your avatar

The call surface shows a 16:9 portrait + idle loop of your agent. Pick one:

```bash
# Generate from a text prompt (fal.ai nano-banana → Kling i2v idle loop)
./scripts/setup-avatar.sh --prompt "a calm 28-year-old looking into camera, soft natural light, off-shoulder top"

# Or animate your own photo
./scripts/setup-avatar.sh --image ./me.jpg
```

Writes `public/avatar.png` (1280×720) and `public/avatar-loop.mp4` (~5s loop). Both are gitignored — each fork brings its own.

## 5. Persona context

The call surface can ground itself in your agent's identity / soul / memory markdown. Three ways to provide it (first match wins per file):

- Inline env vars: `OPENCLAW_IDENTITY_MD`, `OPENCLAW_SOUL_MD`, `OPENCLAW_MEMORY_MD`
- File-path env vars: `OPENCLAW_IDENTITY_FILE`, `OPENCLAW_SOUL_FILE`, `OPENCLAW_MEMORY_FILE`
- Repo drop-in: place files at `persona/IDENTITY.md`, `persona/SOUL.md`, `persona/MEMORY.md` (gitignored).
- For dated memory logs: `OPENCLAW_MEMORY_DIR=/path/to/dir` (the latest `*.md` is used).

## 6. Run locally

```bash
npm run dev
```

## 7. Deploy on Vercel

Import the repo on Vercel as a Vite project and set the environment variables from `.env.local` (Vercel doesn't read local `.env.local` — copy the values into the project's environment settings, scoped to Production).

Minimum required env on Vercel:

- `OPENAI_API_KEY`
- `OPENCLAW_PUBLIC_URL` (your tunnel URL or hosted gateway)
- `OPENCLAW_GATEWAY_TOKEN`
- `PUBLIC_APP_ORIGIN` and `OPENCLAW_GATEWAY_ORIGIN` (your deployed Vercel URL)

Optional: `OPENCLAW_AGENT_NAME`, `OPENCLAW_OWNER_NAME`, `OPENCLAW_AGENT_VOICE_PROMPT`, `FAL_KEY`, persona env vars.

## Security

- Never commit `.env.local`, `.env.production.local`, or your `bin/cloudflared` PID files.
- Rotate any key that was ever pasted into chat or committed.
- The OpenClaw routes are intentionally narrow. Add real auth, rate limiting, and logging before running a public instance for other users.
