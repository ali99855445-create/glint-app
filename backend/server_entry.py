"""Glint modular upgrade backend entrypoint."""
from server import app, db, get_current_user, now_iso
from group_routes import install_group_management_routes
from profile_edit_routes import install_profile_edit_routes
from blue_entitlement_routes import install_blue_entitlement_routes
from blue_links_routes import install_blue_links_routes
from blue_story_routes import install_blue_story_routes
from blue_remaining_routes import install_blue_remaining_routes

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
