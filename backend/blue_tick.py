"""Glint Blue Tick entitlement rules.

Blue Tick is the canonical verification product. Paid subscriptions and explicit
admin Blue grants resolve to the same product capabilities. The retired legacy
Golden badge is intentionally not used as a Blue entitlement source.
"""
from datetime import datetime, timezone
from typing import Optional

BLUE_STORY_VIDEO_MAX_SECONDS = 60
BLUE_EXTERNAL_LINKS_MAX = 2
BLUE_SOURCES = {"subscription", "admin_manual"}


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


def _manual_blue(user: dict) -> bool:
    # Only explicit Blue admin fields count. golden_tick is a retired legacy
    # field and must never unlock the new paid Blue product or its benefits.
    return bool(user.get("blue_tick_manual") or user.get("blue_manual_grant"))


def _subscription_blue(user: dict) -> bool:
    status = str(user.get("blue_subscription_status") or "").lower()
    if status not in {"active", "cancelled"}:
        return False
    ends_at = _parse_iso(user.get("blue_subscription_ends_at"))
    return bool(ends_at and ends_at > datetime.now(timezone.utc))


def blue_tick_active(user: dict) -> bool:
    """Return whether Blue Tick benefits are currently active for a user."""
    if not user:
        return False
    return _manual_blue(user) or _subscription_blue(user)


def blue_tick_source(user: dict) -> Optional[str]:
    if _manual_blue(user):
        return "admin_manual"
    if _subscription_blue(user):
        return "subscription"
    return None


def resolve_blue_entitlements(user: dict) -> dict:
    active = blue_tick_active(user)
    source = blue_tick_source(user) if active else None
    return {
        "active": active,
        "source": source,
        "badge_everywhere": active,
        "impersonation_protection": active,
        "priority_support": active,
        "video_stories": active,
        "external_links": active,
        "story_video_max_seconds": BLUE_STORY_VIDEO_MAX_SECONDS if active else 0,
        "external_links_max": BLUE_EXTERNAL_LINKS_MAX if active else 0,
    }
