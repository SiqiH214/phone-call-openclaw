import { askOpenClaw } from "../../server/openclawBrain.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const { memory = "", context = "", responseStyle = "" } = req.body || {};
  try {
    const result = await askOpenClaw({
      question: `Update shared OpenClaw memory from the phone-call channel. Save, update, correct, or forget memory according to the user's request. Use the same durable memory system and policies used by other OpenClaw channels such as Slack.\n${memory}`,
      context,
      responseStyle: responseStyle || "Briefly acknowledge the memory update. If it should not be stored, explain why briefly.",
    });
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}
