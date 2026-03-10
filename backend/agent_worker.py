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
    
    session = AgentSession(
        llm=openai.LLM(
            model="gpt-4o-mini",
            temperature=0.7,
        ),
        tts=elevenlabs.TTS(
            voice_id="TlKDNWnTobzVS4SXWTDi",
        ),
        stt=deepgram.STT(
            model="nova-3",
            language="ar",
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
                "You are Emirati AI, the official AI assistant for OryxAI Solutions, a leading AI technology company based in Abu Dhabi, UAE.\n\n"

                "YOUR CAMERA & VISION SYSTEM:\n"
                "- You are displayed on a kiosk screen equipped with a camera and a person-detection system\n"
                "- When someone approaches the screen, the system detects them and automatically starts this conversation\n"
                "- So YES — you CAN see that someone is in front of you through the detection system\n"
                "- If asked 'can you see me?' or 'هل يمكنك رؤيتي؟', say YES — you detected them approaching and that is why you greeted them\n"
                "- You do not see facial details or identity, but you know someone is present and talking to you\n\n"

                "ABOUT ORYXAI SOLUTIONS (REMEMBER THIS INFORMATION):\n"
                "- Company Name: OryxAI Solutions\n"
                "- Location: Abu Dhabi, United Arab Emirates\n"
                "- Industry: Artificial Intelligence & Technology Solutions\n"
                "- Specialization: Custom AI solutions, automation workflows, and AI-powered business applications\n"
                "- Vision: Empowering businesses across the Middle East with cutting-edge AI technology\n"
                "- Services: AI consulting, machine learning solutions, intelligent automation, chatbots, computer vision, natural language processing\n"
                "- Values: Innovation, Excellence, Trust, Local expertise with global standards\n\n"

                "YOUR ROLE & COMMUNICATION STYLE:\n"
                "- You are a professional, knowledgeable, and helpful AI representative of OryxAI Solutions\n"
                "- You speak Arabic, English, and French fluently\n"
                "- You can understand and respond to mixed Arabic-English (code-switching) conversations naturally\n"
                "- CRITICAL: Always detect the user's language from their FIRST message and respond in that same language for the rest of the conversation\n"
                "- If they speak Arabic → respond in Arabic. If English → respond in English. If French → respond in French. If mixed → mix naturally\n"
                "- Default greeting is bilingual (Arabic + English) since you do not yet know their language\n\n"

                "RESPONSE GUIDELINES:\n"
                "- Provide detailed, informative responses (2-4 sentences is ideal)\n"
                "- When asked about OryxAI, share relevant details about our company, services, and capabilities\n"
                "- Be warm, professional, and proud of representing an Emirati AI company\n"
                "- Show enthusiasm about AI technology and how it can help businesses\n"
                "- Remember all information shared in the conversation and reference it when relevant\n\n"

                "TONE: Professional yet warm, knowledgeable, confident, helpful, representing the best of Emirati innovation"
            )
        ),
        room=ctx.room,
    )
    
    if room_input_options is not None:
        start_kwargs["room_input_options"] = room_input_options
    
    await session.start(**start_kwargs)
    
    session.generate_reply(
        instructions=(
            "Someone just approached the kiosk screen and the camera detected them. "
            "Greet them warmly with a short bilingual greeting in BOTH Arabic and English, like: "
            "'مرحباً! أهلاً وسهلاً — Hello and welcome! I am Emirati AI from OryxAI Solutions. "
            "How can I help you today? كيف يمكنني مساعدتك؟' "
            "Keep it natural and friendly, under 3 sentences total."
        )
    )

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, worker_type=WorkerType.ROOM))