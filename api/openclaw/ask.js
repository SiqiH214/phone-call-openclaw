import { askOpenClaw } from "../../server/openclawBrain.js";
import { requireAuth } from "../../server/auth.js";

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    const result = await askOpenClaw(req.body || {});
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}
