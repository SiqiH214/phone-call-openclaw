#!/usr/bin/env bash
# Generate a 16:9 avatar still + 5s idle loop for the call surface.
#
# Usage:
#   ./scripts/setup-avatar.sh --prompt "a calm bookish 28-year-old looking into camera"
#   ./scripts/setup-avatar.sh --image my-photo.jpg
#
# Output:
#   public/avatar.png       (1280x720 still)
#   public/avatar-loop.mp4  (~5s idle loop)
#
# Requires FAL_KEY in .env.local (or env).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

[ -f .env.local ] && set -a && . ./.env.local && set +a

if [ -z "${FAL_KEY:-}" ]; then
  echo "FAL_KEY is not set. Run ./scripts/setup.sh first or add FAL_KEY to your environment." >&2
  exit 1
fi

PROMPT=""
IMAGE=""
IMAGE_MODEL="${FAL_IMAGE_MODEL:-fal-ai/nano-banana-2}"
VIDEO_MODEL="${AVATAR_VIDEO_MODEL:-fal-ai/kling-video/v2.1/standard/image-to-video}"
LOOP_PROMPT="${AVATAR_LOOP_PROMPT:-Subtle idle motion. Slow blink, slight micro head movement. Calm gaze stays locked on the camera. No camera movement at all, locked-off shot, no zoom, no pan. Loopable idle.}"

while [ $# -gt 0 ]; do
  case "$1" in
    --prompt) PROMPT="$2"; shift 2 ;;
    --image) IMAGE="$2"; shift 2 ;;
    --loop-prompt) LOOP_PROMPT="$2"; shift 2 ;;
    --image-model) IMAGE_MODEL="$2"; shift 2 ;;
    --video-model) VIDEO_MODEL="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "$PROMPT" ] && [ -z "$IMAGE" ]; then
  echo "Provide --prompt \"...\" or --image path/to/photo.jpg" >&2
  exit 1
fi

mkdir -p public

node --version >/dev/null 2>&1 || { echo "node is required." >&2; exit 1; }

export FAL_KEY PROMPT IMAGE IMAGE_MODEL VIDEO_MODEL LOOP_PROMPT

node --input-type=module <<'NODE'
import fs from "node:fs/promises";
import { fal } from "@fal-ai/client";

const falKey = process.env.FAL_KEY;
fal.config({ credentials: falKey });

const prompt = process.env.PROMPT;
const imagePath = process.env.IMAGE;
const imageModel = process.env.IMAGE_MODEL;
const videoModel = process.env.VIDEO_MODEL;
const loopPrompt = process.env.LOOP_PROMPT;

async function upload(path) {
  const buffer = await fs.readFile(path);
  const ext = path.split(".").pop().toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const blob = new Blob([buffer], { type: mime });
  return await fal.storage.upload(blob);
}

async function downloadTo(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
  return dest;
}

let stillUrl;
if (prompt && !imagePath) {
  process.stderr.write(`Generating 16:9 still with ${imageModel}...\n`);
  const result = await fal.subscribe(imageModel, {
    input: { prompt, image_size: { width: 1280, height: 720 } },
    logs: false,
  });
  stillUrl = result.data?.images?.[0]?.url || result.data?.image?.url;
  if (!stillUrl) throw new Error("No image url in fal response.");
} else {
  process.stderr.write(`Uploading ${imagePath}...\n`);
  stillUrl = await upload(imagePath);
}

await downloadTo(stillUrl, "public/avatar.png");
process.stderr.write("Wrote public/avatar.png\n");

process.stderr.write(`Generating idle loop with ${videoModel}...\n`);
const video = await fal.subscribe(videoModel, {
  input: {
    image_url: stillUrl,
    prompt: loopPrompt,
    duration: "5",
    aspect_ratio: "16:9",
  },
  logs: false,
});
const videoUrl = video.data?.video?.url || video.data?.url;
if (!videoUrl) throw new Error("No video url in fal response.");
await downloadTo(videoUrl, "public/avatar-loop.mp4");
process.stderr.write("Wrote public/avatar-loop.mp4\n");
NODE

echo
echo "Done. Restart the dev server to pick up the new avatar."
