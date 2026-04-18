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
  console.log("[liveavatar-token] Response keys:", JSON.stringify(Object.keys(data)));
  const token = data?.data?.session_token ?? data?.session_token ?? data?.token;
  if (!token) {
    console.error("[liveavatar-token] No token found in response:", JSON.stringify(data).slice(0, 500));
    return NextResponse.json({ error: "No token in API response", raw: data }, { status: 502 });
  }
  return NextResponse.json({ token });
}
