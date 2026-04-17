"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskType,
  TaskMode,
} from "@heygen/streaming-avatar";

// TODO: Replace with your real IDs from HeyGen dashboard
const HEYGEN_AVATAR_ID = process.env.NEXT_PUBLIC_HEYGEN_AVATAR_ID || "REPLACE_WITH_AVATAR_ID";
const HEYGEN_VOICE_ID = process.env.NEXT_PUBLIC_HEYGEN_VOICE_ID || "REPLACE_WITH_VOICE_ID";

export type HeyGenState = "idle" | "loading" | "connected" | "speaking" | "error";

export function useHeyGenAvatar(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const avatarRef = useRef<StreamingAvatar | null>(null);
  const [state, setState] = useState<HeyGenState>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (avatarRef.current) return;
    setState("loading");

    try {
      // Get session token from our API route
      const tokenResp = await fetch("/api/heygen-token");
      if (!tokenResp.ok) throw new Error("Failed to get HeyGen token");
      const { token } = await tokenResp.json();

      const avatar = new StreamingAvatar({ token });
      avatarRef.current = avatar;

      // Listen for stream ready
      avatar.on(StreamingEvents.STREAM_READY, (event: any) => {
        console.log("[HeyGen] Stream ready");
        if (videoRef.current && event.detail) {
          videoRef.current.srcObject = event.detail as MediaStream;
          videoRef.current.play().catch(console.error);
        }
        setState("connected");
      });

      avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
        setState("speaking");
      });

      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        setState("connected");
      });

      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.log("[HeyGen] Stream disconnected");
        setState("idle");
        avatarRef.current = null;
      });

      // Start avatar session with ElevenLabs voice
      const sessionInfo = await avatar.createStartAvatar({
        quality: AvatarQuality.Medium,
        avatarName: HEYGEN_AVATAR_ID,
        voice: {
          voiceId: HEYGEN_VOICE_ID,
          rate: 1.0,
          emotion: "FRIENDLY" as any,
        },
        language: "ar",
      });

      setSessionId(sessionInfo?.session_id ?? null);
      console.log("[HeyGen] Avatar started:", sessionInfo?.session_id);
    } catch (err) {
      console.error("[HeyGen] Start error:", err);
      setState("error");
    }
  }, [videoRef]);

  const speak = useCallback(async (text: string) => {
    if (!avatarRef.current) return;
    try {
      await avatarRef.current.speak({
        text,
        taskType: TaskType.REPEAT,
        taskMode: TaskMode.ASYNC,
      });
    } catch (err) {
      console.error("[HeyGen] Speak error:", err);
    }
  }, []);

  const interrupt = useCallback(async () => {
    if (!avatarRef.current) return;
    try {
      await avatarRef.current.interrupt();
    } catch (err) {
      console.error("[HeyGen] Interrupt error:", err);
    }
  }, []);

  const stop = useCallback(async () => {
    if (!avatarRef.current) return;
    try {
      await avatarRef.current.stopAvatar();
    } catch (err) {
      console.error("[HeyGen] Stop error:", err);
    }
    avatarRef.current = null;
    setState("idle");
    setSessionId(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (avatarRef.current) {
        avatarRef.current.stopAvatar().catch(() => {});
        avatarRef.current = null;
      }
    };
  }, []);

  return { state, sessionId, start, speak, interrupt, stop };
}
