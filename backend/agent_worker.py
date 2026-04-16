import asyncio
import json
import logging
import os
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    WorkerType,
    cli,
    llm as llm_mod,
)
from livekit.plugins import deepgram, openai, silero

from heygen_liveavatar import HeyGenClient

load_dotenv(".env.local")

logger = logging.getLogger("emirati-ai")
logger.setLevel(logging.INFO)


async def entrypoint(ctx: JobContext):
    await ctx.connect()
    logger.info("✓ Connected to LiveKit room")

    avatar_id = os.getenv("HEYGEN_AVATAR_ID")
    voice_id = os.getenv("HEYGEN_VOICE_ID")
    if not avatar_id:
        raise RuntimeError("HEYGEN_AVATAR_ID is not set")

    heygen = HeyGenClient()
    session_info: dict | None = None

    try:
        # ── Start HeyGen streaming session ────────────────────────────────
        logger.info("Creating HeyGen streaming session...")
        session_info = await heygen.create_session(
            avatar_id=avatar_id, voice_id=voice_id, quality="medium"
        )
        session_id = session_info["session_id"]
        await heygen.start_session(session_id)
        logger.info(f"✓ HeyGen session started: {session_id}")

        # ── Publish HeyGen session info to frontend via data channel ──────
        payload = json.dumps(
            {
                "type": "heygen",
                "session_id": session_id,
                "url": session_info.get("url"),
                "access_token": session_info.get("access_token"),
            }
        )
        await ctx.room.local_participant.publish_data(
            payload.encode("utf-8"), reliable=True
        )

        # ── Keep HeyGen session alive in background ───────────────────────
        async def keep_alive_loop():
            while True:
                try:
                    await asyncio.sleep(25)
                    await heygen.keep_alive(session_id)
                except Exception as e:
                    logger.warning(f"keep_alive failed: {e}")
                    break

        keep_alive_task = asyncio.create_task(keep_alive_loop())

        # ── Build voice AI pipeline (no TTS — HeyGen speaks) ──────────────
        session = AgentSession(
            stt=deepgram.STT(model="nova-3", language="ar"),
            llm=openai.LLM(model="gpt-4o-mini", temperature=0.7),
            vad=silero.VAD.load(
                activation_threshold=0.25,
                min_speech_duration=0.1,
            ),
        )

        agent = Agent(
            instructions=(
                "You are Emirati AI, the official AI assistant for OryxAI Solutions in Abu Dhabi, UAE. "
                "You speak Arabic, English, and French fluently. "
                "Respond in the user's language in 2–4 sentences. "
                "Be warm, professional, and helpful."
            )
        )

        # ── Forward every final LLM response to HeyGen to be spoken ───────
        @session.on("agent_state_changed")
        def _on_state(_ev):
            pass

        @session.on("conversation_item_added")
        def _on_item(ev):
            try:
                item = getattr(ev, "item", None) or ev
                role = getattr(item, "role", None)
                text = getattr(item, "text_content", None) or getattr(item, "content", None)
                if role == "assistant" and text and isinstance(text, str):
                    asyncio.create_task(heygen.speak(session_id, text))
            except Exception as e:
                logger.warning(f"speak dispatch failed: {e}")

        logger.info("Starting agent session...")
        await session.start(agent=agent, room=ctx.room)
        logger.info("✓ Agent session started!")

        # Initial Arabic greeting
        greeting = (
            "مرحباً! أنا الذكاء الاصطناعي الإماراتي من أوركس إيه آي سوليوشنز. "
            "كيف يمكنني مساعدتك اليوم؟"
        )
        await heygen.speak(session_id, greeting)

        # Block until room disconnects
        disconnected = asyncio.Event()

        @ctx.room.on("disconnected")
        def _on_disc(_reason):
            disconnected.set()

        await disconnected.wait()
        keep_alive_task.cancel()

    finally:
        if session_info:
            try:
                await heygen.stop_session(session_info["session_id"])
                logger.info("HeyGen session stopped")
            except Exception as e:
                logger.warning(f"stop_session failed: {e}")
        await heygen.close()


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, worker_type=WorkerType.ROOM))
