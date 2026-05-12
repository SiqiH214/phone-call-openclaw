import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPersona, personaInstructionBlock } from "./persona.js";
import { getAsyncArtifact, renderArtifact } from "./artifacts.js";
import { askOpenClaw } from "./openclawBrain.js";
import {
  bridgeSecret,
  buildRealtimeInstructions,
  openclawPublicUrl,
  publicChannelConfig,
  realtimeModel,
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
  });
});

async function mintRealtimeToken(_req, res) {
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
      instructions: buildRealtimeInstructions(personaInstructionBlock()),
      tools: [
        {
          type: "function",
          name: "render_artifact",
          description: "Local fallback renderer for simple single-step artifacts. For agentic media workflows, t2v/i2v/keyframes/stitching, current web research, files, or OpenClaw tools, prefer ask_openclaw.",
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
          description: "Ask the connected OpenClaw agent to plan and execute with its full tools. Use for web search/research, files, GitHub, Slack, Linear, browser/server context, and flexible artifact/media workflows including image generation/editing, t2v, i2v, keyframes, stitching, and multi-step tasks.",
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
          name: "web_search",
          description: "Ask OpenClaw to search or research the web and return a sourced, current answer.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "The web search or research question." },
              context: { type: "string", description: "Optional context from the voice conversation." },
              responseStyle: { type: "string", description: "How the result should be spoken back." },
            },
            required: ["query"],
            additionalProperties: false,
          },
        },
        {
          type: "function",
          name: "inspect_view",
          description: "Capture the user's visible camera frame or shared screen and attach it directly to this Realtime conversation as an image input.",
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


app.post("/api/artifacts/render", async (req, res) => {
  const { kind = "image", prompt = "", imageDataUrl = null, mediaDataUrl = null, mediaType = null, mediaName = null, referenceSource = null } = req.body || {};
  try {
    const artifact = await renderArtifact({ kind, prompt, imageDataUrl, mediaDataUrl, mediaType, mediaName, referenceSource });
    res.json(artifact);
  } catch (error) {
    res.status(500).json({ kind, status: "error", error: error.message });
  }
});

app.get("/api/artifacts/status", async (req, res) => {
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
  const { memory = "" } = req.body || {};
  res.json({
    ok: true,
    status: "accepted",
    memory,
    note: "Memory capture acknowledged by the voice surface. Persistent OpenClaw memory writes should route through ask_openclaw.",
  });
});

app.post("/api/tools/web-search", async (req, res) => {
  const { query = "", context = "", responseStyle = "" } = req.body || {};
  try {
    const result = await askOpenClaw({
      question: `Search/research the web and answer with current, sourced information:\n${query}`,
      context,
      responseStyle: responseStyle || "Concise answer with source names or links when useful.",
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/openclaw/action", (req, res) => {
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
