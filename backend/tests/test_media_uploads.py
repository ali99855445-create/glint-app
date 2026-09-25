"""Media upload regression tests — upload endpoint + all downstream flows that consume uploaded media
(edit-profile avatar/cover, photo post, photo story, chat photo message, help ticket screenshot,
verification document). Web-preview equivalent of the native uploadAsync fix.
"""
import base64
import os

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

# 1x1 red PNG
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def user(api_client):
    """Login as demo user"""
    r = api_client.post(f"{API}/auth/login", json={"contact": "user@glint.app", "password": "GlintUser@2026"})
    assert r.status_code == 200, f"login failed: {r.text}"
    data = r.json()
    assert data.get("token")
    return data


@pytest.fixture(scope="module")
def friend(api_client):
    r = api_client.post(f"{API}/auth/login", json={"contact": "friend@glint.app", "password": "GlintFriend@2026"})
    assert r.status_code == 200, f"friend login failed: {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def auth(api_client, user):
    return {"Authorization": f"Bearer {user['token']}"}


@pytest.fixture(scope="module")
def uploaded(auth):
    """Upload a real PNG via multipart and return response payload"""
    # NOTE: plain requests.post (no session) — the session's default
    # Content-Type: application/json would break multipart encoding.
    r = requests.post(
        f"{API}/upload",
        files={"file": ("test_photo.png", PNG_BYTES, "image/png")},
        headers=auth,
    )
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("path") and data.get("token") and data.get("url")
    return data


class TestUploadEndpoint:
    """POST /api/upload + GET /api/files"""

    def test_upload_image_success(self, uploaded):
        assert uploaded["path"].startswith("glint/uploads/")
        assert uploaded["path"].endswith(".png")

    def test_uploaded_file_is_servable_with_token(self, api_client, uploaded):
        r = api_client.get(f"{API}/files/{uploaded['path']}?token={uploaded['token']}")
        assert r.status_code == 200, f"file fetch failed: {r.status_code}"
        assert r.content == PNG_BYTES, "served bytes differ from uploaded bytes"
        assert "image" in (r.headers.get("Content-Type") or "")

    def test_file_fetch_without_token_rejected(self, api_client, uploaded):
        r = api_client.get(f"{API}/files/{uploaded['path']}")
        assert r.status_code == 401

    def test_upload_requires_auth(self, api_client):
        r = requests.post(f"{API}/upload", files={"file": ("x.png", PNG_BYTES, "image/png")})
        assert r.status_code in (401, 403)

    def test_upload_without_file_field_422(self, api_client, auth):
        r = api_client.post(f"{API}/upload", headers=auth)
        assert r.status_code == 422


class TestUploadConsumers:
    """Flows that consume uploaded media URLs"""

    def test_edit_profile_avatar_upload_and_persist(self, api_client, auth, uploaded):
        avatar_url = f"{API}/files/{uploaded['path']}?token={uploaded['token']}"
        r = api_client.put(f"{API}/users/me", json={"avatar": avatar_url}, headers={**auth, "Content-Type": "application/json"})
        assert r.status_code == 200, f"avatar update failed: {r.text}"
        me = api_client.get(f"{API}/users/me", headers=auth)
        assert me.status_code == 200
        assert me.json().get("avatar") == avatar_url

    def test_photo_post_appears_in_feed(self, api_client, auth, uploaded):
        img = f"{API}/files/{uploaded['path']}?token={uploaded['token']}"
        r = api_client.post(
            f"{API}/posts",
            json={"type": "photo", "text": "TEST_upload photo post", "image": img, "audience": "public"},
            headers={**auth, "Content-Type": "application/json"},
        )
        assert r.status_code == 200, f"photo post failed: {r.text}"
        post = r.json()
        assert post.get("image") == img
        feed = api_client.get(f"{API}/posts/feed", headers=auth)
        assert feed.status_code == 200
        body = feed.json()
        posts = body if isinstance(body, list) else body.get("posts", [])
        assert any(p.get("id") == post["id"] and p.get("image") for p in posts)

    def test_photo_story_created(self, api_client, auth, uploaded):
        img = f"{API}/files/{uploaded['path']}?token={uploaded['token']}"
        r = api_client.post(
            f"{API}/stories",
            json={"type": "photo", "image": img, "audience": "friends"},
            headers={**auth, "Content-Type": "application/json"},
        )
        assert r.status_code == 200, f"story create failed: {r.text}"
        feed = api_client.get(f"{API}/stories/feed", headers=auth)
        assert feed.status_code == 200
        groups = feed.json() if isinstance(feed.json(), list) else feed.json().get("stories", [])
        stories = [s for g in groups for s in (g.get("stories") or [g])]
        assert any(s.get("image") == img for s in stories if isinstance(s, dict))

    def test_chat_photo_message(self, api_client, auth, user, friend, uploaded):
        media = f"{API}/files/{uploaded['path']}?token={uploaded['token']}"
        r = api_client.post(
            f"{API}/chat/send",
            json={"to_user": friend["user"]["id"], "type": "photo", "media": media},
            headers={**auth, "Content-Type": "application/json"},
        )
        assert r.status_code == 200, f"photo message failed: {r.text}"
        msg = r.json()
        assert msg.get("media") == media and msg.get("type") == "photo"
        hist = api_client.get(f"{API}/chat/with/{friend['user']['id']}", headers=auth)
        assert hist.status_code == 200
        msgs = hist.json() if isinstance(hist.json(), list) else hist.json().get("messages", [])
        assert any(m.get("id") == msg["id"] and m.get("media") == media for m in msgs)

    def test_help_ticket_with_screenshot(self, api_client, auth, uploaded):
        shot = f"{API}/files/{uploaded['path']}?token={uploaded['token']}"
        r = api_client.post(
            f"{API}/tickets",
            json={"subject": "TEST_upload ticket", "description": "screenshot attached", "screenshot": shot},
            headers={**auth, "Content-Type": "application/json"},
        )
        assert r.status_code == 200, f"ticket create failed: {r.text}"
        mine = api_client.get(f"{API}/tickets/me", headers=auth)
        assert mine.status_code == 200
        assert any(t.get("screenshot") == shot for t in mine.json())

    def test_verification_document_upload(self, api_client, auth, uploaded):
        doc = f"{API}/files/{uploaded['path']}?token={uploaded['token']}"
        r = api_client.post(
            f"{API}/verification",
            json={"document": doc, "full_legal_name": "Test Uploader", "note": "TEST_upload"},
            headers={**auth, "Content-Type": "application/json"},
        )
        # demo user is already verified → backend may reject resubmission (valid business rule)
        if r.status_code == 400 and "already verified" in r.text:
            mine = api_client.get(f"{API}/verification/me", headers=auth)
            assert mine.status_code == 200
            assert mine.json().get("status") in ("approved", "verified", "pending")
            assert mine.json().get("document"), "verified user has no stored document"
            return
        assert r.status_code == 200, f"verification submit failed: {r.text}"
        mine = api_client.get(f"{API}/verification/me", headers=auth)
        assert mine.status_code == 200
        assert mine.json().get("document") == doc


class TestRegressionBasics:
    """Confirm core flows still work"""

    def test_text_post_still_works(self, api_client, auth):
        r = api_client.post(
            f"{API}/posts",
            json={"type": "text", "text": "TEST_regression text post", "audience": "public"},
            headers={**auth, "Content-Type": "application/json"},
        )
        assert r.status_code == 200

    def test_feed_renders(self, api_client, auth):
        r = api_client.get(f"{API}/posts/feed", headers=auth)
        assert r.status_code == 200
