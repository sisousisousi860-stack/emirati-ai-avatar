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
import { useCallback, useEffect, useState } from "react";
import type { ConnectionDetails } from "./api/connection-details/route";

export default function Page() {
  const [room] = useState(new Room());
  const [audioInitialized, setAudioInitialized] = useState(false);

  const onConnectButtonClicked = useCallback(async () => {
    try {
      // MOBILE FIX 1: Create and resume AudioContext FIRST (critical for iOS)
      if (typeof window !== 'undefined' && !audioInitialized) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const audioContext = new AudioContext();
          console.log('AudioContext initial state:', audioContext.state);
          
          if (audioContext.state === 'suspended') {
            await audioContext.resume();
            console.log('AudioContext resumed:', audioContext.state);
          }
          setAudioInitialized(true);
        }
      }

      // Fetch connection details
      const url = new URL(
        process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? "/api/connection-details",
        window.location.origin
      );
      const response = await fetch(url.toString());
      const connectionDetailsData: ConnectionDetails = await response.json();

      // MOBILE FIX 2: Connect with audio-optimized options
      await room.connect(
        connectionDetailsData.serverUrl,
        connectionDetailsData.participantToken,
        {
          // Mobile-optimized connection options
          autoSubscribe: true,
          publishDefaults: {
            audioPreset: {
              maxBitrate: 64000, // Optimize for mobile bandwidth
            },
          },
        }
      );

      // MOBILE FIX 3: Enable microphone with mobile-friendly constraints
      await room.localParticipant.setMicrophoneEnabled(true, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });

      console.log('✓ Room connected and microphone enabled');
    } catch (error) {
      console.error('Connection error:', error);
      alert('Failed to connect. Please check microphone permissions and try again.');
    }
  }, [room, audioInitialized]);

  useEffect(() => {
    // MOBILE FIX 4: Listen for audio track events
    room.on(RoomEvent.MediaDevicesError, onDeviceFailure);
    
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      console.log('Track subscribed:', track.kind, participant.identity);
      
      // Force audio track to play (critical for mobile)
      if (track.kind === 'audio' && track.mediaStreamTrack) {
        const audioElement = track.attach();
        audioElement.play().catch(e => {
          console.error('Audio play failed:', e);
          // Retry after user interaction
          document.addEventListener('touchstart', () => {
            audioElement.play().catch(console.error);
          }, { once: true });
        });
      }
    });

    return () => {
      room.off(RoomEvent.MediaDevicesError, onDeviceFailure);
    };
  }, [room]);

  return (
    <main
      data-lk-theme="default"
      className="min-h-screen w-full bg-[#001F3F] flex items-center justify-center px-4 py-10 relative overflow-hidden"
    >
      {/* Subtle background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[520px] w-[520px] rounded-full bg-[#D4AF37]/10 blur-3xl" />
        <div className="absolute bottom-[-200px] right-[-120px] h-[520px] w-[520px] rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-5xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl md:text-6xl font-semibold tracking-tight gold-text">
            Emirati AI
          </h1>
          <p className="mt-2 text-sm md:text-base text-white/70">
            Voice assistant powered by LiveKit
          </p>
        </div>

        <RoomContext.Provider value={room}>
          {/* Premium card */}
          <div className="mx-auto w-full max-w-4xl rounded-2xl border border-[#D4AF37]/20 bg-black/20 backdrop-blur-md shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
            <div className="p-6 md:p-10">
              <SimpleVoiceAssistant
                onConnectButtonClicked={onConnectButtonClicked}
              />
            </div>
          </div>
        </RoomContext.Provider>
      </div>
    </main>
  );
}

function SimpleVoiceAssistant(props: { onConnectButtonClicked: () => void }) {
  const { state: agentState } = useVoiceAssistant();

  return (
    <AnimatePresence mode="wait">
      {agentState === "disconnected" ? (
        <motion.div
          key="disconnected"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.25 }}
          className="grid items-center justify-center py-16"
        >
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, delay: 0.08 }}
            className="px-8 py-4 rounded-full text-base md:text-lg font-semibold
              bg-[#D4AF37] text-[#001F3F]
              shadow-[0_12px_30px_rgba(212,175,55,0.25)]
              hover:bg-[#caa437] hover:shadow-[0_14px_40px_rgba(212,175,55,0.35)]
              active:scale-[0.99] transition"
            onClick={() => props.onConnectButtonClicked()}
          >
            تحدث معي | Talk to Me
          </motion.button>
        </motion.div>
      ) : (
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
            <ControlBar onConnectButtonClicked={props.onConnectButtonClicked} />
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
      <div className="h-[440px] w-[440px] max-w-full rounded-2xl overflow-hidden border border-[#D4AF37]/25 bg-black/20">
        <VideoTrack trackRef={videoTrack} />
      </div>
    );
  }

  return (
    <div className="h-[220px] w-full flex items-center justify-center rounded-2xl border border-white/10 bg-black/15">
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

function ControlBar(props: { onConnectButtonClicked: () => void }) {
  const { state: agentState } = useVoiceAssistant();

  return (
    <div className="relative h-[64px]">
      <AnimatePresence>
        {agentState === "disconnected" && (
          <motion.button
            initial={{ opacity: 0, top: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, top: "-10px" }}
            transition={{ duration: 0.5 }}
            className="absolute left-1/2 -translate-x-1/2
              px-8 py-4 rounded-full text-base md:text-lg font-semibold
              bg-[#D4AF37] text-[#001F3F]
              shadow-[0_12px_30px_rgba(212,175,55,0.25)]
              hover:bg-[#caa437] hover:shadow-[0_14px_40px_rgba(212,175,55,0.35)]
              active:scale-[0.99] transition"
            onClick={() => props.onConnectButtonClicked()}
          >
            تحدث معي | Talk to Me
          </motion.button>
        )}
      </AnimatePresence>

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