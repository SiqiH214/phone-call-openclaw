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
          description: "Open an artifact panel and render the requested artifact from the live voice conversation. Supports creating and editing images, HTML/docs/code/PDF/Word-style docs, music, and video; uploaded reference image/video media is attached by the browser automatically.",
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
          description: "Ask the connected OpenClaw agent to use its tools and connected apps such as Gmail, GitHub, Slack messaging, Linear issue/project management, filesystem, and server context.",
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
          name: "inspect_view",
          description: "Capture the user's visible camera frame or shared screen and ask OpenClaw to inspect it with vision context.",
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
