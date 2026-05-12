import { fal } from "@fal-ai/client";
import fs from "node:fs";
import path from "node:path";
import { agentAvatarImageUrl } from "../shared/channel.js";

const falVideoEndpoint = cleanModelId(process.env.FAL_VIDEO_MODEL || "bytedance/seedance-2.0/fast/text-to-video");
const falImageToVideoEndpoint = cleanModelId(process.env.FAL_IMAGE_TO_VIDEO_MODEL || "fal-ai/kling-video/v3/standard/image-to-video");
const falVideoEditEndpoint = cleanModelId(process.env.FAL_VIDEO_EDIT_MODEL || "fal-ai/wan/v2.7/edit-video");
const falImageEndpoint = cleanModelId(process.env.FAL_IMAGE_MODEL || "fal-ai/nano-banana-2");
const falImageEditEndpoint = cleanModelId(process.env.FAL_IMAGE_EDIT_MODEL || "fal-ai/nano-banana/edit");
const falMusicEndpoint = cleanModelId(process.env.FAL_MUSIC_MODEL || "fal-ai/minimax-music/v2.6");
const publicDir = path.resolve(process.cwd(), "public");
const allowedFalVideoEndpoints = new Set([
  "bytedance/seedance-2.0/fast/text-to-video",
  "bytedance/seedance-2.0/text-to-video",
  "fal-ai/kling-video/v1/standard/text-to-video",
  "fal-ai/kling-video/v3/standard/image-to-video",
  "fal-ai/kling-video/v3/pro/image-to-video",
  "fal-ai/kling-video/v3/4k/image-to-video",
  "fal-ai/wan/v2.7/edit-video",
]);

export async function renderArtifact({ kind, prompt, imageDataUrl, mediaDataUrl, mediaType, mediaName, referenceSource }) {
  const referenceVideo = mediaType?.startsWith("video/") ? mediaDataUrl : null;
  const artifactPrompt = normalizePromptForKind(kind, prompt);
  const useAgentAvatar = kind === "image" && referenceSource !== "upload" && shouldUseAgentAvatarReference(artifactPrompt);
  const referenceImage = useAgentAvatar ? null : imageDataUrl || (mediaType?.startsWith("image/") ? mediaDataUrl : null);

  if (kind === "image") {
    return renderImage(artifactPrompt, referenceImage, { useAgentAvatar });
  }

  if (kind === "video") {
    return createVideo(artifactPrompt, { referenceImage, referenceVideo, mediaName });
  }

  if (kind === "music" || kind === "audio") {
    return createMusic(artifactPrompt);
  }

  if (["doc", "markdown", "pdf", "word", "docx"].includes(kind)) {
    return renderTextArtifact({ kind, prompt: artifactPrompt, format: "markdown" });
  }

  if (kind === "html") {
    return renderTextArtifact({ kind, prompt: artifactPrompt, format: "html" });
  }

  if (kind === "code") {
    return renderTextArtifact({ kind, prompt: artifactPrompt, format: "code" });
  }

  return {
    kind,
    status: "queued",
    content: `${kind} artifact queued: ${prompt}`,
  };
}

export async function getVideoArtifact(videoId) {
  return getAsyncArtifact({ requestId: videoId, kind: "video" });
}

export async function getAsyncArtifact({ requestId, kind = "video", endpoint, statusUrl, responseUrl }) {
  if (!requestId) throw new Error("Missing artifact id.");
  const resolvedEndpoint = resolveAsyncEndpoint(kind, endpoint);
  const status = await getFalStatus(resolvedEndpoint, requestId, statusUrl);
  if (status.status !== "COMPLETED") {
    return falAsyncPayload({ kind, endpoint: resolvedEndpoint, requestId, status, statusUrl, responseUrl });
  }
  const result = await getFalResult(resolvedEndpoint, requestId, responseUrl);
  return falAsyncPayload({ kind, endpoint: resolvedEndpoint, requestId, status, result, statusUrl, responseUrl });
}

