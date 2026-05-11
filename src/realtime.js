export async function startRealtimeCall({ onEvent, onStatus }) {
  onStatus("minting");
  const tokenResponse = await fetch("/api/session", { method: "POST" });
  const tokenPayload = await tokenResponse.json();

  if (!tokenResponse.ok) {
    throw new Error(tokenPayload.error || "Could not create realtime token.");
  }

  const ephemeralKey = tokenPayload.value || tokenPayload.client_secret?.value;
  if (!ephemeralKey) {
    throw new Error("Realtime token response did not include a client secret value.");
  }

  onStatus("requesting microphone");
  const peer = new RTCPeerConnection();
  const audio = document.createElement("audio");
  audio.autoplay = true;
  audio.playsInline = true;
  audio.style.display = "none";
  document.body.appendChild(audio);
  peer.ontrack = (event) => {
    audio.srcObject = event.streams[0];
    audio.play().catch(() => {});
  };

  peer.onconnectionstatechange = () => {
    onEvent({ type: "webrtc.connection", state: peer.connectionState });
    if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
      onStatus(peer.connectionState);
    }
  };

  peer.oniceconnectionstatechange = () => {
    onEvent({ type: "webrtc.ice", state: peer.iceConnectionState });
  };

  const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaStream.getTracks().forEach((track) => peer.addTrack(track, mediaStream));

  const channel = peer.createDataChannel("oai-events");
  channel.onmessage = (event) => {
    try {
      onEvent(JSON.parse(event.data));
    } catch {
      onEvent({ type: "raw", data: event.data });
    }
  };

  onStatus("connecting");
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${ephemeralKey}`,
      "Content-Type": "application/sdp",
    },
  });

  if (!sdpResponse.ok) {
    throw new Error(await sdpResponse.text());
  }

  await peer.setRemoteDescription({
    type: "answer",
    sdp: await sdpResponse.text(),
  });

  onStatus("live");

  return {
    channel,
    stop() {
      channel.close();
      peer.close();
      mediaStream.getTracks().forEach((track) => track.stop());
      audio.remove();
      onStatus("idle");
    },
  };
}
