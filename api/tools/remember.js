import { requireAuth } from "../../server/auth.js";

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const { memory = "" } = req.body || {};
  res.status(200).json({
    ok: true,
    status: "accepted",
    memory,
    note: "Memory capture acknowledged by the voice surface. Persistent OpenClaw memory writes should route through ask_openclaw.",
  });
}