async function renderImage(prompt, imageDataUrl, { useAgentAvatar = false } = {}) {
  const endpoint = imageDataUrl || useAgentAvatar ? falImageEditEndpoint : falImageEndpoint;
  const referenceImageUrl = imageDataUrl
    ? await uploadDataUrlForFal(imageDataUrl, "reference.png")
    : useAgentAvatar
      ? await resolveAgentAvatarReference()
      : null;
  const imagePrompt = normalizeImagePrompt(prompt);
  const finalPrompt = useAgentAvatar ? agentAvatarImagePrompt(imagePrompt) : imagePrompt;
  const body = referenceImageUrl
    ? {
        prompt: finalPrompt,
        image_urls: [referenceImageUrl],
        num_images: 1,
        aspect_ratio: imageAspectRatio(),
        output_format: "png",
      }
    : {
        prompt: finalPrompt,
        num_images: 1,
        aspect_ratio: imageAspectRatio(),
        resolution: process.env.FAL_IMAGE_RESOLUTION || "1K",
        limit_generations: true,
        output_format: "png",
      };

  let response;
  try {
    response = await falFetch(`https://fal.run/${endpoint}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(friendlyProviderError(error, "Image generation failed. Try a more specific visual prompt, or upload a reference image."));
  }

  const payload = await response.json();
  const imageUrl = payload.images?.[0]?.url || payload.image?.url || payload.url;
  if (!imageUrl) throw new Error("Image generation finished without an image. Try a more specific visual prompt.");

  return {
    kind: "image",
    status: "ready",
    imageUrl,
    prompt: finalPrompt,
    model: endpoint,
    referenceSource: useAgentAvatar ? "openclaw_avatar" : imageDataUrl ? "reference_image" : "text",
  };
}

async function renderTextArtifact({ kind, prompt, format }) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      kind,
      status: "ready",
      content: normalizeTextArtifact(format === "html" ? fallbackHtml(prompt) : fallbackMarkdown(prompt), format, prompt),
      prompt,
    };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_ARTIFACT_MODEL || "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content: [
            "You create clean artifacts for a voice-call UI.",
            "Return only the requested artifact content. Do not include analysis, meta text, prompt restatement, or wrapper labels like ask/draft.",
            format === "markdown" ? "For markdown, produce polished GitHub-flavored Markdown with a useful title, readable headings, concise paragraphs, and bullets when helpful." : "",
            format === "html" ? "For HTML, return a complete standalone HTML document with inline CSS. No markdown fences." : "",
            format === "code" ? "For code, return only the code, with no markdown fences unless the user explicitly asks for markdown." : "",
          ].filter(Boolean).join(" "),
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || "Text artifact generation failed.");

  return {
    kind,
    status: "ready",
    content: normalizeTextArtifact(payload.output_text || extractResponseText(payload) || fallbackMarkdown(prompt), format, prompt),
    prompt,
    model: process.env.OPENAI_ARTIFACT_MODEL || "gpt-5.4-mini",
  };
}

async function createVideo(prompt, { referenceImage, referenceVideo, mediaName } = {}) {
  const endpoint = videoEndpointForInput({ referenceImage, referenceVideo });
  const referenceImageUrl = referenceImage ? await uploadDataUrlForFal(referenceImage, mediaName || "reference.png") : null;
  const referenceVideoUrl = referenceVideo ? await uploadDataUrlForFal(referenceVideo, mediaName || "reference.mp4") : null;
  const input = falVideoInput(prompt, endpoint, { referenceImage: referenceImageUrl, referenceVideo: referenceVideoUrl, mediaName });
  const submitted = await submitFalRequest(endpoint, input);

  return falAsyncPayload({
    kind: "video",
    endpoint,
    requestId: submitted.request_id,
    status: {
      status: "IN_QUEUE",
      queue_position: submitted.queue_position,
      response_url: submitted.response_url,
      status_url: submitted.status_url,
    },
    prompt,
    responseUrl: submitted.response_url,
    statusUrl: submitted.status_url,
  });
}

async function createMusic(prompt) {
  const endpoint = falMusicEndpoint;
  const submitted = await submitFalRequest(endpoint, {
    prompt,
    lyrics: "",
    lyrics_optimizer: true,
    is_instrumental: /\b(instrumental|no vocal|no vocals|ambient|score|background)\b/i.test(prompt),
    audio_setting: {
      sample_rate: 44100,
      bitrate: 256000,
      format: "mp3",
    },
  });

  return falAsyncPayload({
    kind: "music",
    endpoint,
    requestId: submitted.request_id,
    status: {
      status: "IN_QUEUE",
      queue_position: submitted.queue_position,
      response_url: submitted.response_url,
      status_url: submitted.status_url,
    },
    prompt,
    responseUrl: submitted.response_url,
    statusUrl: submitted.status_url,
  });
}

async function submitFalRequest(endpoint, input) {
  const response = await falFetch(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.json();
}

async function getFalStatus(endpoint, requestId, statusUrl) {
  const response = await falFetch(statusUrl || `https://queue.fal.run/${endpoint}/requests/${encodeURIComponent(requestId)}/status?logs=1`);
  return response.json();
}

async function getFalResult(endpoint, requestId, responseUrl) {
  const response = await falFetch(responseUrl || `https://queue.fal.run/${endpoint}/requests/${encodeURIComponent(requestId)}/response`);
  return response.json();
}

async function falFetch(url, options = {}) {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not set.");

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail?.[0]?.msg || payload?.detail || payload?.error || "Fal video request failed.");
  }
  return response;
}

