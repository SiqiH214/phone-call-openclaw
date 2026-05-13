import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPersona, personaInstructionBlock, personaMetadata } from "./persona.js";
import { getAsyncArtifact, renderArtifact } from "./artifacts.js";
import { askOpenClaw } from "./openclawBrain.js";
import { authStatus, loginWithPassword, logout, requireAuth } from "./auth.js";
import {
  bridgeSecret,
  buildRealtimeInstructions,
  openclawPublicUrl,
  publicChannelConfig,
  realtimeModel,
  realtimeTurnDetection,
  realtimeVoice,
  safetyIdentifier,
  serviceName,
} from "../shared/channel.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

app.use(cors());
app.use(express.json({ limit: "25mb" }));

const openclawHost = process.env.OPENCLAW_HOST || openclawPublicUrl || "local";
const openclawGateway = process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789";

function readOpenClawConfig() {
  try {
    return JSON.parse(fs.readFileSync("/root/.openclaw/openclaw.json", "utf8"));
  } catch {
    return null;
  }
}

async function fetchOpenClaw(pathname, options = {}) {
  const config = readOpenClawConfig();
  const token = config?.gateway?.auth?.token || process.env.OPENCLAW_GATEWAY_TOKEN;
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${openclawGateway}${pathname}`, {
    ...options,
    headers,
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  return { ok: response.ok, status: response.status, body };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: serviceName,
    config: publicChannelConfig(),
    openclawHost,
    openclawGateway,
    realtimeModel,
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
  });
});

app.get("/api/openclaw/status", async (_req, res) => {
  try {
    const gatewayHealth = await fetchOpenClaw("/health");
    res.status(gatewayHealth.ok ? 200 : 502).json({
      ok: gatewayHealth.ok,
      gateway: gatewayHealth.body,
      gatewayUrl: openclawGateway,
    });
  } catch (error) {
    res.status(502).json({ ok: false, error: "OpenClaw gateway is not reachable." });
  }
});

app.get("/api/persona", (_req, res) => {
  const persona = loadPersona();
  res.json({
    ok: true,
    connected: persona.connected,
    metadata: personaMetadata(persona),
  });
});

app.get("/api/auth/status", (req, res) => {
  res.json({ ok: true, ...authStatus(req) });
});

app.post("/api/auth/login", (req, res) => {
  loginWithPassword(req, res, req.body?.password);
});

app.post("/api/auth/logout", (req, res) => {
  logout(req, res);
});

async function mintRealtimeToken(_req, res) {
  if (!requireAuth(_req, res)) return;

  if (!process.env.OPENAI_API_KEY) {
    res.status(400).json({
      error: "OPENAI_API_KEY is not set on the server. Add it to your environment after rotating the exposed key.",
    });
    return;
  }

  const sessionConfig = {
    session: {
      type: "realtime",
      model: realtimeModel,
      instructions: buildRealtimeInstructions([
        personaInstructionBlock(),
        ownerRealtimeContext(_req.body?.ownerProfile),
      ].filter(Boolean).join("\n\n")),
      tools: [
        {
          type: "function",
          name: "render_artifact",
          description: "Open an artifact panel and render the requested artifact from the live voice conversation. Supports creating and editing images, HTML/docs/code/PDF/Word-style docs, music, and video. Uploaded reference media is attached automatically; if camera or screen share is on, the website can also attach the current frame as a reference image for image/video artifacts.",
          parameters: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: ["image", "doc", "markdown", "code", "html", "pdf", "word", "docx", "video", "music"],
                description: "The artifact type to render.",
              },
              prompt: {
                type: "string",
                description: "A concise, self-contained prompt for the artifact.",
              },
            },
            required: ["kind", "prompt"],
            additionalProperties: false,
          },
        },
        {
          type: "function",
          name: "ask_openclaw",
          description: "Ask the connected OpenClaw agent to use its native tools and connected apps such as Gmail, GitHub, Slack messaging, Linear issue/project management, filesystem, server context, and OpenClaw-owned delegation/subagent flows.",
          parameters: {
            type: "object",
            properties: {
              question: { type: "string", description: "What OpenClaw should answer or do." },
              context: { type: "string", description: "Optional context from the voice conversation or screen." },
              responseStyle: { type: "string", description: "How the result should be spoken back." },
            },
            required: ["question"],
            additionalProperties: false,
          },
        },
        {
          type: "function",
          name: "use_mcp",
          description: "Route a request explicitly through OpenClaw's configured MCP servers, connectors, and tool layer. Use this when the user says MCP, connected tools, connector, GitHub/Gmail/Slack/Linear/Zillow/Vercel/Sentry/Figma/etc, or asks to call/list/use external tools.",
          parameters: {
            type: "object",
            properties: {
              task: { type: "string", description: "The concrete MCP/tool task to perform." },
              serverHint: { type: "string", description: "Optional MCP server or connector name, such as github, gmail, slack, linear, vercel, sentry, figma, browser, or filesystem." },
              context: { type: "string", description: "Relevant user context, target URL, repo, channel, issue, file, or desired output." },
            },
            required: ["task"],
            additionalProperties: false,
          },
        },
        {
          type: "function",
          name: "inspect_view",
          description: "Ask the web client to capture a fresh high-detail camera or shared-screen frame and attach it as an image input. Use this when Siqi asks what you see, asks about emotion/action/objects/UI, or when ambient camera frames are not enough.",
          parameters: {
            type: "object",
            properties: {
              question: { type: "string", description: "What to inspect or answer from the camera/screen view." },
              responseStyle: { type: "string", description: "How the result should be spoken back." },
            },
            required: ["question"],
            additionalProperties: false,
          },
        },
      ],
      tool_choice: "auto",
      audio: {
        input: {
          turn_detection: realtimeTurnDetection,
          transcription: {
            model: process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",
          },
        },
        output: {
          voice: realtimeVoice,
        },
      },
    },
  };

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safetyIdentifier(),
      },
      body: JSON.stringify(sessionConfig),
    });

    const payload = await response.json();
    if (!response.ok) {
      res.status(response.status).json(payload);
      return;
    }

    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: "Failed to mint realtime client secret." });
  }
}

app.post("/api/realtime/token", mintRealtimeToken);
app.post("/api/session", mintRealtimeToken);

function ownerRealtimeContext(profile) {
  return [
    "Relationship context:",
    "- This is Siqi's first-party personal web channel to 47.",
    "- Siqi is your owner.",
    "- owner_name: Siqi",
    "- preferred_name: Siqi",
    "- channel: call-my-agent-47-web",
    "- Treat the current speaker/typist as Siqi unless they explicitly say this is someone else.",
    "- If asked 'who am I?' or 'am I your owner?', answer naturally: yes, you're Siqi, my owner.",
    "- The web client can attach low-frequency live camera frames during calls. Use them as ambient visual context in the Thinking Machines sense: stay aware without forcing the user to ask you to look.",
    "- When camera frames are available, you can notice visible facial expression, posture, gaze direction, gestures, objects, and actions. Describe them as visual impressions and observable cues, not certain hidden emotions or private thoughts.",
    "- If Siqi asks whether you can see them, answer based on whether recent camera frames are present. Do not say you are blind when frames were attached.",
    "- Do not say you cannot verify ownership, do not mention claim systems, and do not ask for an identity database.",
    "- For sensitive actions, still use OpenClaw tool policy and configured permissions.",
  ].join("\n");
}

function cleanInline(value) {
  return String(value || "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
}


app.post("/api/artifacts/render", async (req, res) => {
  if (!requireAuth(req, res)) return;

  const { kind = "image", prompt = "", imageDataUrl = null, mediaDataUrl = null, mediaType = null, mediaName = null, referenceSource = null, videoModelPlan = null } = req.body || {};
  try {
    const artifact = await renderArtifact({ kind, prompt, imageDataUrl, mediaDataUrl, mediaType, mediaName, referenceSource, videoModelPlan });
    res.json(artifact);
  } catch (error) {
    res.status(500).json({ kind, status: "error", error: error.message });
  }
});

app.get("/api/artifacts/status", async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const artifact = await getAsyncArtifact({
      requestId: req.query?.id,
      kind: req.query?.kind || "video",
      endpoint: req.query?.endpoint,
      statusUrl: req.query?.statusUrl,
      responseUrl: req.query?.responseUrl,
    });
    res.json(artifact);
  } catch (error) {
    res.status(500).json({ kind: "video", status: "error", error: error.message });
  }
});

app.post("/api/openclaw/ask", async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const result = await askOpenClaw(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/openclaw/bridge", async (req, res) => {
  const actual = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!bridgeSecret || actual !== bridgeSecret) {
    res.status(401).json({ ok: false, error: "Unauthorized." });
    return;
  }

  try {
    const result = await askOpenClaw(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/tools/get-time", (_req, res) => {
  res.json({
    ok: true,
    iso: new Date().toISOString(),
    locale: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
});

app.post("/api/tools/remember", (req, res) => {
  if (!requireAuth(req, res)) return;

  const { memory = "" } = req.body || {};
  res.json({
    ok: true,
    status: "accepted",
    memory,
    note: "Memory capture acknowledged by the voice surface. Persistent OpenClaw memory writes should route through ask_openclaw.",
  });
});

app.post("/api/tools/web-search", (_req, res) => {
  res.json({
    ok: false,
    status: "not_configured",
    note: "Use ask_openclaw for web/tool research until a dedicated web-search tool is enabled.",
  });
});

app.post("/api/openclaw/action", (req, res) => {
  if (!requireAuth(req, res)) return;

  const { action, prompt } = req.body || {};
  const accepted = ["code", "doc", "markdown", "html", "image", "video", "music", "diagram", "status"];

  if (!accepted.includes(action)) {
    res.status(400).json({ error: "Unknown action." });
    return;
  }

  res.json({
    ok: true,
    action,
    host: openclawHost,
    status: action === "status" ? "server channel ready" : "queued for confirmed execution",
    note:
      "This scaffold intentionally queues creative/coding actions instead of exposing arbitrary root shell over HTTP.",
    prompt: prompt || "",
  });
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(port, "0.0.0.0", () => {
  console.log(`OpenClaw channel server listening on http://localhost:${port}`);
});
