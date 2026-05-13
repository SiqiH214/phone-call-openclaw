import { renderArtifact } from "../../server/artifacts.js";
import { requireAuth } from "../../server/auth.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb",
    },
  },
};

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const {
    kind = "image",
    prompt = "",
    imageDataUrl = null,
    mediaDataUrl = null,
    mediaType = null,
    mediaName = null,
    referenceSource = null,
    videoModelPlan = null,
  } = req.body || {};

  try {
    const artifact = await renderArtifact({ kind, prompt, imageDataUrl, mediaDataUrl, mediaType, mediaName, referenceSource, videoModelPlan });
    res.status(200).json(artifact);
  } catch (error) {
    res.status(500).json({ kind, status: "error", error: error.message });
  }
}
