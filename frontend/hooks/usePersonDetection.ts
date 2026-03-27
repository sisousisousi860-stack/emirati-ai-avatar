"use client";

import { RefObject, useEffect, useRef } from "react";

const PROXIMITY_THRESHOLD = 0.06;
const CONFIDENCE_MIN = 0.45;
const POLL_MS = 300;
const LEAVE_TIMEOUT_MS = 10_000;
const RECOG_BUFFER_SIZE = 3;   // require 3 consecutive polls agreeing on identity
const RECOG_MAX_POLLS = 8;     // give up waiting for consensus after 8 polls → use majority

interface Options {
  onApproach: (name: string | null) => void;
  onLeave: () => void;
  onModelReady?: () => void;
  canvasRef?: RefObject<HTMLCanvasElement>;
}

function drawDetectionOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  prediction: any | null,
  isClose: boolean,
  badgeText?: string | null
) {
  const ctx = canvas.getContext("2d");
  if (!ctx || video.videoWidth === 0 || video.clientWidth === 0) return;

  canvas.width = video.clientWidth;
  canvas.height = video.clientHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!prediction) return;

  const sx = canvas.width / video.videoWidth;
  const sy = canvas.height / video.videoHeight;
  const [bx, by, bw, bh] = prediction.bbox;
  // Canvas is counter-flipped (scaleX(-1) on element cancels container scaleX(-1)),
  // so it renders in normal screen space. Mirror x to match the displayed mirror video.
  const w = bw * sx;
  const h = bh * sy;
  const x = canvas.width - (bx + bw) * sx; // mirror: right edge becomes left edge
  const y = by * sy;
  const cl = Math.min(24, w * 0.18, h * 0.18);

  const color = isClose ? "#C9A84C" : "rgba(255,255,255,0.4)";
  ctx.strokeStyle = color;
  ctx.lineWidth = isClose ? 3 : 2;
  ctx.lineCap = "round";

  const segs: [number, number, number, number, number, number][] = [
    [x,           y + cl,     x,     y,         x + cl, y         ],
    [x + w - cl,  y,          x + w, y,         x + w,  y + cl    ],
    [x,           y + h - cl, x,     y + h,     x + cl, y + h     ],
    [x + w - cl,  y + h,      x + w, y + h,     x + w,  y + h - cl],
  ];

  for (const [x1, y1, x2, y2, x3, y3] of segs) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.stroke();
  }

  if (isClose && badgeText !== undefined) {
    const text = badgeText ?? "Detected ✓";
    ctx.font = "bold 12px system-ui, sans-serif";
    const tw = ctx.measureText(text).width + 16;
    const bx2 = x;
    const by2 = Math.max(2, y - 28);
    ctx.fillStyle = "#C9A84C";
    ctx.beginPath();
    ctx.roundRect(bx2, by2, tw, 22, 4);
    ctx.fill();
    ctx.fillStyle = "#0a0f1a";
    ctx.fillText(text, bx2 + 8, by2 + 15);
  }
}

