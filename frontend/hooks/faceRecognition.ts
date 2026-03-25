"use client";

// Models served locally from /public/face-models (no CDN dependency)
const MODELS_URL = "/face-models";
const STORAGE_KEY = "emirati-ai-known-faces";

let modelsLoaded = false;
let faceapi: any = null;

interface StoredFace {
  name: string;
  descriptors: number[][];
}

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  const fa = await import("face-api.js");
  faceapi = fa;
  await Promise.all([
    fa.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
    fa.nets.faceLandmark68TinyNet.loadFromUri(MODELS_URL),
    fa.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
  ]);
  modelsLoaded = true;
}

export async function registerFace(
  element: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  name: string
): Promise<"ok" | "no_face" | "error"> {
  try {
    if (!modelsLoaded || !faceapi) await loadFaceModels();

    const detection = await faceapi
      .detectSingleFace(element, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!detection) return "no_face";

    const stored: StoredFace[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    const existing = stored.find((f) => f.name === name);

    if (existing) {
      existing.descriptors.push(Array.from(detection.descriptor));
    } else {
      stored.push({ name, descriptors: [Array.from(detection.descriptor)] });
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return "ok";
  } catch (e) {
    console.error("[FaceRecognition] registerFace error:", e);
    return "error";
  }
}

// Returns { name, confidence (0-100) } or null if unknown
export async function recognizeFace(
  video: HTMLVideoElement
): Promise<{ name: string; confidence: number } | null> {
  if (!modelsLoaded || !faceapi) return null;
  if (video.readyState < 2 || video.videoWidth === 0) return null;

  const stored: StoredFace[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  if (stored.length === 0) return null;

  try {
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!detection) return null;

    const labeledDescriptors = stored.map(
      (f) =>
        new faceapi.LabeledFaceDescriptors(
          f.name,
          f.descriptors.map((d: number[]) => new Float32Array(d))
        )
    );

    // Threshold 0.45 — lower = stricter match required
    const matcher = new faceapi.FaceMatcher(labeledDescriptors, 0.45);
    const match = matcher.findBestMatch(detection.descriptor);

    if (match.label !== "unknown") {
      const confidence = Math.round((1 - match.distance) * 100);
      return { name: match.label, confidence };
    }
    return null;
  } catch {
    return null;
  }
}

export function getRegisteredFaces(): { name: string; count: number }[] {
  const stored: StoredFace[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  return stored.map((f) => ({ name: f.name, count: f.descriptors.length }));
}

export function removeRegisteredFace(name: string): void {
  const stored: StoredFace[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored.filter((f) => f.name !== name)));
}
