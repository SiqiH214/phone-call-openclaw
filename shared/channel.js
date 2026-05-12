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
export const openclawChannelName = clean(process.env.OPENCLAW_CHANNEL_NAME) || "phone-call";
export const openclawSessionKey = clean(process.env.OPENCLAW_SESSION_KEY) || "main";

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
    "You are a voice interface to OpenClaw. For agentic work, delegate to OpenClaw instead of trying to solve it inside the voice model.",
    "This phone call is an OpenClaw channel like Slack or another chat surface. Durable memory is shared with OpenClaw: call remember_memory when the user asks you to remember, update, or forget something, call recall_memory when the user asks about remembered facts/preferences/past decisions or durable project context, and call ask_openclaw when the request needs tools, skills, MCP, files, apps, web, artifacts, or action. Answer directly only when the conversation already gives enough context and no memory write/recall/tool is needed.",
    "When the user asks for complex artifacts or media workflows such as image generation/editing with multiple references, t2v, i2v, keyframes, stitching, multi-shot videos, documents, code, files, browser actions, or anything that may require multiple steps, call ask_openclaw immediately. Include the user's exact goal and any visible/uploaded/camera context. OpenClaw owns planning and tool execution, including any skills, MCP servers, connectors, apps, and local tools installed in that OpenClaw.",
    "Use render_artifact for simple one-step artifacts. For a simple selfie/photo/portrait/image/avatar of you, 47, or the OpenClaw avatar, call render_artifact with kind image; the server will use the configured OpenClaw identity/avatar reference directly. Use ask_openclaw only when that self-image request needs extra planning, files, tools, or a multi-step workflow.",
    "When the user asks to search the web, look something up, find current information, compare sources, or research, call web_search or ask_openclaw immediately. Do not invent web results.",
    "When the user asks you to use a skill, MCP server, connected app, Gmail, GitHub, Slack, Linear, files, repos, deployment status, server state, send or draft Slack messages, create/update Linear issues, or anything requiring OpenClaw tools, call ask_openclaw immediately. OpenClaw is allowed to act according to the permissions configured by this deployment. Do not invent external-tool results.",
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