async function uploadDataUrlForFal(dataUrl, fileName = "reference.bin") {
  if (!dataUrl) return null;
  if (/^https?:\/\//i.test(dataUrl)) return dataUrl;
  const { mime, buffer } = dataUrlToBuffer(dataUrl);
  return uploadBufferForFal(buffer, fileName, mime);
}

async function uploadLocalFileForFal(filePath, fileName = "reference.bin", mime = "application/octet-stream") {
  const buffer = fs.readFileSync(filePath);
  return uploadBufferForFal(buffer, fileName, mime);
}

async function uploadBufferForFal(buffer, fileName, mime) {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not set.");
  fal.config({ credentials: key });
  const blob = new Blob([buffer], { type: mime });
  return fal.storage.upload(blob, { fileName });
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl).match(/^data:([^;,]+)?(?:;[^,]*)?,(.*)$/);
  if (!match) throw new Error("Uploaded media must be a data URL.");
  const mime = match[1] || "application/octet-stream";
  const payload = match[2] || "";
  const buffer = Buffer.from(payload, "base64");
  return { mime, buffer };
}

function falVideoInput(prompt, endpoint, { referenceImage, referenceVideo } = {}) {
  const duration = process.env.FAL_VIDEO_DURATION || "5";
  const aspectRatio = process.env.FAL_VIDEO_ASPECT_RATIO || "16:9";

  if (referenceVideo) {
    return {
      prompt,
      video_url: referenceVideo,
      resolution: process.env.FAL_VIDEO_EDIT_RESOLUTION || "1080p",
      duration: process.env.FAL_VIDEO_EDIT_DURATION || "0",
      audio_setting: process.env.FAL_VIDEO_EDIT_AUDIO || "origin",
      enable_safety_checker: true,
    };
  }

  if (referenceImage) {
    if (endpoint.includes("kling-video")) {
      return {
        prompt,
        start_image_url: referenceImage,
        duration: process.env.FAL_IMAGE_TO_VIDEO_DURATION || "5",
        aspect_ratio: aspectRatio,
        generate_audio: false,
        negative_prompt: "large motion, big camera move, distorted face, extra fingers, low quality, flicker, watermark, logo",
      };
    }

    return {
      prompt,
      image_url: referenceImage,
      resolution: process.env.FAL_IMAGE_TO_VIDEO_RESOLUTION || "720p",
      aspect_ratio: process.env.FAL_IMAGE_TO_VIDEO_ASPECT_RATIO || "auto",
      negative_prompt: "large motion, big camera move, distorted face, extra fingers, low quality, flicker, watermark, logo",
    };
  }

  if (endpoint.includes("kling-video")) {
    return {
      prompt,
      duration: duration === "4" ? "5" : duration,
      aspect_ratio: aspectRatio,
      negative_prompt: "blur, distort, low quality, flicker, watermark, logo",
    };
  }

  return {
    prompt,
    duration,
    aspect_ratio: aspectRatio,
    resolution: process.env.FAL_VIDEO_RESOLUTION || "720p",
    generate_audio: true,
  };
}

