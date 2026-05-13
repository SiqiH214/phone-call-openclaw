import { buildRealtimeInstructions, realtimeModel, realtimeTurnDetection, realtimeVoice, safetyIdentifier } from "../_shared.js";
import { personaInstructionBlock } from "../_persona.js";

export default async function handler(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    res.status(400).json({ error: "OPENAI_API_KEY is not set in Vercel." });
    return;
  }

  const sessionConfig = {
    session: {
      type: "realtime",
      model: realtimeModel,
      instructions: buildRealtimeInstructions([
        personaInstructionBlock(),
        ownerRealtimeContext(req.body?.ownerProfile),
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
  res.status(response.status).json(payload);
}

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
    "- Do not say you cannot verify ownership, do not mention claim systems, and do not ask for an identity database.",
    "- Workspace persona files like IDENTITY.md, SOUL.md, STYLE.md, USER.md, and MEMORY.md are owner-editable OpenClaw workspace context when the owner explicitly asks to update memory/profile. They are not an external claims database.",
    "- For sensitive actions, still use OpenClaw tool policy and configured permissions.",
  ].join("\n");
}

function clean(value) {
  return String(value || "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
}
