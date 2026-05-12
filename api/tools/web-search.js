import { askOpenClaw } from "../../server/openclawBrain.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const { query = "", context = "", responseStyle = "" } = req.body || {};
  try {
    const result = await askOpenClaw({
      question: `Search/research the web and answer with current, sourced information:\n${query}`,
      context,
      responseStyle: responseStyle || "Concise answer with source names or links when useful.",
    });
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}