function falAsyncPayload({ kind, endpoint, requestId, status, result, prompt, statusUrl, responseUrl }) {
  const resultVideo = result?.video || result?.data?.video;
  const resultAudio = result?.audio || result?.data?.audio || result?.music || result?.data?.music;
  const falStatus = status?.status || "IN_QUEUE";
  const mediaUrl = kind === "music" || kind === "audio" ? mediaUrlFrom(resultAudio) : mediaUrlFrom(resultVideo);
  const ready = falStatus === "COMPLETED" && mediaUrl;
  const failed = falStatus === "FAILED" || falStatus === "ERROR";

  return {
    kind,
    status: ready ? "ready" : failed ? "error" : "rendering",
    videoId: kind === "video" ? requestId : undefined,
    audioId: kind === "music" || kind === "audio" ? requestId : undefined,
    requestId,
    videoUrl: kind === "video" && ready ? mediaUrl : null,
    audioUrl: (kind === "music" || kind === "audio") && ready ? mediaUrl : null,
    prompt: result?.prompt || prompt,
    model: endpoint,
    statusUrl: status?.status_url || statusUrl,
    responseUrl: status?.response_url || responseUrl,
    progress: falStatus === "IN_PROGRESS" ? 55 : falStatus === "COMPLETED" ? 100 : 8,
    queuePosition: status?.queue_position,
    logs: status?.logs || [],
    error: failed ? status?.error || result?.error || "Fal generation failed." : undefined,
  };
}

function mediaUrlFrom(media) {
  if (!media) return "";
  if (typeof media === "string") return media;
  if (media.url) return media.url;
  if (media.file?.url) return media.file.url;
  if (Array.isArray(media)) return mediaUrlFrom(media[0]);
  return "";
}

function normalizeFalEndpoint(endpoint) {
  if (!allowedFalVideoEndpoints.has(endpoint)) return "bytedance/seedance-2.0/fast/text-to-video";
  return endpoint;
}

function videoEndpointForInput({ referenceImage, referenceVideo } = {}) {
  if (referenceVideo) return cleanModelId(process.env.FAL_VIDEO_EDIT_MODEL || falVideoEditEndpoint);
  if (referenceImage) return cleanModelId(process.env.FAL_IMAGE_TO_VIDEO_MODEL || falImageToVideoEndpoint);
  return normalizeFalEndpoint(cleanModelId(process.env.FAL_VIDEO_MODEL || falVideoEndpoint));
}

function cleanModelId(value) {
  return String(value || "").replace(/\\[rnt]/g, "").replace(/[\r\n\t]/g, "").trim();
}

function resolveAsyncEndpoint(kind, endpoint) {
  if (endpoint) return cleanModelId(endpoint);
  if (kind === "music" || kind === "audio") return falMusicEndpoint;
  return normalizeFalEndpoint(cleanModelId(process.env.FAL_VIDEO_MODEL || falVideoEndpoint));
}

function normalizePromptForKind(kind, prompt = "") {
  const cleanPrompt = String(prompt || "").replace(/\s+/g, " ").trim();
  if (!cleanPrompt || /^make an artifact from this conversation\.?$/i.test(cleanPrompt)) {
    if (kind === "image") {
      return "Create a polished editorial visual artifact for this live agent call: abstract cinematic interface poster, dark Nova-style palette, subtle lavender accent, refined grain texture, clean composition, no readable text.";
    }
    if (kind === "html") {
      return "Create a minimal standalone HTML artifact for this live agent call with elegant typography, subtle dark interface styling, and one clear content section.";
    }
    if (kind === "video") {
      return "Create a short cinematic ambient loop for a live agent call interface, subtle motion only, dark refined palette, no text.";
    }
    return "Create a concise, polished artifact from this live agent conversation.";
  }
  return cleanPrompt;
}

function normalizeImagePrompt(prompt = "") {
  const cleanPrompt = normalizePromptForKind("image", prompt);
  if (cleanPrompt.length < 18 || /\b(artifact|image|picture|something|this conversation)\b/i.test(cleanPrompt) && cleanPrompt.length < 72) {
    return [
      cleanPrompt,
      "Make it visually specific: refined editorial poster, cinematic lighting, tactile grain, balanced negative space, sophisticated dark/lavender color language, no logos, no watermarks, no UI text.",
    ].join(" ");
  }
  return cleanPrompt;
}

