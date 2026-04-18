"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskType,
  TaskMode,
} from "@heygen/streaming-avatar";

const AVATAR_ID = "0930fd59-c8ad-434d-ad53-b391a1768720";
const VOICE_ID = "997f0279afba4e1998e89d90becca013";

export type AvatarState = "idle" | "loading" | "connected" | "speaking" | "error";

export function useHeyGenAvatar(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const avatarRef = useRef<StreamingAvatar | null>(null);
  const [state, setState] = useState<AvatarState>("idle");

  const start = useCallback(async () => {
    if (avatarRef.current) return;
    setState("loading");

    try {
      const tokenResp = await fetch("/api/heygen-token", { method: "POST" });
      if (!tokenResp.ok) {
        const err = await tokenResp.text();
        throw new Error(`Token fetch failed: ${tokenResp.status} ${err}`);
      }
      const { token } = await tokenResp.json();

      const avatar = new StreamingAvatar({ token });
      avatarRef.current = avatar;

      avatar.on(StreamingEvents.STREAM_READY, (event: any) => {
        console.log("[LiveAvatar] Stream ready");
        if (videoRef.current && event.detail) {
          videoRef.current.srcObject = event.detail as MediaStream;
          videoRef.current.play().catch(console.error);
        }
        setState("connected");
      });

      avatar.on(StreamingEvents.AVATAR_START_TALKING, () => setState("speaking"));
      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => setState("connected"));
      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.log("[LiveAvatar] Stream disconnected");
        setState("idle");
        avatarRef.current = null;
      });

      await avatar.createStartAvatar({
        avatarName: AVATAR_ID,
        quality: AvatarQuality.Medium,
        voice: {
          voiceId: VOICE_ID,
          rate: 1.0,
          emotion: "FRIENDLY" as any,
        },
        language: "ar",
      });
      console.log("[LiveAvatar] Avatar started");
    } catch (err) {
      console.error("[LiveAvatar] Start error:", err);
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
      console.error("[LiveAvatar] Speak error:", err);
    }
  }, []);

  const interrupt = useCallback(async () => {
    if (!avatarRef.current) return;
    try {
      await avatarRef.current.interrupt();
    } catch (err) {
      console.error("[LiveAvatar] Interrupt error:", err);
    }
  }, []);

  const stop = useCallback(async () => {
    if (!avatarRef.current) return;
    try {
      await avatarRef.current.stopAvatar();
    } catch (err) {
      console.error("[LiveAvatar] Stop error:", err);
    }
    avatarRef.current = null;
    setState("idle");
  }, []);

  useEffect(() => {
    return () => {
      if (avatarRef.current) {
        avatarRef.current.stopAvatar().catch(() => {});
        avatarRef.current = null;
      }
    };
  }, []);

  return { state, start, speak, interrupt, stop };
}
