import { askOpenClaw } from "../../server/openclawBrain.js";
import { bridgeSecret } from "../_shared.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const actual = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!bridgeSecret || actual !== bridgeSecret) {
    res.status(401).json({ ok: false, error: "Unauthorized." });
    return;
  }

  try {
    const result = await askOpenClaw(req.body || {});
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}
