"""Blue-only Story video authorization and limits."""
from blue_tick import resolve_blue_entitlements


def validate_story_for_user(user: dict, story_type: str, duration_seconds=None) -> dict:
    story_type = (story_type or "").strip().lower()
    if story_type != "video":
        return {"allowed": True, "expires_hours": 24}

    entitlements = resolve_blue_entitlements(user)
    if not entitlements["video_stories"]:
        return {
            "allowed": False,
            "error": "Video Stories are available with Glint Blue.",
        }

    try:
        duration = float(duration_seconds or 0)
    except (TypeError, ValueError):
        duration = 0
    max_seconds = entitlements["story_video_max_seconds"]
    if duration <= 0:
        return {"allowed": False, "error": "Video duration is required."}
    if duration > max_seconds:
        return {
            "allowed": False,
            "error": f"Blue video Stories can be up to {max_seconds} seconds.",
            "max_seconds": max_seconds,
        }
    return {
        "allowed": True,
        "expires_hours": 24,
        "max_seconds": max_seconds,
    }
