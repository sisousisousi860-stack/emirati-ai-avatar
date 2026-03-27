"use client";

import { useEffect, useRef, useState } from "react";
import {
  getRegisteredFaces,
  loadFaceModels,
  registerFace,
  removeRegisteredFace,
} from "@hooks/faceRecognition";

const PHOTO_GOAL = 10;
type Tab = "upload" | "webcam";

// Resize image to max 640×480 and normalize brightness if image is too dark
async function preprocessImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const maxW = 640, maxH = 480;
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);

      // Normalize brightness only if image is very dark
      const data = ctx.getImageData(0, 0, w, h);
      let sum = 0;
      for (let i = 0; i < data.data.length; i += 4) {
        sum += (data.data[i] + data.data[i + 1] + data.data[i + 2]) / 3;
      }
      const avg = sum / (data.data.length / 4);
      if (avg > 0 && avg < 70) {
        const factor = Math.min(110 / avg, 2.5);
        for (let i = 0; i < data.data.length; i += 4) {
          data.data[i]     = Math.min(255, data.data[i]     * factor);
          data.data[i + 1] = Math.min(255, data.data[i + 1] * factor);
          data.data[i + 2] = Math.min(255, data.data[i + 2] * factor);
        }
        ctx.putImageData(data, 0, 0);
      }

      const out = new Image();
      out.onload = () => { URL.revokeObjectURL(url); resolve(out); };
      out.src = canvas.toDataURL("image/jpeg", 0.92);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
    img.crossOrigin = "anonymous";
    img.src = url;
  });
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("upload");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const [faces, setFaces] = useState<{ name: string; count: number }[]>([]);
  const [modelReady, setModelReady] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processedImg, setProcessedImg] = useState<HTMLImageElement | null>(null);
  const [autoProgress, setAutoProgress] = useState<{ done: number; total: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const refreshFaces = async () => { setFaces(await getRegisteredFaces()); };

  useEffect(() => {
    loadFaceModels()
      .then(async () => { setModelReady(true); await refreshFaces(); })
      .catch((e) => console.error("Model load failed:", e));
  }, []);

  useEffect(() => {
    if (tab !== "webcam") return;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } })
      .then((s) => {
        stream = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
      })
      .catch(() => setStatus({ msg: "Camera unavailable", ok: false }));
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, [tab]);

  const handleCapture = async () => {
    if (!name.trim()) { setStatus({ msg: "Enter a name first", ok: false }); return; }
    if (!videoRef.current) return;
    setProcessing(true);
    setStatus({ msg: "Processing...", ok: true });
    const result = await registerFace(videoRef.current, name.trim());
    setProcessing(false);
    if (result === "ok") {
      setStatus({ msg: `✓ Photo added for "${name.trim()}"`, ok: true });
      refreshFaces();
    } else if (result === "no_face") {
      setStatus({ msg: "No face detected — look directly at the camera", ok: false });
    } else {
      setStatus({ msg: "Error — try again", ok: false });
    }
  };

  // Auto-capture 5 frames from live webcam with 800ms between each
  const handleAutoCapture = async () => {
    if (!name.trim()) { setStatus({ msg: "Enter a name first", ok: false }); return; }
    if (!videoRef.current) return;
    const FRAMES = 5;
    let ok = 0;
    setProcessing(true);
    setAutoProgress({ done: 0, total: FRAMES });
    setStatus({ msg: `Look straight at the camera — capturing ${FRAMES} frames...`, ok: true });
    for (let i = 0; i < FRAMES; i++) {
      await new Promise((r) => setTimeout(r, 800));
      const result = await registerFace(videoRef.current!, name.trim());
      if (result === "ok") ok++;
      setAutoProgress({ done: i + 1, total: FRAMES });
    }
    setProcessing(false);
    setAutoProgress(null);
    refreshFaces();
    if (ok > 0) {
      setStatus({ msg: `✓ ${ok}/${FRAMES} frames captured for "${name.trim()}" — these will match much better!`, ok: true });
    } else {
      setStatus({ msg: "No face detected in any frame — face the camera directly with good lighting", ok: false });
    }
  };

  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setStatus({ msg: "Please select an image file", ok: false });
      return;
    }
    setStatus({ msg: "Processing image...", ok: true });
    try {
      const img = await preprocessImageFile(file);
      setProcessedImg(img);
      setPreviewSrc(img.src);
      setStatus(null);
    } catch {
      setStatus({ msg: "Could not load image", ok: false });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleRegisterPhoto = async () => {
    if (!name.trim()) { setStatus({ msg: "Enter a name first", ok: false }); return; }
    if (!processedImg) { setStatus({ msg: "Upload a photo first", ok: false }); return; }
    setProcessing(true);
    setStatus({ msg: "Detecting face...", ok: true });
    const result = await registerFace(processedImg, name.trim());
    setProcessing(false);
    const updatedFaces = await getRegisteredFaces();
    setFaces(updatedFaces);
    if (result === "ok") {
      const count = updatedFaces.find((f: { name: string; count: number }) => f.name === name.trim())?.count ?? 0;
      setStatus({ msg: `✓ Photo ${count}/${PHOTO_GOAL} added for "${name.trim()}"`, ok: true });
      setPreviewSrc(null);
      setProcessedImg(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else if (result === "no_face") {
      setStatus({ msg: "No face detected — use a clear front-facing photo", ok: false });
    } else {
      setStatus({ msg: "Error processing photo. Try a different image.", ok: false });
    }
  };

  const handleRemove = async (faceName: string) => {
    if (confirm(`Remove "${faceName}" from known faces?`)) {
      await removeRegisteredFace(faceName);
      refreshFaces();
    }
  };

  return (
    <main className="min-h-screen text-white p-8"
      style={{ background: "linear-gradient(135deg, #0a0f1a 0%, #0f172a 100%)" }}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <a href="/" className="text-sm transition" style={{ color: "rgba(201,168,76,0.5)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#C9A84C")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(201,168,76,0.5)")}>
            ← Back to Kiosk
          </a>
          <h1 className="text-3xl font-bold mt-2" style={{ color: "#C9A84C" }}>Face Registration</h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            Register VIPs and guests — upload {PHOTO_GOAL} photos per person for best accuracy.
          </p>
        </div>

        {!modelReady ? (
          <div className="flex items-center gap-3" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#C9A84C" }} />
            Loading face recognition model...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* ── Left: Register ───────────────────────────────────────── */}
            <div className="space-y-4">
              <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                {(["upload", "webcam"] as Tab[]).map((t) => (
                  <button key={t} onClick={() => { setTab(t); setStatus(null); }}
                    className="flex-1 py-2.5 text-sm font-medium transition"
                    style={{
                      background: tab === t ? "#C9A84C" : "transparent",
                      color: tab === t ? "#0a0f1a" : "rgba(255,255,255,0.4)",
                    }}>
                    {t === "upload" ? "Upload Photo" : "Webcam Capture"}
                  </button>
                ))}
              </div>

              {tab === "upload" && (
                <>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    className="relative rounded-2xl border-2 border-dashed cursor-pointer transition flex flex-col items-center justify-center min-h-[220px]"
                    style={{
                      borderColor: dragOver ? "#C9A84C" : "rgba(255,255,255,0.15)",
                      background: dragOver ? "rgba(201,168,76,0.08)" : "rgba(0,0,0,0.2)",
                    }}
                  >
                    {previewSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img ref={imgRef} src={previewSrc} alt="Preview"
                        className="w-full object-contain rounded-2xl max-h-[300px]" />
                    ) : (
                      <div className="text-center p-8">
                        <p className="text-5xl mb-3">🖼️</p>
                        <p className="font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>Drop a photo here</p>
                        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>or click to browse</p>
                        <p className="text-xs mt-3" style={{ color: "rgba(255,255,255,0.15)" }}>JPG, PNG, WEBP — clear front-facing photo</p>
                      </div>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  {previewSrc && (
                    <button onClick={() => { setPreviewSrc(null); setProcessedImg(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                      className="text-xs transition" style={{ color: "rgba(255,255,255,0.25)" }}>
                      ✕ Remove photo
                    </button>
                  )}
                </>
              )}

              {tab === "webcam" && (
                <div className="relative rounded-2xl overflow-hidden aspect-video"
                  style={{ border: "1px solid rgba(201,168,76,0.2)", background: "#000" }}>
                  <video ref={videoRef} className="w-full h-full object-contain" muted playsInline
                    style={{ transform: "scaleX(-1)" }} />
                  <div className="absolute bottom-2 left-0 right-0 flex justify-center">
                    <span className="text-xs px-2 py-1 rounded-full"
                      style={{ background: "rgba(0,0,0,0.5)", color: "rgba(255,255,255,0.35)" }}>
                      Face the camera directly
                    </span>
                  </div>
                </div>
              )}

              <input type="text" placeholder="Full Name (e.g. Mohamed bin Zayed)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (tab === "webcam" ? handleCapture() : handleRegisterPhoto())}
                className="w-full rounded-xl px-4 py-3 text-white focus:outline-none"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
              />

              {tab === "webcam" ? (
                <div className="space-y-2">
                  <button
                    onClick={handleAutoCapture}
                    disabled={!name.trim() || processing}
                    className="w-full font-bold py-3 rounded-xl transition active:scale-[0.99]"
                    style={{
                      background: "#C9A84C", color: "#0a0f1a",
                      opacity: (!name.trim() || processing) ? 0.4 : 1,
                      cursor: (!name.trim() || processing) ? "not-allowed" : "pointer",
                    }}
                  >
                    {autoProgress ? `Capturing... ${autoProgress.done}/${autoProgress.total}` : "Auto-Capture 5 Frames ⚡"}
                  </button>

                  {autoProgress && (
                    <div className="w-full rounded-full h-1.5" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div className="h-1.5 rounded-full transition-all"
                        style={{ width: `${(autoProgress.done / autoProgress.total) * 100}%`, background: "#C9A84C" }} />
                    </div>
                  )}

                  <button
                    onClick={handleCapture}
                    disabled={!name.trim() || processing}
                    className="w-full py-2.5 rounded-xl text-sm transition"
                    style={{
                      border: "1px solid rgba(201,168,76,0.3)", color: "rgba(201,168,76,0.7)",
                      opacity: (!name.trim() || processing) ? 0.4 : 1,
                      cursor: (!name.trim() || processing) ? "not-allowed" : "pointer",
                    }}
                  >
                    Single Capture
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleRegisterPhoto}
                  disabled={!name.trim() || processing || !previewSrc}
                  className="w-full font-bold py-3 rounded-xl transition active:scale-[0.99]"
                  style={{
                    background: "#C9A84C", color: "#0a0f1a",
                    opacity: (!name.trim() || processing || !previewSrc) ? 0.4 : 1,
                    cursor: (!name.trim() || processing || !previewSrc) ? "not-allowed" : "pointer",
                  }}
                >
                  {processing ? "Processing..." : "Register This Photo"}
                </button>
              )}

              {status && (
                <p className="text-sm" style={{ color: status.ok ? "#C9A84C" : "#f87171" }}>
                  {status.msg}
                </p>
              )}

              <div className="text-xs rounded-xl p-3 space-y-1"
                style={{ border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.25)" }}>
                <p className="font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>Tips for best results:</p>
                <p>• Upload {PHOTO_GOAL} different photos per person</p>
                <p>• Use clear, well-lit front-facing photos</p>
                <p>• Vary angles slightly: straight, slight left, slight right</p>
                <p>• Headshots or passport-style photos work great</p>
                <p>• Avoid sunglasses or masks</p>
              </div>
            </div>

            {/* ── Right: Registered People ─────────────────────────────── */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">
                Registered People
                <span className="ml-2 text-sm font-normal" style={{ color: "rgba(255,255,255,0.3)" }}>
                  ({faces.length} {faces.length === 1 ? "person" : "people"})
                </span>
              </h2>

              {faces.length === 0 ? (
                <div className="rounded-2xl p-10 text-center" style={{ border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.25)" }}>
                  <p className="text-4xl mb-3">👤</p>
                  <p>No faces registered yet</p>
                  <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.15)" }}>
                    Upload {PHOTO_GOAL} photos per person for best accuracy
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {faces.map((f) => {
                    const pct = Math.min(100, Math.round((f.count / PHOTO_GOAL) * 100));
                    const complete = f.count >= PHOTO_GOAL;
                    return (
                      <div key={f.name} className="rounded-xl px-4 py-3 space-y-2"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg"
                              style={{
                                background: "rgba(201,168,76,0.15)",
                                border: "1px solid rgba(201,168,76,0.3)",
                                color: "#C9A84C",
                              }}>
                              {f.name.charAt(0).toUpperCase()}
                            </span>
                            <div>
                              <p className="font-medium">{f.name}</p>
                              <p className="text-xs" style={{ color: complete ? "rgba(74,222,128,0.7)" : "rgba(255,255,255,0.35)" }}>
                                {f.count}/{PHOTO_GOAL} photos
                                {!complete && ` — ${PHOTO_GOAL - f.count} more recommended`}
                                {complete && " ✓ Optimal"}
                              </p>
                            </div>
                          </div>
                          <button onClick={() => handleRemove(f.name)}
                            className="text-sm px-2 py-1 rounded transition"
                            style={{ color: "rgba(255,255,255,0.25)" }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
                            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}>
                            Remove
                          </button>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full rounded-full h-1.5" style={{ background: "rgba(255,255,255,0.08)" }}>
                          <div className="h-1.5 rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: complete ? "rgba(74,222,128,0.6)" : "#C9A84C",
                            }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {faces.length > 0 && (
                <p className="text-xs rounded-xl p-3" style={{ border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.25)" }}>
                  Face data is stored locally on this device. It will persist across page reloads but is device-specific.
                </p>
              )}
            </div>

          </div>
        )}
      </div>
    </main>
  );
}
