export default function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const { action, prompt } = req.body || {};
  const accepted = ["code", "doc", "markdown", "html", "image", "video", "music", "diagram", "status"];
  if (!accepted.includes(action)) {
    res.status(400).json({ error: "Unknown action." });
    return;
  }

  res.status(200).json({
    ok: true,
    action,
    status: "queued for OpenClaw support",
    note: "Vercel artifact route is ready. Add OPENCLAW_PUBLIC_URL to forward this into your OpenClaw gateway.",
    prompt: prompt || "",
  });
}
