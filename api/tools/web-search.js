export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  res.status(200).json({
    ok: false,
    status: "not_configured",
    note: "Use ask_openclaw for web/tool research until a dedicated web-search tool is enabled.",
  });
}
