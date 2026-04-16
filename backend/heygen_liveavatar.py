"""
HeyGen Streaming Avatar API client.

Wraps the REST endpoints needed to run a real-time lip-sync avatar session.
Returns LiveKit URL + access token so a frontend client can subscribe to the
avatar's video/audio stream.
"""
import os
import logging
import aiohttp
from typing import Optional

logger = logging.getLogger("heygen")

HEYGEN_BASE = "https://api.heygen.com"


class HeyGenClient:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("HEYGEN_API_KEY")
        if not self.api_key:
            raise RuntimeError("HEYGEN_API_KEY is not set")
        self._session: Optional[aiohttp.ClientSession] = None

    async def _aio(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={"X-Api-Key": self.api_key, "Content-Type": "application/json"}
            )
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    async def get_session_token(self) -> str:
        """Generate a short-lived token for client-side SDK use."""
        sess = await self._aio()
        async with sess.post(f"{HEYGEN_BASE}/v1/streaming.create_token") as r:
            r.raise_for_status()
            data = await r.json()
            return data["data"]["token"]

    async def list_avatars(self) -> list:
        sess = await self._aio()
        async with sess.get(f"{HEYGEN_BASE}/v2/avatars") as r:
            r.raise_for_status()
            data = await r.json()
            return data.get("data", {}).get("avatars", [])

    async def create_session(
        self,
        avatar_id: str,
        voice_id: Optional[str] = None,
        quality: str = "medium",
    ) -> dict:
        """
        Create a new streaming session.
        Returns: { session_id, url (LiveKit), access_token, realtime_endpoint }
        """
        payload: dict = {
            "quality": quality,
            "avatar_id": avatar_id,
            "version": "v2",
            "video_encoding": "H264",
        }
        if voice_id:
            payload["voice"] = {"voice_id": voice_id, "rate": 1.0}

        sess = await self._aio()
        async with sess.post(
            f"{HEYGEN_BASE}/v1/streaming.new", json=payload
        ) as r:
            r.raise_for_status()
            data = await r.json()
            logger.info(f"HeyGen session created: {data.get('data', {}).get('session_id')}")
            return data["data"]

    async def start_session(self, session_id: str) -> dict:
        sess = await self._aio()
        async with sess.post(
            f"{HEYGEN_BASE}/v1/streaming.start",
            json={"session_id": session_id},
        ) as r:
            r.raise_for_status()
            return await r.json()

    async def speak(self, session_id: str, text: str, task_type: str = "repeat") -> dict:
        """
        Make the avatar speak.
        task_type: 'repeat' (say literal text) or 'talk' (generate AI response).
        """
        sess = await self._aio()
        async with sess.post(
            f"{HEYGEN_BASE}/v1/streaming.task",
            json={
                "session_id": session_id,
                "text": text,
                "task_type": task_type,
            },
        ) as r:
            r.raise_for_status()
            return await r.json()

    async def interrupt(self, session_id: str) -> dict:
        sess = await self._aio()
        async with sess.post(
            f"{HEYGEN_BASE}/v1/streaming.interrupt",
            json={"session_id": session_id},
        ) as r:
            r.raise_for_status()
            return await r.json()

    async def keep_alive(self, session_id: str) -> dict:
        sess = await self._aio()
        async with sess.post(
            f"{HEYGEN_BASE}/v1/streaming.keep_alive",
            json={"session_id": session_id},
        ) as r:
            r.raise_for_status()
            return await r.json()

    async def stop_session(self, session_id: str) -> dict:
        sess = await self._aio()
        async with sess.post(
            f"{HEYGEN_BASE}/v1/streaming.stop",
            json={"session_id": session_id},
        ) as r:
            r.raise_for_status()
            return await r.json()
