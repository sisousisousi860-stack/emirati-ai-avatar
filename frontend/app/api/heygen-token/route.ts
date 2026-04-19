import { NextResponse } from "next/server";

const AVATAR_ID = "0930fd59-c8ad-434d-ad53-b391a1768720";
const VOICE_ID = "997f0279afba4e1998e89d90becca013";

export async function POST() {
  const apiKey = process.env.LIVEAVATAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "LIVEAVATAR_API_KEY not set" }, { status: 500 });
  }

  const resp = await fetch("https://api.liveavatar.com/v1/sessions/token", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "FULL",
      avatar_id: AVATAR_ID,
      avatar_persona: {
        voice_id: VOICE_ID,
      },
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
