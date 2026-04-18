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
      avatar_id: AVATAR_ID,
      voice_id: VOICE_ID,
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
  console.log("[liveavatar-token] Response:", JSON.stringify(data).slice(0, 300));
  const token = data?.data?.session_token ?? data?.session_token ?? data?.token;
  if (!token) {
    console.error("[liveavatar-token] No token in response:", JSON.stringify(data).slice(0, 500));
    return NextResponse.json({ error: "No token in API response", raw: data }, { status: 502 });
  }
  return NextResponse.json({ token });
}
