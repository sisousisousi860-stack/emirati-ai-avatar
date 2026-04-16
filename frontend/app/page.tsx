"use client";

import { CloseIcon } from "@components/CloseIcon";
import { NoAgentNotification } from "@components/NoAgentNotification";
import TranscriptionView from "@components/TranscriptionView";
import {
  BarVisualizer,
  DisconnectButton,
  RoomAudioRenderer,
  RoomContext,
  VideoTrack,
  VoiceAssistantControlBar,
  useVoiceAssistant,
  useTracks,
} from "@livekit/components-react";
import { AnimatePresence, motion } from "framer-motion";
import { Room, RoomEvent, Track } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionDetails } from "./api/connection-details/route";
import { usePersonDetection } from "@hooks/usePersonDetection";

export default function Page() {
  const [room] = useState(new Room());
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [roomConnected, setRoomConnected] = useState(false);
  const [detectionReady, setDetectionReady] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState(false);
  const [detectedLang, setDetectedLang] = useState<"AR" | "EN">("AR");

  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const connectingRef = useRef(false);
  const roomConnectedRef = useRef(false);
  const prefetchedConnRef = useRef<ConnectionDetails | null>(null);
  const recognizedNameRef = useRef<string | null>(null);
  const [recognizedName, setRecognizedName] = useState<string | null>(null);

  useEffect(() => { roomConnectedRef.current = roomConnected; }, [roomConnected]);

  // ── Camera setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false })
      .then((s) => {
        stream = s;
        const video = cameraVideoRef.current;
        if (video) {
          video.srcObject = s;
          video.play()
            .then(() => setCameraAvailable(true))
            .catch(() => setCameraAvailable(true));
        }
      })
      .catch((e) => console.warn("[Kiosk] Camera unavailable:", e));
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // ── Language detection from transcription ─────────────────────────────────
  useEffect(() => {
    const onTranscription = (segments: any[]) => {
      const text = segments.map((s: any) => s.text ?? "").join(" ");
      const hasArabic = /[\u0600-\u06FF]/.test(text);
      setDetectedLang(hasArabic ? "AR" : "EN");
    };
    room.on(RoomEvent.TranscriptionReceived, onTranscription);
    return () => { room.off(RoomEvent.TranscriptionReceived, onTranscription); };
  }, [room]);

  // ── Pre-fetch connection details ──────────────────────────────────────────
  const prefetchConnection = useCallback(async () => {
    try {
      const url = new URL(
        process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? "/api/connection-details",
        window.location.origin
      );
      const res = await fetch(url.toString());
      prefetchedConnRef.current = await res.json();
    } catch (_) {}
  }, []);

  // ── Connect to LiveKit room ───────────────────────────────────────────────
  const onConnectButtonClicked = useCallback(async () => {
    try {
      if (typeof window !== "undefined" && !audioInitialized) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          if (ctx.state === "suspended") await ctx.resume();
          setAudioInitialized(true);
        }
      }

      let connectionDetailsData = prefetchedConnRef.current;
      prefetchedConnRef.current = null;
      if (!connectionDetailsData) {
        const url = new URL(
          process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? "/api/connection-details",
          window.location.origin
        );
        const response = await fetch(url.toString());
        connectionDetailsData = await response.json();
      }

      await room.connect(
        connectionDetailsData!.serverUrl,
        connectionDetailsData!.participantToken,
        { autoSubscribe: true }
      );

      await room.localParticipant.setMicrophoneEnabled(true, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
    } catch (error) {
      console.error("Connection error:", error);
      connectingRef.current = false;
    }
  }, [room, audioInitialized]);

  // ── Room events ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onConnected = () => {
      setRoomConnected(true);
      connectingRef.current = false;
      const payload = JSON.stringify({ type: "visitor", name: recognizedNameRef.current ?? null });
      room.localParticipant
        .publishData(new TextEncoder().encode(payload), { reliable: true })
        .catch(() => {});
    };
    const onDisconnected = () => { setRoomConnected(false); connectingRef.current = false; };

    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.MediaDevicesError, onDeviceFailure);
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === "audio" && track.mediaStreamTrack) {
        const el = track.attach();
        el.play().catch(() => {
          document.addEventListener("touchstart", () => el.play().catch(console.error), { once: true });
        });
      }
    });

    return () => {
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.MediaDevicesError, onDeviceFailure);
    };
  }, [room]);

  // ── Person detection ──────────────────────────────────────────────────────
  usePersonDetection(cameraVideoRef, {
    canvasRef,
    onApproach: useCallback(async (name: string | null) => {
      if (roomConnectedRef.current || connectingRef.current) return;
      recognizedNameRef.current = name;
      setRecognizedName(name);
      connectingRef.current = true;
      await onConnectButtonClicked();
    }, [onConnectButtonClicked]),
    onLeave: useCallback(async () => {
      if (!roomConnectedRef.current) return;
      await room.disconnect();
    }, [room]),
    onModelReady: useCallback(() => {
      setDetectionReady(true);
      prefetchConnection();
    }, [prefetchConnection]),
  });

  return (
    <main
      data-lk-theme="default"
      className="h-screen w-screen overflow-hidden flex flex-col"
      style={{ background: "linear-gradient(135deg, #0a0f1a 0%, #0f172a 100%)" }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
            style={{ background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.35)", color: "#C9A84C" }}>
            O
          </div>
          <span className="text-sm font-semibold" style={{ color: "rgba(201,168,76,0.7)" }}>OryxAI</span>
        </div>

        <h1 className="text-lg font-bold tracking-[0.2em]" style={{ color: "#C9A84C" }}>
          EMIRATI AI
        </h1>

        <div className="flex items-center gap-2">
          <StatusChip label="STT: Multi" active />
          <StatusChip label={detectionReady ? "Face: Active" : "Face: Loading"} active={detectionReady} />
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 min-h-0">

        {/* ── Camera Panel ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 min-h-0">
          <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(201,168,76,0.18)", background: "#000" }}>

            {/* OryxAI watermark */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-lg px-2 py-1"
              style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}>
              <div className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold"
                style={{ background: "rgba(201,168,76,0.25)", color: "#C9A84C" }}>O</div>
              <span className="text-[10px] font-medium" style={{ color: "rgba(201,168,76,0.6)" }}>OryxAI Vision</span>
            </div>

            {/* Video + canvas — always in DOM, visibility toggled */}
            <div
              className="absolute inset-0"
              style={{ transform: "scaleX(-1)", display: cameraAvailable ? "block" : "none" }}
            >
              <video
                ref={cameraVideoRef}
                className="w-full h-full"
                style={{ objectFit: "contain", background: "#000" }}
                muted
                playsInline
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ transform: "scaleX(-1)" }}
              />
            </div>

            {!cameraAvailable && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                style={{ color: "rgba(255,255,255,0.2)" }}>
                <span className="text-5xl">📷</span>
                <p className="text-sm">Camera unavailable</p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.1)" }}>Allow camera access and reload</p>
              </div>
            )}
          </div>

          {/* Detection status bar */}
          <div className="rounded-xl px-4 py-2 flex items-center justify-between flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${detectionReady ? "animate-pulse" : ""}`}
                style={{ background: detectionReady ? "#C9A84C" : "rgba(255,255,255,0.2)" }} />
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                {detectionReady ? "Detection Active" : "Loading detection model..."}
              </span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold tracking-widest"
              style={{
                background: "rgba(201,168,76,0.1)",
                border: "1px solid rgba(201,168,76,0.2)",
                color: "#C9A84C",
              }}>
              {detectedLang}
            </span>
          </div>
        </div>

        {/* ── Right Panel ───────────────────────────────────────────────── */}
        <RoomContext.Provider value={room}>
          <KioskPanel
            onConnectButtonClicked={onConnectButtonClicked}
            detectionReady={detectionReady}
            recognizedName={recognizedName}
            roomConnected={roomConnected}
          />
        </RoomContext.Provider>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="flex items-center justify-center gap-4 px-6 py-2 flex-shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>Powered by</span>
        <span className="text-xs font-bold tracking-widest" style={{ color: "rgba(201,168,76,0.45)" }}>ORYX AI</span>
        <span style={{ color: "rgba(255,255,255,0.1)" }}>·</span>
        <FooterDot color="rgba(74,222,128,0.6)" label="STT: Multilingual" />
        <FooterDot color={detectionReady ? "rgba(201,168,76,0.6)" : "rgba(255,255,255,0.2)"} label="Face Recognition" />
        <FooterDot color={roomConnected ? "rgba(74,222,128,0.6)" : "rgba(255,255,255,0.2)"} label="LiveKit" />
      </footer>
    </main>
  );
}

