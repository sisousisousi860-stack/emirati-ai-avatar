import os
import requests
from dotenv import load_dotenv

load_dotenv(".env.local")

HEYGEN_API_KEY = os.getenv("HEYGEN_API_KEY")
HEADERS = {"X-Api-Key": HEYGEN_API_KEY}

# List all avatars
resp = requests.get("https://api.heygen.com/v2/avatars", headers=HEADERS)
avatars = resp.json()["data"]["avatars"]

print("\n" + "="*60)
print("YOUR HEYGEN AVATARS:")
print("="*60)
for a in avatars:
    print(f"ID: {a['avatar_id']}")
    print(f"Name: {a['avatar_name']}")
    print(f"Streaming: {a.get('streaming_enabled', 'unknown')}")
    print("-" * 60)

# List Arabic voices
resp2 = requests.get("https://api.heygen.com/v2/voices", params={"language": "ar"}, headers=HEADERS)
voices = resp2.json()["data"]["voices"]

print("\n" + "="*60)
print("ARABIC VOICES FOR HEYGEN:")
print("="*60)
for v in voices[:5]:
    print(f"ID: {v['voice_id']}")
    print(f"Name: {v['display_name']}")
    print("-" * 60)

print("\nADD THESE TO .env.local:")
if avatars:
    print(f"HEYGEN_AVATAR_ID={avatars[0]['avatar_id']}")
if voices:
    print(f"HEYGEN_VOICE_ID={voices[0]['voice_id']}")
