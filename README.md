# Phone Call OpenClaw

A self-hostable realtime voice-call website for an OpenClaw agent. The browser talks to OpenAI Realtime with short-lived client secrets, while server routes proxy OpenClaw gateway calls and artifact generation so private API keys never ship to the client.

## What You Get

- A Vite/React call surface with microphone, camera/screen inspection, transcript, uploads, and artifact panel.
- Vercel API routes for OpenAI Realtime token minting and OpenClaw gateway status/actions.
- Local Express server for running the same app against a local OpenClaw gateway.
- Configurable agent name, owner name, avatar media, voice prompt, Realtime model/voice, OpenClaw URL, and artifact models.

## Quick Start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open the Vite URL printed by the terminal. By default, the local server expects OpenClaw gateway access at `http://127.0.0.1:18789`.

## Setup Checklist

1. Add an OpenAI API key for Realtime voice calls.
2. Add your OpenClaw gateway URL/token, or run the site on the same machine as OpenClaw and use the local gateway defaults.
3. Replace the default avatar with your own image or video.
4. Add a Fal key if you want image/video/music artifact generation.
5. Add persona/style/memory env vars if your OpenClaw agent does not already provide them locally.

## OpenAI API

```bash
OPENAI_API_KEY=sk-proj-your-key-here
OPENAI_REALTIME_MODEL=gpt-realtime-2
OPENAI_REALTIME_VOICE=marin
```

The server mints short-lived Realtime client secrets, so the browser never receives your standard OpenAI API key.

## Optional Site Password

Set `SITE_PASSWORD` to require a password before the call UI loads. The password is checked server-side and stored in an HttpOnly cookie after unlock. Sensitive routes such as Realtime token minting, OpenClaw asks, and artifact rendering also require the cookie.

```bash
SITE_PASSWORD=change-me
```

## Wire Your OpenClaw

If this site runs beside an existing OpenClaw agent, the local Express server defaults to:

```bash
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
```

It can also read the gateway token from `/root/.openclaw/openclaw.json` when available. Otherwise set:

```bash
OPENCLAW_GATEWAY_TOKEN=your-openclaw-gateway-token
```

For deployed sites, expose your OpenClaw gateway over HTTPS and set:

```bash
OPENCLAW_PUBLIC_URL=https://your-stable-openclaw-gateway.example
OPENCLAW_GATEWAY_TOKEN=your-openclaw-gateway-token
PUBLIC_APP_ORIGIN=https://your-vercel-site.example
OPENCLAW_GATEWAY_ORIGIN=https://your-vercel-site.example
```

If your OpenClaw agent already has OpenAI/Fal keys and persona files, you can reuse those by setting the same values in this web app's environment, or by running locally where the OpenClaw config/persona files are readable.

## Avatar And Branding

Put your avatar assets in `public/`, then point the env vars at them. For example:

```bash
PUBLIC_APP_NAME=Phone Call OpenClaw
OPENCLAW_AGENT_NAME=Ada
OPENCLAW_OWNER_NAME=Jane
PUBLIC_AGENT_AVATAR_IMAGE_URL=/avatar.png
PUBLIC_AGENT_AVATAR_VIDEO_URL=/avatar-live.mp4
PUBLIC_AGENT_AVATAR_INITIALS=AD
```

`PUBLIC_AGENT_AVATAR_IMAGE_URL` is used when idle and as the video poster. `PUBLIC_AGENT_AVATAR_VIDEO_URL` is used while the call is live. These can be local `/file.ext` paths from `public/` or full hosted URLs.

Optional voice/personality override:

```bash
OPENCLAW_AGENT_VOICE_PROMPT="You are Ada, Jane's concise and warm OpenClaw voice agent..."
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

## MCP And Connected Tools

The website routes MCP/tool requests through the connected OpenClaw gateway. When the user asks to use MCP, connectors, GitHub, Gmail, Slack, Linear, Vercel, Sentry, Figma, files, repos, or other configured tools, the Realtime layer calls OpenClaw instead of guessing locally. The actual MCP servers must be configured in OpenClaw; this web app passes the task, active session key, optional screen/camera context, and operator scopes through the gateway.

## Camera And Screen Vision

The browser does not continuously stream camera video to OpenClaw. When the user asks the voice agent to look, see, inspect the camera, or inspect the shared screen, the site captures a single PNG/JPEG frame and attaches it directly to the active OpenAI Realtime conversation as an `input_image`.

If the agent says it cannot see the camera:

- Make sure the user clicked the camera button and granted browser camera permission.
- Ask the agent to "look at my camera" after the preview has appeared.

## Fal API For Artifacts

Fal is optional. Add it when you want the voice agent to render images, videos, or music from the artifact panel:

```bash
FAL_KEY=your-fal-key
FAL_IMAGE_MODEL=fal-ai/nano-banana-2
FAL_VIDEO_MODEL=bytedance/seedance-2.0/fast/text-to-video
FAL_MUSIC_MODEL=fal-ai/minimax-music/v2.6
```

If you skip `FAL_KEY`, text/code/html artifacts still work, but image/video/music generation will return a setup error.

Image and video artifacts support reference media. If the user uploads an image/video, the site sends that as the reference. If camera or screen share is on, the site can capture the current frame and pass it as a reference image, so prompts like "make an avatar based on my camera" can use the camera snapshot.

## Deploy On Vercel

1. Fork or clone this repository.
2. Import it into Vercel as a Vite project.
3. Add the environment variables from `.env.example`.
4. Point `OPENCLAW_PUBLIC_URL` at an HTTPS-accessible OpenClaw gateway.
5. Set `PUBLIC_APP_ORIGIN` and `OPENCLAW_GATEWAY_ORIGIN` to your deployed site URL.
6. Upload your avatar assets into `public/` before deploy, or use hosted asset URLs.

## Persona And Memory

The server can load OpenClaw persona, style, and memory context from environment variables:

- `OPENCLAW_IDENTITY_MD`
- `OPENCLAW_SOUL_MD`
- `OPENCLAW_STYLE_MD`
- `OPENCLAW_MEMORY_MD`

Local OpenClaw installs can also provide `/root/.openclaw/workspace/IDENTITY.md`, `/root/.openclaw/workspace/SOUL.md`, `/root/.openclaw/workspace/STYLE.md`, and markdown files under `/root/.openclaw/workspace/memory`.

## Security Notes

Do not commit `.env`, `.env.local`, `.env.production.local`, `.vercel`, `dist`, or `node_modules`. Rotate any key that has ever been pasted into chat or committed.

The OpenClaw routes are intentionally narrow. Before running a public instance for other users, add real authentication, rate limiting, request logging, and confirmation gates for server-changing actions.

## License

MIT
