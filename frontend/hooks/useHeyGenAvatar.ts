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

export function useHeyGenAvatar() {
  const avatarRef = useRef<StreamingAvatar | null>(null);
  const [state, setState] = useState<AvatarState>("idle");
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const attachStream = useCallback(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(console.error);
    }
  }, []);

  const setVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current) {
      el.srcObject = streamRef.current;
      el.play().catch(console.error);
    }
  }, []);

  const start = useCallback(async () => {
    if (avatarRef.current) return;
    setState("loading");
    setError(null);

    try {
      console.log("[LiveAvatar] Fetching token...");
      const tokenResp = await fetch("/api/heygen-token", { method: "POST" });
      if (!tokenResp.ok) {
        const err = await tokenResp.text();
        throw new Error(`Token fetch failed: ${tokenResp.status} ${err}`);
      }
      const tokenData = await tokenResp.json();
      console.log("[LiveAvatar] Token response:", JSON.stringify(tokenData).slice(0, 200));

      if (!tokenData.token) {
        throw new Error(`No token in response: ${JSON.stringify(tokenData)}`);
      }

      const avatar = new StreamingAvatar({ token: tokenData.token });
      avatarRef.current = avatar;

      avatar.on(StreamingEvents.STREAM_READY, (event: any) => {
        console.log("[LiveAvatar] STREAM_READY fired");
        streamRef.current = event.detail as MediaStream;
        attachStream();
        setState("connected");
      });

      avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
        console.log("[LiveAvatar] Avatar started talking");
        setState("speaking");
      });
      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        console.log("[LiveAvatar] Avatar stopped talking");
        setState("connected");
      });
      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.log("[LiveAvatar] Stream disconnected");
        streamRef.current = null;
        setState("idle");
        avatarRef.current = null;
      });

      console.log("[LiveAvatar] Calling createStartAvatar...");
      const sessionInfo = await avatar.createStartAvatar({
        avatarName: AVATAR_ID,
        quality: AvatarQuality.Medium,
        voice: {
          voiceId: VOICE_ID,
          rate: 1.0,
          emotion: "FRIENDLY" as any,
        },
        language: "ar",
      });
      console.log("[LiveAvatar] Avatar started, session:", sessionInfo);
    } catch (err: any) {
      console.error("[LiveAvatar] Start error:", err);
      setError(err.message || String(err));
      setState("error");
      avatarRef.current = null;
    }
  }, [attachStream]);

  const speak = useCallback(async (text: string) => {
    if (!avatarRef.current) return;
    try {
      console.log("[LiveAvatar] Speaking:", text.slice(0, 80));
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
    streamRef.current = null;
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

  return { state, error, setVideoRef, start, speak, interrupt, stop };
}
