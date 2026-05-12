import { buildRealtimeInstructions, realtimeModel, realtimeVoice, safetyIdentifier } from "../_shared.js";
import { personaInstructionBlock } from "../_persona.js";

export default async function handler(_req, res) {
  if (!process.env.OPENAI_API_KEY) {
    res.status(400).json({ error: "OPENAI_API_KEY is not set in Vercel." });
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
          description: "Ask the connected OpenClaw agent to plan and execute with its full tools, including installed skills, MCP servers, connectors, apps, filesystem, and local tools. Use for web search/research, files, GitHub, Slack, Linear, browser/server context, and flexible artifact/media workflows including image generation/editing, t2v, i2v, keyframes, stitching, and multi-step tasks.",
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
