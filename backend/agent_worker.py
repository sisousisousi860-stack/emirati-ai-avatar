import logging
import os
from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, WorkerType, cli
from livekit.plugins import tavus, deepgram, openai, elevenlabs, silero

load_dotenv(".env.local")

logger = logging.getLogger("emirati-ai")
logger.setLevel(logging.INFO)

async def entrypoint(ctx: JobContext):
    await ctx.connect()
    logger.info("✓ Connected to LiveKit room")

    # Build voice AI pipeline
    session = AgentSession(
        stt=deepgram.STT(model="nova-3", language="ar"),
        llm=openai.LLM(model="gpt-4o-mini", temperature=0.7),
        tts=elevenlabs.TTS(
            voice_id="TlKDNWnTobzVS4SXWTDi",
            model="eleven_turbo_v2"
        ),
        vad=silero.VAD.load(
            activation_threshold=0.25,
            min_speech_duration=0.1,
        ),
    )

    # Create agent with instructions
    agent = Agent(
        instructions=(
            "You are Emirati AI, the official AI assistant for OryxAI Solutions in Abu Dhabi, UAE. "
            "You speak Arabic, English, and French fluently. "
            "Respond in the user's language in 2-4 sentences. "
            "Be warm, professional, and helpful."
        )
    )

    # Create Tavus avatar
    logger.info("Creating Tavus avatar...")
    avatar = tavus.AvatarSession(
        replica_id=os.getenv("TAVUS_REPLICA_ID"),
        persona_id=os.getenv("TAVUS_PERSONA_ID"),
    )

    # Start Tavus FIRST
    logger.info("Starting Tavus avatar...")
    await avatar.start(session, room=ctx.room)
    logger.info("✓ Tavus avatar started!")

    # Start agent session WITH the agent parameter
    logger.info("Starting agent session...")
    await session.start(
        agent=agent,
        room=ctx.room,
    )
    logger.info("✓ Agent session started!")

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
