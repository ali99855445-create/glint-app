"""Glint modular upgrade backend entrypoint."""
import server as _server
from server import app, db, get_current_user, now_iso
from blue_tick import blue_tick_active
from group_routes import install_group_management_routes
from profile_edit_routes import install_profile_edit_routes
from blue_entitlement_routes import install_blue_entitlement_routes
from blue_links_routes import install_blue_links_routes
from blue_story_routes import install_blue_story_routes
from blue_remaining_routes import install_blue_remaining_routes

# The legacy server serialized `verified` from the retired golden_tick field.
# Keep `verified` only as a compatibility alias for older clients, but derive it
# exclusively from the canonical Blue entitlement. New clients should consume
# `blue_tick_active` directly.
def _public_user_blue(u: dict) -> dict:
    if not u:
        return None
    blue = blue_tick_active(u)
    return {
        "id": u["id"],
        "full_name": u.get("full_name"),
        "username": u.get("username"),
        "avatar": u.get("avatar"),
        "cover": u.get("cover"),
        "bio": u.get("bio"),
        "location": u.get("location"),
        "blue_tick_active": blue,
        "verified": blue,
        "privacy": u.get("privacy", "public"),
        "created_at": u.get("created_at"),
    }

_server.public_user = _public_user_blue

class _ApiPrefixAdapter:
    def __init__(self,target): self.target=target
    def get(self,path,*args,**kwargs): return self.target.get("/api"+path,*args,**kwargs)
    def post(self,path,*args,**kwargs): return self.target.post("/api"+path,*args,**kwargs)
    def delete(self,path,*args,**kwargs): return self.target.delete("/api"+path,*args,**kwargs)

_api=_ApiPrefixAdapter(app)
install_group_management_routes(_api,db,get_current_user,now_iso)
install_profile_edit_routes(_api,db,get_current_user,now_iso)
install_blue_entitlement_routes(_api,db,get_current_user)
install_blue_links_routes(_api,db,get_current_user,now_iso)
install_blue_story_routes(_api,db,get_current_user,now_iso)
install_blue_remaining_routes(_api,db,get_current_user,now_iso)
