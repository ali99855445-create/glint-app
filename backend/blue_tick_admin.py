"""Admin operations for Glint Blue Tick.

Manual admin Blue grants behave like the paid Blue product for entitlement
testing while subscription billing state remains separate. Legacy Golden badge
state is intentionally not read or written here.
"""
from typing import Optional

from blue_tick import resolve_blue_entitlements
from verification_badges import manual_badge, manual_badge_update


async def set_manual_blue_tick(db, user_id: str, enabled: bool, reason: Optional[str] = None, duration_days: Optional[int] = None) -> dict:
    user = await db.users.find_one({"id": user_id, "deleted_at": None})
    if not user:
        raise ValueError("User not found")

    update = manual_badge_update('blue' if enabled else None, duration_days, reason or '')
    update['blue_tick_manual_reason'] = (reason or '').strip() or None
    await db.users.update_one({"id": user_id}, {"$set": update})

    fresh = await db.users.find_one({"id": user_id}, {"_id": 0})
    return {
        "user_id": user_id,
        "manual_blue_tick": bool(enabled),
        "entitlements": resolve_blue_entitlements(fresh),
    }


async def get_blue_tick_admin_state(db, user_id: str) -> dict:
    user = await db.users.find_one({"id": user_id, "deleted_at": None}, {"_id": 0})
    if not user:
        raise ValueError("User not found")
    return {
        "user_id": user_id,
        "manual_blue_tick": manual_badge(user) == "blue",
        "subscription_status": user.get("blue_subscription_status"),
        "subscription_ends_at": user.get("blue_subscription_ends_at"),
        "entitlements": resolve_blue_entitlements(user),
    }
