import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "HEYGEN_API_KEY not set" }, { status: 500 });
  }

  const resp = await fetch("https://api.heygen.com/v1/streaming.create_token", {
    method: "POST",
    headers: { "x-api-key": apiKey },
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error("[heygen-token] Error:", resp.status, text);
    return NextResponse.json({ error: "Failed to get HeyGen token" }, { status: resp.status });
  }

  const data = await resp.json();
  return NextResponse.json({ token: data.data.token });
}
