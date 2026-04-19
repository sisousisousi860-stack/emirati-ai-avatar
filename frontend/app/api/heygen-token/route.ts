import { NextResponse } from "next/server";

export async function POST() {
  const apiKey = process.env.LIVEAVATAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "LIVEAVATAR_API_KEY not set" }, { status: 500 });
  }

  const resp = await fetch("https://api.liveavatar.com/v1/sessions/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({
      avatar_id: "0930fd59-c8ad-434d-ad53-b391a1768720",
      avatar_persona: {
        voice_id: "997f0279afba4e1998e89d90becca013",
        language: "ar",
        voice_settings: {
          provider: "elevenLabs",
          speed: 1,
          stability: 0.75,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
          model: "eleven_multilingual_v2",
        },
      },
      mode: "FULL",
      is_sandbox: false,
      video_settings: {
        quality: "high",
        encoding: "H264",
      },
      interactivity_type: "CONVERSATIONAL",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error("[liveavatar-token] Error:", resp.status, text);
    return NextResponse.json(
      { error: "Failed to get session token", detail: text },
      { status: resp.status }
    );
  }

  const data = await resp.json();
  return NextResponse.json({ token: data.data.session_token });
}
