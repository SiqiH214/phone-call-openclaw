import { getAsyncArtifact } from "../../server/artifacts.js";
import { requireAuth } from "../../server/auth.js";

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  const requestId = req.query?.id || req.body?.id;
  const kind = req.query?.kind || req.body?.kind || "video";
  const endpoint = req.query?.endpoint || req.body?.endpoint;
  const statusUrl = req.query?.statusUrl || req.body?.statusUrl;
  const responseUrl = req.query?.responseUrl || req.body?.responseUrl;
  try {
    const artifact = await getAsyncArtifact({ requestId, kind, endpoint, statusUrl, responseUrl });
    res.status(200).json(artifact);
  } catch (error) {
    res.status(500).json({ kind, status: "error", error: error.message });
  }
}