function StatusChip({ label, active }: { label: string; active: boolean }) {
  return (
    <span className="text-xs px-2 py-1 rounded-full"
      style={{
        border: active ? "1px solid rgba(201,168,76,0.25)" : "1px solid rgba(255,255,255,0.08)",
        color: active ? "rgba(201,168,76,0.65)" : "rgba(255,255,255,0.25)",
      }}>
      {label}
    </span>
  );
}

function FooterDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="text-xs flex items-center gap-1" style={{ color: "rgba(255,255,255,0.2)" }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function KioskPanel(props: {
  onConnectButtonClicked: () => void;
  detectionReady: boolean;
  recognizedName: string | null;
  roomConnected: boolean;
}) {
  const { state: agentState } = useVoiceAssistant();

  return (
    <AnimatePresence mode="wait">
      {agentState === "disconnected" ? (
        <motion.div
          key="idle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex-1 flex flex-col items-center justify-center gap-6 rounded-2xl"
          style={{ border: "1px solid rgba(201,168,76,0.12)", background: "rgba(255,255,255,0.02)" }}
        >
          <div className="relative flex items-center justify-center">
            {props.detectionReady && (
              <span className="absolute inline-flex h-24 w-24 rounded-full animate-ping"
                style={{ background: "rgba(201,168,76,0.08)" }} />
            )}
            <span className="inline-flex h-16 w-16 rounded-full items-center justify-center text-4xl"
              style={{ background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.28)" }}>
              {props.detectionReady ? "👋" : "⏳"}
            </span>
          </div>

          <div className="text-center px-6">
            {props.detectionReady ? (
              props.recognizedName ? (
                <>
                  <p className="text-3xl font-bold" style={{ color: "#C9A84C" }}>
                    مرحباً {props.recognizedName}!
                  </p>
                  <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                    Welcome back, {props.recognizedName}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-semibold text-white">اقترب للتحدث</p>
                  <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                    Approach the screen to talk
                  </p>
                </>
              )
            ) : (
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
                Loading detection model...
              </p>
            )}
          </div>

          <button
            onClick={props.onConnectButtonClicked}
            className="px-6 py-2.5 rounded-full text-sm font-medium transition-all hover:scale-105 active:scale-95"
            style={{
              border: "1px solid rgba(201,168,76,0.3)",
              color: "rgba(201,168,76,0.7)",
              background: "rgba(201,168,76,0.05)",
            }}
          >
            تحدث معي | Talk to Me
          </button>
        </motion.div>
      ) : (
        <motion.div
          key="active"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col gap-3 min-h-0 flex-1"
        >
          {/* Avatar */}
          <AvatarPanel />
          {/* Chat */}
          <ChatPanel />
          {/* Controls */}
          <ControlBar />
          <RoomAudioRenderer />
          <NoAgentNotification state={agentState} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AvatarPanel() {
  const { state: agentState, videoTrack, audioTrack } = useVoiceAssistant();
  const isSpeaking = agentState === "speaking" || agentState === "thinking";

  // Fallback: find any remote video track (Tavus publishes via LiveKit)
  const allTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: true }
  );
  const remoteVideo = allTracks.find(
    (t) => !t.participant.isLocal && t.publication?.kind === Track.Kind.Video
  );
  const activeVideo =
    videoTrack ?? (remoteVideo?.publication ? remoteVideo : undefined);

  return (
    <div
      className="rounded-2xl overflow-hidden relative flex-shrink-0"
      style={{
        height: "360px",
        border: "1px solid rgba(201,168,76,0.18)",
        background: "#000",
      }}
    >
      {/* LIVE badge */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full px-2.5 py-1"
        style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }}>
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[10px] font-bold tracking-widest" style={{ color: "rgba(255,255,255,0.65)" }}>LIVE</span>
      </div>

      {activeVideo ? (
        <VideoTrack trackRef={activeVideo} className="w-full h-full object-cover" />
      ) : (
        <img
          src="/avatar.jpg"
          alt="Emirati AI Avatar"
          className={`w-full h-full object-cover transition-all duration-500 ${
            isSpeaking ? "scale-[1.04] brightness-110" : "scale-100 brightness-100"
          }`}
        />
      )}

      {/* Gold glow ring when speaking */}
      {isSpeaking && (
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none animate-pulse"
          style={{ boxShadow: "inset 0 0 40px rgba(201,168,76,0.55), 0 0 20px rgba(201,168,76,0.4)" }}
        />
      )}

      {/* Voice visualizer overlay (only when showing static image) */}
      {!activeVideo && (
        <div className="absolute bottom-0 left-0 right-0 p-3"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)" }}>
          <BarVisualizer
            state={agentState}
            barCount={7}
            trackRef={audioTrack}
            className="agent-visualizer w-full"
            options={{ minHeight: 18 }}
          />
        </div>
      )}
    </div>
  );
}

function ChatPanel() {
  return (
    <div
      className="flex-1 min-h-0 rounded-2xl overflow-hidden"
      style={{
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <TranscriptionView />
    </div>
  );
}

function ControlBar() {
  const { state: agentState } = useVoiceAssistant();

  return (
    <div className="flex items-center justify-center gap-2 flex-shrink-0" style={{ height: "52px" }}>
      <AnimatePresence>
        {agentState !== "disconnected" && agentState !== "connecting" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2"
          >
            <div className="rounded-xl px-2 py-1"
              style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}>
              <VoiceAssistantControlBar controls={{ leave: false }} />
            </div>
            <DisconnectButton
              className="p-2.5 rounded-xl transition"
              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}
            >
              <CloseIcon />
            </DisconnectButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function onDeviceFailure(error: Error) {
  console.error(error);
  alert("Error acquiring camera or microphone permissions. Please grant permissions and reload.");
}
