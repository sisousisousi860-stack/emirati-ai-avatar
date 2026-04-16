import asyncio
import json
import logging
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, WorkerType, cli
from livekit.plugins import openai, elevenlabs, silero

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

    # Wait up to 4 seconds for the frontend to send the visitor's name
    visitor_name: str | None = None
    name_event = asyncio.Event()

    @ctx.room.on("data_received")
    def on_data(data_packet: rtc.DataPacket):
        nonlocal visitor_name
        try:
            payload = json.loads(bytes(data_packet.data).decode("utf-8"))
            if payload.get("type") == "visitor":
                visitor_name = payload.get("name") or None
                name_event.set()
        except Exception as e:
            logger.warning(f"Data parse error: {e}")
    
    session = AgentSession(
        llm=openai.LLM(
            model="gpt-4o-mini",
            temperature=0.7,
        ),
        tts=elevenlabs.TTS(
            voice_id="TlKDNWnTobzVS4SXWTDi",
            model="eleven_multilingual_v2",
            language="ar",
        ),
        stt=openai.STT(
            model="whisper-1",
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
    
    logger.info("Hedra removed — using static animated avatar on frontend")

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
                "- CRITICAL: You ALWAYS respond in Arabic by default — this is an Arabic-first kiosk\n"
                "- If the user speaks to you in English, respond in Arabic anyway unless they specifically ask you to speak English\n"
                "- Use Modern Standard Arabic (فصحى) with a warm Gulf/Emirati tone\n"
                "- Keep responses concise and clear for TTS playback\n\n"

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

    # Wait for visitor name from frontend (max 4 seconds)
    try:
        await asyncio.wait_for(name_event.wait(), timeout=4.0)
    except asyncio.TimeoutError:
        pass

    if visitor_name:
        session.generate_reply(
            instructions=(
                f"الكاميرا رصدت وتعرّفت على '{visitor_name}' يقترب من الشاشة. "
                f"رحّب به بالاسم بشكل شخصي ودافئ باللغة العربية. "
                f"مثال: 'مرحباً {visitor_name}! أهلاً وسهلاً بك في OryxAI Solutions. كيف يمكنني مساعدتك اليوم؟' "
                f"اجعل الرد قصيراً وحاراً — جملتين على الأكثر."
            )
        )
    else:
        session.generate_reply(
            instructions=(
                "شخص اقترب من شاشة الكشك والكاميرا رصدته. "
                "رحّب به بتحية قصيرة ودافئة باللغة العربية: "
                "'مرحباً! أهلاً وسهلاً، أنا الذكاء الاصطناعي الإماراتي من OryxAI Solutions. كيف يمكنني مساعدتك اليوم؟' "
                "اجعل الرد طبيعياً وودياً — جملتين على الأكثر."
            )
        )

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, worker_type=WorkerType.ROOM))