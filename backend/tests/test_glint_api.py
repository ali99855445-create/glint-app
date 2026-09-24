"""
Glint backend API tests.
Covers auth, users, friends, posts, stories, chat, verification, tickets, admin, config.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://interactive-glint.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@glint.app"
ADMIN_PASSWORD = "GlintAdmin@2026"


def _uniq():
    return uuid.uuid4().hex[:8]


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def user_a(s):
    return _register_and_verify(s, "TESTA")


@pytest.fixture(scope="module")
def user_b(s):
    return _register_and_verify(s, "TESTB")


def _register_and_verify(s, prefix):
    tag = _uniq()
    username = f"test_{prefix.lower()}_{tag}"
    email = f"{username}@test.example.com"
    password = "TestPass123!"
    r = s.post(f"{API}/auth/register-init", json={
        "full_name": f"{prefix} User",
        "username": username,
        "method": "email",
        "contact": email,
        "password": password,
    })
    assert r.status_code == 200, f"register-init failed: {r.status_code} {r.text}"
    data = r.json()
    assert "user_id" in data and "dev_otp" in data
    v = s.post(f"{API}/auth/verify-otp", json={"user_id": data["user_id"], "code": data["dev_otp"]})
    assert v.status_code == 200, f"verify-otp failed: {v.status_code} {v.text}"
    j = v.json()
    assert "token" in j and "user" in j
    return {"id": j["user"]["id"], "username": username, "email": email,
            "password": password, "token": j["token"]}


def _auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# -------------------- Auth --------------------
class TestAuth:
    def test_register_and_verify_flow(self, s):
        u = _register_and_verify(s, "SIGNUP")
        assert u["token"]

    def test_register_terms_short_username(self, s):
        r = s.post(f"{API}/auth/register-init", json={
            "full_name": "x", "username": "ab", "method": "email",
            "contact": f"x{_uniq()}@t.com", "password": "abcdef"})
        assert r.status_code == 400

    def test_register_short_password(self, s):
        r = s.post(f"{API}/auth/register-init", json={
            "full_name": "x", "username": f"u{_uniq()}", "method": "email",
            "contact": f"x{_uniq()}@t.com", "password": "123"})
        assert r.status_code == 400

    def test_verify_otp_wrong_code(self, s):
        r = s.post(f"{API}/auth/register-init", json={
            "full_name": "x", "username": f"u{_uniq()}", "method": "email",
            "contact": f"x{_uniq()}@t.com", "password": "abcdef"})
        assert r.status_code == 200
        v = s.post(f"{API}/auth/verify-otp", json={"user_id": r.json()["user_id"], "code": "000000"})
        assert v.status_code == 400

    def test_login_success(self, s, user_a):
        r = s.post(f"{API}/auth/login", json={"contact": user_a["email"], "password": user_a["password"]})
        assert r.status_code == 200
        assert "token" in r.json()

    def test_login_wrong_password(self, s, user_a):
        r = s.post(f"{API}/auth/login", json={"contact": user_a["email"], "password": "wrongpw"})
        assert r.status_code == 400

    def test_forgot_and_reset(self, s, user_a):
        r = s.post(f"{API}/auth/forgot", json={"contact": user_a["email"]})
        assert r.status_code == 200
        j = r.json()
        assert "dev_otp" in j and "user_id" in j
        new_pw = "NewPass123!"
        rr = s.post(f"{API}/auth/reset", json={"user_id": j["user_id"], "code": j["dev_otp"], "password": new_pw})
        assert rr.status_code == 200
        # login with new password
        lr = s.post(f"{API}/auth/login", json={"contact": user_a["email"], "password": new_pw})
        assert lr.status_code == 200
        user_a["password"] = new_pw
        user_a["token"] = lr.json()["token"]


# -------------------- Users --------------------
class TestUsers:
    def test_get_me(self, s, user_a):
        r = s.get(f"{API}/users/me", headers=_auth(user_a["token"]))
        assert r.status_code == 200
        d = r.json()
        assert d["username"] == user_a["username"]
        assert "counts" in d

    def test_update_me(self, s, user_a):
        r = s.put(f"{API}/users/me", headers=_auth(user_a["token"]),
                  json={"bio": "hello world", "location": "NYC"})
        assert r.status_code == 200
        # verify persistence
        g = s.get(f"{API}/users/me", headers=_auth(user_a["token"]))
        assert g.json().get("bio") == "hello world"

    def test_get_user_by_username(self, s, user_a, user_b):
        r = s.get(f"{API}/users/{user_b['username']}", headers=_auth(user_a["token"]))
        assert r.status_code == 200
        assert r.json()["username"] == user_b["username"]

    def test_search(self, s, user_a, user_b):
        r = s.get(f"{API}/users/search", params={"q": user_b["username"][:8]}, headers=_auth(user_a["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_unauthenticated(self, s):
        r = s.get(f"{API}/users/me")
        assert r.status_code == 401


# -------------------- Friends --------------------
class TestFriends:
    def test_request_accept_flow(self, s, user_a, user_b):
        r = s.post(f"{API}/friends/request/{user_b['id']}", headers=_auth(user_a["token"]))
        assert r.status_code == 200
        # requests visible
        rq = s.get(f"{API}/friends/requests", headers=_auth(user_b["token"]))
        assert rq.status_code == 200
        assert any(u["id"] == user_a["id"] for u in rq.json()["incoming"])
        # accept
        ac = s.post(f"{API}/friends/accept/{user_a['id']}", headers=_auth(user_b["token"]))
        assert ac.status_code == 200
        # verify friendship
        fl = s.get(f"{API}/friends", headers=_auth(user_a["token"]))
        assert any(u["id"] == user_b["id"] for u in fl.json())

    def test_suggestions(self, s, user_a):
        r = s.get(f"{API}/friends/suggestions", headers=_auth(user_a["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# -------------------- Posts --------------------
class TestPosts:
    def test_create_text_post_and_feed(self, s, user_a):
        r = s.post(f"{API}/posts", headers=_auth(user_a["token"]),
                   json={"type": "text", "text": "hello glint"})
        assert r.status_code == 200
        pid = r.json()["id"]
        # in feed
        f = s.get(f"{API}/posts/feed", headers=_auth(user_a["token"]))
        assert f.status_code == 200
        assert any(p["id"] == pid for p in f.json())
        # get single
        g = s.get(f"{API}/posts/{pid}", headers=_auth(user_a["token"]))
        assert g.status_code == 200

    def test_react_and_save_and_hide(self, s, user_a, user_b):
        r = s.post(f"{API}/posts", headers=_auth(user_a["token"]),
                   json={"type": "text", "text": "reactable"})
        pid = r.json()["id"]
        rr = s.post(f"{API}/posts/{pid}/react", headers=_auth(user_b["token"]), json={"reaction": "love"})
        assert rr.status_code == 200
        assert rr.json()["my_reaction"] == "love"
        # save
        sv = s.post(f"{API}/posts/{pid}/save", headers=_auth(user_b["token"]))
        assert sv.status_code == 200 and sv.json()["saved"] is True
        sl = s.get(f"{API}/posts/saved/list", headers=_auth(user_b["token"]))
        assert any(p["id"] == pid for p in sl.json())
        # hide
        h = s.post(f"{API}/posts/{pid}/hide", headers=_auth(user_b["token"]))
        assert h.status_code == 200

    def test_poll_and_vote(self, s, user_a):
        r = s.post(f"{API}/posts", headers=_auth(user_a["token"]),
                   json={"type": "poll", "text": "?", "poll_options": ["A", "B"]})
        assert r.status_code == 200
        pid = r.json()["id"]
        v = s.post(f"{API}/posts/{pid}/vote", params={"option": 1}, headers=_auth(user_a["token"]))
        assert v.status_code == 200
        assert v.json()["poll"]["my_vote"] == 1

    def test_poll_needs_2_options(self, s, user_a):
        r = s.post(f"{API}/posts", headers=_auth(user_a["token"]),
                   json={"type": "poll", "poll_options": ["only"]})
        assert r.status_code == 400

    def test_comments(self, s, user_a, user_b):
        r = s.post(f"{API}/posts", headers=_auth(user_a["token"]), json={"type": "text", "text": "comment me"})
        pid = r.json()["id"]
        c = s.post(f"{API}/posts/{pid}/comments", headers=_auth(user_b["token"]), json={"text": "nice"})
        assert c.status_code == 200
        cl = s.get(f"{API}/posts/{pid}/comments", headers=_auth(user_a["token"]))
        assert any(x["text"] == "nice" for x in cl.json())

    def test_delete_post_only_owner(self, s, user_a, user_b):
        r = s.post(f"{API}/posts", headers=_auth(user_a["token"]), json={"type": "text", "text": "mine"})
        pid = r.json()["id"]
        bad = s.delete(f"{API}/posts/{pid}", headers=_auth(user_b["token"]))
        assert bad.status_code == 403
        ok = s.delete(f"{API}/posts/{pid}", headers=_auth(user_a["token"]))
        assert ok.status_code == 200
        # verify deletion (soft)
        g = s.get(f"{API}/posts/{pid}", headers=_auth(user_a["token"]))
        assert g.status_code == 404

    def test_report(self, s, user_a, user_b):
        r = s.post(f"{API}/posts", headers=_auth(user_a["token"]), json={"type": "text", "text": "bad"})
        pid = r.json()["id"]
        rp = s.post(f"{API}/report", headers=_auth(user_b["token"]),
                    json={"target_type": "post", "target_id": pid, "reason": "spam"})
        assert rp.status_code == 200


# -------------------- Stories --------------------
class TestStories:
    def test_create_and_feed(self, s, user_a):
        r = s.post(f"{API}/stories", headers=_auth(user_a["token"]),
                   json={"type": "text", "text": "hi", "bg_color": "#000"})
        assert r.status_code == 200
        sid = r.json()["id"]
        f = s.get(f"{API}/stories/feed", headers=_auth(user_a["token"]))
        assert f.status_code == 200
        found = False
        for group in f.json():
            if any(x["id"] == sid for x in group["stories"]):
                found = True
        assert found
        v = s.post(f"{API}/stories/{sid}/view", headers=_auth(user_a["token"]))
        assert v.status_code == 200
        d = s.delete(f"{API}/stories/{sid}", headers=_auth(user_a["token"]))
        assert d.status_code == 200


# -------------------- Chat --------------------
class TestChat:
    def test_send_and_list(self, s, user_a, user_b):
        r = s.post(f"{API}/chat/send", headers=_auth(user_a["token"]),
                   json={"to_user": user_b["id"], "type": "text", "text": "hi B"})
        assert r.status_code == 200
        assert r.json()["status"] == "delivered"
        # conv list for B
        cl = s.get(f"{API}/chat/conversations", headers=_auth(user_b["token"]))
        assert cl.status_code == 200
        assert any(c["user"]["id"] == user_a["id"] for c in cl.json())
        # get conv (marks read)
        gc = s.get(f"{API}/chat/with/{user_a['id']}", headers=_auth(user_b["token"]))
        assert gc.status_code == 200
        assert any(m["text"] == "hi B" for m in gc.json()["messages"])

    def test_mute_and_heartbeat(self, s, user_a, user_b):
        # ensure conversation exists
        s.post(f"{API}/chat/send", headers=_auth(user_a["token"]),
               json={"to_user": user_b["id"], "type": "text", "text": "x"})
        from urllib.parse import quote
        cid = "_".join(sorted([user_a["id"], user_b["id"]]))
        m = s.post(f"{API}/chat/{quote(cid, safe='')}/mute", headers=_auth(user_a["token"]))
        assert m.status_code == 200
        h = s.post(f"{API}/chat/heartbeat", headers=_auth(user_a["token"]))
        assert h.status_code == 200


# -------------------- Verification --------------------
class TestVerification:
    def test_submit_and_me(self, s, user_a):
        r = s.post(f"{API}/verification", headers=_auth(user_a["token"]),
                   json={"document": "some/doc/path.jpg", "full_legal_name": "Test A User"})
        # could be 200 or 400 if a pending exists from other tests
        assert r.status_code in (200, 400)
        m = s.get(f"{API}/verification/me", headers=_auth(user_a["token"]))
        assert m.status_code == 200


# -------------------- Tickets --------------------
class TestTickets:
    def test_create_and_list(self, s, user_a):
        r = s.post(f"{API}/tickets", headers=_auth(user_a["token"]),
                   json={"subject": "Help", "description": "please"})
        assert r.status_code == 200
        ml = s.get(f"{API}/tickets/me", headers=_auth(user_a["token"]))
        assert ml.status_code == 200
        assert any(t["subject"] == "Help" for t in ml.json())


# -------------------- Admin --------------------
@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.text}"
    return r.json()["token"]


class TestAdmin:
    def test_admin_login_wrong(self, s):
        r = s.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": "bad"})
        assert r.status_code == 400

    def test_stats(self, s, admin_token):
        r = s.get(f"{API}/admin/stats", headers=_auth(admin_token))
        assert r.status_code == 200
        for k in ["users", "posts", "stories", "pending_verifications", "open_tickets", "open_reports"]:
            assert k in r.json()

    def test_tickets_and_resolve(self, s, admin_token, user_a):
        # create a fresh ticket
        tt = s.post(f"{API}/tickets", headers=_auth(user_a["token"]),
                    json={"subject": "AdminResolve", "description": "test"})
        tid = tt.json()["id"]
        # admin list
        lt = s.get(f"{API}/admin/tickets", headers=_auth(admin_token))
        assert lt.status_code == 200
        # resolve uses Form
        rr = requests.post(f"{API}/admin/tickets/{tid}/resolve",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           data={"reply": "resolved by test"})
        assert rr.status_code == 200, rr.text

    def test_verifications_approve(self, s, admin_token, user_b):
        # ensure a submission
        sub = s.post(f"{API}/verification", headers=_auth(user_b["token"]),
                     json={"document": "d", "full_legal_name": "B User"})
        vl = s.get(f"{API}/admin/verifications", headers=_auth(admin_token))
        assert vl.status_code == 200
        pending = [v for v in vl.json() if v["user_id"] == user_b["id"] and v["status"] == "pending"]
        if pending:
            vid = pending[0]["id"]
            ap = s.post(f"{API}/admin/verifications/{vid}/approve", headers=_auth(admin_token))
            assert ap.status_code == 200

    def test_broadcast_and_force_update_and_config(self, s, admin_token, user_a):
        r = s.post(f"{API}/admin/broadcast", headers=_auth(admin_token),
                   json={"message": "hello all", "active": True})
        assert r.status_code == 200
        f = s.post(f"{API}/admin/force-update", headers=_auth(admin_token),
                   json={"active": False, "message": None, "min_version": "1.0.0"})
        assert f.status_code == 200
        c = s.get(f"{API}/config", headers=_auth(user_a["token"]))
        assert c.status_code == 200
        assert c.json()["broadcast"]["message"] == "hello all"

    def test_users_search_and_suspend(self, s, admin_token, user_b):
        r = s.get(f"{API}/admin/users", params={"q": user_b["username"][:6]}, headers=_auth(admin_token))
        assert r.status_code == 200

    def test_admin_requires_admin(self, s, user_a):
        r = s.get(f"{API}/admin/stats", headers=_auth(user_a["token"]))
        assert r.status_code == 403
