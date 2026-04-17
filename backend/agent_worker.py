"""
LiveKit voice-AI agent — STT + LLM only.

Audio pipeline:  mic → Deepgram STT → GPT-4o-mini → text sent to frontend
The frontend calls HeyGen avatar.speak() with the LLM response text.
HeyGen handles TTS (via integrated ElevenLabs) + lip-sync rendering.
"""
import asyncio
import json
import logging
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, WorkerType, cli
from livekit.plugins import deepgram, openai, silero

load_dotenv(".env.local")

logger = logging.getLogger("emirati-ai")
logger.setLevel(logging.INFO)


async def entrypoint(ctx: JobContext):
    await ctx.connect()
    logger.info("✓ Connected to LiveKit room")

    session = AgentSession(
        stt=deepgram.STT(model="nova-3", language="ar"),
        llm=openai.LLM(model="gpt-4o-mini", temperature=0.7),
        vad=silero.VAD.load(
            activation_threshold=0.25,
            min_speech_duration=0.1,
            min_silence_duration=0.2,
            prefix_padding_duration=0.1,
            sample_rate=16000,
        ),
    )

    agent = Agent(
        instructions=(
            "You are Emirati AI, the official AI assistant for OryxAI Solutions, "
            "a leading AI technology company based in Abu Dhabi, UAE.\n\n"
            "CRITICAL: You ALWAYS respond in Arabic by default — this is an Arabic-first kiosk.\n"
            "Use Modern Standard Arabic with a warm Gulf/Emirati tone.\n"
            "Keep responses concise (2-4 sentences) for TTS playback.\n\n"
            "You speak Arabic, English, and French fluently.\n"
            "Be warm, professional, and helpful."
        )
    )

    # Forward LLM responses to frontend via data channel for HeyGen to speak
    @session.on("conversation_item_added")
    def _on_item(ev):
        try:
            item = getattr(ev, "item", None) or ev
            role = getattr(item, "role", None)
            text = getattr(item, "text_content", None) or getattr(item, "content", None)
            if role == "assistant" and text and isinstance(text, str) and len(text.strip()) > 0:
                payload = json.dumps({"type": "llm_response", "text": text})
                asyncio.create_task(
                    ctx.room.local_participant.publish_data(
                        payload.encode("utf-8"), reliable=True
                    )
                )
                logger.info(f"Sent LLM response to frontend ({len(text)} chars)")
        except Exception as e:
            logger.warning(f"Failed to forward LLM response: {e}")

    logger.info("Starting agent session (STT + LLM only, no TTS)...")
    await session.start(agent=agent, room=ctx.room)
    logger.info("✓ Agent session started!")

    # Send initial greeting via data channel (frontend will call HeyGen speak)
    greeting = (
        "مرحباً! أنا الذكاء الاصطناعي الإماراتي من أوركس إيه آي سوليوشنز. "
        "كيف يمكنني مساعدتك اليوم؟"
    )
    payload = json.dumps({"type": "llm_response", "text": greeting})
    await ctx.room.local_participant.publish_data(
        payload.encode("utf-8"), reliable=True
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, worker_type=WorkerType.ROOM))
