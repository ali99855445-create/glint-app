"""Blue Tick support, protection, manual grants and profile-change review."""
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from bson import ObjectId
from bson.errors import InvalidId
from blue_tick import resolve_blue_entitlements

class SupportBody(BaseModel):
    subject: str
    message: str
class ImpersonationBody(BaseModel):
    reported_user_id: str
    details: Optional[str]=None
class ManualBlueBody(BaseModel):
    user_id: str
    enabled: bool
class ReviewBody(BaseModel):
    review_id: str
    decision: str
    note: Optional[str]=None

def install_blue_remaining_routes(api,db,get_current_user,now_iso):
    async def require_admin(me):
        u=await db.users.find_one({"id":me["id"]})
        if not u or not (u.get("is_admin") or u.get("role")=="admin"): raise HTTPException(403,"Admin access required")
        return u

    @api.post("/blue/support")
    async def blue_support(body:SupportBody,me=Depends(get_current_user)):
        u=await db.users.find_one({"id":me["id"]}); ent=resolve_blue_entitlements(u or {})
        if not ent["priority_support"]: raise HTTPException(403,"Priority support is a Blue benefit")
        subject=body.subject.strip()[:120]; message=body.message.strip()[:4000]
        if not subject or not message: raise HTTPException(400,"Subject and message are required")
        ticket={"user_id":me["id"],"subject":subject,"message":message,"priority":"blue","status":"open","created_at":now_iso()}
        r=await db.support_tickets.insert_one(ticket); return {"ok":True,"ticket_id":str(r.inserted_id),"priority":"blue"}

    @api.post("/blue/impersonation-report")
    async def impersonation(body:ImpersonationBody,me=Depends(get_current_user)):
        u=await db.users.find_one({"id":me["id"]}); ent=resolve_blue_entitlements(u or {})
        if not ent["impersonation_protection"]: raise HTTPException(403,"Blue impersonation protection required")
        if body.reported_user_id==me["id"]: raise HTTPException(400,"Cannot report your own account")
        if not await db.users.find_one({"id":body.reported_user_id}): raise HTTPException(404,"Reported account not found")
        item={"reporter_id":me["id"],"reported_user_id":body.reported_user_id,"details":(body.details or "").strip()[:2000],"priority":"blue_protection","status":"open","created_at":now_iso()}
        r=await db.impersonation_reports.insert_one(item); return {"ok":True,"report_id":str(r.inserted_id),"priority":"blue_protection"}

    @api.post("/admin/blue/manual")
    async def manual_blue(body:ManualBlueBody,me=Depends(get_current_user)):
        await require_admin(me); target=await db.users.find_one({"id":body.user_id})
        if not target: raise HTTPException(404,"User not found")
        # Blue is now independent from the retired Golden badge. Keep both
        # explicit Blue admin fields synchronized for old/new admin clients.
        update={
            "blue_tick_manual":body.enabled,
            "blue_manual_grant":body.enabled,
            "blue_manual_updated_at":now_iso(),
        }
        await db.users.update_one({"id":body.user_id},{"$set":update})
        fresh=await db.users.find_one({"id":body.user_id})
        ent=resolve_blue_entitlements(fresh or {})
        return {"ok":True,"enabled":body.enabled,"blue":ent,"source":ent.get("source")}

    @api.post("/admin/profile-change/review")
    async def review_identity(body:ReviewBody,me=Depends(get_current_user)):
        await require_admin(me)
        if body.decision not in {"approved","rejected"}: raise HTTPException(400,"Decision must be approved or rejected")
        try: oid=ObjectId(body.review_id)
        except (InvalidId,TypeError): raise HTTPException(400,"Invalid review id")
        review=await db.profile_change_reviews.find_one({"_id":oid,"status":"pending"})
        if not review: raise HTTPException(404,"Pending review not found")
        if body.decision=="approved":
            changes={}
            if review.get("requested_name"): changes["full_name"]=review["requested_name"]; changes["name_changed_at"]=now_iso()
            if review.get("requested_avatar"): changes["avatar"]=review["requested_avatar"]
            if changes:
                changes["updated_at"]=now_iso(); await db.users.update_one({"id":review["user_id"]},{"$set":changes})
        await db.profile_change_reviews.update_one({"_id":oid},{"$set":{"status":body.decision,"admin_note":(body.note or "")[:1000],"reviewed_at":now_iso(),"reviewed_by":me["id"]}})
        return {"ok":True,"status":body.decision}