function shouldUseAgentAvatarReference(prompt = "") {
  const text = String(prompt || "").toLowerCase();
  return /你的自拍|你的照片|你自己|你.*自拍|给你自己|openclaw avatar|openclaw.*(photo|portrait|selfie|image|avatar)|47_h|47\b|agent selfie|agent.*(photo|portrait|selfie|image|avatar)|your (photo|portrait|selfie|image|avatar)|photo of you|portrait of you|image of you|picture of you/.test(text);
}

function agentAvatarImagePrompt(prompt = "") {
  return [
    prompt,
    "Use the attached OpenClaw avatar as the identity reference. Generate a new selfie/portrait of the same character/person, preserving the face identity and black minimalist styling. Keep the 3D stylized avatar / Pixar-like aesthetic from the reference. Do not generate an unrelated person. No text, no watermark.",
  ].join("\n\n");
}

async function resolveAgentAvatarReference() {
  const source = process.env.OPENCLAW_IDENTITY_AVATAR_URL || agentAvatarImageUrl;
  if (/^https?:\/\//i.test(source)) return source;
  if (source.startsWith("data:image/")) return uploadDataUrlForFal(source, "agent-avatar.png");
  if (source.startsWith("/")) {
    const localPath = path.join(publicDir, source.replace(/^\/+/, ""));
    if (fs.existsSync(localPath)) return uploadLocalFileForFal(localPath, path.basename(localPath), mimeForPath(localPath));
  }
  throw new Error("Agent avatar reference is not configured. Set PUBLIC_AGENT_AVATAR_IMAGE_URL or OPENCLAW_IDENTITY_AVATAR_URL.");
}

function mimeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function imageAspectRatio() {
  const ratio = cleanModelId(process.env.FAL_IMAGE_ASPECT_RATIO || "16:9");
  const allowed = new Set(["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"]);
  return allowed.has(ratio) ? ratio : "16:9";
}

function friendlyProviderError(error, fallback) {
  const message = String(error?.message || error || "");
  if (/expected output|unsafe content|incompatible|missing attachments|cannot be processed/i.test(message)) {
    return fallback;
  }
  if (/verified|Verify Organization/i.test(message)) {
    return "Image model access is not ready on this account yet.";
  }
  return message || fallback;
}

function normalizeTextArtifact(content = "", format, prompt = "") {
  const stripped = stripArtifactFence(content);
  if (format === "html") {
    if (!stripped) return fallbackHtml(prompt);
    if (/<!doctype html/i.test(stripped) || /<html[\s>]/i.test(stripped)) return stripped;
    if (/<\/?[a-z][\s\S]*>/i.test(stripped)) {
      return [
        "<!doctype html>",
        "<html><head><meta charset=\"utf-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
        "<style>html,body{margin:0;min-height:100%;background:#faf9f5;color:#252320;font-family:Inter,Arial,sans-serif}body{padding:24px}</style>",
        "</head><body>",
        stripped,
        "</body></html>",
      ].join("");
    }
    return fallbackHtml(stripped || prompt);
  }
  return stripped || content;
}

function stripArtifactFence(value = "") {
  const text = String(value || "").trim();
  const fenced = text.match(/^```(?:html|javascript|js|css|markdown|md|[a-z0-9_-]+)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : text).trim();
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractResponseText(payload) {
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((part) => part.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function fallbackMarkdown(prompt = "") {
  return [
    "# Artifact",
    "",
    prompt || "No prompt provided.",
  ].join("\n");
}

function fallbackHtml(prompt = "") {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    "<meta charset=\"utf-8\" />",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    "<style>",
    "body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f6f2;color:#292722;font-family:Georgia,'Times New Roman',serif}",
    "main{max-width:760px;padding:56px}",
    "h1{font-size:clamp(40px,7vw,86px);font-weight:500;line-height:.95;margin:0 0 22px}",
    "p{font-size:20px;line-height:1.5;margin:0;color:rgba(41,39,34,.72)}",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>Artifact</h1>",
    `<p>${escapeHtml(prompt)}</p>`,
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}
