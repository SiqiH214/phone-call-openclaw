import React, { useEffect, useRef, useState } from "react";
import { Camera, Eye, ImagePlus, MonitorDown, Phone, PhoneOff } from "lucide-react";
import { startRealtimeCall } from "./realtime.js";

const HISTORY_KEY = "phone-call-openclaw-session-history:v1";

export function App() {
  const [callState, setCallState] = useState("idle");
  const [server, setServer] = useState(null);
  const [persona, setPersona] = useState(null);
  const [events, setEvents] = useState([]);
  const [transcript, setTranscript] = useState([]);
  const [speechText, setSpeechText] = useState("Hello?");
  const [artifact, setArtifact] = useState(null);
  const [artifactCollapsed, setArtifactCollapsed] = useState(false);
  const [sessionHistory, setSessionHistory] = useState(() => loadHistory());
  const [screenStream, setScreenStream] = useState(null);
  const [cameraStream, setCameraStream] = useState(null);
  const [uploadedMedia, setUploadedMedia] = useState(null);
  const screenVideoRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const uploadInputRef = useRef(null);
  const sessionRef = useRef(null);

  const live = ["minting", "requesting microphone", "connecting", "live"].includes(callState);
  const memoryReady = persona?.connected?.identity && persona?.connected?.soul && persona?.connected?.memory;
  const agentName = server?.config?.agentName || "OpenClaw";

  useEffect(() => {
    Promise.all([
      fetch("/api/health").then((response) => response.json()),
      fetch("/api/openclaw/status").then((response) => response.json()).catch(() => ({ ok: false })),
      fetch("/api/persona").then((response) => response.json()).catch(() => ({ ok: false })),
    ])
      .then(([health, openclaw, personaState]) => {
        setServer({ ...health, openclaw });
        setPersona(personaState);
      })
      .catch(() => setServer({ ok: false }));
  }, []);

  useEffect(() => {
    if (!["video", "music", "audio"].includes(artifact?.kind) || !artifact.requestId || !["rendering", "IN_QUEUE", "IN_PROGRESS"].includes(artifact.status)) {
      return undefined;
    }

    const timer = window.setInterval(async () => {
      try {
        const params = new URLSearchParams({
          id: artifact.requestId,
          kind: artifact.kind,
        });
        if (artifact.model) params.set("endpoint", artifact.model);
        if (artifact.statusUrl) params.set("statusUrl", artifact.statusUrl);
        if (artifact.responseUrl) params.set("responseUrl", artifact.responseUrl);
        const response = await fetch(`/api/artifacts/status?${params}`);
        const payload = await response.json();
        setArtifact((current) => current?.requestId === artifact.requestId ? { ...current, ...payload } : current);
      } catch (error) {
        setArtifact((current) => current?.requestId === artifact.requestId ? { ...current, status: "error", error: error.message } : current);
      }
    }, 3500);

    return () => window.clearInterval(timer);
  }, [artifact?.kind, artifact?.status, artifact?.requestId, artifact?.model, artifact?.statusUrl, artifact?.responseUrl]);

  useEffect(() => {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(sessionHistory.slice(0, 18)));
  }, [sessionHistory]);

  async function toggleCall() {
    if (sessionRef.current) {
      sessionRef.current.stop();
      sessionRef.current = null;
      return;
    }

    try {
      sessionRef.current = await startRealtimeCall({
        onStatus: setCallState,
        onEvent: (event) => {
          setEvents((items) => [event, ...items].slice(0, 3));
          handleRealtimeEvent(event);
        },
      });
    } catch (error) {
      setCallState("error");
      setEvents((items) => [{ type: "voice.error", message: error.message }, ...items].slice(0, 3));
    }
  }

  async function handleRealtimeEvent(event) {
    updateSpeechBubble(event);
    updateTranscript(event);
    if (event.type !== "response.function_call_arguments.done") return;

    let args = {};
    try {
      args = JSON.parse(event.arguments || "{}");
    } catch {
      args = {};
    }

    if (event.name === "ask_openclaw") {
      await handleOpenClawConsult(event, args);
      return;
    }

    if (event.name === "inspect_view") {
      await handleInspectView(event, args);
      return;
    }

    if (event.name !== "render_artifact") return;

    const kind = args.kind || "image";
    const prompt = args.prompt || "Make an artifact from this conversation.";
    setArtifact({ kind, status: "loading", prompt, createdAt: Date.now() });
    setArtifactCollapsed(false);

    try {
      const response = await fetch("/api/artifacts/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          prompt,
          mediaDataUrl: uploadedMedia?.dataUrl || null,
          mediaType: uploadedMedia?.type || null,
          mediaName: uploadedMedia?.name || null,
          imageDataUrl: uploadedMedia?.type?.startsWith("image/") ? uploadedMedia.dataUrl : null,
        }),
      });
      const payload = await response.json();
      const readyArtifact = { ...payload, kind, prompt, status: payload.status || "ready", createdAt: Date.now() };
      setArtifact(readyArtifact);
      saveHistoryItem(readyArtifact);
      sendToolResult(event.call_id, payload, artifactToolInstruction(payload));
    } catch (error) {
      const payload = { kind, status: "error", error: error.message, prompt, createdAt: Date.now() };
      setArtifact(payload);
      saveHistoryItem(payload);
      sendToolResult(event.call_id, payload, artifactToolInstruction(payload));
    }
  }

  function updateSpeechBubble(event) {
    if (event.type === "response.created") {
      setSpeechText("...");
      return;
    }

    const delta = event.delta || event.text || event.transcript || "";
    if (
      delta &&
      [
        "response.audio_transcript.delta",
        "response.output_text.delta",
        "response.text.delta",
      ].includes(event.type)
    ) {
      setSpeechText((current) => compactSpeech(`${current === "..." || current === "Hello?" ? "" : current}${delta}`));
      return;
    }

    if (
      [
        "response.audio_transcript.done",
        "response.output_text.done",
        "response.text.done",
      ].includes(event.type)
    ) {
      const finalText = event.transcript || event.text;
      if (finalText) setSpeechText(compactSpeech(finalText));
      return;
    }

    if (event.type === "response.done") {
      const text = extractRealtimeResponseText(event.response);
      if (text) setSpeechText(compactSpeech(text));
    }
  }

  function updateTranscript(event) {
    if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
      appendTranscript("you", event.transcript);
      return;
    }

    if (
      ["response.audio_transcript.done", "response.output_text.done", "response.text.done"].includes(event.type) &&
      (event.transcript || event.text)
    ) {
      appendTranscript("agent", event.transcript || event.text);
    }
  }

  function appendTranscript(role, text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    setTranscript((items) => {
      const previous = items[0];
      if (previous?.role === role && previous?.text === clean) return items;
      return [{ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, role, text: clean }, ...items].slice(0, 8);
    });
  }

  function saveHistoryItem(item) {
    setSessionHistory((items) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        kind: item.kind || "doc",
        status: item.status || "ready",
        prompt: item.prompt || "",
        content: item.content || "",
        imageUrl: item.imageUrl || "",
        videoUrl: item.videoUrl || "",
        audioUrl: item.audioUrl || "",
        fileUrl: item.fileUrl || "",
        mimeType: item.mimeType || "",
        requestId: item.requestId || item.videoId || item.audioId || "",
        model: item.model || "",
        statusUrl: item.statusUrl || "",
        responseUrl: item.responseUrl || "",
        error: item.error || "",
        createdAt: item.createdAt || Date.now(),
      },
      ...items,
    ].slice(0, 18));
  }

  async function handleOpenClawConsult(event, args) {
    setEvents((items) => [{ type: "openclaw.thinking", message: args.question || "checking" }, ...items].slice(0, 3));
    const screenshot = await captureVisualFrame();

    try {
      const response = await fetch("/api/openclaw/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: args.question || "Help with this request.",
          context: args.context || "",
          responseStyle: args.responseStyle || "short natural spoken answer",
          screenshot,
        }),
      });
      const payload = await response.json();
      sendToolResult(
        event.call_id,
        payload.ok ? payload : { error: payload.error || "OpenClaw failed." },
        "Speak OpenClaw's result back naturally and briefly. If it completed an action, say what changed."
      );
    } catch (error) {
      sendToolResult(event.call_id, { error: error.message }, "Tell the user OpenClaw failed, briefly and naturally.");
    }
  }

  async function handleInspectView(event, args) {
    setEvents((items) => [{ type: "vision.inspecting", message: args.question || "looking" }, ...items].slice(0, 3));
    const screenshot = await captureVisualFrame();

    if (!screenshot) {
      sendToolResult(
        event.call_id,
        { error: "No camera or shared-screen frame is available. Ask the user to turn on camera or share view first." },
        "Tell the user you need camera or share view turned on before you can see them. Keep it brief and natural."
      );
      return;
    }

    try {
      const response = await fetch("/api/openclaw/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: args.question || "Look at the current camera frame and describe what you see.",
          context: "The user explicitly asked the voice agent to see them or inspect the current visual frame. Use the attached camera/screen image as the main context.",
          responseStyle: args.responseStyle || "short, warm, natural spoken answer",
          screenshot,
        }),
      });
      const payload = await response.json();
      sendToolResult(
        event.call_id,
        payload.ok ? payload : { error: payload.error || "Vision inspection failed." },
        "Speak the visual observation back naturally, like a real person on a call. Be concise and do not mention implementation details."
      );
    } catch (error) {
      sendToolResult(event.call_id, { error: error.message }, "Tell the user you couldn't inspect the view, briefly and naturally.");
    }
  }

  function sendToolResult(callId, payload, instructions = "Answer briefly and naturally.") {
    const channel = sessionRef.current?.channel;
    if (!channel || channel.readyState !== "open" || !callId) return;

    channel.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(payload),
      },
    }));
    channel.send(JSON.stringify({
      type: "response.create",
      response: {
        instructions,
      },
    }));
  }

  async function toggleScreenShare(event) {
    event.stopPropagation();
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      setScreenStream(null);
      screenVideoRef.current = null;
      return;
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const video = await prepareCaptureVideo(stream);
    screenVideoRef.current = video;
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      setScreenStream(null);
      screenVideoRef.current = null;
    });
    setScreenStream(stream);
  }

  async function toggleCamera(event) {
    event.stopPropagation();
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
      cameraVideoRef.current = null;
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const video = await prepareCaptureVideo(stream);
    cameraVideoRef.current = video;
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      setCameraStream(null);
      cameraVideoRef.current = null;
    });
    setCameraStream(stream);
  }

  function attachCameraPreview(element) {
    if (!element || !cameraStream) return;
    if (element.srcObject !== cameraStream) {
      element.srcObject = cameraStream;
    }
    element.play().catch(() => {});
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setUploadedMedia({ name: file.name, type: file.type || "application/octet-stream", dataUrl });
    setEvents((items) => [{ type: "media.uploaded", message: file.name }, ...items].slice(0, 3));
    event.target.value = "";
  }

  async function captureVisualFrame() {
    return await captureFrame(cameraVideoRef.current) || await captureFrame(screenVideoRef.current);
  }

  async function captureScreenFrame() {
    return captureFrame(screenVideoRef.current);
  }

  async function captureFrame(video) {
    if (!video) return null;
    await waitForVideoFrame(video);
    if (!video.videoWidth || !video.videoHeight) return null;
    const canvas = document.createElement("canvas");
    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  }

  const hasArtifact = Boolean(artifact);

  return (
    <main className={`voice-room ${live ? "is-live" : ""} ${hasArtifact ? "has-artifact" : ""}`}>
      <div className="grain" aria-hidden="true" />
      <div className="ambient-field" aria-hidden="true" />

      <div className="tiny-status" aria-label="Connection status">
        <span>{server?.openclaw?.ok ? "openclaw" : "connecting"}</span>
        <span>{memoryReady ? "memory" : "memory pending"}</span>
        <button onClick={toggleScreenShare}><Eye size={12} strokeWidth={2.2} />{screenStream ? "seeing" : "share view"}</button>
        <input
          ref={uploadInputRef}
          className="hidden-upload"
          type="file"
          accept="image/*,video/*,audio/*,application/pdf,.pdf,.md,.markdown,.txt,.html,.htm,.doc,.docx"
          onChange={handleUpload}
        />
      </div>

      <section className="agent-stage" aria-label={`${agentName} voice call`}>
        <picture>
          {live ? (
            <video className="agent-scene" src="/girl-agent-kling.mp4" poster="/girl-agent-main.png" autoPlay muted loop playsInline aria-hidden="true" />
          ) : (
            <img className="agent-scene" src="/girl-agent-main.png" alt="" aria-hidden="true" />
          )}
        </picture>
        {live ? <span className="speech">{speechText}</span> : null}
        <div className="call-controls">
          <button className="media-pill" onClick={toggleCamera} aria-label={cameraStream ? "Turn camera off" : "Turn camera on"}>
            <Camera size={18} strokeWidth={2.2} />
            <span>{cameraStream ? "camera on" : "camera"}</span>
          </button>
          <button className="call-button" onClick={toggleCall} aria-label={live ? "End voice call" : "Start voice call"}>
            {live ? <PhoneOff size={20} strokeWidth={2.4} /> : <Phone size={20} strokeWidth={2.6} />}
            <span>{live ? "END" : "CALL"}</span>
          </button>
          <button className="media-pill" onClick={(event) => { event.stopPropagation(); uploadInputRef.current?.click(); }} aria-label="Upload reference media">
            <ImagePlus size={18} strokeWidth={2.2} />
            <span>{mediaUploadLabel(uploadedMedia)}</span>
          </button>
        </div>
        {live ? (
          <div className="voice-activity scene-activity" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        ) : null}
        {cameraStream ? (
          <div className="camera-window" aria-label="Your camera preview">
            <div className="camera-titlebar">
              <span />
              <b>you</b>
              <button onClick={toggleCamera} aria-label="Turn camera off">off</button>
            </div>
            <video ref={attachCameraPreview} muted playsInline autoPlay />
          </div>
        ) : null}
        {live && transcript.length ? (
          <div className="call-transcript" aria-label="Live call transcript">
            {transcript.slice(0, 4).map((item) => (
              <p key={item.id} className={item.role}>
                <span>{item.role === "agent" ? agentName : item.role}</span>
                {item.text}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      {artifact ? (
        <aside className={`artifact-sheet ${artifactCollapsed ? "is-collapsed" : ""}`}>
          <div className="artifact-titlebar">
            <div className="window-lights" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <div className="artifact-title">
              <MonitorDown size={13} strokeWidth={2} />
              <span>{artifactTitle(artifact)}</span>
            </div>
            <div className="artifact-actions">
              <button onClick={() => setArtifactCollapsed((value) => !value)} aria-label={artifactCollapsed ? "Open artifact" : "Collapse artifact"}>
                {artifactCollapsed ? "open" : "minimize"}
              </button>
              <button onClick={() => setArtifact(null)} aria-label="Close artifact">close</button>
            </div>
          </div>
          <div className="artifact-menubar">
            <span>{artifact.kind || "doc"}</span>
            <span>{artifact.status || "ready"}</span>
            <span>{sessionHistory.length} saved</span>
          </div>
          <div className={`artifact-body ${artifact.kind || "doc"}`}>
            <ArtifactRenderer artifact={artifact} />
          </div>
          {sessionHistory.length ? (
            <div className="history-dock" aria-label="Saved session history">
              <button className="history-clear" onClick={() => setSessionHistory([])}>
                <span>clear</span>
                <b>remove saved artifacts</b>
              </button>
              {sessionHistory.slice(0, 6).map((item) => (
                <button key={item.id} onClick={() => setArtifact(item)} title={item.prompt || item.kind}>
                  <span>{item.kind}</span>
                  <b>{item.prompt || item.status}</b>
                </button>
              ))}
            </div>
          ) : null}
        </aside>
      ) : null}

      <div className="soft-log" aria-hidden="true">
        {events.length === 0 ? "quiet" : events[0]?.type || callState}
      </div>
    </main>
  );
}

function ArtifactRenderer({ artifact }) {
  const loading = ["loading", "rendering", "IN_QUEUE", "IN_PROGRESS"].includes(artifact.status);

  if (loading) {
    return (
      <div className="loader" aria-label={`Rendering ${artifact.kind || "artifact"}`}>
        <span />
        <span />
        <span />
      </div>
    );
  }

  if (artifact.error) {
    return <pre className="artifact-error">{friendlyArtifactError(artifact.error)}</pre>;
  }

  if (artifact.imageUrl) {
    return <img src={artifact.imageUrl} alt={artifact.prompt || "Generated artifact"} />;
  }

  if (artifact.videoUrl) {
    return <video src={artifact.videoUrl} controls playsInline autoPlay loop />;
  }

  if (artifact.audioUrl) {
    return (
      <div className="audio-artifact">
        <div className="record-disc" aria-hidden="true" />
        <h1>music artifact</h1>
        <p>{artifact.prompt}</p>
        <audio src={artifact.audioUrl} controls autoPlay />
      </div>
    );
  }

  if (artifact.fileUrl || artifact.pdfUrl || artifact.documentUrl) {
    return <FileArtifact artifact={artifact} />;
  }

  if (artifact.kind === "html" || looksLikeHtml(artifact.content)) {
    return (
      <iframe
        className="artifact-frame"
        title="HTML artifact"
        sandbox="allow-scripts allow-same-origin"
        srcDoc={normalizeHtmlArtifact(artifact.content, artifact.prompt)}
      />
    );
  }

  if (artifact.kind === "code") {
    return <pre className="code-artifact">{artifact.content || artifact.prompt}</pre>;
  }

  const markdown = artifact.content || artifact.prompt || "";
  return <div className="markdown-artifact" dangerouslySetInnerHTML={{ __html: markdownToHtml(markdown) }} />;
}

function FileArtifact({ artifact }) {
  const url = artifact.fileUrl || artifact.pdfUrl || artifact.documentUrl;
  const mime = artifact.mimeType || artifact.contentType || "";
  if (/pdf/i.test(mime) || artifact.kind === "pdf" || /\.pdf(?:$|\?)/i.test(url)) {
    return <iframe className="artifact-frame" title="PDF artifact" src={url} />;
  }
  if (/image\//i.test(mime)) {
    return <img src={url} alt={artifact.prompt || "Artifact file"} />;
  }
  if (/video\//i.test(mime)) {
    return <video src={url} controls playsInline />;
  }
  if (/audio\//i.test(mime)) {
    return (
      <div className="audio-artifact">
        <div className="record-disc" aria-hidden="true" />
        <h1>{artifact.kind || "audio"} artifact</h1>
        <p>{artifact.prompt}</p>
        <audio src={url} controls />
      </div>
    );
  }
  return (
    <div className="file-artifact">
      <h1>{artifact.kind || "file"} artifact</h1>
      <p>{artifact.prompt || "Generated file is ready."}</p>
      <a href={url} target="_blank" rel="noreferrer">open file</a>
    </div>
  );
}

function compactSpeech(value = "") {
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return "...";
  return text.length > 120 ? `${text.slice(-117).trimStart()}...` : text;
}

function extractRealtimeResponseText(response) {
  if (!response?.output) return "";
  return response.output
    .flatMap((item) => item.content || [])
    .map((part) => part.transcript || part.text || "")
    .filter(Boolean)
    .join(" ")
    .trim();
}

function artifactTitle(artifact) {
  const kind = artifact?.kind || "artifact";
  if (artifact?.prompt) return `${kind} / ${artifact.prompt.slice(0, 42)}${artifact.prompt.length > 42 ? "..." : ""}`;
  return `${kind} artifact`;
}

function mediaUploadLabel(media) {
  if (!media) return "media";
  if (media.type?.startsWith("video/")) return "video ready";
  if (media.type?.startsWith("image/")) return "image ready";
  if (media.type?.startsWith("audio/")) return "audio ready";
  if (media.type?.includes("pdf")) return "pdf ready";
  if (/\.(docx?|md|markdown|txt|html?)$/i.test(media.name || "")) return "doc ready";
  return "file ready";
}

function artifactToolInstruction(payload) {
  if (payload?.status === "error") {
    return "Briefly tell the user the artifact hit an error. Do not over-explain.";
  }
  if (payload?.status === "queued") {
    return "Briefly tell the user the artifact has been queued and the panel is open.";
  }
  return "Briefly tell the user the artifact is ready in the panel. Keep it natural and short.";
}

function friendlyArtifactError(error) {
  if (!error) return "";
  if (error.includes("verified") || error.includes("Verify Organization")) {
    return "image model access is not ready on this account. i tried the fallback too, but generation is blocked right now.";
  }
  return error;
}

function loadHistory() {
  try {
    return JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

async function prepareCaptureVideo(stream) {
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  await video.play().catch(() => {});
  await waitForVideoFrame(video);
  return video;
}

function waitForVideoFrame(video, timeoutMs = 1800) {
  if (!video || video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("loadedmetadata", finish);
      video.removeEventListener("canplay", finish);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    video.addEventListener("loadedmetadata", finish, { once: true });
    video.addEventListener("canplay", finish, { once: true });
    video.play().catch(() => {});
  });
}

function stripArtifactFence(value = "") {
  const text = String(value || "").trim();
  const fenced = text.match(/^```(?:html|javascript|js|css|markdown|md|[a-z0-9_-]+)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : text).trim();
}

function looksLikeHtml(value = "") {
  const content = stripArtifactFence(value);
  return /<!doctype html/i.test(content) || /<html[\s>]/i.test(content) || /<\/?(body|head|main|section|div|style|script|article)[\s>]/i.test(content);
}

function normalizeHtmlArtifact(content = "", prompt = "") {
  const stripped = stripArtifactFence(content);
  if (!stripped) return htmlPlaceholder(prompt);
  if (/<!doctype html/i.test(stripped) || /<html[\s>]/i.test(stripped)) return stripped;
  if (looksLikeHtml(stripped)) {
    return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>html,body{margin:0;min-height:100%;background:#faf9f5;color:#252320;font-family:Inter,Arial,sans-serif}body{padding:24px}</style></head><body>${stripped}</body></html>`;
  }
  return htmlPlaceholder(stripped || prompt);
}

function htmlPlaceholder(prompt = "") {
  return `<!doctype html><html><head><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:18px Georgia,serif;background:#f7f6f2;color:#292722}main{max-width:720px;padding:48px}h1{font-size:44px;font-weight:500}</style></head><body><main><h1>HTML artifact</h1><p>${escapeHtml(prompt)}</p></main></body></html>`;
}

function markdownToHtml(markdown = "") {
  const lines = markdown.split(/\n/);
  let html = "";
  let inList = false;
  let inCode = false;
  let code = [];

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        html += `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`;
        code = [];
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inlineMarkdown(line.replace(/^\s*[-*]\s+/, ""))}</li>`;
      continue;
    }
    if (inList) {
      html += "</ul>";
      inList = false;
    }
    if (!line.trim()) {
      html += "<br />";
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      html += `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`;
    } else {
      html += `<p>${inlineMarkdown(line)}</p>`;
    }
  }

  if (inList) html += "</ul>";
  if (inCode) html += `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`;
  return html;
}

function inlineMarkdown(value = "") {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
