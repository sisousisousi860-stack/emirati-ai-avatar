"""
LiveKit voice-AI agent — STT + LLM only.

Audio pipeline:  mic → Deepgram STT → GPT-4o-mini → ElevenLabs TTS
Avatar lip-sync is handled on the frontend via LiveAvatar streaming SDK.
"""
import logging
from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, WorkerType, cli
from livekit.plugins import deepgram, openai, elevenlabs, silero

load_dotenv(".env.local")

logger = logging.getLogger("emirati-ai")
logger.setLevel(logging.INFO)


async def entrypoint(ctx: JobContext):
    await ctx.connect()
    logger.info("Connected to LiveKit room")

    session = AgentSession(
        stt=deepgram.STT(model="nova-3", language="ar"),
        llm=openai.LLM(model="gpt-4o-mini", temperature=0.7),
        tts=elevenlabs.TTS(
            voice_id="TlKDNWnTobzVS4SXWTDi",
            model="eleven_multilingual_v2",
        ),
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
            "CRITICAL: You ALWAYS respond in Arabic by default.\n"
            "Use Modern Standard Arabic with a warm Gulf/Emirati tone.\n"
            "Keep responses concise (2-4 sentences) for TTS playback.\n\n"
            "You speak Arabic, English, and French fluently.\n"
            "Be warm, professional, and helpful."
        )
    )

    logger.info("Starting agent session...")
    await session.start(agent=agent, room=ctx.room)
    logger.info("Agent session started!")

    # Arabic greeting
    session.generate_reply(
        instructions=(
            "Greet warmly in Arabic: "
            "'مرحباً! أنا الذكاء الاصطناعي الإماراتي من أوركس إيه آي سوليوشنز. "
            "كيف يمكنني مساعدتك اليوم؟'"
        )
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, worker_type=WorkerType.ROOM))
