"use client";

import { RefObject, useEffect, useRef } from "react";

const PROXIMITY_THRESHOLD = 0.06;
const CONFIDENCE_MIN = 0.45;
const POLL_MS = 300; // fast polling for snappy detection
const LEAVE_TIMEOUT_MS = 10_000;

interface Options {
  onApproach: () => void;
  onLeave: () => void;
  onModelReady?: () => void;
  canvasRef?: RefObject<HTMLCanvasElement>;
}

// Draw gold corner-bracket overlay + badge on the canvas
function drawDetectionOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  prediction: any | null,
  isClose: boolean
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
  const x = bx * sx;
  const y = by * sy;
  const w = bw * sx;
  const h = bh * sy;
  const cl = Math.min(24, w * 0.18, h * 0.18); // corner length

  const color = isClose ? "#D4AF37" : "rgba(255,255,255,0.5)";
  ctx.strokeStyle = color;
  ctx.lineWidth = isClose ? 3 : 2;
  ctx.lineCap = "round";

  // Corner brackets
  const segs: [number, number, number, number, number, number][] = [
    [x,         y + cl,     x,     y,         x + cl, y        ], // TL
    [x + w - cl, y,         x + w, y,         x + w,  y + cl   ], // TR
    [x,         y + h - cl, x,     y + h,     x + cl, y + h    ], // BL
    [x + w - cl, y + h,     x + w, y + h,     x + w,  y + h - cl], // BR
  ];

  for (const [x1, y1, x2, y2, x3, y3] of segs) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.stroke();
  }

  // "Detected" gold badge above the box
  if (isClose) {
    const text = "تم الكشف ✓";
    ctx.font = "bold 13px system-ui, sans-serif";
    const tw = ctx.measureText(text).width + 16;
    const bx2 = x;
    const by2 = Math.max(2, y - 28);
    ctx.fillStyle = "#D4AF37";
    ctx.fillRect(bx2, by2, tw, 24);
    ctx.fillStyle = "#001F3F";
    ctx.fillText(text, bx2 + 8, by2 + 16);
  }
}

export function usePersonDetection(
  videoRef: RefObject<HTMLVideoElement>,
  { onApproach, onLeave, onModelReady, canvasRef }: Options
) {
  // Keep latest callbacks in refs so the detection loop always calls the current version
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

    function schedulePoll() {
      if (!active) return;
      pollTimer = setTimeout(poll, POLL_MS);
    }

    function markPresent() {
      if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
      if (!isPresent) { isPresent = true; onApproachRef.current(); }
    }

    function markAbsent() {
      if (!isPresent || leaveTimer) return;
      leaveTimer = setTimeout(() => {
        if (!active) return;
        isPresent = false;
        leaveTimer = null;
        // Clear canvas when person leaves
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

        // Draw overlay directly on canvas (no React state update needed)
        if (canvasRef?.current) {
          drawDetectionOverlay(canvasRef.current, video, person ?? null, isClose);
        }

        if (isClose) markPresent();
        else markAbsent();
      } catch (_) {}

      schedulePoll();
    }

    async function init() {
      try {
        await import("@tensorflow/tfjs");
        const cocoSsd = await import("@tensorflow-models/coco-ssd");
        if (!active) return;
        model = await (cocoSsd as any).load();
        console.log("[PersonDetection] Model ready");
        if (!active) return;
        onModelReadyRef.current?.();
        schedulePoll();
      } catch (e) {
        console.warn("[PersonDetection] Failed to load model:", e);
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
