"""Blue-only video Story creation.

Video Stories are deliberately separated from the legacy Story endpoint so the
existing photo/text/voice experience stays untouched. Entitlement and duration
are enforced server-side.
"""
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from typing import Literal, Optional
import uuid
from datetime import datetime, timezone, timedelta

from blue_tick import resolve_blue_entitlements


class BlueVideoStoryBody(BaseModel):
    media: str
    duration: float
    caption: Optional[str] = None
    audience: Literal["friends", "inner"] = "friends"


def install_blue_story_routes(api, db, get_current_user, now_iso):
    @api.post("/stories/video")
    async def create_blue_video_story(body: BlueVideoStoryBody, me=Depends(get_current_user)):
        user = await db.users.find_one({"id": me["id"]})
        if not user:
            raise HTTPException(404, "User not found")

        entitlements = resolve_blue_entitlements(user)
        if not entitlements["video_stories"]:
            raise HTTPException(403, "Video Stories are available to Blue verified accounts only")

        max_seconds = int(entitlements["story_video_max_seconds"])
        if body.duration <= 0 or body.duration > max_seconds:
            raise HTTPException(400, f"Video Story must be {max_seconds} seconds or shorter")
        if not body.media.strip():
            raise HTTPException(400, "Video is required")

        now = datetime.now(timezone.utc)
        story = {
            "id": str(uuid.uuid4()),
            "user_id": me["id"],
            "type": "video",
            "media": body.media.strip(),
            "duration": round(float(body.duration), 2),
            "text": (body.caption or "").strip()[:120] or None,
            "audience": body.audience,
            "created_at": now_iso(),
            "expires_at": (now + timedelta(hours=24)).isoformat(),
            "views": [],
        }
        await db.stories.insert_one(story.copy())
        story.pop("_id", None)
        return {"ok": True, "story": story, "max_seconds": max_seconds}
