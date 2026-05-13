import fs from "node:fs";
import WebSocket from "ws";
import { callScopes, serviceName } from "../shared/channel.js";

const defaultGateway = process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789";

function gatewayOrigin() {
  if (process.env.OPENCLAW_GATEWAY_ORIGIN) return cleanHeaderValue(process.env.OPENCLAW_GATEWAY_ORIGIN);
  if (process.env.PUBLIC_APP_ORIGIN) return cleanHeaderValue(process.env.PUBLIC_APP_ORIGIN);
  if (process.env.VERCEL_URL) return cleanHeaderValue(`https://${process.env.VERCEL_URL}`);
  return "https://phone-call-openclaw.example";
}

function cleanHeaderValue(value) {
  return String(value || "").replace(/[\r\n\t]/g, "").trim();
}

function readGatewayToken() {
  if (process.env.OPENCLAW_GATEWAY_TOKEN) return process.env.OPENCLAW_GATEWAY_TOKEN;
  try {
    return JSON.parse(fs.readFileSync("/root/.openclaw/openclaw.json", "utf8"))?.gateway?.auth?.token || "";
  } catch {
    return "";
  }
}

function gatewayWsUrl() {
  const source = process.env.OPENCLAW_PUBLIC_URL || defaultGateway;
  const url = new URL(source);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/";
  url.search = "";
  return url.toString();
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function askOpenClaw({ question, context, ownerContext, responseStyle, screenshot, sessionKey = "main", artifactRequest = null }) {
  const visualContext = screenshot ? await describeScreenshot(screenshot) : "";
  const message = [
    question,
    ownerContext ? `Channel owner context:\n${ownerContext}` : "",
    context ? `Context:\n${context}` : "",
    artifactRequest ? artifactRequestInstruction(artifactRequest) : "",
    visualContext ? `Current screen:\n${visualContext}` : "",
    responseStyle ? `Spoken style:\n${responseStyle}` : "Spoken style:\nshort, natural, useful",
  ].filter(Boolean).join("\n\n");

  return withGateway(async (client) => {
    const idempotencyKey = uid();
    const sent = await client.request("chat.send", {
      sessionKey: cleanSessionKey(sessionKey),
      message,
      idempotencyKey,
    });
    const runId = sent?.runId || idempotencyKey;
    const result = await waitForFinal(client, runId, 120000);
    return { result, artifact: extractArtifactFromOpenClawResult(result, artifactRequest?.kind) };
  });
}

function artifactRequestInstruction(artifactRequest) {
  const kind = artifactRequest?.kind || "artifact";
  const prompt = artifactRequest?.prompt || "";
  const task = artifactRequest?.taskKey ? `Task: ${artifactRequest.taskKey}. Treat this as a new artifact task.` : "Treat this as a new artifact task.";
  const reference = artifactRequest?.referenceSource ? `Reference source: ${artifactRequest.referenceSource}.` : "";
  return [
    "Artifact request:",
    task,
    `Kind: ${kind}`,
    `Prompt: ${prompt}`,
    reference,
    "If you create or locate a finished image, video, audio, PDF, document, or HTML artifact, return the direct URL in your final answer.",
    "Prefer a concise final answer with any artifact URL plainly visible.",
  ].filter(Boolean).join("\n");
}

function cleanSessionKey(value) {
  return cleanHeaderValue(value || "main").replace(/[^a-zA-Z0-9:._-]/g, "-").slice(0, 80) || "main";
}

async function describeScreenshot(screenshot) {
  if (!screenshot.startsWith("data:image/")) return "";
  if (!process.env.OPENAI_API_KEY) {
    return "A camera or screen frame was captured by the phone-call website, but server-side OPENAI_API_KEY is not configured, so the frame could not be inspected.";
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || "gpt-5.4-mini",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Describe this camera or screen frame in a concise way for an agent that needs to help the user. Include visible app/site, important text, UI state, errors, objects, person pose/expression, and what the user likely wants done. Do not mention private content unless it is necessary.",
              },
              {
                type: "input_image",
                image_url: screenshot,
              },
            ],
          },
        ],
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      return `A camera or screen frame was captured by the phone-call website, but the server vision request failed: ${payload?.error?.message || response.statusText}.`;
    }
    return payload.output_text || extractResponseText(payload) || "A camera or screen frame was captured, but the server vision response did not include a description.";
  } catch (error) {
    return `A camera or screen frame was captured by the phone-call website, but the server could not inspect it: ${error.message}.`;
  }
}

function extractResponseText(payload) {
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((part) => part.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function waitForFinal(client, runId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("OpenClaw tool call timed out."));
    }, timeoutMs);

    const unsubscribe = client.onEvent((event) => {
      if (event.event !== "chat") return;
      const payload = event.payload;
      if (!payload || payload.runId !== runId) return;
      if (payload.state === "final") {
        clearTimeout(timer);
        unsubscribe();
        resolve(extractText(payload.message) || "OpenClaw finished.");
      }
      if (payload.state === "error") {
        clearTimeout(timer);
        unsubscribe();
        reject(new Error(payload.errorMessage || "OpenClaw tool call failed."));
      }
    });
  });
}

