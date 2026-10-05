"""Glint backend entrypoint for modular feature routes.

Use `uvicorn server_entry:app` from the backend directory. This imports the
existing production server unchanged, then installs modular routes directly on
the FastAPI app. Keeping this as an entrypoint avoids risky wholesale edits to
the large legacy server.py file.
"""
from server import app, db, get_current_user, now_iso
from group_routes import install_group_management_routes
from profile_edit_routes import install_profile_edit_routes
from blue_entitlement_routes import install_blue_entitlement_routes

# server.py has already included its legacy /api router by this point. Install
# modular routes directly on the FastAPI application using a tiny adapter that
# adds the /api prefix expected by the mobile client.
class _ApiPrefixAdapter:
    def __init__(self, target):
        self.target = target

    def get(self, path, *args, **kwargs):
        return self.target.get("/api" + path, *args, **kwargs)

    def post(self, path, *args, **kwargs):
        return self.target.post("/api" + path, *args, **kwargs)

    def delete(self, path, *args, **kwargs):
        return self.target.delete("/api" + path, *args, **kwargs)


_api = _ApiPrefixAdapter(app)

install_group_management_routes(
    _api,
    db,
    get_current_user,
    now_iso,
)

install_profile_edit_routes(
    _api,
    db,
    get_current_user,
    now_iso,
)

install_blue_entitlement_routes(
    _api,
    db,
    get_current_user,
)
