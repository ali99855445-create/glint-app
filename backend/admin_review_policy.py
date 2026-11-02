"""Admin decision validation, notices, and Blue application enforcement."""
from fastapi import HTTPException

REJECTION_LIMIT = 3
REFUND_HELP = "https://support.google.com/googleplay/answer/2479637"
MANAGE_SUBSCRIPTIONS = "https://play.google.com/store/account/subscriptions"


def require_decision_reason(reason):
    text = str(reason or "").strip()
    if not 10 <= len(text) <= 4000:
        raise HTTPException(400, "Write a specific decision reason between 10 and 4000 characters")
    return text


def decision_message(subject, decision, reason, case_id, next_steps=None):
    reason = require_decision_reason(reason)
    return (f"Glint Safety & Trust Team\n\n{subject}: {decision.replace('_', ' ').title()}\n"
            f"Case reference: {case_id}\n\nWe have completed our review of your request.\n\n"
            f"Decision reason\n{reason}\n\nNext steps\n"
            f"{next_steps or 'If you need clarification, contact Glint Support and include this case reference.'}\n\n"
            "Glint Safety & Trust Team")


async def reject_blue_application(db, application_id, reason, permanent, now_iso):
    reason = require_decision_reason(reason)
    # Claim exactly one pending application; a repeated click never counts twice.
    application = await db.verifications.find_one_and_update(
        {"id": application_id, "status": "pending"},
        {"$set": {"status": "rejected", "review_reason": reason, "reviewed_at": now_iso()}})
    if not application:
        raise HTTPException(409, "Application not found or already reviewed")
    user_id = application["user_id"]
    count = await db.verifications.count_documents({"user_id": user_id, "status": "rejected"})
    user = await db.users.find_one({"id": user_id}) or {}
    permanent = bool(permanent or count >= REJECTION_LIMIT or user.get("blue_application_permanent_block"))
    remaining = max(0, REJECTION_LIMIT - count)
    next_steps = (f"You may submit a corrected application. {remaining} review attempt(s) remain before applications are permanently blocked."
                  if not permanent else
                  "Further Blue Tick verification applications on this account are permanently blocked. "
                  "Glint will attempt to stop future Google Play subscription renewals. "
                  f"Check and manage your subscription at {MANAGE_SUBSCRIPTIONS}. "
                  f"To request a refund from Google Play, visit {REFUND_HELP}. "
                  "Refund approval is determined by Google Play; this notice does not confirm a refund.")
    message = decision_message("Blue Tick verification", "permanently rejected" if permanent else "rejected", reason, application_id, next_steps)
    update = {"blue_last_rejection_reason": reason}
    if permanent:
        update.update({"blue_application_permanent_block": True, "blue_identity_approved": False,
                       "blue_cancellation_status": "pending", "blue_application_blocked_at": now_iso()})
    await db.users.update_one({"id": user_id}, {"$set": update, "$max": {"blue_rejection_count": count}})
    await db.verifications.update_one({"id": application_id}, {"$set": {
        "permanent_rejection": permanent, "rejection_count": count, "decision_message": message}})
    return {"user_id": user_id, "permanent": permanent, "rejection_count": count,
            "attempts_remaining": remaining, "decision_message": message}
