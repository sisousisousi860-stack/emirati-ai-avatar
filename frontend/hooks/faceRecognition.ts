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
  console.log("[FACE] Loading face models from", MODELS_URL);
  const fa = await import("@vladmandic/face-api");
  faceapi = fa;
  await Promise.all([
    fa.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
    fa.nets.faceLandmark68TinyNet.loadFromUri(MODELS_URL),
    fa.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
  ]);
  modelsLoaded = true;
  console.log("[FACE] Models loaded OK");
}

export async function registerFace(
  element: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  name: string
): Promise<"ok" | "no_face" | "error"> {
  try {
    if (!modelsLoaded || !faceapi) await loadFaceModels();

    console.log("[ADMIN] Computing descriptor for:", name);
    const detection = await faceapi
      .detectSingleFace(element, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!detection) {
      console.warn("[ADMIN] No face detected in image");
      return "no_face";
    }

    console.log("[ADMIN] Descriptor computed:", detection.descriptor?.length === 128 ? "YES (128-dim)" : "FAILED", "score:", detection.detection?.score?.toFixed(3));

    const stored: StoredFace[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    const existing = stored.find((f) => f.name === name);

    if (existing) {
      existing.descriptors.push(Array.from(detection.descriptor));
    } else {
      stored.push({ name, descriptors: [Array.from(detection.descriptor)] });
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const saved = localStorage.getItem(STORAGE_KEY)!;
    const totalPhotos = stored.find(f => f.name === name)?.descriptors.length ?? 0;
    console.log("[ADMIN] Saved OK —", name, "now has", totalPhotos, "descriptors, storage size:", (saved.length / 1024).toFixed(1), "KB");
    return "ok";
  } catch (e) {
    console.error("[ADMIN] registerFace error:", e);
    return "error";
  }
}

// Returns { name, confidence (0-100) } or null if unknown
export async function recognizeFace(
  video: HTMLVideoElement
): Promise<{ name: string; confidence: number } | null> {
  if (!modelsLoaded || !faceapi) {
    console.log("[FACE] recognizeFace called but models not loaded yet");
    return null;
  }
  if (video.readyState < 2 || video.videoWidth === 0) return null;

  const stored: StoredFace[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  console.log("[FACE] Storage key:", STORAGE_KEY, "| People registered:", stored.length,
    stored.map(f => `${f.name}(${f.descriptors.length})`).join(", ") || "NONE");

  if (stored.length === 0) {
    console.warn("[FACE] No registered faces — go to /admin to register");
    return null;
  }

  try {
    console.log("[FACE] Running face detection on video frame...");
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!detection) {
      console.log("[FACE] No face descriptor found in current frame");
      return null;
    }

    console.log("[FACE] Detection score:", detection.detection?.score?.toFixed(3), "| Descriptor:", detection.descriptor?.length === 128 ? "128-dim OK" : "MISSING");

    const labeledDescriptors = stored.map(
      (f) =>
        new faceapi.LabeledFaceDescriptors(
          f.name,
          f.descriptors.map((d: number[]) => new Float32Array(d))
        )
    );

    // Threshold 0.6 — good for kiosk/webcam with varying lighting
    const matcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
    const match = matcher.findBestMatch(detection.descriptor);

    console.log("[FACE] Best match:", match.label, "| distance:", match.distance.toFixed(3), "| threshold: 0.45 |", match.distance < 0.45 ? "MATCHED ✓" : "NO MATCH ✗");

    if (match.label !== "unknown") {
      const confidence = Math.round((1 - match.distance) * 100);
      return { name: match.label, confidence };
    }
    return null;
  } catch (e) {
    console.error("[FACE] recognizeFace error:", e);
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
