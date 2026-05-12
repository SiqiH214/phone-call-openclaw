import { askOpenClaw } from "../../server/openclawBrain.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const { query = "", context = "", responseStyle = "" } = req.body || {};
  try {
    const result = await askOpenClaw({
      question: `Recall durable OpenClaw memory, persona facts, user preferences, prior decisions, or project context relevant to this voice-call question. Do not fabricate; if nothing relevant is known, say so briefly.\n${query}`,
      context,
      responseStyle: responseStyle || "Concise answer grounded only in recalled memory; say if unknown.",
    });
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}
