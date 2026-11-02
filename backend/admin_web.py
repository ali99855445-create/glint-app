"""Serve the versioned admin SPA beside the existing protected API."""
from pathlib import Path

from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


def install_admin_web(app, directory):
    root = Path(directory)
    if not (root / "index.html").is_file():
        return False

    for folder in ("_expo", "assets"):
        if (root / folder).is_dir():
            app.mount(f"/{folder}", StaticFiles(directory=root / folder), name=f"admin-{folder}")

    async def admin_page(rest=""):
        return FileResponse(root / "index.html", headers={
            "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
        })

    app.add_api_route("/admin", admin_page, methods=["GET"], include_in_schema=False)
    app.add_api_route("/admin/{rest:path}", admin_page, methods=["GET"], include_in_schema=False)
    return True
