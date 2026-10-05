"""Blue Tick entitlement API used by the mobile app.

The app should ask this endpoint instead of guessing from a badge flag. Manual
admin grants and paid subscriptions therefore unlock exactly the same five
benefits and expired subscriptions stop unlocking them automatically.
"""
from fastapi import Depends, HTTPException

from blue_tick import resolve_blue_entitlements


def install_blue_entitlement_routes(api, db, get_current_user):
    @api.get("/blue/entitlements")
    async def my_blue_entitlements(me=Depends(get_current_user)):
        user = await db.users.find_one({"id": me["id"]}, {"_id": 0})
        if not user:
            raise HTTPException(404, "User not found")

        entitlements = resolve_blue_entitlements(user)
        return {
            "ok": True,
            "blue": entitlements,
            "subscription": {
                "status": user.get("blue_subscription_status") or "none",
                "ends_at": user.get("blue_subscription_ends_at"),
                "auto_renew": bool(user.get("blue_subscription_auto_renew", False)),
            },
        }