export function usePersonDetection(
  videoRef: RefObject<HTMLVideoElement>,
  { onApproach, onLeave, onModelReady, canvasRef }: Options
) {
  const onApproachRef = useRef(onApproach);
  const onLeaveRef = useRef(onLeave);
  const onModelReadyRef = useRef(onModelReady);
  useEffect(() => { onApproachRef.current = onApproach; });
  useEffect(() => { onLeaveRef.current = onLeave; });
  useEffect(() => { onModelReadyRef.current = onModelReady; });

  useEffect(() => {
    let active = true;
    let model: any = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let leaveTimer: ReturnType<typeof setTimeout> | null = null;
    let isPresent = false;

    // Recognition buffer — accumulates results until consensus
    let recogBuffer: Array<string | null> = [];
    let recogPollCount = 0;

    function resetRecogBuffer() {
      recogBuffer = [];
      recogPollCount = 0;
    }

    function getMajority(arr: Array<string | null>): string | null {
      const counts = new Map<string | null, number>();
      for (const n of arr) counts.set(n, (counts.get(n) ?? 0) + 1);
      let top: string | null = null;
      let topCount = 0;
      counts.forEach((count, name) => { if (count > topCount) { topCount = count; top = name; } });
      return top;
    }

    function schedulePoll() {
      if (!active) return;
      pollTimer = setTimeout(poll, POLL_MS);
    }

    function markPresent(name: string | null) {
      if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
      if (!isPresent) { isPresent = true; onApproachRef.current(name); }
    }

    function markAbsent() {
      if (!isPresent || leaveTimer) return;
      leaveTimer = setTimeout(() => {
        if (!active) return;
        isPresent = false;
        leaveTimer = null;
        resetRecogBuffer();
        if (canvasRef?.current) {
          const ctx = canvasRef.current.getContext("2d");
          ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
        onLeaveRef.current();
      }, LEAVE_TIMEOUT_MS);
    }

    async function poll() {
      const video = videoRef.current;
      if (!active) return;

      if (!video || !model || video.readyState < 2 || video.videoWidth === 0) {
        schedulePoll();
        return;
      }

      try {
        const predictions: any[] = await model.detect(video);
        const person = predictions.find(
          (p) => p.class === "person" && p.score >= CONFIDENCE_MIN
        );

        let isClose = false;
        if (person) {
          const [, , bw, bh] = person.bbox;
          isClose = (bw * bh) / (video.videoWidth * video.videoHeight) >= PROXIMITY_THRESHOLD;
        }

        if (isClose) {
          // Run face recognition
          let result: { name: string; confidence: number } | null = null;
          try {
            const { loadFaceModels, recognizeFace } = await import("./faceRecognition");
            await loadFaceModels();
            result = await recognizeFace(video);
          } catch (_) {}

          // Show live badge with confidence
          const badgeText = result
            ? `✓ ${result.name} (${result.confidence}%)`
            : "Detected ✓";
          if (canvasRef?.current) {
            drawDetectionOverlay(canvasRef.current, video, person, true, badgeText);
          }

          // Build recognition buffer — require consensus before triggering approach
          if (!isPresent) {
            recogPollCount++;
            recogBuffer.push(result?.name ?? null);
            if (recogBuffer.length > RECOG_BUFFER_SIZE) recogBuffer.shift();

            const allAgree =
              recogBuffer.length === RECOG_BUFFER_SIZE &&
              recogBuffer.every((n) => n === recogBuffer[0]);
            const timedOut = recogPollCount >= RECOG_MAX_POLLS;

            if (allAgree || timedOut) {
              const confirmedName = getMajority(recogBuffer);
              resetRecogBuffer();
              markPresent(confirmedName);
            }
          }
        } else {
          if (canvasRef?.current) {
            drawDetectionOverlay(canvasRef.current, video, person ?? null, false, null);
          }
          if (!isClose) resetRecogBuffer();
          markAbsent();
        }
      } catch (_) {}

      schedulePoll();
    }

    async function init() {
      try {
        const tf = await import("@tensorflow/tfjs");
        await tf.setBackend("webgl");
        await tf.ready();
        const cocoSsd = await import("@tensorflow-models/coco-ssd");
        if (!active) return;
        model = await (cocoSsd as any).load();
        if (!active) return;
        onModelReadyRef.current?.();
        schedulePoll();
      } catch (e) {
        console.warn("[PersonDetection] WebGL failed, trying CPU backend:", e);
        try {
          const tf = await import("@tensorflow/tfjs");
          await tf.setBackend("cpu");
          await tf.ready();
          const cocoSsd = await import("@tensorflow-models/coco-ssd");
          if (!active) return;
          model = await (cocoSsd as any).load();
          if (!active) return;
          onModelReadyRef.current?.();
          schedulePoll();
        } catch (e2) {
          console.warn("[PersonDetection] Failed to load model:", e2);
        }
      }
    }

    init();

    return () => {
      active = false;
      if (pollTimer) clearTimeout(pollTimer);
      if (leaveTimer) clearTimeout(leaveTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef, canvasRef]);
}
