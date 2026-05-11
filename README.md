# Phone Call OpenClaw

A self-hostable realtime voice-call website for an OpenClaw agent. The browser talks to OpenAI Realtime with short-lived client secrets, while server routes proxy OpenClaw gateway calls and artifact generation so private API keys never ship to the client.

## What You Get

- A Vite/React call surface with microphone, camera/screen inspection, transcript, uploads, and artifact panel.
- Vercel API routes for OpenAI Realtime token minting and OpenClaw gateway status/actions.
- Local Express server for running the same app against a local OpenClaw gateway.
- Configurable agent name, owner name, voice prompt, Realtime model/voice, OpenClaw URL, and artifact models.

## Quick Start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open the Vite URL printed by the terminal. By default, the local server expects OpenClaw gateway access at `http://127.0.0.1:18789`.

## Required Environment

```bash
OPENAI_API_KEY=sk-proj-your-key-here
OPENCLAW_GATEWAY_TOKEN=your-openclaw-gateway-token
```

For deployed sites, set:

```bash
OPENCLAW_PUBLIC_URL=https://your-stable-openclaw-gateway.example
PUBLIC_APP_ORIGIN=https://your-vercel-site.example
OPENCLAW_GATEWAY_ORIGIN=https://your-vercel-site.example
```

Optional branding/personality:

```bash
PUBLIC_APP_NAME=Phone Call OpenClaw
OPENCLAW_AGENT_NAME=OpenClaw
OPENCLAW_OWNER_NAME=the user
OPENCLAW_AGENT_VOICE_PROMPT="You are ..."
```

## Phone Call Permissions

By default, phone calls request the same full OpenClaw operator permission set as chatting with OpenClaw:

```bash
OPENCLAW_CALL_SCOPES=all
```

Installers can restrict the call surface without changing code:

```bash
# Only allow read-style OpenClaw access.
OPENCLAW_CALL_SCOPES=read-only

# Disable OpenClaw gateway tool access from calls.
OPENCLAW_CALL_SCOPES=none

# Or provide an explicit comma-separated scope list.
OPENCLAW_CALL_SCOPES=operator.read,operator.write
```

The current full preset expands to `operator.admin`, `operator.read`, `operator.write`, `operator.approvals`, and `operator.pairing`.

## Camera And Screen Vision

The browser does not continuously stream camera video to OpenClaw. When the user asks the voice agent to look, see, inspect the camera, or inspect the shared screen, the site captures a single frame and sends it to the server for vision description before forwarding the result to OpenClaw.

If the agent says it cannot see the camera:

- Make sure the user clicked the camera button and granted browser camera permission.
- Make sure `OPENAI_API_KEY` is set on the server or Vercel project, because the server uses it to describe captured frames.
- Check `OPENAI_VISION_MODEL` if you override it; the default is used when it is unset.
- Ask the agent to "look at my camera" after the preview has appeared.

Optional artifact generation:

```bash
FAL_KEY=your-fal-key
FAL_IMAGE_MODEL=fal-ai/nano-banana-2
FAL_VIDEO_MODEL=bytedance/seedance-2.0/fast/text-to-video
```

## Deploy On Vercel

1. Fork or clone this repository.
2. Import it into Vercel as a Vite project.
3. Add the environment variables from `.env.example`.
4. Point `OPENCLAW_PUBLIC_URL` at an HTTPS-accessible OpenClaw gateway.
5. Set `PUBLIC_APP_ORIGIN` and `OPENCLAW_GATEWAY_ORIGIN` to your deployed site URL.

## Persona And Memory

The server can load OpenClaw persona context from environment variables:

- `OPENCLAW_IDENTITY_MD`
- `OPENCLAW_SOUL_MD`
- `OPENCLAW_MEMORY_MD`

Local OpenClaw installs can also provide `/root/.openclaw/workspace/IDENTITY.md`, `/root/.openclaw/workspace/SOUL.md`, and markdown files under `/root/.openclaw/workspace/memory`.

## Security Notes

Do not commit `.env`, `.env.local`, `.env.production.local`, `.vercel`, `dist`, or `node_modules`. Rotate any key that has ever been pasted into chat or committed.

The OpenClaw routes are intentionally narrow. Before running a public instance for other users, add real authentication, rate limiting, request logging, and confirmation gates for server-changing actions.

## License

MIT
