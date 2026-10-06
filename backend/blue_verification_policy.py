"""Blue Tick verification enforcement policy.

Three confirmed fraudulent-document rejections trigger a 30-day application
cooldown. This module records the enforcement state only; payment/refund
handling remains with the billing system and published purchase terms.
"""
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException

FRAUD_REJECTION_LIMIT = 3
FRAUD_COOLDOWN_DAYS = 30
FRAUD_REASONS = {"fake_document", "impersonation_document", "ai_generated_document", "forged_document"}


def _parse(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def assert_blue_application_allowed(user):
    until = _parse(user.get("blue_apply_blocked_until"))
    if until and until > datetime.now(timezone.utc):
        remaining = max(1, (until - datetime.now(timezone.utc)).days + 1)
        raise HTTPException(403, f"Blue verification applications are temporarily blocked for {remaining} more day(s)")


async def record_fraud_rejection(db, user_id: str, reason: str, now_iso):
    if reason not in FRAUD_REASONS:
        return {"fraud_rejections": None, "blocked_until": None}
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(404, "User not found")
    count = int(user.get("blue_fraud_rejections") or 0) + 1
    update = {"blue_fraud_rejections": count, "blue_last_fraud_rejection_reason": reason, "blue_last_fraud_rejection_at": now_iso()}
    blocked_until = None
    if count >= FRAUD_REJECTION_LIMIT:
        blocked_until = (datetime.now(timezone.utc) + timedelta(days=FRAUD_COOLDOWN_DAYS)).isoformat()
        update["blue_apply_blocked_until"] = blocked_until
        update["blue_fraud_rejections"] = 0
    await db.users.update_one({"id": user_id}, {"$set": update})
    return {"fraud_rejections": update["blue_fraud_rejections"], "blocked_until": blocked_until}

POLICY_TEXT = """Blue Verification Document Policy
Applicants must submit authentic, unaltered identity information belonging to themselves. Fake, forged, impersonation, or AI-generated identity documents are prohibited. A confirmed fraudulent-document rejection is recorded. After three confirmed fraudulent-document rejections, the account is blocked from submitting another Blue verification application for 30 days. Any payment or refund eligibility is governed by the purchase terms shown before payment and applicable platform/consumer-law requirements; Glint does not promise a refund for fraudulent submissions."""
