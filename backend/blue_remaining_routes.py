"""Remaining Blue Tick workflows: priority support, impersonation reports,
identity review admin actions and manual Blue grants/removal.
"""
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from blue_tick import resolve_blue_entitlements

class SupportBody(BaseModel):
    subject: str
    message: str
class ImpersonationBody(BaseModel):
    reported_user_id: str
    details: Optional[str] = None
class ManualBlueBody(BaseModel):
    user_id: str
    enabled: bool
class ReviewBody(BaseModel):
    review_id: str
    decision: str
    note: Optional[str] = None

def install_blue_remaining_routes(api, db, get_current_user, now_iso):
    async def require_admin(me):
        u=await db.users.find_one({"id":me["id"]})
        if not u or not (u.get("is_admin") or u.get("role")=="admin"):
            raise HTTPException(403,"Admin access required")
        return u

    @api.post("/blue/support")
    async def blue_support(body:SupportBody, me=Depends(get_current_user)):
        u=await db.users.find_one({"id":me["id"]})
        ent=resolve_blue_entitlements(u or {})
        if not ent["priority_support"]: raise HTTPException(403,"Priority support is a Blue benefit")
        ticket={"user_id":me["id"],"subject":body.subject.strip()[:120],"message":body.message.strip()[:4000],"priority":"blue","status":"open","created_at":now_iso()}
        if not ticket["subject"] or not ticket["message"]: raise HTTPException(400,"Subject and message are required")
        r=await db.support_tickets.insert_one(ticket); return {"ok":True,"ticket_id":str(r.inserted_id),"priority":"blue"}

    @api.post("/blue/impersonation-report")
    async def impersonation(body:ImpersonationBody, me=Depends(get_current_user)):
        u=await db.users.find_one({"id":me["id"]}); ent=resolve_blue_entitlements(u or {})
        if not ent["impersonation_protection"]: raise HTTPException(403,"Blue impersonation protection required")
        if body.reported_user_id==me["id"]: raise HTTPException(400,"Cannot report your own account")
        target=await db.users.find_one({"id":body.reported_user_id})
        if not target: raise HTTPException(404,"Reported account not found")
        item={"reporter_id":me["id"],"reported_user_id":body.reported_user_id,"details":(body.details or "").strip()[:2000],"priority":"blue_protection","status":"open","created_at":now_iso()}
        r=await db.impersonation_reports.insert_one(item); return {"ok":True,"report_id":str(r.inserted_id),"priority":"blue_protection"}

    @api.post("/admin/blue/manual")
    async def manual_blue(body:ManualBlueBody, me=Depends(get_current_user)):
        await require_admin(me); target=await db.users.find_one({"id":body.user_id})
        if not target: raise HTTPException(404,"User not found")
        update={"blue_manual_grant":body.enabled,"verified":body.enabled or bool(target.get("blue_subscription_status")=="active"),"blue_manual_updated_at":now_iso()}
        await db.users.update_one({"id":body.user_id},{"$set":update}); return {"ok":True,"enabled":body.enabled}

    @api.post("/admin/profile-change/review")
    async def review_identity(body:ReviewBody, me=Depends(get_current_user)):
        await require_admin(me)
        if body.decision not in {"approved","rejected"}: raise HTTPException(400,"Decision must be approved or rejected")
        review=await db.profile_change_reviews.find_one({"_id":__import__('bson').ObjectId(body.review_id),"status":"pending"})
        if not review: raise HTTPException(404,"Pending review not found")
        if body.decision=="approved":
            changes={}
            if review.get("requested_name"): changes["full_name"]=review["requested_name"]
            if review.get("requested_avatar"): changes["avatar"]=review["requested_avatar"]
            if changes: await db.users.update_one({"id":review["user_id"]},{"$set":changes})
        await db.profile_change_reviews.update_one({"_id":review["_id"]},{"$set":{"status":body.decision,"admin_note":(body.note or "")[:1000],"reviewed_at":now_iso(),"reviewed_by":me["id"]}})
        return {"ok":True,"status":body.decision}
