export async function startRealtimeCall({ onEvent, onStatus, ownerProfile }) {
  onStatus("minting");
  const tokenResponse = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerProfile: ownerProfile || null }),
  });
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

  let mediaStream;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    peer.close();
    audio.remove();
    throw new Error(friendlyMicrophoneError(error));
  }
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
    peer.close();
    mediaStream.getTracks().forEach((track) => track.stop());
    audio.remove();
    throw new Error(`Realtime connection failed: ${await sdpResponse.text()}`);
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

function friendlyMicrophoneError(error) {
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone permission was blocked. Allow microphone access for this site, then tap Call again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found. Connect or enable a microphone, then tap Call again.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The microphone is busy in another app. Close the other app or browser tab, then tap Call again.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "This browser does not support microphone capture for calls.";
  }
  return error?.message || "Could not start the microphone.";
}
