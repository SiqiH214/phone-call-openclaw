#!/usr/bin/env bash
# Start a cloudflared quick tunnel to your local OpenClaw gateway.
# Auto-downloads cloudflared on first run. Prints the public HTTPS URL.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$ROOT/bin"
CLOUDFLARED="$BIN_DIR/cloudflared"
LOG="${TUNNEL_LOG:-/tmp/phone-call-openclaw-tunnel.log}"

GATEWAY_URL="${1:-${OPENCLAW_GATEWAY_URL:-http://127.0.0.1:18789}}"

mkdir -p "$BIN_DIR"

if [ ! -x "$CLOUDFLARED" ]; then
  arch=$(uname -m)
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  case "$os-$arch" in
    linux-x86_64)  url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" ;;
    linux-aarch64) url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64" ;;
    darwin-x86_64) url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz" ;;
    darwin-arm64)  url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz" ;;
    *) echo "Unsupported platform $os-$arch. Install cloudflared manually and place it at $CLOUDFLARED." >&2; exit 1 ;;
  esac
  echo "Downloading cloudflared for $os-$arch..." >&2
  if [[ "$url" == *.tgz ]]; then
    curl -sL "$url" | tar -xz -C "$BIN_DIR"
  else
    curl -sL -o "$CLOUDFLARED" "$url"
  fi
  chmod +x "$CLOUDFLARED"
fi

echo "Starting quick tunnel to $GATEWAY_URL ..." >&2
nohup "$CLOUDFLARED" tunnel --url "$GATEWAY_URL" --no-autoupdate > "$LOG" 2>&1 &
TUNNEL_PID=$!
echo "$TUNNEL_PID" > "$BIN_DIR/.tunnel.pid"

for _ in $(seq 1 60); do
  if grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 > /tmp/.tunnel-url; then
    URL=$(cat /tmp/.tunnel-url)
    if [ -n "$URL" ]; then
      echo
      echo "Tunnel up."
      echo "  Public URL : $URL"
      echo "  PID        : $TUNNEL_PID"
      echo "  Log        : $LOG"
      echo
      echo "Set this on your Vercel project (or .env.production):"
      echo "  OPENCLAW_PUBLIC_URL=$URL"
      echo
      echo "Stop with: kill $TUNNEL_PID"
      exit 0
    fi
  fi
  sleep 1
done

echo "Timed out waiting for tunnel URL. Tail $LOG for details." >&2
exit 1
