"""
Tests for new Glint features:
- Golden Hours (status + golden feed + post.golden flag)
- Glint Spark (balance/claim-daily/spark rules)
- Inner Circle (add/remove/list, max 10, friends-only)
- Voice Stories (create with media/duration, feed shape, inner audience filter)
- AI Caption Studio (Emergent LLM, 3-4 suggestions)
- Regression: audience-scoped feed/story visibility
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://interactive-glint.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _uniq():
    return uuid.uuid4().hex[:8]


def _auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _register(s, prefix):
    tag = _uniq()
    username = f"nf_{prefix.lower()}_{tag}"
    email = f"{username}@t.example.com"
    password = "TestPass123!"
    r = s.post(f"{API}/auth/register-init", json={
        "full_name": f"{prefix} User", "username": username,
        "method": "email", "contact": email, "password": password,
    })
    assert r.status_code == 200, r.text
    d = r.json()
    v = s.post(f"{API}/auth/verify-otp", json={"user_id": d["user_id"], "code": d["dev_otp"]})
    assert v.status_code == 200, v.text
    j = v.json()
    return {"id": j["user"]["id"], "username": username, "email": email,
            "password": password, "token": j["token"]}


def _befriend(s, a, b):
    r = s.post(f"{API}/friends/request/{b['id']}", headers=_auth(a["token"]))
    assert r.status_code == 200, r.text
    r = s.post(f"{API}/friends/accept/{a['id']}", headers=_auth(b["token"]))
    assert r.status_code == 200, r.text


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def ua(s):
    return _register(s, "A")


@pytest.fixture(scope="module")
def ub(s):
    return _register(s, "B")


@pytest.fixture(scope="module")
def uc(s):
    return _register(s, "C")


@pytest.fixture(scope="module")
def friends_ab(s, ua, ub):
    _befriend(s, ua, ub)
    return True


@pytest.fixture(scope="module")
def friends_ac(s, ua, uc):
    _befriend(s, ua, uc)
    return True


# ---------- Golden Hours ----------
class TestGolden:
    def test_status_shape(self, s, ua):
        r = s.get(f"{API}/golden/status", headers=_auth(ua["token"]))
        assert r.status_code == 200
        d = r.json()
        assert "active" in d and "next_start" in d
        assert isinstance(d["active"], bool)
        # ends_at only when active
        if d["active"]:
            assert d["ends_at"] is not None

    def test_post_has_golden_flag(self, s, ua):
        r = s.post(f"{API}/posts", headers=_auth(ua["token"]),
                   json={"type": "text", "text": "golden check", "audience": "public"})
        assert r.status_code == 200
        p = r.json()
        assert "golden" in p and isinstance(p["golden"], bool)

    def test_golden_feed_endpoint(self, s, ua):
        r = s.get(f"{API}/posts/golden", headers=_auth(ua["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        # All returned posts must be golden if any
        for p in r.json():
            assert p.get("golden") is True


# ---------- Glint Spark ----------
class TestSpark:
    def test_initial_balance_50(self, s, ua):
        r = s.get(f"{API}/spark/balance", headers=_auth(ua["token"]))
        assert r.status_code == 200
        d = r.json()
        assert d["balance"] >= 50
        assert "can_claim" in d

    def test_claim_daily_gives_10_once(self, s, ub):
        b0 = s.get(f"{API}/spark/balance", headers=_auth(ub["token"])).json()["balance"]
        c = s.post(f"{API}/spark/claim-daily", headers=_auth(ub["token"]))
        assert c.status_code == 200
        j = c.json()
        assert j["claimed"] is True
        assert j["balance"] == b0 + 10
        # second claim same day → claimed False
        c2 = s.post(f"{API}/spark/claim-daily", headers=_auth(ub["token"]))
        assert c2.status_code == 200
        assert c2.json()["claimed"] is False

    def test_spark_post_flow(self, s, ua, ub):
        # ua creates a post; ub sparks it
        pr = s.post(f"{API}/posts", headers=_auth(ua["token"]),
                    json={"type": "text", "text": "spark me"})
        pid = pr.json()["id"]
        # cannot spark own
        self_sp = s.post(f"{API}/posts/{pid}/spark", headers=_auth(ua["token"]))
        assert self_sp.status_code == 400
        # ub sparks
        b_before = s.get(f"{API}/spark/balance", headers=_auth(ub["token"])).json()["balance"]
        a_before = s.get(f"{API}/spark/balance", headers=_auth(ua["token"])).json()["balance"]
        sp = s.post(f"{API}/posts/{pid}/spark", headers=_auth(ub["token"]))
        assert sp.status_code == 200, sp.text
        # deduct 1 giver
        b_after = s.get(f"{API}/spark/balance", headers=_auth(ub["token"])).json()["balance"]
        a_after = s.get(f"{API}/spark/balance", headers=_auth(ua["token"])).json()["balance"]
        assert b_after == b_before - 1
        assert a_after == a_before + 1
        # post.sparks incremented
        pg = s.get(f"{API}/posts/{pid}", headers=_auth(ua["token"])).json()
        assert pg["sparks"] >= 1
        # cannot double-spark
        sp2 = s.post(f"{API}/posts/{pid}/spark", headers=_auth(ub["token"]))
        assert sp2.status_code == 400


# ---------- Inner Circle ----------
class TestInnerCircle:
    def test_add_requires_friendship(self, s, ua, uc):
        # ua and uc are NOT yet friends here (fixture order)
        r = s.post(f"{API}/inner-circle/{uc['id']}", headers=_auth(ua["token"]))
        assert r.status_code == 400

    def test_add_get_delete(self, s, ua, ub, friends_ab):
        # add ub to ua's inner circle
        r = s.post(f"{API}/inner-circle/{ub['id']}", headers=_auth(ua["token"]))
        assert r.status_code == 200
        # list
        gl = s.get(f"{API}/inner-circle", headers=_auth(ua["token"]))
        assert gl.status_code == 200
        assert any(u["id"] == ub["id"] for u in gl.json())
        # delete
        d = s.delete(f"{API}/inner-circle/{ub['id']}", headers=_auth(ua["token"]))
        assert d.status_code == 200
        gl2 = s.get(f"{API}/inner-circle", headers=_auth(ua["token"])).json()
        assert not any(u["id"] == ub["id"] for u in gl2)


# ---------- Voice Stories + audience ----------
class TestVoiceStories:
    def test_voice_story_stored(self, s, ua):
        r = s.post(f"{API}/stories", headers=_auth(ua["token"]),
                   json={"type": "voice", "media": "path/to/voice.m4a",
                         "duration": 4.2, "audience": "friends"})
        assert r.status_code == 200
        sid = r.json()["id"]
        # feed for author includes media+duration
        f = s.get(f"{API}/stories/feed", headers=_auth(ua["token"]))
        assert f.status_code == 200
        found = None
        for g in f.json():
            for st in g["stories"]:
                if st["id"] == sid:
                    found = st
                    break
        assert found is not None
        assert found["type"] == "voice"
        assert found["media"] == "path/to/voice.m4a"
        assert abs(found["duration"] - 4.2) < 0.01

    def test_inner_story_hidden_from_non_inner(self, s, ua, ub, uc, friends_ab, friends_ac):
        # ua adds ub to inner circle only
        s.post(f"{API}/inner-circle/{ub['id']}", headers=_auth(ua["token"]))
        # ua posts inner story
        r = s.post(f"{API}/stories", headers=_auth(ua["token"]),
                   json={"type": "text", "text": "secret", "audience": "inner", "bg_color": "#000"})
        assert r.status_code == 200
        sid = r.json()["id"]
        # ub (inner) sees it and has is_inner=true
        fb = s.get(f"{API}/stories/feed", headers=_auth(ub["token"])).json()
        ub_can_see = False
        for g in fb:
            if g["author"]["id"] == ua["id"]:
                assert g.get("is_inner") is True
                if any(st["id"] == sid for st in g["stories"]):
                    ub_can_see = True
        assert ub_can_see
        # uc (friend but not inner) does NOT see the inner story
        fc = s.get(f"{API}/stories/feed", headers=_auth(uc["token"])).json()
        for g in fc:
            if g["author"]["id"] == ua["id"]:
                assert not any(st["id"] == sid for st in g["stories"])


# ---------- Inner-audience posts ----------
class TestInnerPosts:
    def test_inner_post_visibility(self, s, ua, ub, uc, friends_ab, friends_ac):
        # ensure ub is in ua's inner circle, uc is not
        s.post(f"{API}/inner-circle/{ub['id']}", headers=_auth(ua["token"]))
        s.delete(f"{API}/inner-circle/{uc['id']}", headers=_auth(ua["token"]))
        pr = s.post(f"{API}/posts", headers=_auth(ua["token"]),
                    json={"type": "text", "text": "inner post", "audience": "inner"})
        assert pr.status_code == 200
        pid = pr.json()["id"]
        # ub sees it
        fb = s.get(f"{API}/posts/feed", headers=_auth(ub["token"])).json()
        assert any(p["id"] == pid for p in fb), "inner post should be visible to inner-circle friend"
        # uc does NOT see it (friend but not inner)
        fc = s.get(f"{API}/posts/feed", headers=_auth(uc["token"])).json()
        assert not any(p["id"] == pid for p in fc), "inner post must not be visible to non-inner friend"


# ---------- AI Caption Studio ----------
class TestAICaptions:
    def test_captions_returns_3_to_4(self, s, ua):
        r = s.post(f"{API}/ai/captions", headers=_auth(ua["token"]),
                   json={"topic": "sunset over the ocean", "tone": "poetic"})
        # 200 expected; may 502 if AI temporarily down — surface as failure to main agent
        assert r.status_code == 200, f"AI captions failed: {r.status_code} {r.text[:200]}"
        d = r.json()
        assert "suggestions" in d
        assert 3 <= len(d["suggestions"]) <= 4, f"expected 3-4 got {len(d['suggestions'])}: {d}"
        for c in d["suggestions"]:
            assert isinstance(c, str) and len(c.strip()) > 1
