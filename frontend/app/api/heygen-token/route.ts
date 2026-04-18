import { NextResponse } from "next/server";

export async function POST() {
  const apiKey = process.env.LIVEAVATAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "LIVEAVATAR_API_KEY not set" }, { status: 500 });
  }

  const resp = await fetch("https://api.liveavatar.com/v1/sessions/token", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error("[liveavatar-token] Error:", resp.status, text);
    return NextResponse.json({ error: "Failed to get session token" }, { status: resp.status });
  }

  const data = await resp.json();
  return NextResponse.json({ token: data.data.session_token });
}
