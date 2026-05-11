function clean(value) {
  return String(value || "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
}

export const serviceName = "phone-call-openclaw";
export const appName = clean(process.env.PUBLIC_APP_NAME || process.env.APP_NAME) || "Phone Call OpenClaw";
export const agentName = clean(process.env.OPENCLAW_AGENT_NAME) || "OpenClaw";
export const ownerName = clean(process.env.OPENCLAW_OWNER_NAME) || "the user";
export const agentAvatarImageUrl = clean(process.env.PUBLIC_AGENT_AVATAR_IMAGE_URL) || "/girl-agent-main.png";
export const agentAvatarVideoUrl = clean(process.env.PUBLIC_AGENT_AVATAR_VIDEO_URL) || "/girl-agent-kling.mp4";
export const agentAvatarInitials = clean(process.env.PUBLIC_AGENT_AVATAR_INITIALS) || initialsFor(agentName);
export const realtimeModel = clean(process.env.OPENAI_REALTIME_MODEL) || "gpt-realtime-2";
export const realtimeVoice = clean(process.env.OPENAI_REALTIME_VOICE) || "marin";
export const openclawPublicUrl = clean(process.env.OPENCLAW_PUBLIC_URL);
export const bridgeSecret = process.env.OPENCLAW_BRIDGE_SECRET || "";

const fullOperatorScopes = [
  "operator.admin",
  "operator.read",
  "operator.write",
  "operator.approvals",
  "operator.pairing",
];

const readOnlyScopes = [
  "operator.read",
];

export const callPermissionPreset = clean(process.env.OPENCLAW_CALL_SCOPES || "all").toLowerCase();
export const callScopes = parseCallScopes(process.env.OPENCLAW_CALL_SCOPES);

export function publicChannelConfig() {
  return {
    appName,
    agentName,
    ownerName,
    agentAvatarImageUrl,
    agentAvatarVideoUrl,
    agentAvatarInitials,
    callPermissions: callPermissionPreset || "all",
  };
}

export function safetyIdentifier() {
  const source = `${serviceName}:${openclawPublicUrl || appName || "local"}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(31, hash) + source.charCodeAt(index) | 0;
  }
  return `${serviceName}-${Math.abs(hash)}`;
}

export function buildRealtimeInstructions(personaBlock = "") {
  const defaultVoicePrompt = [
    `You are ${agentName}, a warm, concise voice agent inside a cinematic website for calling an OpenClaw instance.`,
    `You are speaking with ${ownerName}.`,
    "Sound natural, emotionally present, useful, and direct. Avoid pretending you used external tools yourself.",
  ].join(" ");

  return [
    clean(process.env.OPENCLAW_AGENT_VOICE_PROMPT) || defaultVoicePrompt,
    "When the user asks you to make, draw, create, write, edit, animate, render, or generate an image/doc/markdown/code/html/pdf/word/video/music artifact, call the render_artifact tool immediately. Do not merely say you can do it. If the user uploaded an image/video or has camera/screen share on, the website can attach that visual context as reference media for image/video artifacts.",
    "When the user asks you to inspect Gmail, GitHub, Slack, Linear, files, repos, deployment status, server state, send or draft Slack messages, create/update Linear issues, or anything requiring OpenClaw tools, call ask_openclaw immediately. OpenClaw is allowed to act according to the permissions configured by this deployment. Do not invent external-tool results.",
    "When the user asks you to look, see them, check the camera, describe what you see, react to their face/room/object, or use visual context, call inspect_view immediately. The website will attach the current camera or screen frame directly to this Realtime conversation as an image input.",
    personaBlock,
  ].filter(Boolean).join("\n\n");
}

function parseCallScopes(value) {
  const raw = clean(value || "all");
  if (!raw || raw.toLowerCase() === "all") return fullOperatorScopes;
  if (raw.toLowerCase() === "read-only" || raw.toLowerCase() === "readonly") return readOnlyScopes;
  if (raw.toLowerCase() === "none") return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return normalizeScopes(parsed);
  } catch {
    // Fall through to comma-separated parsing.
  }

  return normalizeScopes(raw.split(","));
}

function normalizeScopes(scopes) {
  return scopes
    .map((scope) => clean(scope))
    .filter(Boolean)
    .filter((scope, index, all) => all.indexOf(scope) === index);
}

function initialsFor(value) {
  const words = clean(value).split(" ").filter(Boolean);
  if (words.length === 0) return "AI";
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}
