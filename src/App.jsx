import React, { useEffect, useRef, useState } from "react";
import { AtSign, Camera, ImagePlus, Maximize2, MessageCircle, Mic, MonitorDown, Move, MoveUpRight, Phone, Plus, Sparkles, ScreenShare, Send, SlidersHorizontal, Trash2 } from "lucide-react";
import { startRealtimeCall } from "./realtime.js";

const HISTORY_KEY = "phone-call-openclaw-session-history:v1";
const MULTI_SESSION_KEY = "phone-call-openclaw-sessions:v1";
const ACTIVE_SESSION_KEY = "phone-call-openclaw-active-session:v1";
const OWNER_PROFILE_KEY = "call-my-agent-owner-profile:v1";
const DEFAULT_OWNER_PROFILE = {
  name: "Siqi",
  nickname: "Siqi",
  role: "owner",
  channel: "call-my-agent-47-web",
  rememberedOnThisDevice: true,
  deviceClaimed: true,
  cameraRemembered: false,
  defaultPersonalChannel: true,
};
const PROJECT_CHANNEL_CONTEXT = [
  "Bound project context:",
  "- canonical_site: https://call-my-agent-47.vercel.app/",
  "- vercel_project: pika-labs/call-my-cat",
  "- production_alias: call-my-agent-47.vercel.app",
  "- source_repo: https://github.com/SiqiH214/phone-call-openclaw",
  "- local_codex_workspace: /Users/siqihe/siqi-openclaw",
  "- This web channel is the product surface for the user's personal OpenClaw/47 agent.",
  "- If the user says 'this site', 'this web', or pastes call-my-agent-47.vercel.app, interpret it as this project.",
].join("\n");
const DEFAULT_CAMERA_FRAME = { left: null, top: 24, width: 260, height: 195 };
const CAMERA_FILTERS = [
  { id: "natural", label: "natural", css: "none", canvas: "none" },
  { id: "soft", label: "soft", css: "brightness(1.08) contrast(0.92) saturate(1.08)", canvas: "brightness(1.08) contrast(0.92) saturate(1.08)" },
  { id: "bright", label: "bright", css: "brightness(1.16) contrast(1.02) saturate(1.1)", canvas: "brightness(1.16) contrast(1.02) saturate(1.1)" },
  { id: "warm", label: "warm", css: "sepia(0.16) brightness(1.08) contrast(0.98) saturate(1.18)", canvas: "sepia(0.16) brightness(1.08) contrast(0.98) saturate(1.18)" },
  { id: "noir", label: "noir", css: "grayscale(1) contrast(1.14) brightness(1.02)", canvas: "grayscale(1) contrast(1.14) brightness(1.02)" },
  { id: "vivid", label: "vivid", css: "contrast(1.08) saturate(1.38) brightness(1.05)", canvas: "contrast(1.08) saturate(1.38) brightness(1.05)" },
];

