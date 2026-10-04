"""External profile-link rules for Glint Blue."""
from urllib.parse import urlparse

from blue_tick import resolve_blue_entitlements

ALLOWED_SCHEMES = {"http", "https"}


def validate_external_links(user: dict, links) -> dict:
    links = [str(link).strip() for link in (links or []) if str(link).strip()]
    entitlements = resolve_blue_entitlements(user)

    if links and not entitlements["external_links"]:
        return {"allowed": False, "error": "External profile links are available with Glint Blue."}

    maximum = entitlements["external_links_max"]
    if len(links) > maximum:
        return {"allowed": False, "error": f"Glint Blue supports up to {maximum} external links.", "max_links": maximum}

    normalized = []
    for link in links:
        parsed = urlparse(link)
        if parsed.scheme.lower() not in ALLOWED_SCHEMES or not parsed.netloc:
            return {"allowed": False, "error": "Enter a valid http or https link."}
        normalized.append(link)

    return {"allowed": True, "links": normalized, "max_links": maximum}
