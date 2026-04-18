"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskType,
  TaskMode,
} from "@heygen/streaming-avatar";

const HEYGEN_AVATAR_ID = process.env.NEXT_PUBLIC_HEYGEN_AVATAR_ID || "0930fd59-c8ad-434d-ad53-b391a1768720";
const HEYGEN_VOICE_ID = process.env.NEXT_PUBLIC_HEYGEN_VOICE_ID || "997f0279afba4e1998e89d90becca013";

export type HeyGenState = "idle" | "loading" | "connected" | "speaking" | "error";

export function useHeyGenAvatar(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const avatarRef = useRef<StreamingAvatar | null>(null);
  const [state, setState] = useState<HeyGenState>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (avatarRef.current) return;
    setState("loading");

    try {
      // Get session token from our API route (LiveAvatar API)
      console.log("[HeyGen] Fetching session token...");
      const tokenResp = await fetch("/api/heygen-token");
      if (!tokenResp.ok) {
        const err = await tokenResp.text();
        throw new Error(`Token fetch failed: ${tokenResp.status} ${err}`);
      }
      const { token, session_id } = await tokenResp.json();
      console.log("[HeyGen] Got token, session:", session_id);

      const avatar = new StreamingAvatar({ token });
      avatarRef.current = avatar;

      // Listen for stream ready
      avatar.on(StreamingEvents.STREAM_READY, (event: any) => {
        console.log("[HeyGen] Stream ready — attaching video");
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

      // Start avatar — the token already contains avatar/voice config from LiveAvatar API
      console.log("[HeyGen] Starting avatar session...");
      try {
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
        setSessionId(sessionInfo?.session_id ?? session_id);
        console.log("[HeyGen] Avatar started:", sessionInfo?.session_id);
      } catch (startErr) {
        console.warn("[HeyGen] createStartAvatar failed, session may already be started:", startErr);
        setSessionId(session_id);
        setState("connected");
      }
    } catch (err) {
      console.error("[HeyGen] Start error:", err);
      setState("error");
    }
  }, [videoRef]);

  const speak = useCallback(async (text: string) => {
    if (!avatarRef.current) {
      console.warn("[HeyGen] speak called but no avatar instance");
      return;
    }
    try {
      console.log("[HeyGen] Speaking:", text.slice(0, 60));
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
