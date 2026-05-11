import { openclawPublicUrl } from "../_shared.js";

export default async function handler(_req, res) {
  if (!openclawPublicUrl) {
    res.status(200).json({ ok: false, note: "Set OPENCLAW_PUBLIC_URL in Vercel to connect your OpenClaw gateway." });
    return;
  }

  try {
    const response = await fetch(`${openclawPublicUrl.replace(/\/$/, "")}/health`);
    const body = await response.json().catch(() => ({}));
    res.status(response.ok ? 200 : 502).json({ ok: response.ok, gateway: body });
  } catch {
    res.status(502).json({ ok: false, error: "OpenClaw public URL is not reachable." });
  }
}
