import logging
import os
from dotenv import load_dotenv
from PIL import Image
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, WorkerType, cli
from livekit.plugins import hedra, openai, elevenlabs, deepgram, silero

# Load env
load_dotenv(".env.local")

logger = logging.getLogger("emirati-ai")
logger.setLevel(logging.INFO)

def build_room_input_options():
    try:
        from livekit.agents import RoomInputOptions
    except Exception:
        return None
    
    ann = getattr(RoomInputOptions, "__annotations__", {}) or {}
    kwargs = {}
    
    if "close_on_disconnect" in ann:
        kwargs["close_on_disconnect"] = True
    
    if "interrupt_speech" in ann:
        kwargs["interrupt_speech"] = True
    elif "allow_interruptions" in ann:
        kwargs["allow_interruptions"] = True
    elif "enable_interruption" in ann:
        kwargs["enable_interruption"] = True
    elif "enable_interruptions" in ann:
        kwargs["enable_interruptions"] = True
    
    if "min_end_of_speech_delay" in ann:
        kwargs["min_end_of_speech_delay"] = 0.1
    
    try:
        return RoomInputOptions(**kwargs) if kwargs else RoomInputOptions()
    except Exception:
        return None

async def entrypoint(ctx: JobContext):
    await ctx.connect()
    
    # OPTIMIZED SESSION - Arabic primary with LLM-based multilingual support
    session = AgentSession(
        preemptive_generation=True,
        llm=openai.LLM(
            model="gpt-4o-mini",
            temperature=0.7,
        ),
        tts=elevenlabs.TTS(
            voice_id="TlKDNWnTobzVS4SXWTDi",
        ),
        stt=deepgram.STT(
            model="nova-3",
            language="ar",  # Arabic primary - will still capture English/French words
        ),
        vad=silero.VAD.load(
            activation_threshold=0.25,
            min_speech_duration=0.1,
            min_silence_duration=0.2,
            prefix_padding_duration=0.1,
            sample_rate=16000,
        ),
    )
    
    avatar_path = os.path.join(os.path.dirname(__file__), "avatar.jpg")
    if not os.path.exists(avatar_path):
        raise FileNotFoundError(f"Avatar not found: {avatar_path}")
    
    logger.info(f"Loading Emirati AI avatar from {avatar_path}")
    avatar_image = Image.open(avatar_path)
    hedra_avatar = hedra.AvatarSession(avatar_image=avatar_image)
    
    await hedra_avatar.start(session, room=ctx.room)
    
    room_input_options = build_room_input_options()
    start_kwargs = dict(
        agent=Agent(
            instructions=(
                "You are Emirati AI, an AI assistant from Abu Dhabi, UAE. "
                "You speak Arabic, English, and French fluently. "
                "ALWAYS detect the user's language from their message and respond in that SAME language. "
                "If they speak Arabic, respond ONLY in Arabic. "
                "If they speak English, respond ONLY in English. "
                "If they speak French, respond ONLY in French. "
                "CRITICAL: Keep ALL responses under 20 words maximum. "
                "Be concise, warm, and helpful."
            )
        ),
        room=ctx.room,
    )
    
    if room_input_options is not None:
        start_kwargs["room_input_options"] = room_input_options
    
    await session.start(**start_kwargs)
    
    session.generate_reply(
        instructions="Greet warmly in Arabic: 'مرحباً! أنا الذكاء الاصطناعي الإماراتي. كيف يمكنني مساعدتك؟'"
    )

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, worker_type=WorkerType.ROOM))
