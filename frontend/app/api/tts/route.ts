import { NextRequest, NextResponse } from "next/server";

const VOICE_ID = "TlKDNWnTobzVS4SXWTDi";
const MODEL_ID = "eleven_multilingual_v2";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ELEVENLABS_API_KEY not set" }, { status: 500 });
  }

  const { text } = await req.json();
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("[tts] ElevenLabs error:", resp.status, errText);
    return NextResponse.json({ error: "TTS failed" }, { status: resp.status });
  }

  const audioBuffer = await resp.arrayBuffer();
  const base64 = Buffer.from(audioBuffer).toString("base64");
  return NextResponse.json({ audio: base64 });
}
