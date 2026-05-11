import { openclawPublicUrl, publicChannelConfig, realtimeModel, serviceName } from "./_shared.js";

export default function handler(_req, res) {
  res.status(200).json({
    ok: true,
    service: serviceName,
    config: publicChannelConfig(),
    openclawHost: openclawPublicUrl || "not connected on Vercel yet",
    openclawGateway: openclawPublicUrl || null,
    realtimeModel,
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
  });
}