function extractText(message) {
  if (!message || typeof message !== "object") return "";
  if (typeof message.text === "string") return message.text.trim();
  if (!Array.isArray(message.content)) return "";
  return message.content
    .map((part) => part?.type === "text" && typeof part.text === "string" ? part.text : "")
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function extractArtifactFromOpenClawResult(result, preferredKind) {
  const text = typeof result === "string" ? result : JSON.stringify(result || "");
  const jsonArtifact = extractJsonArtifact(text);
  if (jsonArtifact) return normalizeArtifact(jsonArtifact, preferredKind);

  const urls = extractUrls(text);
  const mediaUrl = urls.find((url) => artifactKindFromUrl(url)) || urls[0];
  if (!mediaUrl) return null;
  const kind = artifactKindFromUrl(mediaUrl) || preferredKind || "doc";
  return normalizeArtifact({ kind, url: mediaUrl, prompt: text.slice(0, 240) }, preferredKind);
}

function extractJsonArtifact(text) {
  const candidates = [
    text,
    ...(text.match(/```(?:json)?\s*([\s\S]*?)```/gi) || []).map((block) => block.replace(/```(?:json)?/i, "").replace(/```$/, "").trim()),
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && (parsed.imageUrl || parsed.videoUrl || parsed.audioUrl || parsed.fileUrl || parsed.url)) return parsed;
    } catch {
      // Continue trying other candidates.
    }
  }
  return null;
}

function extractUrls(text) {
  return Array.from(new Set(
    String(text || "")
      .match(/https?:\/\/[^\s<>)"'`]+/gi) || []
  )).map((url) => url.replace(/[.,;:!?]+$/, ""));
}

function artifactKindFromUrl(url) {
  const cleanUrl = String(url || "").split("?")[0].toLowerCase();
  if (/\.(png|jpe?g|webp|gif|avif|heic)$/.test(cleanUrl)) return "image";
  if (/\.(mp4|webm|mov|m4v)$/.test(cleanUrl)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(cleanUrl)) return "music";
  if (/\.(pdf)$/.test(cleanUrl)) return "pdf";
  if (/\.(docx?|md|markdown|txt|html?)$/.test(cleanUrl)) return "doc";
  return null;
}

function normalizeArtifact(candidate, preferredKind) {
  const url = candidate.url || candidate.imageUrl || candidate.videoUrl || candidate.audioUrl || candidate.fileUrl || candidate.pdfUrl || candidate.documentUrl;
  const inferredKind = candidate.kind || artifactKindFromUrl(url) || preferredKind || "doc";
  return {
    kind: inferredKind,
    status: "ready",
    prompt: candidate.prompt || candidate.description || "",
    imageUrl: candidate.imageUrl || (inferredKind === "image" ? url : ""),
    videoUrl: candidate.videoUrl || (inferredKind === "video" ? url : ""),
    audioUrl: candidate.audioUrl || (inferredKind === "music" || inferredKind === "audio" ? url : ""),
    fileUrl: candidate.fileUrl || candidate.pdfUrl || candidate.documentUrl || (!["image", "video", "music", "audio"].includes(inferredKind) ? url : ""),
    mimeType: candidate.mimeType || candidate.contentType || "",
    model: candidate.model || "openclaw",
    referenceSource: candidate.referenceSource || "openclaw_session",
  };
}

async function withGateway(fn) {
  const token = readGatewayToken();
  if (!token) throw new Error("OPENCLAW_GATEWAY_TOKEN is not set.");

  const client = new GatewayClient(gatewayWsUrl(), token);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    client.close();
  }
}

class GatewayClient {
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Set();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url, {
        headers: {
          Origin: gatewayOrigin(),
        },
      });
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error("OpenClaw gateway connect timed out.")), 15000);
      ws.on("message", (raw) => this.handleMessage(String(raw), resolve, reject, timer));
      ws.on("error", reject);
      ws.on("close", () => {
        for (const pending of this.pending.values()) pending.reject(new Error("OpenClaw gateway closed."));
        this.pending.clear();
      });
    });
  }

  async handleMessage(raw, resolveConnect, rejectConnect, connectTimer) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.type === "event") {
      if (message.event === "connect.challenge") {
        try {
          await this.request("connect", {
            minProtocol: 3,
            maxProtocol: 3,
            client: { id: "openclaw-control-ui", version: serviceName, platform: "web", mode: "webchat" },
            role: "operator",
            scopes: callScopes,
            caps: ["tool-events"],
            auth: { token: this.token },
            userAgent: serviceName,
            locale: "en-US",
          });
          clearTimeout(connectTimer);
          resolveConnect();
        } catch (error) {
          clearTimeout(connectTimer);
          rejectConnect(error);
        }
        return;
      }

      for (const listener of this.listeners) listener(message);
      return;
    }

    if (message.type === "res") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.ok) pending.resolve(message.payload);
      else pending.reject(new Error(message.error?.message || "OpenClaw request failed."));
    }
  }

  request(method, params) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("OpenClaw gateway is not connected."));
    }
    const id = String(++this.id);
    const payload = { type: "req", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close() {
    this.ws?.close();
  }
}
