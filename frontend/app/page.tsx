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
} from "@livekit/components-react";
import { AnimatePresence, motion } from "framer-motion";
import { Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionDetails } from "./api/connection-details/route";
import { usePersonDetection } from "@hooks/usePersonDetection";

export default function Page() {
  const [room] = useState(new Room());
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [roomConnected, setRoomConnected] = useState(false);
  const [detectionReady, setDetectionReady] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState(false);

  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const connectingRef = useRef(false);
  const roomConnectedRef = useRef(false);
  // Pre-fetched connection details to reduce latency when person approaches
  const prefetchedConnRef = useRef<ConnectionDetails | null>(null);

  useEffect(() => { roomConnectedRef.current = roomConnected; }, [roomConnected]);

  // ── Camera setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then((s) => {
        stream = s;
        // Video element is always in DOM (not conditional) so ref is always valid
        const video = cameraVideoRef.current;
        if (video) {
          video.srcObject = s;
          video.play()
            .then(() => setCameraAvailable(true))
            .catch(() => setCameraAvailable(true)); // show even if autoplay delayed
        }
      })
      .catch((e) => console.warn("[Kiosk] Camera unavailable:", e));
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // ── Pre-fetch connection details when model is ready (reduces latency) ────
  const prefetchConnection = useCallback(async () => {
    try {
      const url = new URL(
        process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? "/api/connection-details",
        window.location.origin
      );
      const res = await fetch(url.toString());
      prefetchedConnRef.current = await res.json();
    } catch (_) { /* will fetch fresh on connect */ }
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

      // Use pre-fetched details if available, else fetch fresh
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

  // ── Room event listeners ──────────────────────────────────────────────────
  useEffect(() => {
    const onConnected = () => { setRoomConnected(true); connectingRef.current = false; };
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

    onApproach: useCallback(async () => {
      if (roomConnectedRef.current || connectingRef.current) return;
      connectingRef.current = true;
      await onConnectButtonClicked();
    }, [onConnectButtonClicked]),

    onLeave: useCallback(async () => {
      if (!roomConnectedRef.current) return;
      await room.disconnect();
    }, [room]),

    onModelReady: useCallback(() => {
      setDetectionReady(true);
      // Pre-fetch connection details now so they're ready when person approaches
      prefetchConnection();
    }, [prefetchConnection]),
  });

  return (
    <main
      data-lk-theme="default"
      className="min-h-screen w-full bg-[#001F3F] flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden"
    >
      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[520px] w-[520px] rounded-full bg-[#D4AF37]/10 blur-3xl" />
        <div className="absolute bottom-[-200px] right-[-120px] h-[520px] w-[520px] rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl md:text-6xl font-semibold tracking-tight gold-text">
            Emirati AI
          </h1>
          <p className="mt-2 text-sm md:text-base text-white/70">
            Voice assistant powered by LiveKit
          </p>
        </div>

        {/* Split layout: camera panel left — avatar/idle panel right */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

          {/* ── Camera Panel ─────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-[#D4AF37]/20 bg-black/20 overflow-hidden flex flex-col">
            <div className="relative aspect-video flex-1">
              {/*
               * Video element is ALWAYS in the DOM so cameraVideoRef is valid
               * when the camera setup effect runs. Visibility is toggled via CSS.
               * Mirror the container so it acts like a real mirror.
               */}
              <div
                className="absolute inset-0"
                style={{ transform: "scaleX(-1)", display: cameraAvailable ? "block" : "none" }}
              >
                <video
                  ref={cameraVideoRef}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
              </div>

              {/* Fallback shown only when camera is unavailable */}
              {!cameraAvailable && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20 gap-3">
                  <span className="text-5xl">📷</span>
                  <p className="text-sm">Camera unavailable</p>
                  <p className="text-xs text-white/10">Allow camera access and reload</p>
                </div>
              )}
            </div>

            {/* Camera status bar */}
            <div className="px-4 py-2 border-t border-white/5 flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  detectionReady ? "bg-[#D4AF37] animate-pulse" : "bg-white/20"
                }`}
              />
              <span className="text-xs text-white/40">
                {detectionReady
                  ? "الكشف نشط | Detection Active"
                  : "جاري تحميل نموذج الكشف... | Loading model..."}
              </span>
            </div>
          </div>

          {/* ── Avatar / Idle Panel ───────────────────────────────────────── */}
          <RoomContext.Provider value={room}>
            <div className="rounded-2xl border border-[#D4AF37]/20 bg-black/20 backdrop-blur-md shadow-[0_20px_80px_rgba(0,0,0,0.45)] flex flex-col">
              <div className="p-6 md:p-8 flex-1 flex flex-col justify-center">
                <SimpleVoiceAssistant
                  onConnectButtonClicked={onConnectButtonClicked}
                  detectionReady={detectionReady}
                />
              </div>
            </div>
          </RoomContext.Provider>

        </div>
      </div>
    </main>
  );
}

function SimpleVoiceAssistant(props: {
  onConnectButtonClicked: () => void;
  detectionReady: boolean;
}) {
  const { state: agentState } = useVoiceAssistant();

  return (
    <AnimatePresence mode="wait">
      {agentState === "disconnected" ? (
        // ── Idle / kiosk waiting screen ───────────────────────────────────
        <motion.div
          key="disconnected"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col items-center justify-center gap-6 py-10"
        >
          {/* Pulsing indicator */}
          <div className="relative flex items-center justify-center">
            {props.detectionReady && (
              <span className="absolute inline-flex h-20 w-20 rounded-full bg-[#D4AF37]/20 animate-ping" />
            )}
            <span className="inline-flex h-14 w-14 rounded-full bg-[#D4AF37]/30 border border-[#D4AF37]/40 items-center justify-center text-3xl">
              {props.detectionReady ? "👋" : "⏳"}
            </span>
          </div>

          <div className="text-center">
            {props.detectionReady ? (
              <>
                <p className="text-2xl font-semibold text-white">اقترب للتحدث</p>
                <p className="text-sm text-white/50 mt-1">Approach the screen to talk</p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium text-white/70">جاري تحميل الكاميرا...</p>
                <p className="text-sm text-white/40 mt-1">Loading detection model</p>
              </>
            )}
          </div>

          {/* Manual fallback button */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, delay: 0.3 }}
            className="px-6 py-3 rounded-full text-sm font-medium
              border border-[#D4AF37]/30 text-[#D4AF37]/70
              hover:border-[#D4AF37] hover:text-[#D4AF37]
              active:scale-[0.99] transition"
            onClick={() => props.onConnectButtonClicked()}
          >
            تحدث معي | Talk to Me
          </motion.button>
        </motion.div>
      ) : (
        // ── Active conversation screen ────────────────────────────────────
        <motion.div
          key="connected"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col items-center gap-6"
        >
          <AgentVisualizer />

          <div className="w-full rounded-2xl border border-white/10 bg-black/15 p-4 md:p-5">
            <TranscriptionView />
          </div>

          <div className="w-full">
            <ControlBar />
          </div>

          <RoomAudioRenderer />
          <NoAgentNotification state={agentState} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AgentVisualizer() {
  const { state: agentState, videoTrack, audioTrack } = useVoiceAssistant();

  if (videoTrack) {
    return (
      <div className="w-full rounded-2xl overflow-hidden border border-[#D4AF37]/25 bg-black/20" style={{ aspectRatio: "1/1" }}>
        <VideoTrack trackRef={videoTrack} className="w-full h-full object-cover" />
      </div>
    );
  }

  return (
    <div className="h-[160px] w-full flex items-center justify-center rounded-2xl border border-white/10 bg-black/15">
      <BarVisualizer
        state={agentState}
        barCount={7}
        trackRef={audioTrack}
        className="agent-visualizer w-full px-6"
        options={{ minHeight: 24 }}
      />
    </div>
  );
}

function ControlBar() {
  const { state: agentState } = useVoiceAssistant();

  return (
    <div className="relative h-[64px]">
      <AnimatePresence>
        {agentState !== "disconnected" && agentState !== "connecting" && (
          <motion.div
            initial={{ opacity: 0, top: "10px" }}
            animate={{ opacity: 1, top: 0 }}
            exit={{ opacity: 0, top: "-10px" }}
            transition={{ duration: 0.25 }}
            className="flex h-12 absolute left-1/2 -translate-x-1/2 justify-center gap-2 items-center"
          >
            <div className="rounded-xl border border-white/10 bg-black/15 px-2 py-1">
              <VoiceAssistantControlBar controls={{ leave: false }} />
            </div>
            <DisconnectButton className="bg-red-900/40 hover:bg-red-800/60 p-2 rounded-xl border border-white/10 transition">
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
  alert(
    "Error acquiring camera or microphone permissions. Please grant permissions and reload."
  );
}
