"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveAvatarSession,
  SessionEvent,
  SessionState,
  AgentEventsEnum,
} from "@heygen/liveavatar-web-sdk";

export type AvatarState = "idle" | "loading" | "connected" | "speaking" | "error";

const KEEP_ALIVE_INTERVAL = 30_000;

export function useLiveAvatar() {
  const sessionRef = useRef<LiveAvatarSession | null>(null);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [state, setState] = useState<AvatarState>("idle");
  const [error, setError] = useState<string | null>(null);
  const elementRef = useRef<HTMLVideoElement | null>(null);

  const setVideoRef = useCallback((el: HTMLVideoElement | null) => {
    elementRef.current = el;
    if (el && sessionRef.current) {
      sessionRef.current.attach(el);
    }
  }, []);

  const startKeepAlive = useCallback(() => {
    if (keepAliveRef.current) return;
    keepAliveRef.current = setInterval(() => {
      if (sessionRef.current) {
        sessionRef.current.keepAlive().catch((e) =>
          console.warn("[LiveAvatar] keepAlive failed:", e)
        );
      }
    }, KEEP_ALIVE_INTERVAL);
  }, []);

  const stopKeepAlive = useCallback(() => {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (sessionRef.current) return;
    setState("loading");
    setError(null);

    try {
      console.log("[LiveAvatar] Fetching token...");
      const tokenResp = await fetch("/api/heygen-token", { method: "POST" });
      if (!tokenResp.ok) {
        const err = await tokenResp.text();
        throw new Error(`Token fetch failed: ${tokenResp.status} ${err}`);
      }
      const { token } = await tokenResp.json();
      if (!token) throw new Error("No token in response");
      console.log("[LiveAvatar] Got token");

      const session = new LiveAvatarSession(token, {
        voiceChat: false,
      });
      sessionRef.current = session;

      session.on(SessionEvent.SESSION_STATE_CHANGED, (s: SessionState) => {
        console.log("[LiveAvatar] State:", s);
        if (s === SessionState.CONNECTED) {
          setState("connected");
          startKeepAlive();
        } else if (s === SessionState.DISCONNECTED) {
          setState("idle");
          stopKeepAlive();
          sessionRef.current = null;
        }
      });

      session.on(SessionEvent.SESSION_STREAM_READY, () => {
        console.log("[LiveAvatar] Stream ready");
        if (elementRef.current) {
          session.attach(elementRef.current);
        }
        setState("connected");
      });

      session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
        console.log("[LiveAvatar] Speaking started");
        setState("speaking");
      });

      session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
        console.log("[LiveAvatar] Speaking ended");
        setState("connected");
      });

      console.log("[LiveAvatar] Starting session...");
      await session.start();
      console.log("[LiveAvatar] Session started");
    } catch (err: any) {
      console.error("[LiveAvatar] Start error:", err);
      setError(err.message || String(err));
      setState("error");
      sessionRef.current = null;
    }
  }, [startKeepAlive, stopKeepAlive]);

  const speak = useCallback((text: string) => {
    if (!sessionRef.current) return;
    try {
      console.log("[LiveAvatar] repeat:", text.slice(0, 80));
      sessionRef.current.repeat(text);
    } catch (err) {
      console.error("[LiveAvatar] Speak error:", err);
    }
  }, []);

  const interrupt = useCallback(() => {
    if (!sessionRef.current) return;
    try {
      sessionRef.current.interrupt();
    } catch (err) {
      console.error("[LiveAvatar] Interrupt error:", err);
    }
  }, []);

  const stop = useCallback(async () => {
    stopKeepAlive();
    if (!sessionRef.current) return;
    try {
      await sessionRef.current.stop();
    } catch (err) {
      console.error("[LiveAvatar] Stop error:", err);
    }
    sessionRef.current = null;
    setState("idle");
  }, [stopKeepAlive]);

  useEffect(() => {
    return () => {
      stopKeepAlive();
      if (sessionRef.current) {
        sessionRef.current.stop().catch(() => {});
        sessionRef.current = null;
      }
    };
  }, [stopKeepAlive]);

  return { state, error, setVideoRef, start, speak, interrupt, stop };
}
