"""Profile-change policy for Glint Blue Tick and normal accounts."""
from datetime import datetime, timezone, timedelta
from typing import Optional

from blue_tick import blue_tick_active

NAME_CHANGE_COOLDOWN_DAYS = 30


def _parse_iso(value: Optional[str]):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def normal_name_change_allowed(user: dict, now: Optional[datetime] = None) -> dict:
    now = now or datetime.now(timezone.utc)
    last = _parse_iso(user.get("name_changed_at"))
    if not last:
        return {"allowed": True, "next_change_at": None}
    next_at = last + timedelta(days=NAME_CHANGE_COOLDOWN_DAYS)
    return {"allowed": now >= next_at, "next_change_at": next_at.isoformat()}


def profile_change_policy(user: dict, requested_name: Optional[str] = None, requested_avatar: Optional[str] = None) -> dict:
    """Return server policy before applying profile edits.

    Cover photos are deliberately excluded from Blue review, per product rule.
    """
    is_blue = blue_tick_active(user)
    name_changed = requested_name is not None and requested_name.strip() != str(user.get("full_name") or "").strip()
    avatar_changed = requested_avatar is not None and requested_avatar != user.get("avatar")

    if is_blue and (name_changed or avatar_changed):
        return {
            "apply_immediately": False,
            "requires_review": True,
            "requires_identity_documents": True,
            "review_fields": [field for field, changed in (("full_name", name_changed), ("avatar", avatar_changed)) if changed],
        }

    if name_changed:
        cooldown = normal_name_change_allowed(user)
        if not cooldown["allowed"]:
            return {
                "apply_immediately": False,
                "requires_review": False,
                "blocked": True,
                "reason": "Name can only be changed once every 30 days.",
                "next_change_at": cooldown["next_change_at"],
            }

    return {
        "apply_immediately": True,
        "requires_review": False,
        "requires_identity_documents": False,
        "blocked": False,
    }