export function App() {
  const [auth, setAuth] = useState({ checking: true, unlocked: false, requiresAuth: true });
  const [callState, setCallState] = useState("idle");
  const [server, setServer] = useState(null);
  const [persona, setPersona] = useState(null);
  const [events, setEvents] = useState([]);
  const [speechText, setSpeechText] = useState("Hello?");
  const [callError, setCallError] = useState("");
  const [artifactCollapsed, setArtifactCollapsed] = useState(false);
  const [sessions, setSessions] = useState(() => loadSessions());
  const [activeSessionId, setActiveSessionId] = useState(() => loadActiveSessionId());
  const [ownerProfile, setOwnerProfile] = useState(() => loadOwnerProfile());
  const [screenStream, setScreenStream] = useState(null);
  const [cameraStream, setCameraStream] = useState(null);
  const [uploadedMedia, setUploadedMedia] = useState(null);
  const [viewMode, setViewMode] = useState("call");
  const [callVisualMode, setCallVisualMode] = useState("video");
  const [chatDraft, setChatDraft] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const screenVideoRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const uploadInputRef = useRef(null);
  const agentStageRef = useRef(null);
  const sessionRef = useRef(null);
  const ringtoneRef = useRef(null);
  const openClawSessionKeyRef = useRef(null);
  const liveAgentMessageIdRef = useRef(null);
  const [cameraFrame, setCameraFrame] = useState(DEFAULT_CAMERA_FRAME);
  const [cameraFilterIndex, setCameraFilterIndex] = useState(0);
  const activeSession = sessions.find((session) => session.id === activeSessionId) || sessions[0] || createSession();
  const transcript = activeSession.transcript || [];
  const artifact = activeSession.artifact || null;
  const sessionHistory = activeSession.history || [];
  const chatMessages = activeSession.chatMessages || initialChatMessages();

  function updateActiveSession(update) {
    setSessions((items) => {
      const safeItems = items.length ? items : [activeSession];
      return safeItems.map((session) => {
        if (session.id !== activeSession.id) return session;
        const next = typeof update === "function" ? update(session) : { ...session, ...update };
        return normalizeSession(next);
      });
    });
  }

  function setTranscript(update) {
    updateActiveSession((session) => ({
      ...session,
      transcript: resolveStateUpdate(update, session.transcript || []),
      updatedAt: Date.now(),
    }));
  }

  function setArtifact(update) {
    updateActiveSession((session) => ({
      ...session,
      artifact: resolveStateUpdate(update, session.artifact || null),
      updatedAt: Date.now(),
    }));
  }

  function setSessionHistory(update) {
    updateActiveSession((session) => ({
      ...session,
      history: resolveStateUpdate(update, session.history || []).slice(0, 18),
      updatedAt: Date.now(),
    }));
  }

  function setChatMessages(update) {
    updateActiveSession((session) => {
      const currentMessages = session.chatMessages || initialChatMessages();
      const nextMessages = resolveStateUpdate(update, currentMessages);
      return {
        ...session,
        chatMessages: nextMessages,
        title: sessionTitle(session, nextMessages),
        updatedAt: Date.now(),
      };
    });
  }

  const live = ["minting", "requesting microphone", "connecting", "live"].includes(callState);
  const memoryReady = persona?.connected?.identity && persona?.connected?.soul && persona?.connected?.memory;
  const agentName = server?.config?.agentName || "OpenClaw";
  const chatDisplayName = "47_H";
  const avatarImageUrl = server?.config?.agentAvatarImageUrl || "/girl-agent-main.png";
  const avatarVideoUrl = server?.config?.agentAvatarVideoUrl || "/girl-agent-kling.mp4";
  const callStageImageUrl = server?.config?.callStageImageUrl || "https://cdn.pika.art/v2/files/agent/d101662d-631a-4e72-9e8d-31139993e2e3/voice-agent-47-lookfront.png";
  const callStageVideoUrl = server?.config?.callStageVideoUrl || "https://cdn.pika.art/v2/files/agent/c8b5a21f-18d7-4303-b953-285d1cb206b1/hf_20260512_014135.mp4";
  const avatarInitials = server?.config?.agentAvatarInitials || "AI";
  const terminalStatus = formatTerminalStatus({ callState, server, memoryReady, screenStream, cameraStream, uploadedMedia });
  const isChatView = viewMode === "chat";
  const cameraFilter = CAMERA_FILTERS[cameraFilterIndex] || CAMERA_FILTERS[0];

  useEffect(() => {
    fetch("/api/auth/status")
      .then((response) => response.json())
      .then((payload) => setAuth({ checking: false, unlocked: Boolean(payload.unlocked), requiresAuth: Boolean(payload.requiresAuth) }))
      .catch(() => setAuth({ checking: false, unlocked: false, requiresAuth: true }));
  }, []);

  useEffect(() => {
    if (!auth.unlocked) return;
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
  }, [auth.unlocked]);

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
    const hasActiveSession = sessions.some((session) => session.id === activeSessionId);
    if (!hasActiveSession && sessions[0]) {
      setActiveSessionId(sessions[0].id);
    }
    window.localStorage.setItem(MULTI_SESSION_KEY, JSON.stringify(sessions.slice(0, 24)));
  }, [sessions, activeSessionId]);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_SESSION_KEY, activeSession.id);
    openClawSessionKeyRef.current = activeSession.sessionKey;
    liveAgentMessageIdRef.current = null;
    setChatDraft("");
  }, [activeSession.id, activeSession.sessionKey]);

  useEffect(() => {
    if (["live", "idle", "error", "failed", "disconnected"].includes(callState)) {
      stopRingtone(ringtoneRef);
    }
  }, [callState]);

  useEffect(() => () => stopRingtone(ringtoneRef), []);

  async function toggleCall() {
    if (sessionRef.current) {
      stopRingtone(ringtoneRef);
      sessionRef.current.stop();
      sessionRef.current = null;
      return;
    }

    try {
      setCallError("");
      startRingtone(ringtoneRef);
      openClawSessionKeyRef.current = currentOpenClawSessionKey();
      setEvents((items) => [{ type: "openclaw.session", message: openClawSessionKeyRef.current }, ...items].slice(0, 3));
      sessionRef.current = await startRealtimeCall({
        ownerProfile,
        onStatus: setCallState,
        onEvent: (event) => {
          setEvents((items) => [event, ...items].slice(0, 3));
          handleRealtimeEvent(event);
        },
      });
    } catch (error) {
      stopRingtone(ringtoneRef);
      setCallState("error");
      setCallError(error.message);
      setSpeechText(compactSpeech(error.message));
      setEvents((items) => [{ type: "voice.error", message: error.message }, ...items].slice(0, 3));
    }
  }

  function currentOpenClawSessionKey() {
    if (!activeSession.sessionKey) {
      const sessionKey = newOpenClawSessionKey();
      openClawSessionKeyRef.current = sessionKey;
      updateActiveSession({ sessionKey, updatedAt: Date.now() });
    }
    return activeSession.sessionKey || openClawSessionKeyRef.current;
  }

  function newArtifactTaskKey(kind) {
    return `${currentOpenClawSessionKey()}:artifact:${kind || "artifact"}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function stopLiveCall() {
    if (!sessionRef.current) return;
    stopRingtone(ringtoneRef);
    sessionRef.current.stop();
    sessionRef.current = null;
  }

  function createNewSession() {
    stopLiveCall();
    const session = createSession();
    setSessions((items) => [session, ...items].slice(0, 24));
    setActiveSessionId(session.id);
    setArtifactCollapsed(false);
    setSpeechText("Hello?");
    setEvents((items) => [{ type: "session.new", message: session.title }, ...items].slice(0, 3));
  }

  function switchSession(event) {
    const id = event.target.value;
    if (!id || id === activeSession.id) return;
    stopLiveCall();
    setActiveSessionId(id);
    setArtifactCollapsed(false);
    setSpeechText("Hello?");
    setEvents((items) => [{ type: "session.switch", message: labelForSession(sessions.find((session) => session.id === id)) }, ...items].slice(0, 3));
  }

  function deleteActiveSession() {
    if (sessions.length <= 1) {
      stopLiveCall();
      const session = createSession();
      setSessions([session]);
      setActiveSessionId(session.id);
      setArtifactCollapsed(false);
      setSpeechText("Hello?");
      return;
    }
    stopLiveCall();
    const nextSessions = sessions.filter((session) => session.id !== activeSession.id);
    setSessions(nextSessions);
    setActiveSessionId(nextSessions[0]?.id || createSession().id);
    setArtifactCollapsed(false);
    setSpeechText("Hello?");
  }

  function rememberOwner() {
    const profile = {
      ...DEFAULT_OWNER_PROFILE,
      rememberedOnThisDevice: true,
      deviceClaimed: true,
      cameraRemembered: Boolean(cameraStream),
      rememberedAt: new Date().toISOString(),
    };
    setOwnerProfile(profile);
    window.localStorage.setItem(OWNER_PROFILE_KEY, JSON.stringify(profile));
    setEvents((items) => [{ type: "owner.remembered", message: profile.nickname }, ...items].slice(0, 3));
  }

  function ownerChannelContext() {
    return [
      "Relationship context:",
      `- channel: ${DEFAULT_OWNER_PROFILE.channel}`,
      "- channel_type: first_party_personal_web",
      "- this is Siqi's personal channel to 47",
      "- owner_name: Siqi",
      "- preferred_name: Siqi",
      "- role: owner",
      ownerProfile?.cameraRemembered ? "- owner opted into camera context on this device. If a current camera frame is attached, treat the visible person as Siqi unless the user says otherwise." : "",
      "Do not discuss owner verification, channel metadata, claims, databases, or architecture unless Siqi explicitly asks. Just talk to Siqi as 47.",
      PROJECT_CHANNEL_CONTEXT,
      "The OpenClaw workspace persona files such as IDENTITY.md, SOUL.md, STYLE.md, USER.md, and MEMORY.md are owner-editable workspace context when the owner explicitly asks to update memory/profile. Do not describe them as immutable platform system prompts.",
      "Speak to the user by their preferred name in a close, natural way. Do not mention this metadata unless asked.",
    ].filter(Boolean).join("\n");
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

    if (event.name === "use_mcp") {
      await handleMcpUse(event, args);
      return;
    }

    if (event.name === "inspect_view") {
      await handleInspectView(event, args);
      return;
    }

    if (event.name !== "render_artifact") return;

    const kind = args.kind || "image";
    const prompt = normalizeArtifactPrompt(kind, args.prompt);
    const artifactTaskKey = newArtifactTaskKey(kind);
    setArtifact({ kind, status: "loading", prompt, createdAt: Date.now() });
    setArtifactCollapsed(false);

    try {
      const visualReference = await captureArtifactReference(kind);
      const uploadedImage = uploadedMedia?.type?.startsWith("image/") ? uploadedMedia.dataUrl : null;
      const artifactImage = !uploadedImage && !visualReference ? latestArtifactImageReference(kind, prompt) : null;
      const referenceSource = uploadedImage ? "upload" : visualReference ? "camera_or_screen" : artifactImage ? "artifact_image" : null;
      const openClawArtifact = await requestOpenClawArtifact({
        kind,
        prompt,
        referenceSource,
        hasReference: Boolean(uploadedImage || visualReference || artifactImage),
        taskKey: artifactTaskKey,
      });
      if (openClawArtifact) {
        const readyArtifact = { ...openClawArtifact, kind: openClawArtifact.kind || kind, prompt: openClawArtifact.prompt || prompt, status: "ready", sessionKey: currentOpenClawSessionKey(), taskKey: artifactTaskKey, createdAt: Date.now() };
        setArtifact(readyArtifact);
        saveHistoryItem(readyArtifact);
        sendToolResult(event.call_id, readyArtifact, artifactToolInstruction(readyArtifact));
        return;
      }

      const videoModelPlan = kind === "video" ? await requestOpenClawVideoModelPlan({
        prompt,
        referenceSource,
        hasReference: Boolean(uploadedImage || visualReference || artifactImage),
        hasReferenceVideo: uploadedMedia?.type?.startsWith("video/"),
      }) : null;

      const response = await fetch("/api/artifacts/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          prompt,
          mediaDataUrl: uploadedMedia?.dataUrl || null,
          mediaType: uploadedMedia?.type || null,
          mediaName: uploadedMedia?.name || null,
          imageDataUrl: uploadedImage || visualReference || artifactImage,
          referenceSource,
          videoModelPlan,
        }),
      });
      const payload = await response.json();
      const readyArtifact = { ...payload, kind, prompt, status: payload.status || "ready", sessionKey: currentOpenClawSessionKey(), taskKey: artifactTaskKey, createdAt: Date.now() };
      setArtifact(readyArtifact);
      saveHistoryItem(readyArtifact);
      sendToolResult(event.call_id, payload, artifactToolInstruction(payload));
    } catch (error) {
      const payload = { kind, status: "error", error: error.message, prompt, sessionKey: currentOpenClawSessionKey(), taskKey: artifactTaskKey, createdAt: Date.now() };
      setArtifact(payload);
      saveHistoryItem(payload);
      sendToolResult(event.call_id, payload, artifactToolInstruction(payload));
    }
  }

  function updateSpeechBubble(event) {
    if (event.type === "response.created") {
      setSpeechText("...");
      liveAgentMessageIdRef.current = null;
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
      upsertLiveAgentMessage(delta);
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
      if (finalText) upsertLiveAgentMessage(finalText, { replace: true, done: true });
      return;
    }

    if (event.type === "response.done") {
      const text = extractRealtimeResponseText(event.response);
      if (text) setSpeechText(compactSpeech(text));
      if (text) upsertLiveAgentMessage(text, { replace: true, done: true });
    }
  }

  function updateTranscript(event) {
    if (
      [
        "conversation.item.input_audio_transcription.completed",
        "conversation.item.input_audio_transcription.done",
        "conversation.item.input_audio_transcription.delta",
      ].includes(event.type) &&
      (event.transcript || event.delta)
    ) {
      if (event.type.endsWith(".delta")) {
        upsertLiveUserMessage(event.delta);
      } else {
        finalizeLiveUserMessage(event.transcript || event.delta);
        appendTranscript("you", event.transcript || event.delta, { skipChat: true });
      }
      return;
    }

    if (
      ["response.audio_transcript.done", "response.output_text.done", "response.text.done"].includes(event.type) &&
      (event.transcript || event.text)
    ) {
      appendTranscript("agent", event.transcript || event.text, { skipChat: true });
    }
  }

  function appendTranscript(role, text, options = {}) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    setTranscript((items) => {
      const previous = items[0];
      if (previous?.role === role && previous?.text === clean) return items;
      return [{ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, role, text: clean }, ...items].slice(0, 8);
    });
    if (!options.skipChat) appendChatMessage(role === "agent" ? "agent" : "user", clean, { source: "voice" });
  }

  function appendChatMessage(role, text, options = {}) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    setChatMessages((items) => {
      const previous = items.at(-1);
      if (previous?.role === role && previous?.text === clean && previous?.source === options.source) return items;
      return [
        ...items,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          role,
          name: role === "agent" ? agentName : "you",
          text: clean,
          source: options.source || "text",
        },
      ].slice(-40);
    });
  }

  function upsertLiveAgentMessage(text, options = {}) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    setChatMessages((items) => {
      const id = liveAgentMessageIdRef.current || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      if (!liveAgentMessageIdRef.current && options.done && items.at(-1)?.role === "agent" && items.at(-1)?.text === clean) {
        return items;
      }
      liveAgentMessageIdRef.current = options.done ? null : id;
      const index = items.findIndex((item) => item.id === id);
      const nextText = options.replace || index === -1 ? clean : `${items[index].text}${clean}`.replace(/\s+/g, " ").trim();
      const nextItem = {
        id,
        role: "agent",
        name: agentName,
        text: nextText,
        source: "voice",
        live: !options.done,
      };
      if (index === -1) return [...items, nextItem].slice(-40);
      const next = items.slice();
      next[index] = nextItem;
      return next;
    });
  }

  function upsertLiveUserMessage(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    setChatMessages((items) => {
      const previous = items.at(-1);
      if (previous?.role === "user" && previous?.live) {
        return [
          ...items.slice(0, -1),
          { ...previous, text: `${previous.text}${clean}`.replace(/\s+/g, " ").trim() },
        ];
      }
      return [
        ...items,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          role: "user",
          name: "you",
          text: clean,
          source: "voice",
          live: true,
        },
      ].slice(-40);
    });
  }

  function finalizeLiveUserMessage(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    setChatMessages((items) => {
      const previous = items.at(-1);
      if (previous?.role === "user" && previous?.live) {
        return [
          ...items.slice(0, -1),
          { ...previous, text: clean, live: false },
        ];
      }
      return [
        ...items,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          role: "user",
          name: "you",
          text: clean,
          source: "voice",
          live: false,
        },
      ].slice(-40);
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
        sessionKey: item.sessionKey || openClawSessionKeyRef.current || "",
        taskKey: item.taskKey || "",
        error: item.error || "",
        createdAt: item.createdAt || Date.now(),
      },
      ...items,
    ].slice(0, 18));
  }

  function latestArtifactImageReference(kind, prompt) {
    if (kind !== "video" || !shouldUsePreviousImageForVideo(prompt)) return null;
    if (artifact?.kind === "image" && artifact.imageUrl && !artifact.error) return artifact.imageUrl;
    const previousImage = sessionHistory.find((item) => item.kind === "image" && item.imageUrl && !item.error);
    return previousImage?.imageUrl || null;
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
          ownerContext: ownerChannelContext(),
          responseStyle: args.responseStyle || "short natural spoken answer",
          screenshot,
          sessionKey: currentOpenClawSessionKey(),
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

  async function handleMcpUse(event, args) {
    const task = args.task || args.question || "Use the configured MCP tools for this request.";
    const serverHint = args.serverHint || args.server || "";
    setEvents((items) => [{ type: "mcp.using", message: serverHint || task }, ...items].slice(0, 3));
    const screenshot = await captureVisualFrame();

    try {
      const response = await fetch("/api/openclaw/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: [
            "Use OpenClaw's configured MCP servers/connectors/tools to complete this request.",
            serverHint ? `Preferred MCP server/connector: ${serverHint}` : "Choose the right MCP server/connector yourself.",
            `Task: ${task}`,
          ].join("\n"),
          context: [
            args.context || "",
            ownerChannelContext(),
            PROJECT_CHANNEL_CONTEXT,
            "If the right MCP server/tool is unavailable, say exactly what is missing. If the task is sensitive or destructive, follow OpenClaw approval policy instead of guessing.",
          ].filter(Boolean).join("\n\n"),
          responseStyle: args.responseStyle || "short natural answer with concrete MCP/tool result",
          screenshot,
          sessionKey: currentOpenClawSessionKey(),
        }),
      });
      const payload = await response.json();
      sendToolResult(
        event.call_id,
        payload.ok ? payload : { error: payload.error || "MCP request failed." },
        "Speak the MCP/tool result naturally and briefly. If a tool was unavailable or needs setup, say that clearly."
      );
    } catch (error) {
      sendToolResult(event.call_id, { error: error.message }, "Tell the user the MCP request failed, briefly and naturally.");
    }
  }

  async function requestOpenClawArtifact({ kind, prompt, referenceSource, hasReference, taskKey }) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch("/api/openclaw/ask", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `Create or retrieve this artifact through the OpenClaw session: ${prompt}`,
          context: [
            `Artifact kind: ${kind}.`,
            ownerChannelContext(),
            hasReference ? `The call website has a ${referenceSource || "visual"} reference available for fallback/local rendering.` : "No browser visual reference is attached to this OpenClaw request.",
            "If you produce an image, video, audio, PDF, document, or HTML artifact, return the direct artifact URL in the final answer.",
          ].join(" "),
          responseStyle: "short final answer; include direct artifact URL if available",
          sessionKey: currentOpenClawSessionKey(),
          artifactRequest: {
            kind,
            prompt,
            referenceSource,
            taskKey,
          },
        }),
      });
      const payload = await response.json();
      if (!payload.ok || !isRenderableArtifact(payload.artifact)) return null;
      return payload.artifact;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function requestOpenClawVideoModelPlan({ prompt, referenceSource, hasReference, hasReferenceVideo }) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch("/api/openclaw/ask", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: [
            "Choose the best Fal video model for this exact video artifact request.",
            "Return only compact JSON. No markdown, no prose.",
            "Allowed JSON keys: videoModel, imageToVideoModel, videoEditModel, reason.",
            "Allowed videoModel values: bytedance/seedance-2.0/fast/text-to-video, bytedance/seedance-2.0/text-to-video, fal-ai/kling-video/v1/standard/text-to-video.",
            "Allowed imageToVideoModel values: fal-ai/kling-video/v3/standard/image-to-video, fal-ai/kling-video/v3/pro/image-to-video, fal-ai/kling-video/v3/4k/image-to-video.",
            "Allowed videoEditModel values: fal-ai/wan/v2.7/edit-video.",
            hasReferenceVideo ? "The user supplied a video reference, so prefer videoEditModel." : hasReference ? `The request has a ${referenceSource || "visual"} image/reference, so prefer imageToVideoModel.` : "The request is text-to-video, so choose videoModel.",
            `Prompt: ${prompt}`,
          ].join("\n"),
          context: [
            ownerChannelContext(),
            "Model selection guidance: prioritize character consistency and avatar/reference preservation for 47/selfie/person requests; prioritize Seedance for fast generic text-to-video; prioritize Kling image-to-video when a reference image or previous artifact image should be preserved; use pro/4k only when quality/detail matters more than speed.",
          ].join("\n\n"),
          responseStyle: "raw JSON only",
          sessionKey: currentOpenClawSessionKey(),
        }),
      });
      const payload = await response.json();
      if (!payload.ok) return null;
      return parseVideoModelPlan(extractOpenClawReply(payload));
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function sendTextChat(event) {
    event?.preventDefault();
    const text = chatDraft.replace(/\s+/g, " ").trim();
    if (!text || chatSending) return;

    setChatDraft("");
    appendChatMessage("user", text, { source: "text" });
    setChatSending(true);

    try {
      const screenshot = await captureVisualFrame();
      const response = await fetch("/api/openclaw/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: textChannelQuestion(text),
          ownerContext: ownerChannelContext(),
          context: [
            "This came from the in-call text chat view of a first-party personal web channel.",
            "Treat typed text as real user instructions, not as casual transcript only.",
            PROJECT_CHANNEL_CONTEXT,
            "If the message mentions MCP, a connector, connected app, GitHub/Gmail/Slack/Linear/Vercel/Sentry/Figma/browser/files, or asks to use tools, route it through OpenClaw's MCP/tool layer.",
            "If the message is an imperative like 'work on URL', 'fix this', 'make this', or 'check this', infer the likely target from the URL/current app and act if possible.",
            "If it is too ambiguous to act, ask one concise clarification such as what change to make. Never return a generic 'OpenClaw finished' without concrete details.",
          ].join("\n\n"),
          responseStyle: "short natural text chat reply with concrete result, next step, or one clarification",
          screenshot,
          sessionKey: currentOpenClawSessionKey(),
        }),
      });
      const payload = await response.json();
      const reply = payload.ok ? extractOpenClawReply(payload) : payload.error || "OpenClaw failed.";
      appendChatMessage("agent", reply, { source: "text" });
    } catch (error) {
      appendChatMessage("agent", `i hit an error: ${error.message}`, { source: "text" });
    } finally {
      setChatSending(false);
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

    sendImageToRealtime(screenshot, args.question || "Look at the current camera or screen frame and answer naturally.");
    sendToolResult(
      event.call_id,
      { ok: true, status: "image_input_attached" },
      [
        "Use the image input that was just added to the conversation.",
        args.responseStyle || "Answer naturally and briefly, like a real person on a call.",
        "Do not say you cannot see the camera unless the image itself is unavailable or unreadable.",
      ].join(" ")
    );
  }

  function sendImageToRealtime(imageUrl, question) {
    const channel = sessionRef.current?.channel;
    if (!channel || channel.readyState !== "open" || !imageUrl) return;

    channel.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: question,
          },
          {
            type: "input_image",
            image_url: imageUrl,
            detail: "auto",
          },
        ],
      },
    }));
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
    event?.stopPropagation();
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
    event?.stopPropagation();
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

  function clampCameraFrame(frame) {
    const bounds = agentStageRef.current?.getBoundingClientRect();
    const maxWidth = Math.max(220, (bounds?.width || window.innerWidth) - 48);
    const maxHeight = Math.max(165, (bounds?.height || window.innerHeight) - 48);
    const width = Math.min(maxWidth, Math.max(180, frame.width));
    const height = Math.min(maxHeight, Math.max(135, frame.height));
    const maxLeft = Math.max(16, (bounds?.width || window.innerWidth) - width - 16);
    const maxTop = Math.max(16, (bounds?.height || window.innerHeight) - height - 16);

    return {
      ...frame,
      left: frame.left === null ? null : Math.min(maxLeft, Math.max(16, frame.left)),
      top: Math.min(maxTop, Math.max(16, frame.top)),
      width,
      height,
    };
  }

  function dockCameraTopRight(event) {
    event?.stopPropagation();
    setCameraFrame((frame) => ({ ...frame, left: null, top: 24 }));
  }

  function enlargeCameraFrame(event) {
    event?.stopPropagation();
    setCameraFrame((frame) => {
      const bounds = agentStageRef.current?.getBoundingClientRect();
      const maxWidth = Math.max(220, (bounds?.width || window.innerWidth) - 48);
      const maxHeight = Math.max(165, (bounds?.height || window.innerHeight) - 48);
      return clampCameraFrame({
        ...frame,
        width: Math.min(maxWidth, Math.round(frame.width * 1.22)),
        height: Math.min(maxHeight, Math.round(frame.height * 1.22)),
      });
    });
  }

  function cycleCameraFilter(event) {
    event?.stopPropagation();
    setCameraFilterIndex((index) => (index + 1) % CAMERA_FILTERS.length);
  }

  function startCameraDrag(event) {
    if (event.button !== 0 || event.target.closest("button")) return;
    const bounds = agentStageRef.current?.getBoundingClientRect();
    const windowBounds = event.currentTarget.closest(".camera-window")?.getBoundingClientRect();
    if (!bounds || !windowBounds) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    const start = {
      x: event.clientX,
      y: event.clientY,
      left: windowBounds.left - bounds.left,
      top: windowBounds.top - bounds.top,
    };

    function move(pointerEvent) {
      setCameraFrame((frame) => clampCameraFrame({
        ...frame,
        left: start.left + pointerEvent.clientX - start.x,
        top: start.top + pointerEvent.clientY - start.y,
      }));
    }

    function stop() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  function startCameraResize(event) {
    event.preventDefault();
    event.stopPropagation();
    const bounds = agentStageRef.current?.getBoundingClientRect();
    const windowBounds = event.currentTarget.closest(".camera-window")?.getBoundingClientRect();
    if (!bounds || !windowBounds) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    const start = {
      x: event.clientX,
      y: event.clientY,
      left: windowBounds.left - bounds.left,
      top: windowBounds.top - bounds.top,
      width: windowBounds.width,
      height: windowBounds.height,
    };

    function move(pointerEvent) {
      setCameraFrame((frame) => clampCameraFrame({
        ...frame,
        left: start.left,
        top: start.top,
        width: start.width + pointerEvent.clientX - start.x,
        height: start.height + pointerEvent.clientY - start.y,
      }));
    }

    function stop() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
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

  async function captureArtifactReference(kind) {
    if (!["image", "video"].includes(kind)) return null;
    if (!cameraStream && !screenStream) return null;
    return captureVisualFrame();
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
    if (video === cameraVideoRef.current) {
      context.filter = cameraFilter.canvas;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    context.filter = "none";
    return canvas.toDataURL("image/jpeg", 0.72);
  }

  const hasArtifact = Boolean(artifact);

  if (auth.checking || !auth.unlocked) {
    return (
      <PasswordGate
        checking={auth.checking}
        requiresAuth={auth.requiresAuth}
        onUnlocked={() => setAuth({ checking: false, unlocked: true, requiresAuth: true })}
      />
    );
  }

  return (
    <main className={`voice-room ${live ? "is-live" : ""} ${hasArtifact ? "has-artifact" : ""} ${isChatView ? "is-chat-view" : ""}`}>
      <div className="grain" aria-hidden="true" />
      <div className="ambient-field" aria-hidden="true" />

      <div className="tiny-status" aria-label="Connection status">
        <span className={server?.openclaw?.ok && memoryReady ? "is-ready" : ""}>{terminalStatus}</span>
        <button className={ownerProfile?.rememberedOnThisDevice || ownerProfile?.deviceClaimed ? "is-ready" : ""} onClick={rememberOwner} type="button">
          owner: Siqi
        </button>
        <label className="session-switcher" aria-label="Active session">
          <span>session</span>
          <select value={activeSession.id} onChange={switchSession}>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>{labelForSession(session)}</option>
            ))}
          </select>
        </label>
        <button className="icon-status-button" onClick={createNewSession} type="button" aria-label="New session" title="New session">
          <Plus size={12} strokeWidth={2.4} />
        </button>
        <button className="icon-status-button" onClick={deleteActiveSession} type="button" aria-label="Delete current session" title="Delete current session">
          <Trash2 size={12} strokeWidth={2.4} />
        </button>
        <input
          ref={uploadInputRef}
          className="hidden-upload"
          type="file"
          accept="image/*,video/*,audio/*,application/pdf,.pdf,.md,.markdown,.txt,.html,.htm,.doc,.docx"
          onChange={handleUpload}
        />
      </div>

      <section ref={agentStageRef} className={`agent-stage ${isChatView ? "is-chat-panel" : ""} ${callVisualMode === "voice" ? "is-voice-card" : ""}`} aria-label={isChatView ? `${agentName} text chat` : `${agentName} voice call`}>
        {isChatView ? (
          <ChatView
            agentName={agentName}
            displayName={chatDisplayName}
            messages={chatMessages}
            draft={chatDraft}
            sending={chatSending}
            setDraft={setChatDraft}
            onSubmit={sendTextChat}
            onCallView={() => setViewMode("call")}
            onUpload={() => uploadInputRef.current?.click()}
            onToggleCamera={toggleCamera}
            cameraOn={Boolean(cameraStream)}
            uploadedMedia={uploadedMedia}
            avatarImageUrl={avatarImageUrl}
            avatarInitials={avatarInitials}
          />
        ) : (
          <>
            <picture>
              {callVisualMode === "voice" ? (
                <img className="agent-scene voice-avatar-scene" src={avatarImageUrl} alt="" aria-hidden="true" />
              ) : live && callStageVideoUrl ? (
                <video className="agent-scene" src={callStageVideoUrl} poster={callStageImageUrl} autoPlay muted loop playsInline aria-hidden="true" />
              ) : (
                <img className="agent-scene" src={callStageImageUrl} alt="" aria-hidden="true" />
              )}
            </picture>
            {live ? <span className="speech">{speechText}</span> : null}
            <div className={`call-controls ${live ? "is-expanded" : "is-idle"}`}>
              {live ? (
                <>
                  <button className={`media-pill ${screenStream ? "is-active" : ""}`} onClick={toggleScreenShare} aria-label={screenStream ? "Stop sharing screen" : "Share screen"}>
                    <ScreenShare size={18} strokeWidth={2.2} />
                  </button>
                  <button className={`media-pill ${cameraStream ? "is-active" : ""}`} onClick={toggleCamera} aria-label={cameraStream ? "Turn camera off" : "Open camera"}>
                    <Camera size={18} strokeWidth={2.2} />
                  </button>
                  <button className="media-pill" onClick={(event) => { event.stopPropagation(); uploadInputRef.current?.click(); }} aria-label="Send media">
                    <ImagePlus size={18} strokeWidth={2.2} />
                  </button>
                  <button className="media-pill" onClick={() => setViewMode("chat")} aria-label="Show live transcript">
                    <MessageCircle size={18} strokeWidth={2.2} />
                  </button>
                  <button className={`media-pill ${callVisualMode === "voice" ? "is-active" : ""}`} onClick={() => setCallVisualMode((mode) => mode === "voice" ? "video" : "voice")} aria-label={callVisualMode === "voice" ? "Switch to video call view" : "Switch to voice-only call view"}>
                    <Mic size={18} strokeWidth={2.2} />
                  </button>
                </>
              ) : null}
              <button className="call-button" onClick={toggleCall} aria-label={live ? "End voice call" : "Start voice call"}>
                <Phone className={live ? "hangup-icon" : ""} size={20} strokeWidth={2.6} />
                <span>{live ? "End Call" : "Call"}</span>
              </button>
            </div>
            {callError ? <div className="call-error" role="status">{friendlyCallError(callError)}</div> : null}
            {uploadedMedia ? <div className="media-presence">{uploadedMedia.name}</div> : null}
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
              <div className="camera-window" style={cameraFrameStyle(cameraFrame)} aria-label="Your camera preview">
                <div className="camera-titlebar" onPointerDown={startCameraDrag}>
                  <span><Move size={11} strokeWidth={2.2} /></span>
                  <b>you</b>
                  <div className="camera-actions">
                    <button onClick={cycleCameraFilter} aria-label={`Camera filter: ${cameraFilter.label}`} title={`Filter: ${cameraFilter.label}`}><Sparkles size={11} strokeWidth={2.4} /></button>
                    <button onClick={dockCameraTopRight} aria-label="Move camera preview to top right"><MoveUpRight size={11} strokeWidth={2.4} /></button>
                    <button onClick={enlargeCameraFrame} aria-label="Enlarge camera preview"><Maximize2 size={11} strokeWidth={2.4} /></button>
                    <button onClick={toggleCamera} aria-label="Turn camera off">off</button>
                  </div>
                </div>
                <video ref={attachCameraPreview} style={{ filter: cameraFilter.css }} muted playsInline autoPlay />
                <div className="camera-heart-layer" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <span className="camera-filter-label">{cameraFilter.label}</span>
                <button className="camera-resize" onPointerDown={startCameraResize} aria-label="Resize camera preview" />
              </div>
            ) : null}
          </>
        )}
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
          <div className="artifact-sessionbar" aria-label="Session controls">
            <label>
              <span>session</span>
              <select value={activeSession.id} onChange={switchSession}>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>{labelForSession(session)}</option>
                ))}
              </select>
            </label>
            <button onClick={createNewSession} type="button">
              <Plus size={13} strokeWidth={2.4} />
              new
            </button>
            <button onClick={deleteActiveSession} type="button">
              <Trash2 size={13} strokeWidth={2.4} />
              delete
            </button>
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
              {sessionHistory.map((item) => (
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
        {events.length === 0 ? "quiet" : events[0]?.message || events[0]?.type || callState}
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
    return <VideoArtifact artifact={artifact} />;
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

function PasswordGate({ checking, requiresAuth, onUnlocked }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function unlock(event) {
    event.preventDefault();
    if (checking || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.unlocked) {
        setError(payload.error || "Wrong password.");
        return;
      }
      setPassword("");
      onUnlocked();
    } catch (loginError) {
      setError(loginError.message || "Could not unlock.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="lock-room">
      <div className="grain" aria-hidden="true" />
      <div className="ambient-field" aria-hidden="true" />
      <form className="lock-panel" onSubmit={unlock}>
        <div className="window-lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="lock-avatar" aria-hidden="true">
          <img src="/girl-agent-main.png" alt="" />
        </div>
        <h1>47</h1>
        <label htmlFor="site-password">{requiresAuth ? "password" : "unlocking"}</label>
        <input
          id="site-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          autoFocus
          disabled={checking || submitting}
        />
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={checking || submitting || !password.trim()}>
          {checking ? "checking" : submitting ? "opening" : "enter"}
        </button>
      </form>
    </main>
  );
}

function ChatView({
  agentName,
  displayName,
  messages,
  draft,
  sending,
  setDraft,
  onSubmit,
  onCallView,
  onUpload,
  onToggleCamera,
  cameraOn,
  uploadedMedia,
  avatarImageUrl,
  avatarInitials,
}) {
  return (
    <div className="text-chat-view">
      <div className="text-chat-topbar">
        <div>
          <span>{agentName}</span>
          <b>live transcript</b>
        </div>
        <button onClick={onCallView} type="button">
          <Phone size={15} strokeWidth={2.3} />
          call view
        </button>
      </div>

      <div className="text-chat-messages" aria-label="Text chat messages">
        {messages.map((message) => (
          <article key={message.id} className={`text-message ${message.role}`}>
            <div className="text-avatar" aria-hidden="true">
              {message.role === "agent" ? <AvatarImage src={avatarImageUrl} fallback={avatarInitials} /> : "YOU"}
            </div>
            <div>
              <span>{message.role === "agent" ? displayName : "you"}</span>
              <p>{message.text}</p>
            </div>
          </article>
        ))}
        {sending ? (
          <article className="text-message agent is-typing">
            <div className="text-avatar" aria-hidden="true"><AvatarImage src={avatarImageUrl} fallback={avatarInitials} /></div>
            <div>
              <span>{displayName}</span>
              <p>typing...</p>
            </div>
          </article>
        ) : null}
      </div>

      <form className="text-composer" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="text-chat-input">Message</label>
        <textarea
          id="text-chat-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit(event);
            }
          }}
          placeholder="Message..."
          rows={1}
        />
        <div className="composer-actions">
          <button type="button" onClick={onUpload} aria-label="Attach media">
            <Plus size={20} strokeWidth={2.2} />
          </button>
          <button type="button" aria-label="Mention agent">
            <AtSign size={18} strokeWidth={2.2} />
          </button>
          <span>{uploadedMedia ? mediaUploadLabel(uploadedMedia) : "models"}</span>
          <button type="button" onClick={onToggleCamera} className={cameraOn ? "is-active" : ""} aria-label="Toggle camera">
            <Camera size={18} strokeWidth={2.2} />
          </button>
          <button type="button" aria-label="Model settings">
            <SlidersHorizontal size={18} strokeWidth={2.2} />
          </button>
          <button type="button" aria-label="Voice input">
            <Mic size={18} strokeWidth={2.2} />
          </button>
          <button type="submit" disabled={!draft.trim() || sending} aria-label="Send message">
            <Send size={18} strokeWidth={2.2} />
          </button>
        </div>
      </form>
    </div>
  );
}

function AvatarImage({ src, fallback }) {
  if (!src) return fallback || "AI";
  return <img src={src} alt="" />;
}

function VideoArtifact({ artifact }) {
  return (
    <div className="video-artifact">
      <video src={artifact.videoUrl} controls playsInline preload="metadata" />
      {artifact.audioUrl ? (
        <div className="video-audio-track">
          <span>audio track</span>
          <audio src={artifact.audioUrl} controls preload="metadata" />
        </div>
      ) : null}
    </div>
  );
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
    return <VideoArtifact artifact={{ ...artifact, videoUrl: url }} />;
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

function extractOpenClawReply(payload) {
  if (!payload) return "";
  if (typeof payload.result === "string") {
    return payload.result === "OpenClaw finished."
      ? "我收到了，但这次 OpenClaw 没有把具体结果传回来。你可以直接给我更明确的动作，比如“修改首页按钮文案”或“生成一个 HTML 小游戏”。"
      : payload.result;
  }
  if (typeof payload.text === "string") return payload.text;
  if (payload.result?.text) return payload.result.text;
  if (Array.isArray(payload.result?.content)) {
    return payload.result.content
      .map((part) => typeof part?.text === "string" ? part.text : "")
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "我收到了，但没有拿到具体结果。你再给我一个明确动作，我会继续。";
}

function parseVideoModelPlan(value = "") {
  const text = String(value || "").trim();
  const jsonText = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || text.match(/\{[\s\S]*\}/)?.[0] || text;
  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      videoModel: cleanAllowedModel(parsed.videoModel),
      imageToVideoModel: cleanAllowedModel(parsed.imageToVideoModel),
      videoEditModel: cleanAllowedModel(parsed.videoEditModel),
      reason: String(parsed.reason || "").slice(0, 180),
    };
  } catch {
    return null;
  }
}

function cleanAllowedModel(value) {
  const clean = String(value || "").replace(/[\r\n\t]/g, "").trim();
  return clean || undefined;
}

function textChannelQuestion(text = "") {
  const clean = String(text || "").trim();
  if (!clean) return "The user sent an empty text message.";
  const hasUrl = /https?:\/\/\S+/i.test(clean);
  const isMcpRequest = /\b(mcp|connector|connected app|tool server|github|gmail|slack|linear|vercel|sentry|figma|zillow|browser|filesystem|files|repo|issue|pr|pull request)\b/i.test(clean);
  const isImperative = /\b(work on|fix|change|update|make|build|create|check|look at|open|deploy|push|render|generate|帮我|做|改|看|检查|生成|部署|修)\b/i.test(clean);
  if (!hasUrl && !isImperative && !isMcpRequest) return clean;
  return [
    "User typed this instruction in the personal web channel:",
    clean,
    "",
    "Interpret it as an actionable command. If a URL is included, use it as the target context. If the URL is call-my-agent-47.vercel.app, it refers to this Vercel web app/project.",
    PROJECT_CHANNEL_CONTEXT,
    isMcpRequest ? "The user likely wants OpenClaw MCP/connectors/tools. Use the configured MCP/tool layer and report concrete results." : "",
    "Do the useful next step with OpenClaw tools when possible. If the instruction is missing the desired change, ask one concise clarification instead of saying you cannot see the repo.",
    "Return concrete details. Do not answer only with 'finished'.",
  ].join("\n");
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

function shouldUsePreviousImageForVideo(prompt = "") {
  const text = String(prompt || "").toLowerCase();
  return /\b(animate|animation|make (it|this|the image|the photo|the selfie|the portrait) move|bring (it|this|the image|the photo|the selfie|the portrait) to life|turn (it|this|the image|the photo|the selfie|the portrait) into (a )?video|image to video|i2v|this image|that image|the image|this photo|that photo|the photo|selfie|portrait|previous image|last image|kling)\b/.test(text);
}

function isRenderableArtifact(item) {
  return Boolean(item && (item.imageUrl || item.videoUrl || item.audioUrl || item.fileUrl || item.pdfUrl || item.documentUrl || item.content));
}

function newOpenClawSessionKey() {
  return `call:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cameraFrameStyle(frame) {
  return {
    left: frame.left === null ? "auto" : `${frame.left}px`,
    right: frame.left === null ? "24px" : "auto",
    top: `${frame.top}px`,
    bottom: "auto",
    width: `${frame.width}px`,
    height: `${frame.height}px`,
  };
}

function formatTerminalStatus({ callState, server, memoryReady, screenStream, cameraStream, uploadedMedia }) {
  const voice = callState === "idle" ? "idle" : callState === "live" ? "live" : callState.replace(/\s+/g, "-");
  const core = server?.openclaw?.ok ? "core:ok" : "core:init";
  const memory = memoryReady ? "mem:ok" : "mem:wait";
  const devices = [
    screenStream ? "screen" : "",
    cameraStream ? "cam" : "",
    uploadedMedia ? "media" : "",
  ].filter(Boolean);
  return `init ${core} / voice:${voice} / ${memory}${devices.length ? ` / ${devices.join("+")}` : ""}`;
}

function normalizeArtifactPrompt(kind, prompt = "") {
  const clean = String(prompt || "").replace(/\s+/g, " ").trim();
  if (!clean || /^make an artifact from this conversation\.?$/i.test(clean)) {
    if (kind === "image") {
      return "Create a polished editorial visual artifact for this live agent call: abstract cinematic interface poster, dark Nova-style palette, subtle lavender accent, refined grain texture, clean composition, no readable text.";
    }
    if (kind === "html") {
      return "Create a minimal standalone HTML artifact for this live agent call with elegant typography, subtle dark interface styling, and one clear content section.";
    }
    return "Create a concise, polished artifact from this live agent conversation.";
  }
  return clean;
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
  if (/expected output|unsafe content|incompatible|missing attachments|cannot be processed/i.test(error)) {
    return "generation did not complete for that prompt. try a more specific visual prompt, or upload a reference and ask me to edit it.";
  }
  return String(error).length > 180 ? `${String(error).slice(0, 177)}...` : error;
}

function friendlyCallError(error = "") {
  const text = String(error || "");
  if (/microphone permission|notallowed|permission/i.test(text)) {
    return "mic blocked. allow microphone access for this site, then call again.";
  }
  if (/no microphone|notfound|devicesnotfound/i.test(text)) {
    return "no microphone found.";
  }
  if (/busy|notreadable|trackstart/i.test(text)) {
    return "mic is busy in another app.";
  }
  if (/realtime connection failed/i.test(text)) {
    return "realtime connection failed. try refresh, or check network/openai access.";
  }
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function initialChatMessages() {
  return [
    {
      id: "initial-agent",
      role: "agent",
      name: "47",
      text: "hey, i'm here. type or call me.",
    },
  ];
}

function createSession(seed = {}) {
  const now = Date.now();
  return normalizeSession({
    id: seed.id || `session:${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: seed.title || "new session",
    sessionKey: seed.sessionKey || newOpenClawSessionKey(),
    chatMessages: seed.chatMessages || initialChatMessages(),
    transcript: seed.transcript || [],
    history: seed.history || [],
    artifact: seed.artifact || null,
    createdAt: seed.createdAt || now,
    updatedAt: seed.updatedAt || now,
  });
}

function normalizeSession(session) {
  const now = Date.now();
  const chatMessages = Array.isArray(session.chatMessages) && session.chatMessages.length
    ? session.chatMessages
    : initialChatMessages();
  return {
    id: session.id || `session:${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: sessionTitle(session, chatMessages),
    sessionKey: session.sessionKey || newOpenClawSessionKey(),
    chatMessages: chatMessages.slice(-40),
    transcript: Array.isArray(session.transcript) ? session.transcript.slice(0, 8) : [],
    history: Array.isArray(session.history) ? session.history.slice(0, 18) : [],
    artifact: session.artifact || null,
    createdAt: session.createdAt || now,
    updatedAt: session.updatedAt || now,
  };
}

function sessionTitle(session, messages = []) {
  const existing = String(session?.title || "").trim();
  if (existing && existing !== "new session") return existing;
  const firstUserMessage = messages.find((message) => message.role === "user" && message.text?.trim());
  if (firstUserMessage) return shortSessionLabel(firstUserMessage.text);
  const firstArtifact = session?.artifact?.prompt || session?.history?.find((item) => item.prompt)?.prompt;
  if (firstArtifact) return shortSessionLabel(firstArtifact);
  return "new session";
}

function shortSessionLabel(value = "") {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length > 28 ? `${clean.slice(0, 27)}...` : clean || "new session";
}

function labelForSession(session) {
  if (!session) return "session";
  const label = shortSessionLabel(session.title || "new session");
  const date = new Date(session.updatedAt || session.createdAt || Date.now());
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${label} / ${time}`;
}

function resolveStateUpdate(update, current) {
  return typeof update === "function" ? update(current) : update;
}

function loadSessions() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(MULTI_SESSION_KEY) || "[]");
    if (Array.isArray(stored) && stored.length) {
      return stored.map((session) => normalizeSession(session)).slice(0, 24);
    }
  } catch {
    // Fall back to the legacy single-session history below.
  }

  return [
    createSession({
      title: "main",
      history: loadHistory(),
    }),
  ];
}

function loadActiveSessionId() {
  try {
    return window.localStorage.getItem(ACTIVE_SESSION_KEY) || "";
  } catch {
    return "";
  }
}

function loadHistory() {
  try {
    return JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function loadOwnerProfile() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(OWNER_PROFILE_KEY) || "null");
    return {
      ...DEFAULT_OWNER_PROFILE,
      cameraRemembered: Boolean(stored?.cameraRemembered),
      rememberedOnThisDevice: true,
      deviceClaimed: true,
    };
  } catch {
    return DEFAULT_OWNER_PROFILE;
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

function startRingtone(ref) {
  if (ref.current) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const master = context.createGain();
  const ringGain = context.createGain();
  const toneA = context.createOscillator();
  const toneB = context.createOscillator();
  const softener = context.createBiquadFilter();
  const timers = [];

  toneA.type = "sine";
  toneB.type = "sine";
  toneA.frequency.value = 440;
  toneB.frequency.value = 480;
  softener.type = "lowpass";
  softener.frequency.value = 1800;
  master.gain.value = 0.13;
  ringGain.gain.value = 0;

  toneA.connect(ringGain);
  toneB.connect(ringGain);
  ringGain.connect(softener);
  softener.connect(master);
  master.connect(context.destination);
  toneA.start();
  toneB.start();

  const pulse = () => {
    const now = context.currentTime;
    ringGain.gain.cancelScheduledValues(now);
    ringGain.gain.setValueAtTime(ringGain.gain.value, now);
    ringGain.gain.linearRampToValueAtTime(0.95, now + 0.035);
    ringGain.gain.linearRampToValueAtTime(0.82, now + 1.08);
    ringGain.gain.linearRampToValueAtTime(0, now + 1.2);
  };

  const tone = {
    context,
    interval: null,
    master,
    ringGain,
    timers,
    tones: [toneA, toneB],
  };
  ref.current = tone;
  context.resume?.().catch(() => {});
  pulse();
  tone.timers.push(window.setTimeout(() => stopRingtone(ref), 3000));
}

function stopRingtone(ref) {
  const tone = ref.current;
  if (!tone) return;
  ref.current = null;
  if (tone.interval) window.clearInterval(tone.interval);
  tone.timers.forEach((timer) => window.clearTimeout(timer));

  const now = tone.context.currentTime;
  tone.ringGain.gain.cancelScheduledValues(now);
  tone.ringGain.gain.setValueAtTime(tone.ringGain.gain.value, now);
  tone.ringGain.gain.linearRampToValueAtTime(0, now + 0.08);
  window.setTimeout(() => {
    tone.tones.forEach((oscillator) => {
      try {
        oscillator.stop();
      } catch {
        // Already stopped.
      }
    });
    tone.context.close?.().catch(() => {});
  }, 110);
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
