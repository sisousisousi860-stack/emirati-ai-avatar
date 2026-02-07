import logging
import os
from dotenv import load_dotenv
from PIL import Image

from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, WorkerType, cli
from livekit.plugins import hedra, openai, elevenlabs, silero

# Load env
load_dotenv(".env.local")

logger = logging.getLogger("emirati-ai")
logger.setLevel(logging.INFO)


def build_room_input_options():
    """
    LiveKit Agents has changed option names across versions.
    This builds RoomInputOptions safely (only with fields that exist),
    enabling user interruption ("barge-in") when possible.
    """
    try:
        from livekit.agents import RoomInputOptions  # type: ignore
    except Exception:
        return None

    ann = getattr(RoomInputOptions, "__annotations__", {}) or {}
    kwargs = {}

    # keep existing default behavior
    if "close_on_disconnect" in ann:
        kwargs["close_on_disconnect"] = True

    # enable interruptions (field name varies by version)
    if "interrupt_speech" in ann:
        kwargs["interrupt_speech"] = True
    elif "allow_interruptions" in ann:
        kwargs["allow_interruptions"] = True
    elif "enable_interruption" in ann:
        kwargs["enable_interruption"] = True
    elif "enable_interruptions" in ann:
        kwargs["enable_interruptions"] = True

    # If your version supports it, lowering this can help responsiveness a bit
    # (only applied when field exists)
    if "min_end_of_speech_delay" in ann:
        kwargs["min_end_of_speech_delay"] = 0.15

    try:
        return RoomInputOptions(**kwargs) if kwargs else RoomInputOptions()
    except Exception:
        return None


async def entrypoint(ctx: JobContext):
    await ctx.connect()

    session = AgentSession(
        llm=openai.LLM(model="gpt-4o-mini"),
        tts=elevenlabs.TTS(voice_id="TlKDNWnTobzVS4SXWTDi"),
        stt=openai.STT(),
        vad=silero.VAD.load(
            activation_threshold=0.4,
            min_speech_duration=0.08,
            min_silence_duration=0.20,     # faster end-of-speech
            prefix_padding_duration=0.10,  # less buffering
            sample_rate=16000,
        ),
    )

    avatar_path = os.path.join(os.path.dirname(__file__), "avatar.jpg")
    if not os.path.exists(avatar_path):
        raise FileNotFoundError(f"Avatar not found: {avatar_path}")

    logger.info(f"Loading Emirati AI avatar from {avatar_path}")
    avatar_image = Image.open(avatar_path)
    hedra_avatar = hedra.AvatarSession(avatar_image=avatar_image)

    # Start avatar streaming with the same session
    await hedra_avatar.start(session, room=ctx.room)

    room_input_options = build_room_input_options()

    start_kwargs = dict(
        agent=Agent(
            instructions=(
                "You are Emirati AI, a professional voice assistant from Abu Dhabi.\n"
                "- Be friendly and direct.\n"
                "- Keep responses extremely short (max 1 sentence unless asked).\n"
                "- Answer immediately with no filler.\n"
                "- Respond in the user's language (Arabic or English).\n"
            )
        ),
        room=ctx.room,
    )

    # Only pass room_input_options if we could build it for this LiveKit version
    if room_input_options is not None:
        start_kwargs["room_input_options"] = room_input_options

    await session.start(**start_kwargs)

    session.generate_reply(
        instructions="Greet the user in one short sentence and ask how you can help."
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, worker_type=WorkerType.ROOM))
