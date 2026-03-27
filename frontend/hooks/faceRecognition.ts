"use client";

const MODELS_URL = "/face-models";

let modelsLoaded = false;
let faceapi: any = null;

// In-memory cache so we don't hit the DB on every 300ms poll
let cachedFaces: { name: string; descriptors: number[][] }[] = [];
let cacheExpiry = 0;
const CACHE_TTL_MS = 30_000; // refresh from DB every 30 seconds

async function getFaces(): Promise<{ name: string; descriptors: number[][] }[]> {
  if (Date.now() < cacheExpiry && cachedFaces.length > 0) return cachedFaces;
  try {
    const res = await fetch("/api/faces");
    cachedFaces = await res.json();
    cacheExpiry = Date.now() + CACHE_TTL_MS;
  } catch {
    // Keep stale cache on network error
  }
  return cachedFaces;
}

function invalidateCache() {
  cacheExpiry = 0;
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

    console.log("[ADMIN] Descriptor:", detection.descriptor?.length === 128 ? "128-dim OK" : "FAILED", "score:", detection.detection?.score?.toFixed(3));

    const descriptor = Array.from(detection.descriptor) as number[];
    const res = await fetch("/api/faces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, descriptor }),
    });

    if (!res.ok) throw new Error("API save failed");

    invalidateCache();
    console.log("[ADMIN] Saved to database OK");
    return "ok";
  } catch (e) {
    console.error("[ADMIN] registerFace error:", e);
    return "error";
  }
}

export async function recognizeFace(
  video: HTMLVideoElement
): Promise<{ name: string; confidence: number } | null> {
  if (!modelsLoaded || !faceapi) return null;
  if (video.readyState < 2 || video.videoWidth === 0) return null;

  const stored = await getFaces();
  if (stored.length === 0) return null;

  try {
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!detection) return null;

    console.log("[FACE] Detection score:", detection.detection?.score?.toFixed(3));

    const labeledDescriptors = stored.map(
      (f) =>
        new faceapi.LabeledFaceDescriptors(
          f.name,
          f.descriptors.map((d: number[]) => new Float32Array(d))
        )
    );

    const matcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
    const match = matcher.findBestMatch(detection.descriptor);

    console.log("[FACE] Match:", match.label, "distance:", match.distance.toFixed(3), match.distance < 0.6 ? "✓" : "✗");

    if (match.label !== "unknown") {
      return { name: match.label, confidence: Math.round((1 - match.distance) * 100) };
    }
    return null;
  } catch (e) {
    console.error("[FACE] recognizeFace error:", e);
    return null;
  }
}

export async function getRegisteredFaces(): Promise<{ name: string; count: number }[]> {
  const stored = await getFaces();
  return stored.map((f) => ({ name: f.name, count: f.descriptors.length }));
}

export async function removeRegisteredFace(name: string): Promise<void> {
  await fetch("/api/faces", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  invalidateCache();
}
