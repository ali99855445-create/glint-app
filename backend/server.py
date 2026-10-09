import os
import uuid
import random
import secrets
import hashlib
import hmac
import unicodedata
import re
import logging
import smtplib
import ssl
import json
import urllib.request
import urllib.error
import urllib.parse
import html
import base64
from email.message import EmailMessage
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Header, Query
from fastapi.responses import Response, HTMLResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
import jwt
import bcrypt

import storage_helper
import play_billing
from blue_profile_policy import normal_name_change_allowed
from blue_tick_admin import set_manual_blue_tick
from verification_badges import BADGES, display_badge
from chat_actions import install_chat_actions, message_for_viewer
from blue_verification_policy import assert_blue_application_allowed

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ.get("MONGO_URL", "mongodb://127.0.0.1:27017")
client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
db = client[os.environ.get("DB_NAME", "glint")]

JWT_SECRET = os.environ.get("JWT_SECRET") or uuid.uuid4().hex
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@glinttest.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ADMIN_EMAIL_2 = os.environ.get("ADMIN_EMAIL_2", "").strip()
ADMIN_PHONE = os.environ.get("ADMIN_PHONE", "").strip()
ACCOUNT_MIGRATION_USERNAME = os.environ.get("ACCOUNT_MIGRATION_USERNAME", "").strip().lower()
ACCOUNT_MIGRATION_EMAIL = os.environ.get("ACCOUNT_MIGRATION_EMAIL", "").strip().lower()
ACCOUNT_MIGRATION_ID = os.environ.get("ACCOUNT_MIGRATION_ID", "contact-v1").strip() or "contact-v1"
ADMIN_CREDS = [
    (ADMIN_EMAIL, ADMIN_PASSWORD),
    (ADMIN_EMAIL_2, os.environ.get("ADMIN_PASSWORD_2", "")),
]

SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465"))
SMTP_USERNAME = os.environ.get("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.environ.get("SMTP_FROM_EMAIL", SMTP_USERNAME).strip()
SMTP_FROM_NAME = os.environ.get("SMTP_FROM_NAME", "Glint").strip() or "Glint"
SMTP_SECURITY = os.environ.get("SMTP_SECURITY", "ssl").strip().lower()
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", SMTP_FROM_EMAIL or "noreply@glinttest.com").strip()
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_VERIFY_SERVICE_SID = os.environ.get("TWILIO_VERIFY_SERVICE_SID", "").strip()
INFOBIP_BASE_URL = os.environ.get("INFOBIP_BASE_URL", "").strip().rstrip("/")
INFOBIP_API_KEY = os.environ.get("INFOBIP_API_KEY", "")
INFOBIP_SMS_SENDER = os.environ.get("INFOBIP_SMS_SENDER", "ServiceSMS").strip() or "ServiceSMS"
DEV_OTP_ENABLED = os.environ.get("DEV_OTP_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}

app = FastAPI()
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("glint")


# ----------------------------- helpers -----------------------------
def now_iso():
    return datetime.now(timezone.utc).isoformat()


def now_dt():
    return datetime.now(timezone.utc)


def new_id():
    return str(uuid.uuid4())


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def _send_smtp_email_sync(to_email: str, subject: str, body: str) -> None:
    if not (SMTP_HOST and SMTP_USERNAME and SMTP_PASSWORD and SMTP_FROM_EMAIL):
        raise RuntimeError("SMTP is not configured")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
    msg["To"] = to_email
    msg.set_content(body)

    context = ssl.create_default_context()
    if SMTP_SECURITY == "ssl":
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context, timeout=20) as server:
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)


def _send_resend_email_sync(to_email: str, subject: str, body: str) -> None:
    if not (RESEND_API_KEY and RESEND_FROM_EMAIL):
        raise RuntimeError("Resend is not configured")

    payload = json.dumps({
        "from": f"{SMTP_FROM_NAME} <{RESEND_FROM_EMAIL}>",
        "to": [to_email],
        "subject": subject,
        "text": body,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "Glint/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        if response.status < 200 or response.status >= 300:
            raise RuntimeError(f"Resend returned HTTP {response.status}")


async def send_otp_email(to_email: str, code: str, purpose: str) -> bool:
    if not RESEND_API_KEY and not (SMTP_HOST and SMTP_USERNAME and SMTP_PASSWORD and SMTP_FROM_EMAIL):
        logger.warning("No email provider is configured; email OTP was not sent")
        return False

    if purpose == "reset":
        subject = "Glint password reset code"
        intro = "Use this code to reset your Glint password:"
    else:
        subject = "Your Glint verification code"
        intro = "Use this code to verify your Glint account:"

    body = (
        f"{intro}\n\n"
        f"{code}\n\n"
        "This code is for your Glint account. If you did not request it, you can ignore this email."
    )
    try:
        if RESEND_API_KEY:
            await run_in_threadpool(_send_resend_email_sync, to_email, subject, body)
        else:
            await run_in_threadpool(_send_smtp_email_sync, to_email, subject, body)
        return True
    except Exception:
        logger.exception("Failed to send OTP email")
        return False


async def send_moderation_email(to_email: Optional[str], subject: str, body: str) -> bool:
    if not to_email or not _email_provider_configured():
        return False
    try:
        if RESEND_API_KEY:
            await run_in_threadpool(_send_resend_email_sync, to_email, subject, body)
        else:
            await run_in_threadpool(_send_smtp_email_sync, to_email, subject, body)
        return True
    except Exception:
        logger.exception("Failed to send moderation email")
        return False


async def active_suspension(user: dict) -> Optional[dict]:
    if not user.get("suspended"):
        return None
    return {"reason": user.get("suspend_reason") or "Violation of Glint rules", "until": None}


def _infobip_sms_configured() -> bool:
    return bool(INFOBIP_BASE_URL and INFOBIP_API_KEY)


def _infobip_send_sms_sync(phone: str, code: str) -> dict:
    if not _infobip_sms_configured():
        raise RuntimeError("Infobip SMS is not configured")
    payload = json.dumps({
        "messages": [{
            "sender": INFOBIP_SMS_SENDER,
            "destinations": [{"to": phone.lstrip("+")}],
            "content": {"text": f"Your Glint verification code is {code}. It expires in 10 minutes."},
        }]
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{INFOBIP_BASE_URL}/sms/3/messages",
        data=payload,
        headers={
            "Authorization": f"App {INFOBIP_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Glint/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(f"Infobip returned HTTP {response.status}")
            return data
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        logger.error("Infobip SMS HTTP %s: %s", exc.code, detail[:500])
        raise


async def _send_infobip_phone_otp(phone: str, code: str) -> bool:
    try:
        data = await run_in_threadpool(_infobip_send_sms_sync, phone, code)
        messages = data.get("messages") or []
        if not messages:
            return False
        status = (messages[0].get("status") or {}).get("groupName")
        return status in {"PENDING", "DELIVERED"}
    except Exception:
        logger.exception("Failed to send Infobip phone verification")
        return False


def _twilio_verify_configured() -> bool:
    return bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID)


def normalize_phone(value: str) -> str:
    raw = (value or "").strip()
    cleaned = "+" + "".join(ch for ch in raw[1:] if ch.isdigit()) if raw.startswith("+") else ""
    digits = cleaned[1:] if cleaned.startswith("+") else ""
    if not cleaned or not digits.isdigit() or len(digits) < 8 or len(digits) > 15:
        raise HTTPException(400, "Enter phone number with country code, for example +9665XXXXXXXX")
    return cleaned


def _twilio_basic_auth() -> str:
    token = base64.b64encode(f"{TWILIO_ACCOUNT_SID}:{TWILIO_AUTH_TOKEN}".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def _twilio_verify_request_sync(path: str, payload: dict) -> dict:
    if not _twilio_verify_configured():
        raise RuntimeError("Twilio Verify is not configured")
    body = urllib.parse.urlencode(payload).encode("utf-8")
    req = urllib.request.Request(
        f"https://verify.twilio.com/v2/Services/{TWILIO_VERIFY_SERVICE_SID}/{path}",
        data=body,
        headers={
            "Authorization": _twilio_basic_auth(),
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Glint/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
            return data
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        logger.error("Twilio Verify HTTP %s: %s", exc.code, detail[:500])
        raise


async def send_phone_otp(phone: str, code: str) -> bool:
    # Prefer Infobip for the current Glint test flow. Keep Twilio as a fallback
    # so switching providers only requires environment configuration.
    if _infobip_sms_configured():
        return await _send_infobip_phone_otp(phone, code)
    if _twilio_verify_configured():
        try:
            data = await run_in_threadpool(
                _twilio_verify_request_sync,
                "Verifications",
                {"To": phone, "Channel": "sms"},
            )
            return data.get("status") in {"pending", "approved"}
        except Exception:
            logger.exception("Failed to start Twilio phone verification")
            return False
    return False


async def check_phone_otp(phone: str, code: str) -> bool:
    if not _twilio_verify_configured():
        return False
    try:
        data = await run_in_threadpool(
            _twilio_verify_request_sync,
            "VerificationCheck",
            {"To": phone, "Code": code},
        )
        return data.get("status") == "approved"
    except Exception:
        logger.exception("Failed to check Twilio phone verification")
        return False


def make_token(user_id: str, is_admin: bool = False) -> str:
    payload = {
        "sub": user_id,
        "admin": is_admin,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


async def issue_session(user_id: str, device: str = 'Glint app') -> str:
    sid=new_id()
    await db.sessions.insert_one({'id':sid,'user_id':user_id,'device':device[:100],'created_at':now_iso(),'revoked':False})
    payload=decode_token(make_token(user_id))
    payload['sid']=sid
    return jwt.encode(payload,JWT_SECRET,algorithm='HS256')


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])


def parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


async def app_feature_enabled(name: str, default: bool = True) -> bool:
    cfg = await db.config.find_one({"id": "app"}, {"_id": 0, "feature_flags": 1}) or {}
    flags = cfg.get("feature_flags") or {}
    return bool(flags.get(name, default))


async def ensure_not_restricted(user: dict, field: str, label: str):
    until = parse_iso_datetime(user.get(field))
    if not until:
        return
    if until <= datetime.now(timezone.utc):
        await db.users.update_one({"id": user["id"]}, {"$set": {field: None}})
        user[field] = None
        return
    reason = user.get("restriction_reason") or "Temporary account restriction"
    raise HTTPException(403, f"{label} is temporarily restricted until {until.isoformat()}. Reason: {reason}")


async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(401, "Invalid token")
    if payload.get('restricted'):
        raise HTTPException(403, 'Appeal-only session. Please sign in again.')
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    force_logout_at = parse_iso_datetime(user.get("force_logout_at"))
    if force_logout_at:
        if payload.get('sid'):
            session=await db.sessions.find_one({'id':payload['sid'],'user_id':user['id'],'revoked':False})
            created=parse_iso_datetime((session or {}).get('created_at'))
            if not created or created<=force_logout_at:
                raise HTTPException(401,'Session expired. Please sign in again.')
        elif not payload.get('restricted'):
            token_iat=payload.get('iat')
            if not token_iat or int(token_iat)<=int(force_logout_at.timestamp()):
                raise HTTPException(401,'Session expired. Please sign in again.')
    if user.get("deactivated"):
        raise HTTPException(403, "Account deactivated. Sign in to reactivate.")
    if user.get("deleted_at"):
        reason = user.get("deleted_reason") or "This account has been removed by Glint."
        raise HTTPException(403, f"Account removed. Reason: {reason}")
    sid = payload.get("sid")
    if not sid and user.get('legacy_sessions_revoked'):
        raise HTTPException(401,'Session expired. Please sign in again.')
    if sid and not await db.sessions.find_one({"id": sid, "user_id": user["id"], "revoked": False}):
        raise HTTPException(401, "Session expired. Please sign in again.")
    suspension = await active_suspension(user)
    if suspension:
        until_text = f" Until: {suspension['until']}." if suspension.get("until") else ""
        raise HTTPException(403, f"Account suspended. Reason: {suspension['reason']}.{until_text}")
    if user.get("blue_purchase_token"):
        checked = parse_iso_datetime(user.get("blue_subscription_checked_at"))
        if not checked or now_dt() - checked > timedelta(minutes=5):
            try:
                result = await run_in_threadpool(play_billing.verify_subscription, user["blue_purchase_token"], user["id"])
                fields = {"blue_subscription_status": "active", "blue_subscription_ends_at": result["ends_at"], "blue_subscription_auto_renew": result["auto_renew"], "blue_subscription_checked_at": now_iso()}
            except ValueError:
                fields = {"blue_subscription_status": "inactive", "blue_subscription_checked_at": now_iso()}
            except Exception:
                # A network/configuration failure cannot grant paid access.
                fields = {"blue_subscription_status": "unavailable"}
            user.update(fields)
            if fields["blue_subscription_status"] != "unavailable":
                await db.users.update_one({"id": user["id"]}, {"$set": fields})
    return user


async def get_authenticated_user_allow_suspended(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    force_logout_at = parse_iso_datetime(user.get("force_logout_at"))
    if force_logout_at:
        if payload.get('sid'):
            session=await db.sessions.find_one({'id':payload['sid'],'user_id':user['id'],'revoked':False})
            created=parse_iso_datetime((session or {}).get('created_at'))
            if not created or created<=force_logout_at:
                raise HTTPException(401,'Session expired. Please sign in again.')
        elif not payload.get('restricted'):
            token_iat=payload.get('iat')
            if not token_iat or int(token_iat)<=int(force_logout_at.timestamp()):
                raise HTTPException(401,'Session expired. Please sign in again.')
    if user.get("deleted_at"):
        raise HTTPException(403, "Account removed")
    sid=payload.get('sid')
    if sid and not await db.sessions.find_one({'id':sid,'user_id':user['id'],'revoked':False}):
        raise HTTPException(401,'Session expired. Please sign in again.')
    return user


async def require_admin(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(401, "Invalid token")
    if not payload.get("admin"):
        raise HTTPException(403, "Admin only")
    return payload


async def require_messenger_admin(me=Depends(get_current_user)):
    email = (me.get("email") or "").strip().lower()
    allowed_emails = {e.strip().lower() for e, _ in ADMIN_CREDS if e}
    phone = "".join(ch for ch in str(me.get("phone") or "") if ch.isdigit())
    allowed_phone = "".join(ch for ch in ADMIN_PHONE if ch.isdigit())
    if (email and email in allowed_emails) or (phone and allowed_phone and phone == allowed_phone):
        return me
    raise HTTPException(403, "Messenger admin only")


async def require_review_admin(authorization: Optional[str] = Header(None)):
    # The app dashboard uses its separate admin session; messenger tools use a user session.
    try:
        return await require_admin(authorization)
    except HTTPException as exc:
        if exc.status_code != 403:
            raise
    me = await get_current_user(authorization)
    return await require_messenger_admin(me)


def identity_name(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value or "").casefold().split())


async def require_owned_identity_file(url: str, user_id: str, media: str):
    path = urllib.parse.urlparse(url).path.removeprefix("/api/files/")
    if not await db.files.find_one({"path": path, "owner_id": user_id, "content_type": {"$regex": "^" + media + "/"}}):
        raise HTTPException(400, "Upload your own ID document and record a live selfie video in the app")


class ContactLinkRequest(BaseModel):
    kind: str
    contact: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class ContactLinkConfirm(BaseModel):
    request_id: str
    code: str = Field(pattern=r"^[0-9]{6}$")


@api.post("/account/contact/request")
async def request_contact_link(body: ContactLinkRequest, me=Depends(get_current_user)):
    if body.kind not in {"email", "phone"}:
        raise HTTPException(400, "Choose email or phone")
    if not verify_pw(body.password, me.get("password") or ""):
        raise HTTPException(403, "Your current password is incorrect")
    contact = body.contact.strip().lower() if body.kind == "email" else normalize_phone(body.contact)
    if body.kind == "email" and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", contact):
        raise HTTPException(400, "Enter a valid email address")
    if await db.users.find_one({body.kind: contact, "verified": True, "deleted_at": None, "id": {"$ne": me["id"]}}):
        raise HTTPException(409, "This contact is already linked to another account")
    recent = await db.contact_verifications.find_one({"user_id": me["id"], "created_at": {"$gt": (now_dt()-timedelta(seconds=60)).isoformat()}})
    if recent:
        raise HTTPException(429, "Wait 60 seconds before requesting another code")
    hourly = await db.contact_verifications.count_documents({"user_id": me["id"], "created_at": {"$gt": (now_dt()-timedelta(hours=1)).isoformat()}})
    if hourly >= 5:
        raise HTTPException(429, "Too many codes requested. Try again later")
    code = f"{secrets.randbelow(1000000):06d}"
    rid = new_id()
    provider = "twilio" if body.kind == "phone" and not _infobip_sms_configured() else "local"
    await db.contact_verifications.update_many({"user_id": me["id"], "status": "pending"}, {"$set": {"status": "superseded"}})
    await db.contact_verifications.insert_one({"id": rid, "user_id": me["id"], "kind": body.kind, "contact": contact, "old_contact": me.get(body.kind), "code_hash": hashlib.sha256((rid+code).encode()).hexdigest(), "provider": provider, "attempts": 0, "status": "pending", "created_at": now_iso(), "expires_at": (now_dt()+timedelta(minutes=10)).isoformat()})
    sent = await send_otp_email(contact, code, "contact") if body.kind == "email" else await send_phone_otp(contact, code)
    if not sent:
        await db.contact_verifications.update_one({"id": rid}, {"$set": {"status": "delivery_failed"}})
        raise HTTPException(503, "Could not send verification code. Please try again later")
    return {"request_id": rid, "message": "Verification code sent", "expires_in": 600}


@api.post("/account/contact/confirm")
async def confirm_contact_link(body: ContactLinkConfirm, me=Depends(get_current_user)):
    record = await db.contact_verifications.find_one_and_update({"id": body.request_id, "user_id": me["id"], "status": "pending", "attempts": {"$lt": 5}, "expires_at": {"$gt": now_iso()}}, {"$inc": {"attempts": 1}})
    if not record:
        raise HTTPException(400, "Code expired or too many attempts. Request a new code")
    valid = await check_phone_otp(record["contact"], body.code) if record["provider"] == "twilio" else hmac.compare_digest(record["code_hash"], hashlib.sha256((body.request_id+body.code).encode()).hexdigest())
    if not valid:
        raise HTTPException(400, "Invalid verification code")
    kind, contact = record["kind"], record["contact"]
    if await db.users.find_one({kind: contact, "verified": True, "deleted_at": None, "id": {"$ne": me["id"]}}):
        raise HTTPException(409, "This contact is already linked to another account")
    # A unique index closes concurrent signup/link races. Fail closed on legacy duplicates.
    try:
        await db.users.create_index([(kind, 1)], name="unique_verified_"+kind, unique=True, partialFilterExpression={"verified": True, kind: {"$type": "string"}, "deleted_at": None})
    except Exception:
        logger.exception("Contact uniqueness check could not be established")
        raise HTTPException(503, "Contact linking is temporarily unavailable. Contact Glint support")
    claimed = await db.contact_verifications.find_one_and_update({"id": body.request_id, "user_id": me["id"], "status": "pending"}, {"$set": {"status": "consumed"}})
    if not claimed:
        raise HTTPException(409, "This code has already been used")
    try:
        result = await db.users.update_one({"id": me["id"], kind: record.get("old_contact"), "deleted_at": None}, {"$set": {kind: contact, kind+"_verified": True}})
    except Exception:
        raise HTTPException(409, "This contact could not be linked. Request a new code")
    if not result.matched_count:
        raise HTTPException(409, "Account contact changed. Request a new code")
    await admin_notify(me["id"], f"Your {kind} was updated and verified.")
    return {"ok": True, "message": "Contact verified and linked"}


def public_user(u: dict) -> dict:
    if not u:
        return None
    return {
        "id": u["id"],
        "full_name": u.get("full_name"),
        "username": u.get("username"),
        "avatar": u.get("avatar"),
        "cover": u.get("cover"),
        "bio": u.get("bio"),
        "external_links": u.get("external_links", []) if play_billing.blue_active(u) else [],
        "location": u.get("location"),
        "verified": play_billing.blue_active(u),
        "blue_tick_active": play_billing.blue_active(u),
        "verification_badge": display_badge(u, play_billing.blue_active),
        "privacy": u.get("privacy", "public"),
        "created_at": u.get("created_at"),
    }


async def are_friends(a: str, b: str) -> bool:
    f = await db.friendships.find_one({"users": {"$all": [a, b]}})
    return f is not None


async def notify(to_user: str, from_user: str, ntype: str, ref_id: Optional[str], text: str, message_id: Optional[str] = None):
    if to_user == from_user:
        return
    recipient = await db.users.find_one({"id": to_user})
    if not recipient or recipient.get("suspended") or recipient.get("deleted_at") or recipient.get("deactivated"):
        return
    if ntype == "message":
        if from_user in recipient.get("chat_blocked", []): return
        conversation = await db.conversations.find_one({"id": ref_id, "is_group": True}) if ref_id else None
        if not conversation: conversation = await db.conversations.find_one({"id": conv_id_for(to_user, from_user)})
        if conversation and to_user in conversation.get("muted_by", []): return
    pref = recipient.get("settings", {}).get("notifications", {}).get(ntype, "everyone")
    if pref == "off" or (pref == "friends" and not await are_friends(to_user, from_user)):
        return
    await db.notifications.insert_one({
        "id": new_id(), "to_user": to_user, "from_user": from_user,
        "type": ntype, "ref_id": ref_id, "text": text, "message_id": message_id,
        "read": False, "created_at": now_iso(),
    })


async def get_user_name(uid: str) -> str:
    u = await db.users.find_one({"id": uid}, {"_id": 0, "full_name": 1})
    return u.get("full_name", "Someone") if u else "Someone"


GOLDEN_HOUR_UTC = 18  # daily 18:00-19:00 UTC Golden Hour


def golden_window():
    now = now_dt()
    start = now.replace(hour=GOLDEN_HOUR_UTC, minute=0, second=0, microsecond=0)
    end = start + timedelta(hours=1)
    active = start <= now < end
    if now < start:
        next_start = start
    elif now >= end:
        next_start = start + timedelta(days=1)
    else:
        next_start = start
    return active, start, end, next_start


async def can_view_post(post: dict, author: dict, viewer_id: str, friend_ids: set) -> bool:
    if post.get('archived'):
        return False
    if author.get("suspended") or author.get("deleted_at") or author.get("deactivated"):
        return False
    if viewer_id in author.get("blocked", []):
        return False
    aud = post.get("audience", "public")
    if aud == "only_me" and author["id"] != viewer_id:
        return False
    if author["id"] == viewer_id:
        return True
    profile_privacy = author.get("privacy", "public")
    if profile_privacy == "only_me":
        return False
    if aud == "inner":
        return viewer_id in author.get("inner_circle", [])
    if aud == "friends" or profile_privacy == "friends":
        return post["author_id"] in friend_ids
    return True


async def enrich_author(user_id: str) -> dict:
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    return None if not u or u.get("suspended") or u.get("deleted_at") or u.get("deactivated") else public_user(u)


# ----------------------------- models -----------------------------
class RegisterInit(BaseModel):
    full_name: str
    username: str
    method: str  # "email" | "phone"
    contact: str  # email or phone
    password: str


class VerifyOtp(BaseModel):
    user_id: str
    code: str


class LoginBody(BaseModel):
    contact: str
    password: str
    second_factor: Optional[str] = None


class ForgotBody(BaseModel):
    contact: str


class ResetBody(BaseModel):
    user_id: str
    code: str
    password: str


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    avatar: Optional[str] = None
    cover: Optional[str] = None
    privacy: Optional[str] = None
    contact_visibility: Optional[str] = None


class PostCreate(BaseModel):
    type: str = "text"  # text | photo | poll
    text: Optional[str] = ""
    image: Optional[str] = None
    poll_options: Optional[List[str]] = None
    audience: Optional[str] = None  # account default when omitted


class StoryCreate(BaseModel):
    type: str  # photo | text | voice
    image: Optional[str] = None
    text: Optional[str] = None
    bg_color: Optional[str] = None
    media: Optional[str] = None
    duration: Optional[float] = None
    audience: Optional[str] = None  # account default when omitted


class CaptionRequest(BaseModel):
    topic: str
    tone: str = "witty"


class CommentCreate(BaseModel):
    text: str


class ReactionBody(BaseModel):
    reaction: Optional[str] = None  # like|love|haha|wow|sad|angry or null to remove


class ReportBody(BaseModel):
    target_type: str
    target_id: str
    reason: str


class MessageCreate(BaseModel):
    conversation_id: Optional[str] = None
    to_user: Optional[str] = None
    type: str = "text"  # text | photo | voice
    text: Optional[str] = None
    media: Optional[str] = None
    duration: Optional[float] = None
    reply_to: Optional[str] = None


class GroupCreate(BaseModel):
    name: str
    member_ids: List[str]
    avatar: Optional[str] = None
    description: Optional[str] = None


class GroupSettingsBody(BaseModel):
    name: Optional[str] = None
    avatar: Optional[str] = None
    description: Optional[str] = None
    send_permission: Optional[str] = None


class GroupVerificationApplyBody(BaseModel):
    purpose: str
    note: Optional[str] = None


class MessengerAdminReasonBody(BaseModel):
    reason: str = "Messenger moderation action"


class MessengerAdminControlsBody(BaseModel):
    group_creation_enabled: Optional[bool] = None
    group_verification_enabled: Optional[bool] = None
    group_messaging_enabled: Optional[bool] = None


class VerificationSubmit(BaseModel):
    document: str
    selfie: str
    full_legal_name: str = Field(min_length=1, max_length=150)
    note: Optional[str] = None


class TicketCreate(BaseModel):
    subject: str
    description: str
    screenshot: Optional[str] = None


class AdminLogin(BaseModel):
    email: str
    password: str


class BroadcastBody(BaseModel):
    message: str
    active: bool = True


class ForceUpdateBody(BaseModel):
    active: bool
    message: Optional[str] = None
    min_version: Optional[str] = None


class AdminReasonBody(BaseModel):
    reason: str = "Violation of Glint rules"


class AdminSuspendBody(BaseModel):
    reason: str = "Violation of Glint rules"
    duration_days: Optional[int] = 7  # 0/None = indefinite


class AdminBlueTickBody(BaseModel):
    verified: bool
    reason: Optional[str] = None


class AdminUserEditBody(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    privacy: Optional[str] = None
    contact_visibility: Optional[str] = None


class AdminWarningBody(BaseModel):
    reason: str = "Please review Glint's community rules."


class AdminRestrictionBody(BaseModel):
    posting_days: Optional[int] = None
    messaging_days: Optional[int] = None
    reason: str = "Temporary account restriction"


class AdminAppControlsBody(BaseModel):
    maintenance_mode: Optional[bool] = None
    maintenance_message: Optional[str] = None
    registration_enabled: Optional[bool] = None
    uploads_enabled: Optional[bool] = None
    posts_enabled: Optional[bool] = None
    stories_enabled: Optional[bool] = None
    chat_enabled: Optional[bool] = None
    verification_enabled: Optional[bool] = None


class AppealCreateBody(BaseModel):
    category: str = "account"
    reason: str


class AdminAppealDecisionBody(BaseModel):
    decision: str
    note: str = ""
    restore_account: bool = False


def _email_provider_configured() -> bool:
    if RESEND_API_KEY and RESEND_FROM_EMAIL:
        return True
    return bool(SMTP_HOST and SMTP_USERNAME and SMTP_PASSWORD and SMTP_FROM_EMAIL)


@app.get("/health")
async def health():
    mongo_ok = False
    try:
        await client.admin.command("ping")
        mongo_ok = True
    except Exception:
        mongo_ok = False
    email_ok = _email_provider_configured()
    return {
        "status": "ok" if mongo_ok and email_ok else "degraded",
        "mongodb": mongo_ok,
        "play_billing_configured": bool(os.getenv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "").strip()),
        "email_configured": email_ok,
        "email_provider": "resend" if RESEND_API_KEY else ("smtp" if email_ok else "none"),
        "sms_configured": _infobip_sms_configured() or _twilio_verify_configured(),
        "sms_provider": "infobip" if _infobip_sms_configured() else ("twilio_verify" if _twilio_verify_configured() else "none"),
    }



# ----------------------------- auth -----------------------------
@api.post("/auth/register-init")
async def register_init(body: RegisterInit):
    if not await app_feature_enabled("registration_enabled", True):
        raise HTTPException(503, "New account registration is temporarily unavailable.")
    username = body.username.strip().lower()
    if len(username) < 3:
        raise HTTPException(400, "Username must be at least 3 characters")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    existing = await db.users.find_one({"username": username, "deleted_at": None})
    if existing:
        raise HTTPException(400, "Username already taken")
    field = "email" if body.method == "email" else "phone"
    contact = body.contact.strip().lower() if field == "email" else normalize_phone(body.contact)
    dup = await db.users.find_one({field: contact, "verified": True, "deleted_at": None})
    if dup:
        raise HTTPException(400, f"An account with this {field} already exists")

    code = f"{random.randint(0, 999999):06d}"
    uid = new_id()
    doc = {
        "id": uid,
        "full_name": body.full_name.strip(),
        "username": username,
        "email": contact if field == "email" else None,
        "phone": contact if field == "phone" else None,
        "password": hash_pw(body.password),
        "avatar": None,
        "cover": None,
        "bio": None,
        "location": None,
        "verified": False,  # email/phone OTP verified
        "phone_verified": False,
        "golden_tick": False,
        "sparks": 50,
        "inner_circle": [],
        "last_spark_bonus": None,
        "otp": code,
        "otp_expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        "otp_attempts": 0,
        "otp_purpose": "signup",
        "privacy": "public",
        "contact_visibility": "only_me",
        "suspended": False,
        "deleted_at": None,
        "created_at": now_iso(),
    }
    # remove any stale unverified signup for same username
    await db.users.delete_many({"username": username, "verified": False})
    await db.users.insert_one(doc)
    logger.info(f"[OTP] signup code generated for {contact}")
    if field == "email":
        sent = await send_otp_email(contact, code, "signup")
        if not sent and not DEV_OTP_ENABLED:
            raise HTTPException(503, "Unable to send verification email. Please try again later.")
    else:
        if DEV_OTP_ENABLED:
            sent = True
        else:
            sent = await send_phone_otp(contact, code)
        if not sent:
            raise HTTPException(503, "Unable to send phone verification code. Check the phone number and try again.")

    response = {"user_id": uid, "message": "OTP sent"}
    if DEV_OTP_ENABLED:
        response["dev_otp"] = code
    return response


@api.post("/auth/verify-otp")
async def verify_otp(body: VerifyOtp):
    u = await db.users.find_one({"id": body.user_id})
    if not u:
        raise HTTPException(404, "User not found")
    if u.get('verified') or u.get('otp_purpose')!='signup' or u.get('deleted_at') or u.get('suspended'):
        raise HTTPException(403,'Use the sign-in screen for this account')
    if u.get("phone") and not DEV_OTP_ENABLED:
        if _infobip_sms_configured():
            expires_raw = u.get("otp_expires_at")
            expired = True
            if expires_raw:
                try:
                    exp = datetime.fromisoformat(str(expires_raw).replace("Z", "+00:00"))
                    if exp.tzinfo is None:
                        exp = exp.replace(tzinfo=timezone.utc)
                    expired = exp <= datetime.now(timezone.utc)
                except Exception:
                    expired = True
            if expired:
                raise HTTPException(400, "Phone verification code expired. Request a new code.")
            attempts = int(u.get("otp_attempts") or 0)
            if attempts >= 5:
                raise HTTPException(429, "Too many incorrect attempts. Request a new code.")
            if u.get("otp") != body.code.strip():
                await db.users.update_one({"id": body.user_id}, {"$inc": {"otp_attempts": 1}})
                raise HTTPException(400, "Invalid phone verification code")
        elif _twilio_verify_configured():
            if not await check_phone_otp(u["phone"], body.code.strip()):
                raise HTTPException(400, "Invalid or expired phone verification code")
        else:
            raise HTTPException(503, "Phone verification provider is not configured")
    elif u.get("otp") != body.code:
        raise HTTPException(400, "Invalid OTP code")
    verify_update = {"verified": True, "otp": None, "otp_expires_at": None, "otp_attempts": 0}
    if u.get("phone"):
        verify_update["phone_verified"] = True
    await db.users.update_one({"id": body.user_id}, {"$set": verify_update})
    token = await issue_session(body.user_id)
    fresh = await db.users.find_one({"id": body.user_id}, {"_id": 0})
    return {"token": token, "user": public_user(fresh)}


@api.post("/auth/resend-otp")
async def resend_otp(body: VerifyOtp):
    u = await db.users.find_one({"id": body.user_id})
    if not u:
        raise HTTPException(404, "User not found")
    code = f"{random.randint(0, 999999):06d}"
    await db.users.update_one({"id": body.user_id}, {"$set": {"otp": code, "otp_expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(), "otp_attempts": 0}})
    logger.info(f"[OTP] resend generated for {u.get('username')}")
    email = u.get("email")
    phone = u.get("phone")
    if email:
        sent = await send_otp_email(email, code, "signup")
        if not sent and not DEV_OTP_ENABLED:
            raise HTTPException(503, "Unable to resend verification email. Please try again later.")
    elif phone:
        if DEV_OTP_ENABLED:
            sent = True
        else:
            sent = await send_phone_otp(phone, code)
        if not sent:
            raise HTTPException(503, "Unable to resend phone verification code. Please try again later.")
    else:
        raise HTTPException(400, "No verification contact found")

    response = {"message": "OTP resent"}
    if DEV_OTP_ENABLED:
        response["dev_otp"] = code
    return response


@api.post("/auth/login")
async def login(body: LoginBody):
    contact = body.contact.strip().lower()
    if contact.startswith("+"):
        contact = normalize_phone(contact)
    u = await db.users.find_one(
        {
            "$or": [{"email": contact}, {"phone": contact}, {"username": contact}],
            "deleted_at": None,
        },
        sort=[("verified", -1), ("created_at", -1)],
    )
    if not u or not verify_pw(body.password, u["password"]):
        raise HTTPException(400, "Invalid credentials")
    if u.get("deleted_at"):
        reason = u.get("deleted_reason") or "This account has been removed by Glint."
        raise HTTPException(403, f"Account removed. Reason: {reason}")
    if not u.get("verified"):
        raise HTTPException(403, "Please verify your account first")
    if u.get('two_factor_secret'):
        locked=parse_iso_datetime(u.get('two_factor_locked_until'))
        if locked and locked>now_dt(): raise HTTPException(429,'Too many attempts. Try again in 10 minutes.')
        if not await check_second_factor(u,body.second_factor or ''):
            failures=int(u.get('two_factor_failures',0))+1
            await db.users.update_one({'id':u['id']},{'$set':{'two_factor_failures':failures,'two_factor_locked_until':(now_dt()+timedelta(minutes=10)).isoformat() if failures>=5 else None}})
            raise HTTPException(403,'Enter your authenticator or recovery code')
        await db.users.update_one({'id':u['id']},{'$set':{'two_factor_failures':0,'two_factor_locked_until':None}})
    if u.get("deactivated"):
        await db.users.update_one({"id": u["id"]}, {"$set": {"deactivated": False}})
        u["deactivated"] = False
    suspension = await active_suspension(u)
    if suspension:
        payload=decode_token(make_token(u['id']))
        payload['restricted']=True
        payload['exp']=int((now_dt()+timedelta(hours=1)).timestamp())
        return {"restricted": True, "appeal_token": jwt.encode(payload,JWT_SECRET,algorithm='HS256'), "reason": suspension["reason"]}
    await db.users.update_one({"id": u["id"]}, {"$set": {"last_seen": now_iso()}})
    await db.login_events.insert_one({
        "id": new_id(), "user_id": u["id"], "type": "password_login", "created_at": now_iso()
    })
    token = await issue_session(u['id'])
    if u.get("settings", {}).get("login_alerts", True):
        await send_moderation_email(u.get("email"), "New Glint sign-in", "A new sign-in was completed on your Glint account. Review your sessions in Login & Security if this was not you.")
    return {"token": token, "user": public_user(u)}


@api.post("/auth/forgot")
async def forgot(body: ForgotBody):
    contact = body.contact.strip().lower()
    u = await db.users.find_one({
        "$or": [{"email": contact}, {"phone": contact}, {"username": contact}],
        "deleted_at": None,
    })
    if not u:
        raise HTTPException(404, "No account found with these details")
    code = f"{random.randint(0, 999999):06d}"
    await db.users.update_one({"id": u["id"]}, {"$set": {"otp": code, "otp_purpose": "reset", "otp_expires_at": (now_dt()+timedelta(minutes=10)).isoformat(), "otp_attempts":0}})
    logger.info(f"[OTP] reset code generated for {u.get('username')}")
    email = u.get("email")
    if email:
        sent = await send_otp_email(email, code, "reset")
        if not sent and not DEV_OTP_ENABLED:
            raise HTTPException(503, "Unable to send reset email. Please try again later.")
    elif not DEV_OTP_ENABLED:
        raise HTTPException(503, "Phone password reset is not configured yet")

    response = {"user_id": u["id"], "message": "Reset code sent"}
    if DEV_OTP_ENABLED:
        response["dev_otp"] = code
    return response


@api.post("/auth/reset")
async def reset(body: ResetBody):
    u = await db.users.find_one({"id": body.user_id})
    if not u or u.get('deleted_at') or u.get('otp_purpose')!='reset' or not parse_iso_datetime(u.get('otp_expires_at')) or parse_iso_datetime(u['otp_expires_at'])<=now_dt() or int(u.get('otp_attempts',0))>=5:
        raise HTTPException(400,'Reset code expired. Request a new code.')
    if not hmac.compare_digest(str(u.get('otp') or ''),body.code):
        await db.users.update_one({'id':u['id']},{'$inc':{'otp_attempts':1}})
        raise HTTPException(400,'Invalid reset code')
    if not 8<=len(body.password)<=128:
        raise HTTPException(400, "Password must be 8–128 characters")
    result=await db.users.update_one({'id':u['id'],'otp':body.code,'otp_purpose':'reset'}, {'$set':{'password':hash_pw(body.password),'otp':None,'otp_purpose':None}})
    if not result.matched_count: raise HTTPException(409,'Code has already been used')
    await db.sessions.update_many({'user_id':u['id']},{'$set':{'revoked':True}})
    await db.users.update_one({'id':u['id']},{'$set':{'legacy_sessions_revoked':True}})
    if u.get('two_factor_secret') or u.get('suspended'):
        await db.users.update_one({'id':u['id']},{'$set':{'force_logout_at':now_iso()}})
        return {'requires_login':True}
    token = await issue_session(body.user_id)
    fresh = await db.users.find_one({"id": body.user_id}, {"_id": 0})
    return {"token": token, "user": public_user(fresh)}


# ----------------------------- users -----------------------------
@api.get("/users/me")
async def get_me(me=Depends(get_current_user)):
    saved = await db.saved.count_documents({"user_id": me["id"]})
    friends = await db.friendships.count_documents({"users": me["id"]})
    posts = await db.posts.count_documents({"author_id": me["id"], "deleted_at": None})
    followers = await db.follows.count_documents({"following_id": me["id"]})
    following = await db.follows.count_documents({"follower_id": me["id"]})
    data = public_user(me)
    data.update({
        "email": me.get("email"),
        "phone": me.get("phone"),
        "phone_verified": bool(me.get("phone_verified")) or bool(me.get("phone") and not me.get("email") and me.get("verified")),
        "contact_visibility": me.get("contact_visibility", "only_me"),
        "is_admin": (
            (
                bool(me.get("email"))
                and me.get("email", "").strip().lower() in {
                    email.strip().lower() for email, _ in ADMIN_CREDS if email
                }
            )
            or (
                bool(me.get("phone"))
                and bool(ADMIN_PHONE)
                and "".join(ch for ch in str(me.get("phone")) if ch.isdigit())
                    == "".join(ch for ch in ADMIN_PHONE if ch.isdigit())
            )
        ),
        "sparks": me.get("sparks", 0),
        "date_of_birth": me.get("date_of_birth"),
        "inner_circle_count": len(me.get("inner_circle", [])),
        "counts": {
            "saved": saved,
            "friends": friends,
            "posts": posts,
            "followers": followers,
            "following": following,
        },
    })
    return data


@api.put("/users/me")
async def update_me(body: ProfileUpdate, me=Depends(get_current_user)):
    # Fields explicitly sent as null should be cleared; omitted fields stay unchanged.
    update = {k: v for k, v in body.dict(exclude_unset=True).items()}
    if "privacy" in update and update["privacy"] not in {"public", "friends", "only_me"}:
        raise HTTPException(400, "Invalid profile privacy")
    if "contact_visibility" in update and update["contact_visibility"] not in {"public", "friends", "only_me"}:
        raise HTTPException(400, "Invalid personal information visibility")
    if play_billing.blue_active(me) and any(k in update and update[k] != me.get(k) for k in ("full_name", "avatar")):
        raise HTTPException(400, "Verified identity changes must use the profile review form")
    if "full_name" in update and update["full_name"] != me.get("full_name"):
        cooldown = normal_name_change_allowed(me)
        if not cooldown["allowed"]:
            raise HTTPException(409, "Name can only be changed once every 30 days")
        update["name_changed_at"] = now_iso()
    if update:
        await db.users.update_one({"id": me["id"]}, {"$set": update})
    fresh = await db.users.find_one({"id": me["id"]}, {"_id": 0})
    return public_user(fresh)


@api.get("/users/search")
async def search_users(q: str = Query(""), me=Depends(get_current_user)):
    q = re.escape(q.strip().lower())
    if not q:
        return []
    blocked = set(me.get("blocked", []))
    cur = db.users.find({
        "deleted_at": None,
        "verified": True,
        "suspended": {"$ne": True}, "deactivated": {"$ne": True},
        "id": {"$ne": me["id"]},
        "$or": [
            {"username": {"$regex": q, "$options": "i"}},
            {"full_name": {"$regex": q, "$options": "i"}},
        ],
    }, {"_id": 0}).limit(30)
    out = []
    async for u in cur:
        if u["id"] in blocked or me["id"] in u.get("blocked", []):
            continue
        out.append(public_user(u))
    return out


@api.get("/users/{username}")
async def get_user(username: str, me=Depends(get_current_user)):
    u = await db.users.find_one({"username": username.lower(), "deleted_at": None}, {"_id": 0})
    if not u or u.get("suspended") or u.get("deactivated"):
        raise HTTPException(404, "Account not found")
    if me['id'] in u.get('blocked',[]) or u['id'] in me.get('blocked',[]):
        raise HTTPException(404,'Account not found')
    data = public_user(u)
    friend = await are_friends(me["id"], u["id"])
    # friend request status
    req = await db.friend_requests.find_one({
        "$or": [
            {"from": me["id"], "to": u["id"]},
            {"from": u["id"], "to": me["id"]},
        ],
        "status": "pending",
    })
    fr_status = "none"
    if friend:
        fr_status = "friends"
    elif req:
        fr_status = "outgoing" if req["from"] == me["id"] else "incoming"
    data["details"] = visible_details(u, me["id"], friend)
    data["avatar_character"] = u.get("avatar_character")
    data["friend_status"] = fr_status
    data["is_me"] = u["id"] == me["id"]
    data["is_blocked"] = u["id"] in set(me.get("blocked", []))
    data["is_inner"] = u["id"] in me.get("inner_circle", [])
    data["is_following"] = await db.follows.find_one({
        "follower_id": me["id"], "following_id": u["id"]
    }) is not None
    profile_privacy = u.get("privacy", "public")
    blocked_either_way = u["id"] in set(me.get("blocked", [])) or me["id"] in set(u.get("blocked", []))
    can_view = (not blocked_either_way) and (
        data["is_me"] or profile_privacy == "public" or (profile_privacy == "friends" and friend)
    )
    data["can_view"] = can_view
    contact_visibility = u.get("contact_visibility", "only_me")
    data["contact_visibility"] = contact_visibility
    can_view_contact = data["is_me"] or contact_visibility == "public" or (contact_visibility == "friends" and friend)
    if can_view_contact:
        data["email"] = u.get("email")
        data["phone"] = u.get("phone")
    data["counts"] = {
        "friends": await db.friendships.count_documents({"users": u["id"]}),
        "posts": await db.posts.count_documents({"author_id": u["id"], "deleted_at": None}),
        "followers": await db.follows.count_documents({"following_id": u["id"]}),
        "following": await db.follows.count_documents({"follower_id": u["id"]}),
    }
    if can_view:
        posts = await feed_posts_for_author(u["id"], me["id"])
        data["posts"] = posts
    else:
        data["posts"] = []
    return data


@api.post("/users/{user_id}/follow")
async def follow_user(user_id: str, me=Depends(get_current_user)):
    if user_id == me["id"]:
        raise HTTPException(400, "You cannot follow yourself")
    target = await db.users.find_one({"id": user_id, "deleted_at": None, "verified": True})
    if not target:
        raise HTTPException(404, "User not found")
    if user_id in set(me.get("blocked", [])):
        raise HTTPException(400, "Unblock this user before following")
    blocked_by_target = await db.users.find_one({"id": user_id, "blocked": me["id"]})
    if blocked_by_target:
        raise HTTPException(403, "You cannot follow this account")
    existing = await db.follows.find_one({"follower_id": me["id"], "following_id": user_id})
    if existing:
        return {"ok": True, "following": True}
    await db.follows.insert_one({
        "id": new_id(),
        "follower_id": me["id"],
        "following_id": user_id,
        "created_at": now_iso(),
    })
    await notify(user_id, me["id"], "follow", me["id"], f"{me['full_name']} followed you")
    return {"ok": True, "following": True}


@api.delete("/users/{user_id}/follow")
async def unfollow_user(user_id: str, me=Depends(get_current_user)):
    await db.follows.delete_many({"follower_id": me["id"], "following_id": user_id})
    return {"ok": True, "following": False}


@api.get("/users/{user_id}/followers")
async def user_followers(user_id: str, me=Depends(get_current_user)):
    target = await db.users.find_one({"id": user_id, "deleted_at": None})
    if not target or target.get("suspended") or target.get("deactivated"):
        raise HTTPException(404, "User not found")
    await require_audience(target, target.get("settings", {}).get("followers_visibility", "public"), me["id"])
    out = []
    cur = db.follows.find({"following_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(500)
    async for row in cur:
        u = await db.users.find_one({"id": row.get("follower_id"), "deleted_at": None, "verified": True}, {"_id": 0})
        if not u or u.get("suspended") or u.get("deactivated"):
            continue
        item = public_user(u)
        item["is_following"] = await db.follows.find_one({
            "follower_id": me["id"], "following_id": u["id"]
        }) is not None
        out.append(item)
    return out


@api.get("/users/{user_id}/following")
async def user_following(user_id: str, me=Depends(get_current_user)):
    target = await db.users.find_one({"id": user_id, "deleted_at": None})
    if not target or target.get("suspended") or target.get("deactivated"):
        raise HTTPException(404, "User not found")
    await require_audience(target, target.get("settings", {}).get("following_visibility", "public"), me["id"])
    out = []
    cur = db.follows.find({"follower_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(500)
    async for row in cur:
        u = await db.users.find_one({"id": row.get("following_id"), "deleted_at": None, "verified": True}, {"_id": 0})
        if not u or u.get("suspended") or u.get("deactivated"):
            continue
        item = public_user(u)
        item["is_following"] = await db.follows.find_one({
            "follower_id": me["id"], "following_id": u["id"]
        }) is not None
        out.append(item)
    return out


@api.delete("/users/me")
async def delete_account(me=Depends(get_current_user)):
    ts = now_iso()
    await db.users.update_one({"id": me["id"]}, {"$set": {"deleted_at": ts, "verified": False}})
    await db.posts.update_many({"author_id": me["id"]}, {"$set": {"deleted_at": ts}})
    await db.stories.update_many({"author_id": me["id"]}, {"$set": {"deleted_at": ts}})
    await db.follows.delete_many({"$or": [{"follower_id": me["id"]}, {"following_id": me["id"]}]})
    return {"ok": True}


@api.post("/users/{user_id}/block")
async def block_user(user_id: str, me=Depends(get_current_user)):
    await db.users.update_one({"id": me["id"]}, {"$addToSet": {"blocked": user_id}})
    # remove friendship + requests
    await db.friendships.delete_many({"users": {"$all": [me["id"], user_id]}})
    await db.friend_requests.delete_many({"$or": [
        {"from": me["id"], "to": user_id}, {"from": user_id, "to": me["id"]}]})
    await db.follows.delete_many({"$or": [
        {"follower_id": me["id"], "following_id": user_id},
        {"follower_id": user_id, "following_id": me["id"]},
    ]})
    return {"ok": True}


@api.post("/users/{user_id}/unblock")
async def unblock_user(user_id: str, me=Depends(get_current_user)):
    await db.users.update_one({"id": me["id"]}, {"$pull": {"blocked": user_id}})
    return {"ok": True}


@api.get("/users/me/blocked")
async def blocked_list(me=Depends(get_current_user)):
    ids = me.get("blocked", [])
    out = []
    for uid in ids:
        u = await db.users.find_one({"id": uid}, {"_id": 0})
        if u:
            out.append(public_user(u))
    return out


# ----------------------------- friends -----------------------------
@api.post("/friends/request/{user_id}")
async def send_request(user_id: str, me=Depends(get_current_user)):
    if user_id == me["id"]:
        raise HTTPException(400, "Cannot friend yourself")
    if await are_friends(me["id"], user_id):
        raise HTTPException(400, "Already friends")
    existing = await db.friend_requests.find_one({
        "$or": [
            {"from": me["id"], "to": user_id},
            {"from": user_id, "to": me["id"]},
        ],
        "status": "pending",
    })
    if existing:
        raise HTTPException(400, "Request already pending")
    await db.friend_requests.insert_one({
        "id": new_id(), "from": me["id"], "to": user_id,
        "status": "pending", "created_at": now_iso(),
    })
    await notify(user_id, me["id"], "friend_request", user_id, f"{me['full_name']} sent you a friend request")
    return {"ok": True}


@api.post("/friends/accept/{req_from}")
async def accept_request(req_from: str, me=Depends(get_current_user)):
    req = await db.friend_requests.find_one({"from": req_from, "to": me["id"], "status": "pending"})
    if not req:
        raise HTTPException(404, "Request not found")
    await db.friend_requests.update_one({"id": req["id"]}, {"$set": {"status": "accepted"}})
    await db.friendships.insert_one({
        "id": new_id(), "users": [req_from, me["id"]], "created_at": now_iso(),
    })
    await notify(req_from, me["id"], "friend_accept", me["id"], f"{me['full_name']} accepted your friend request")
    return {"ok": True}


@api.post("/friends/reject/{req_from}")
async def reject_request(req_from: str, me=Depends(get_current_user)):
    await db.friend_requests.delete_many({"from": req_from, "to": me["id"], "status": "pending"})
    return {"ok": True}


@api.post("/friends/cancel/{user_id}")
async def cancel_request(user_id: str, me=Depends(get_current_user)):
    await db.friend_requests.delete_many({"from": me["id"], "to": user_id, "status": "pending"})
    return {"ok": True}


@api.delete("/friends/{user_id}")
async def remove_friend(user_id: str, me=Depends(get_current_user)):
    await db.friendships.delete_many({"users": {"$all": [me["id"], user_id]}})
    await db.friend_requests.delete_many({"$or": [
        {"from": me["id"], "to": user_id}, {"from": user_id, "to": me["id"]}]})
    return {"ok": True}


@api.get("/friends")
async def list_friends(me=Depends(get_current_user)):
    cur = db.friendships.find({"users": me["id"]})
    out = []
    async for f in cur:
        other = [x for x in f["users"] if x != me["id"]][0]
        u = await db.users.find_one({"id": other, "deleted_at": None}, {"_id": 0})
        if u:
            out.append(public_user(u))
    return out


@api.get("/friends/requests")
async def friend_requests(me=Depends(get_current_user)):
    incoming = []
    async for r in db.friend_requests.find({"to": me["id"], "status": "pending"}):
        u = await db.users.find_one({"id": r["from"], "deleted_at": None}, {"_id": 0})
        if u and not u.get('suspended') and not u.get('deactivated'):
            incoming.append(public_user(u))
    outgoing = []
    async for r in db.friend_requests.find({"from": me["id"], "status": "pending"}):
        u = await db.users.find_one({"id": r["to"], "deleted_at": None}, {"_id": 0})
        if u and not u.get('suspended') and not u.get('deactivated'):
            outgoing.append(public_user(u))
    return {"incoming": incoming, "outgoing": outgoing}


@api.get("/friends/suggestions")
async def suggestions(me=Depends(get_current_user)):
    friend_ids = set()
    async for f in db.friendships.find({"users": me["id"]}):
        for x in f["users"]:
            friend_ids.add(x)
    pending = set()
    async for r in db.friend_requests.find({"$or": [{"from": me["id"]}, {"to": me["id"]}], "status": "pending"}):
        pending.add(r["from"])
        pending.add(r["to"])
    exclude = friend_ids | pending | set(me.get("blocked", [])) | {me["id"]}
    out = []
    cur = db.users.find({"deleted_at": None, "verified": True, "suspended":{"$ne":True}, "deactivated":{"$ne":True}, "id": {"$nin": list(exclude)}}, {"_id": 0}).limit(20)
    async for u in cur:
        out.append(public_user(u))
    return out


# ----------------------------- posts -----------------------------
async def serialize_post(p: dict, me_id: str) -> dict:
    author = await enrich_author(p["author_id"])
    reactions = p.get("reactions", {})  # {user_id: type}
    counts = {}
    for r in reactions.values():
        counts[r] = counts.get(r, 0) + 1
    my_reaction = reactions.get(me_id)
    saved = await db.saved.find_one({"user_id": me_id, "post_id": p["id"]}) is not None
    comment_count = await db.comments.count_documents({"post_id": p["id"], "deleted_at": None})
    data = {
        "id": p["id"],
        "author": author,
        "type": p.get("type", "text"),
        "text": p.get("text", ""),
        "image": p.get("image"),
        "created_at": p.get("created_at"),
        "reaction_counts": counts,
        "total_reactions": sum(counts.values()),
        "my_reaction": my_reaction,
        "saved": saved,
        "comment_count": comment_count,
        "is_mine": p["author_id"] == me_id,
        "sparks": p.get("sparks", 0),
        "i_sparked": me_id in p.get("sparkers", []),
        "golden": p.get("golden", False),
        "audience": p.get("audience", "public"),
    }
    if p.get("type") == "poll":
        votes = p.get("votes", {})  # {user_id: option_index}
        opts = p.get("poll_options", [])
        tally = [0] * len(opts)
        for v in votes.values():
            if 0 <= v < len(opts):
                tally[v] += 1
        data["poll"] = {
            "options": opts,
            "tally": tally,
            "total_votes": sum(tally),
            "my_vote": votes.get(me_id),
        }
    return data


async def feed_posts_for_author(author_id: str, me_id: str):
    author = await db.users.find_one({"id": author_id, "deleted_at": None}, {"_id": 0})
    if not author:
        return []
    friend_ids = {me_id}
    async for friendship in db.friendships.find({"users": me_id}):
        for uid in friendship.get("users", []):
            friend_ids.add(uid)
    cur = db.posts.find({"author_id": author_id, "deleted_at": None}).sort("created_at", -1).limit(50)
    out = []
    async for p in cur:
        if await can_view_post(p, author, me_id, friend_ids):
            out.append(await serialize_post(p, me_id))
    return out


@api.post("/posts")
async def create_post(body: PostCreate, me=Depends(get_current_user)):
    if body.audience is not None and body.audience not in {'public','friends','inner','only_me'}:
        raise HTTPException(400,'Invalid audience')
    if not await app_feature_enabled("posts_enabled", True):
        raise HTTPException(503, "Posting is temporarily unavailable.")
    await ensure_not_restricted(me, "posting_restricted_until", "Posting")
    active, _, _, _ = golden_window()
    doc = {
        "id": new_id(),
        "author_id": me["id"],
        "type": body.type,
        "text": (body.text or "").strip(),
        "image": body.image,
        "audience": body.audience if body.audience in ("public", "friends", "inner", "only_me") else me.get("settings", {}).get("posts_audience", "public"),
        "golden": active,
        "sparks": 0,
        "sparkers": [],
        "reactions": {},
        "deleted_at": None,
        "created_at": now_iso(),
    }
    if body.type == "poll":
        opts = [o.strip() for o in (body.poll_options or []) if o.strip()]
        if len(opts) < 2:
            raise HTTPException(400, "Poll needs at least 2 options")
        doc["poll_options"] = opts
        doc["votes"] = {}
    await db.posts.insert_one(doc)
    return await serialize_post(doc, me["id"])


@api.get("/posts/feed")
async def get_feed(me=Depends(get_current_user)):
    friend_ids = [me["id"]]
    async for f in db.friendships.find({"users": me["id"]}):
        for x in f["users"]:
            if x != me["id"]:
                friend_ids.append(x)
    hidden = [h["post_id"] async for h in db.hidden.find({"user_id": me["id"]})]
    blocked = list(set(me.get("blocked", []) + me.get('settings',{}).get('muted_users',[])))
    # public posts + friends posts, excluding hidden/blocked
    query = {
        "deleted_at": None,
        "id": {"$nin": hidden},
        "author_id": {"$nin": blocked},
    }
    cur = db.posts.find(query).sort("created_at", -1).limit(100)
    out = []
    fset = set(friend_ids)
    async for p in cur:
        author = await db.users.find_one({"id": p["author_id"], "deleted_at": None}, {"_id": 0})
        if not author:
            continue
        if not await can_view_post(p, author, me["id"], fset):
            continue
        out.append(await serialize_post(p, me["id"]))
    return out


@api.get("/posts/spotlight")
@api.get("/posts/golden")
async def golden_feed(me=Depends(get_current_user)):
    friend_ids = {me["id"]}
    async for f in db.friendships.find({"users": me["id"]}):
        for x in f["users"]:
            friend_ids.add(x)
    since = (now_dt() - timedelta(hours=24)).isoformat()
    hidden = [h["post_id"] async for h in db.hidden.find({"user_id": me["id"]})]
    cur = db.posts.find({
        "deleted_at": None, "golden": True, "created_at": {"$gt": since},
        "id": {"$nin": hidden}, "author_id": {"$nin": me.get("blocked", [])},
    }).limit(100)
    out = []
    async for p in cur:
        author = await db.users.find_one({"id": p["author_id"], "deleted_at": None}, {"_id": 0})
        if not author or not await can_view_post(p, author, me["id"], friend_ids):
            continue
        out.append(await serialize_post(p, me["id"]))
    out.sort(key=lambda x: x["total_reactions"] + x["sparks"], reverse=True)
    return out


@api.get("/golden/status")
async def golden_status(me=Depends(get_current_user)):
    active, start, end, next_start = golden_window()
    return {
        "active": active,
        "ends_at": end.isoformat() if active else None,
        "next_start": next_start.isoformat(),
    }


async def require_post_access(post,me):
    if not post or post.get('deleted_at'):
        raise HTTPException(404,'Post not found')
    author=await db.users.find_one({'id':post['author_id'],'deleted_at':None})
    if not author or author['id'] in me.get('blocked',[]):
        raise HTTPException(404,'Post not found')
    friends={me['id']}
    if await are_friends(me['id'],author['id']): friends.add(author['id'])
    if not await can_view_post(post,author,me['id'],friends):
        raise HTTPException(403,'This post is private or unavailable')
    return author


@api.get("/posts/{post_id}")
async def get_post(post_id: str, me=Depends(get_current_user)):
    p = await db.posts.find_one({"id": post_id, "deleted_at": None})
    if not p:
        raise HTTPException(404, "Post not found")
    author = await db.users.find_one({"id": p["author_id"], "deleted_at": None}, {"_id": 0})
    if not author:
        raise HTTPException(404, "Post not found")
    if p["author_id"] in me.get("blocked", []) or me["id"] in author.get("blocked", []):
        raise HTTPException(403, "You cannot view this post")
    friend_ids = {me["id"]}
    async for friendship in db.friendships.find({"users": me["id"]}):
        for uid in friendship.get("users", []):
            friend_ids.add(uid)
    if not await can_view_post(p, author, me["id"], friend_ids):
        raise HTTPException(403, "This post is not available to you")
    return await serialize_post(p, me["id"])


@api.post("/posts/{post_id}/react")
async def react_post(post_id: str, body: ReactionBody, me=Depends(get_current_user)):
    p = await db.posts.find_one({"id": post_id, "deleted_at": None})
    if not p:
        raise HTTPException(404, "Post not found")
    await require_post_access(p,me)
    key = f"reactions.{me['id']}"
    if body.reaction:
        await db.posts.update_one({"id": post_id}, {"$set": {key: body.reaction}})
        emoji = {"like": "👍", "love": "❤️", "haha": "😂", "wow": "😮", "sad": "😢", "angry": "😡"}.get(body.reaction, "👍")
        await notify(p["author_id"], me["id"], "reaction", post_id, f"{me['full_name']} reacted {emoji} to your post")
    else:
        await db.posts.update_one({"id": post_id}, {"$unset": {key: ""}})
    fresh = await db.posts.find_one({"id": post_id})
    return await serialize_post(fresh, me["id"])


@api.post("/posts/{post_id}/vote")
async def vote_poll(post_id: str, option: int = Query(...), me=Depends(get_current_user)):
    p = await db.posts.find_one({"id": post_id, "deleted_at": None, "type": "poll"})
    if not p:
        raise HTTPException(404, "Poll not found")
    await require_post_access(p,me)
    if option < 0 or option >= len(p.get("poll_options", [])):
        raise HTTPException(400, "Invalid option")
    await db.posts.update_one({"id": post_id}, {"$set": {f"votes.{me['id']}": option}})
    fresh = await db.posts.find_one({"id": post_id})
    return await serialize_post(fresh, me["id"])


@api.delete("/posts/{post_id}")
async def delete_post(post_id: str, me=Depends(get_current_user)):
    p = await db.posts.find_one({"id": post_id})
    if not p or p["author_id"] != me["id"]:
        raise HTTPException(403, "Not allowed")
    await db.posts.update_one({"id": post_id}, {"$set": {"deleted_at": now_iso()}})
    return {"ok": True}


@api.post("/posts/{post_id}/save")
async def save_post(post_id: str, me=Depends(get_current_user)):
    await require_post_access(await db.posts.find_one({'id':post_id,'deleted_at':None}),me)
    existing = await db.saved.find_one({"user_id": me["id"], "post_id": post_id})
    if existing:
        await db.saved.delete_one({"user_id": me["id"], "post_id": post_id})
        return {"saved": False}
    await db.saved.insert_one({"id": new_id(), "user_id": me["id"], "post_id": post_id, "created_at": now_iso()})
    return {"saved": True}


@api.get("/posts/saved/list")
async def saved_list(me=Depends(get_current_user)):
    ids = [s["post_id"] async for s in db.saved.find({"user_id": me["id"]}).sort("created_at", -1)]
    out = []
    for pid in ids:
        p = await db.posts.find_one({"id": pid, "deleted_at": None})
        if p:
            try: await require_post_access(p,me)
            except HTTPException: continue
            out.append(await serialize_post(p, me["id"]))
    return out


@api.post("/posts/{post_id}/hide")
async def hide_post(post_id: str, me=Depends(get_current_user)):
    await db.hidden.update_one(
        {"user_id": me["id"], "post_id": post_id},
        {"$set": {"user_id": me["id"], "post_id": post_id, "created_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}


# comments
@api.get("/posts/{post_id}/comments")
async def get_comments(post_id: str, me=Depends(get_current_user)):
    await require_post_access(await db.posts.find_one({'id':post_id,'deleted_at':None}),me)
    cur = db.comments.find({"post_id": post_id, "deleted_at": None}).sort("created_at", 1)
    out = []
    async for c in cur:
        author=await enrich_author(c['author_id'])
        if not author: continue
        out.append({
            "id": c["id"],
            "author": author,
            "text": c["text"],
            "created_at": c["created_at"],
            "is_mine": c["author_id"] == me["id"],
        })
    return out


@api.post("/posts/{post_id}/comments")
async def add_comment(post_id: str, body: CommentCreate, me=Depends(get_current_user)):
    if not await app_feature_enabled("posts_enabled", True):
        raise HTTPException(503, "Posting is temporarily unavailable.")
    await ensure_not_restricted(me, "posting_restricted_until", "Commenting")
    p = await db.posts.find_one({"id": post_id, "deleted_at": None})
    if not p:
        raise HTTPException(404, "Post not found")
    owner = await require_post_access(p,me)
    await require_audience(owner, owner.get("settings", {}).get("comments", "public"), me["id"])
    await require_audience(owner, p.get("audience", "public"), me["id"])
    doc = {
        "id": new_id(), "post_id": post_id, "author_id": me["id"],
        "text": body.text.strip(), "deleted_at": None, "created_at": now_iso(),
    }
    await db.comments.insert_one(doc)
    await notify(p["author_id"], me["id"], "comment", post_id, f"{me['full_name']} commented: {doc['text'][:60]}")
    return {
        "id": doc["id"], "author": await enrich_author(me["id"]),
        "text": doc["text"], "created_at": doc["created_at"], "is_mine": True,
    }


@api.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, me=Depends(get_current_user)):
    c = await db.comments.find_one({"id": comment_id})
    if not c or c["author_id"] != me["id"]:
        raise HTTPException(403, "Not allowed")
    await db.comments.update_one({"id": comment_id}, {"$set": {"deleted_at": now_iso()}})
    return {"ok": True}


@api.post("/report")
async def report(body: ReportBody, me=Depends(get_current_user)):
    target_type = body.target_type.strip().lower()
    reason = body.reason.strip()
    allowed_types = {"user", "post", "story", "comment", "group", "message"}
    if target_type not in allowed_types:
        raise HTTPException(400, "Unsupported report type")
    if not reason:
        raise HTTPException(400, "Select a report reason")

    target = None
    if target_type == "user":
        target = await db.users.find_one({"id": body.target_id, "deleted_at": None})
        if target and target.get("id") == me["id"]:
            raise HTTPException(400, "You cannot report your own account")
    elif target_type == "post":
        target = await db.posts.find_one({"id": body.target_id, "deleted_at": None})
        if target and target.get("author_id") == me["id"]:
            raise HTTPException(400, "You cannot report your own post")
    elif target_type == "story":
        target = await db.stories.find_one({"id": body.target_id, "deleted_at": None})
        if target and target.get("author_id") == me["id"]:
            raise HTTPException(400, "You cannot report your own story")
    elif target_type == "comment":
        target = await db.comments.find_one({"id": body.target_id, "deleted_at": None})
        if target and target.get("author_id") == me["id"]:
            raise HTTPException(400, "You cannot report your own comment")
    elif target_type == "group":
        target = await db.conversations.find_one({"id": body.target_id, "is_group": True})
        if target and me["id"] not in target.get("participants", []):
            raise HTTPException(403, "You can only report groups you belong to")
    else:
        target = await db.messages.find_one({"id": body.target_id, "deleted_at": None})
        if target and target.get("from_user") == me["id"]:
            raise HTTPException(400, "You cannot report your own message")
        if target:
            group = await db.conversations.find_one({"id": target.get("conversation_id"), "deleted_at": None})
            if not group or me["id"] not in group.get("participants", []):
                raise HTTPException(403, "You can only report messages from your conversations")
    if not target:
        raise HTTPException(404, "Reported item not found")

    duplicate = await db.reports.find_one({
        "reporter_id": me["id"], "target_type": target_type, "target_id": body.target_id,
        "reason": reason, "status": "open",
    })
    if duplicate:
        return {"ok": True, "duplicate": True}

    await db.reports.insert_one({
        "id": new_id(), "reporter_id": me["id"], "target_type": target_type,
        "target_id": body.target_id, "reason": reason, "status": "open",
        "created_at": now_iso(),
    })
    return {"ok": True}


# ----------------------------- glint spark (tipping) -----------------------------
@api.get("/spark/balance")
async def spark_balance(me=Depends(get_current_user)):
    today = now_dt().date().isoformat()
    return {"balance": me.get("sparks", 0), "can_claim": me.get("last_spark_bonus") != today}


@api.post("/spark/claim-daily")
async def claim_daily_spark(me=Depends(get_current_user)):
    today = now_dt().date().isoformat()
    if me.get("last_spark_bonus") == today:
        return {"claimed": False, "balance": me.get("sparks", 0)}
    new_balance = me.get("sparks", 0) + 10
    await db.users.update_one({"id": me["id"]}, {"$set": {"sparks": new_balance, "last_spark_bonus": today}})
    return {"claimed": True, "balance": new_balance, "reward": 10}


@api.post("/posts/{post_id}/spark")
async def spark_post(post_id: str, me=Depends(get_current_user)):
    p = await db.posts.find_one({"id": post_id, "deleted_at": None})
    if not p:
        raise HTTPException(404, "Post not found")
    await require_post_access(p,me)
    if p["author_id"] == me["id"]:
        raise HTTPException(400, "You can't spark your own post")
    if me["id"] in p.get("sparkers", []):
        raise HTTPException(400, "Already sparked this post")
    if me.get("sparks", 0) < 1:
        raise HTTPException(400, "Not enough Sparks. Claim your daily bonus!")
    await db.users.update_one({"id": me["id"]}, {"$inc": {"sparks": -1}})
    await db.users.update_one({"id": p["author_id"]}, {"$inc": {"sparks": 1}})
    await db.posts.update_one({"id": post_id}, {"$inc": {"sparks": 1}, "$addToSet": {"sparkers": me["id"]}})
    await notify(p["author_id"], me["id"], "spark", post_id, f"{me['full_name']} sent you a Spark 🪙")
    return {"ok": True, "sparks": p.get("sparks", 0) + 1, "balance": me.get("sparks", 0) - 1}


# ----------------------------- inner circle -----------------------------
@api.get("/inner-circle")
async def get_inner_circle(me=Depends(get_current_user)):
    out = []
    for uid in me.get("inner_circle", []):
        u = await db.users.find_one({"id": uid, "deleted_at": None}, {"_id": 0})
        if u:
            out.append(public_user(u))
    return out


@api.post("/inner-circle/{user_id}")
async def add_inner_circle(user_id: str, me=Depends(get_current_user)):
    circle = me.get("inner_circle", [])
    if user_id in circle:
        return {"ok": True}
    if len(circle) >= 10:
        raise HTTPException(400, "Inner Circle is full (max 10)")
    if not await are_friends(me["id"], user_id):
        raise HTTPException(400, "Only friends can be added to your Inner Circle")
    await db.users.update_one({"id": me["id"]}, {"$addToSet": {"inner_circle": user_id}})
    return {"ok": True}


@api.delete("/inner-circle/{user_id}")
async def remove_inner_circle(user_id: str, me=Depends(get_current_user)):
    await db.users.update_one({"id": me["id"]}, {"$pull": {"inner_circle": user_id}})
    return {"ok": True}


# ----------------------------- AI caption studio -----------------------------
@api.post("/ai/captions")
async def ai_captions(body: CaptionRequest, me=Depends(get_current_user)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI not configured")
    tone = body.tone.strip() or "witty"
    system = (
        "You are Glint's caption studio. Given a topic and a tone, write exactly 4 short, "
        "punchy social media captions (max 120 chars each). Return ONLY the captions, one per "
        "line, no numbering, no quotes, no emojis unless they fit naturally."
    )
    chat = LlmChat(api_key=key, session_id=f"cap-{me['id']}", system_message=system).with_model("openai", "gpt-5.4-mini")
    prompt = f"Topic: {body.topic.strip()}\nTone: {tone}\nWrite 4 {tone} captions."
    try:
        reply = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logger.error(f"AI captions failed: {e}")
        raise HTTPException(502, "Could not generate captions right now")
    lines = [l.strip(" -•\t\"'") for l in str(reply).split("\n") if l.strip()]
    suggestions = [l for l in lines if len(l) > 1][:4]
    return {"suggestions": suggestions}


# ----------------------------- stories -----------------------------
@api.post("/stories")
async def create_story(body: StoryCreate, me=Depends(get_current_user)):
    if body.audience is not None and body.audience not in {'public','friends','inner','only_me'}:
        raise HTTPException(400,'Invalid audience')
    if not await app_feature_enabled("stories_enabled", True):
        raise HTTPException(503, "Stories are temporarily unavailable.")
    await ensure_not_restricted(me, "posting_restricted_until", "Story posting")
    if body.type == "video" and (not play_billing.blue_active(me) or not body.duration or not 0 < body.duration <= 60):
        raise HTTPException(403, "Video Stories require Blue Tick and a maximum duration of 60 seconds")
    doc = {
        "id": new_id(),
        "author_id": me["id"],
        "type": body.type,
        "image": body.image,
        "text": body.text,
        "bg_color": body.bg_color,
        "media": body.media,
        "duration": body.duration,
        "audience": body.audience if body.audience in ("public", "friends", "inner", "only_me") else me.get("settings", {}).get("stories_audience", "friends"),
        "viewers": [],
        "deleted_at": None,
        "created_at": now_iso(),
        "expires_at": (now_dt() + timedelta(hours=24)).isoformat(),
    }
    await db.stories.insert_one(doc)
    return {"ok": True, "id": doc["id"]}


@api.get("/stories/feed")
async def stories_feed(me=Depends(get_current_user)):
    friend_ids = [me["id"]]
    async for f in db.friendships.find({"users": me["id"]}):
        for x in f["users"]:
            if x != me["id"]:
                friend_ids.append(x)
    now = now_iso()
    blocked = list(set(me.get("blocked", []) + me.get('settings',{}).get('muted_users',[])))
    cur = db.stories.find({
        "deleted_at": None,
        "expires_at": {"$gt": now},
        "author_id": {"$nin": blocked},
        "$or": [{"author_id": {"$in": friend_ids}}, {"audience": "public"}],
    }).sort("created_at", 1)
    grouped = {}
    authors_cache = {}
    async for s in cur:
        aid = s["author_id"]
        if aid not in authors_cache:
            authors_cache[aid] = await db.users.find_one({"id": aid}, {"_id": 0})
        au = authors_cache[aid]
        if not au or au.get("suspended") or au.get("deleted_at") or au.get("deactivated") or me["id"] in au.get("blocked", []) or me["id"] in au.get("settings", {}).get("hidden_story_users", []):
            continue
        if s.get("audience") == "only_me" and aid != me["id"]:
            continue
        if s.get('audience','friends')=='friends' and aid not in friend_ids:
            continue
        # inner-audience stories only visible to the author's inner circle
        if s.get("audience") == "inner" and aid != me["id"] and me["id"] not in au.get("inner_circle", []):
            continue
        grouped.setdefault(aid, []).append(s)
    result = []
    for aid, items in grouped.items():
        author = await enrich_author(aid)
        if not author:
            continue
        all_viewed = all(me["id"] in s.get("viewers", []) for s in items)
        au = authors_cache.get(aid) or {}
        is_inner = me["id"] in au.get("inner_circle", []) and aid != me["id"]
        result.append({
            "author": author,
            "is_mine": aid == me["id"],
            "is_inner": is_inner,
            "has_unseen": not all_viewed,
            "count": len(items),
            "stories": [{
                "id": s["id"], "type": s["type"], "image": s.get("image"),
                "text": s.get("text"), "bg_color": s.get("bg_color"),
                "media": s.get("media"), "duration": s.get("duration"),
                "audience": s.get("audience", "friends"),
                "created_at": s["created_at"],
                "viewed": me["id"] in s.get("viewers", []),
            } for s in items],
        })
    result.sort(key=lambda r: (not r["is_mine"], not r["has_unseen"]))
    return result


@api.post("/stories/{story_id}/view")
async def view_story(story_id: str, me=Depends(get_current_user)):
    story=await db.stories.find_one({'id':story_id,'deleted_at':None,'expires_at':{'$gt':now_iso()}})
    if not story: raise HTTPException(404,'Story not found')
    author=await db.users.find_one({'id':story['author_id']})
    await require_audience(author,story.get('audience','friends'),me['id'])
    if author['id'] in me.get('blocked',[]) or me['id'] in author.get('settings',{}).get('hidden_story_users',[]):
        raise HTTPException(404,'Story not found')
    await db.stories.update_one({"id": story_id}, {"$addToSet": {"viewers": me["id"]}})
    return {"ok": True}


@api.get("/stories/{story_id}/viewers")
async def story_viewers(story_id: str, me=Depends(get_current_user)):
    s = await db.stories.find_one({"id": story_id})
    if not s or s["author_id"] != me["id"]:
        raise HTTPException(403, "Not allowed")
    out = []
    for uid in reversed(s.get("viewers", [])):
        if uid == me["id"]:
            continue
        u = await db.users.find_one({"id": uid, "deleted_at": None}, {"_id": 0})
        if u:
            out.append(public_user(u))
    return {"count": len(out), "viewers": out}


@api.delete("/stories/{story_id}")
async def delete_story(story_id: str, me=Depends(get_current_user)):
    s = await db.stories.find_one({"id": story_id})
    if not s or s["author_id"] != me["id"]:
        raise HTTPException(403, "Not allowed")
    await db.stories.update_one({"id": story_id}, {"$set": {"deleted_at": now_iso()}})
    return {"ok": True}


# ----------------------------- messenger client -----------------------------
@api.get("/messenger/bootstrap")
async def messenger_bootstrap(me=Depends(get_current_user)):
    """
    Shared bootstrap for the future Glint Messenger app.
    Messenger uses the same Glint account, users, conversations and messages
    as the main social app, so no second account database is created.
    """
    chats = await conversations(me) if "conversations" in globals() else []
    return {
        "app": "Glint Messenger",
        "account": public_user(me),
        "uses_shared_glint_account": True,
        "chat_api": "/api/chat",
        "conversations": chats,
    }


# ----------------------------- chat -----------------------------
def conv_id_for(a: str, b: str) -> str:
    return "_".join(sorted([a, b]))


@api.get("/chat/conversations")
async def conversations(me=Depends(get_current_user)):
    cur = db.conversations.find({"participants": me["id"], "deleted_at": None}).sort("updated_at", -1)
    out = []
    async for c in cur:
        latest = await db.messages.find_one({"conversation_id": c["id"], "deleted_at": None, "hidden_by": {"$ne": me["id"]}}, sort=[("created_at", -1)])
        c["last_message"] = ("Message removed" if latest.get("removed_for_everyone") else latest.get("text") or ("Photo" if latest.get("type") == "photo" else "Voice note")) if latest else None
        c["last_type"] = latest.get("type", "text") if latest else "text"
        if c.get("is_group"):
            if c.get("disabled"): continue
            unread = await db.messages.count_documents({
                "conversation_id": c["id"], "hidden_by": {"$ne": me["id"]}, "removed_for_everyone": {"$ne": True}, "from_user": {"$ne": me["id"]}, "read_by": {"$ne": me["id"]}})
            members = []
            for uid in c.get("participants", [])[:4]:
                mu = await db.users.find_one({"id": uid}, {"_id": 0})
                if mu:
                    members.append(public_user(mu))
            out.append({
                "id": c["id"],
                "is_group": True,
                "name": c.get("name"),
                "avatar": c.get("avatar"),
                "members": members,
                "member_count": len(c.get("participants", [])),
                "verified": bool(c.get("verified", False)),
                "verification_status": c.get("verification_status", "not_applied"),
                "verification_badge": c.get("verification_badge"),
                "disabled": bool(c.get("disabled", False)),
                "disabled_reason": c.get("disabled_reason"),
                "last_message": c.get("last_message"),
                "last_type": c.get("last_type", "text"),
                "updated_at": c.get("updated_at"),
                "unread": unread,
                "muted": me["id"] in c.get("muted_by", []),
                "online": False,
            })
            continue
        other = [x for x in c["participants"] if x != me["id"]][0]
        u = await db.users.find_one({"id": other, "deleted_at": None}, {"_id": 0})
        if not u or u.get("suspended") or u.get("deactivated") or u["id"] in me.get("blocked", []) or me["id"] in u.get("blocked", []):
            continue
        unread = await db.messages.count_documents({
            "conversation_id": c["id"], "hidden_by": {"$ne": me["id"]}, "removed_for_everyone": {"$ne": True}, "to_user": me["id"], "seen_by_recipient": {"$ne": True}})
        last_seen = u.get("last_seen")
        online = False
        if last_seen:
            try:
                online = (now_dt() - datetime.fromisoformat(last_seen)).total_seconds() < 120
            except Exception:
                online = False
        out.append({
            "id": c["id"],
            "is_group": False,
            "user": public_user(u),
            "last_message": c.get("last_message"),
            "last_type": c.get("last_type", "text"),
            "updated_at": c.get("updated_at"),
            "unread": unread,
            "muted": me["id"] in c.get("muted_by", []),
            "online": online if u.get("settings", {}).get("active_status", True) else False,
            "last_seen": last_seen if u.get("settings", {}).get("active_status", True) else None,
        })
    return out


@api.post("/chat/groups")
async def create_group(body: GroupCreate, me=Depends(get_current_user)):
    if not await app_feature_enabled("group_creation_enabled", True):
        raise HTTPException(503, "Group creation is temporarily unavailable.")
    if not body.name.strip():
        raise HTTPException(400, "Group name required")
    members = list({*body.member_ids, me["id"]})
    if len(members) < 3:
        raise HTTPException(400, "Add at least 2 friends to create a group")
    gid = new_id()
    await db.conversations.insert_one({
        "id": gid, "is_group": True, "name": body.name.strip(), "avatar": body.avatar,
        "description": (body.description or "").strip() or None,
        "participants": members, "created_by": me["id"], "admins": [me["id"]], "muted_by": [],
        "verified": False, "verification_status": "not_applied",
        "verification_badge": None, "verified_at": None, "verified_by": None,
        "disabled": False, "disabled_reason": None, "moderation_strikes": 0,
        "last_message": f"{me['full_name']} created the group", "last_type": "system",
        "updated_at": now_iso(), "created_at": now_iso(),
    })
    return {"id": gid}


@api.get("/chat/group/{group_id}")
async def get_group(group_id: str, me=Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": group_id, "is_group": True})
    if not conv or me["id"] not in conv.get("participants", []):
        raise HTTPException(404, "Group not found")
    if conv.get("disabled"):
        raise HTTPException(403, f"Group disabled. Reason: {conv.get('disabled_reason') or 'Moderation action'}")
    await db.messages.update_many(
        {"conversation_id": group_id, "from_user": {"$ne": me["id"]}, "read_by": {"$ne": me["id"]}},
        {"$addToSet": {"read_by": me["id"]}})
    members = []
    for uid in conv.get("participants", []):
        mu = await db.users.find_one({"id": uid}, {"_id": 0})
        if mu:
            members.append(public_user(mu))
    cur = db.messages.find({"conversation_id": group_id, "deleted_at": None, "hidden_by": {"$ne": me["id"]}}).sort("created_at", -1).limit(300)
    msgs = []
    async for m in cur:
        m = message_for_viewer(m, me)
        if not m: continue
        sender = await db.users.find_one({"id": m["from_user"]}, {"_id": 0})
        msgs.append({
            "id": m["id"], "forwarded": bool(m.get("forwarded")), "reply_to": m.get("reply_to"), "from_user": m["from_user"],
            "sender_name": (sender or {}).get("full_name", "User"),
            "sender_avatar": (sender or {}).get("avatar"),
            "type": m.get("type", "text"), "text": m.get("text"),
            "media": m.get("media"), "duration": m.get("duration"),
            "created_at": m["created_at"], "mine": m["from_user"] == me["id"],
        })
    return {
        "id": group_id, "is_group": True, "name": conv.get("name"), "avatar": conv.get("avatar"),
        "description": conv.get("description"), "created_by": conv.get("created_by"), "admins": conv.get("admins", []),
        "members": members, "member_count": len(members), "messages": list(reversed(msgs)),
        "verified": bool(conv.get("verified", False)),
        "verification_status": conv.get("verification_status", "not_applied"),
        "verification_badge": conv.get("verification_badge"),
        "muted": me["id"] in conv.get("muted_by", []),
        "privacy": conv.get("privacy", "private"),
        "send_permission": conv.get("send_permission", "everyone"),
    }


@api.get("/chat/with/{user_id}")
async def get_conversation(user_id: str, me=Depends(get_current_user)):
    cid = conv_id_for(me["id"], user_id)
    other = await db.users.find_one({"id": user_id, "deleted_at": None}, {"_id": 0})
    if not other or other.get("suspended") or other.get("deactivated"):
        raise HTTPException(404, "Account not found")
    if other['id'] in me.get('blocked',[]) or me['id'] in other.get('blocked',[]):
        raise HTTPException(403,'Conversation unavailable')
    # mark delivered/read
    await db.messages.update_many(
        {"conversation_id": cid, "to_user": me["id"], "status": {"$ne": "read"}},
        {"$set": {"status": "read" if me.get("settings", {}).get("read_receipts",True) else "delivered", "seen_by_recipient":True}})
    cur = db.messages.find({"conversation_id": cid, "deleted_at": None, "hidden_by": {"$ne": me["id"]}}).sort("created_at", -1).limit(200)
    msgs = []
    async for m in cur:
        m = message_for_viewer(m, me)
        if not m: continue
        msgs.append({
            "id": m["id"], "forwarded": bool(m.get("forwarded")), "reply_to": m.get("reply_to"), "from_user": m["from_user"], "to_user": m["to_user"],
            "type": m.get("type", "text"), "text": m.get("text"),
            "media": m.get("media"), "duration": m.get("duration"),
            "status": m.get("status", "sent"), "created_at": m["created_at"],
            "mine": m["from_user"] == me["id"],
        })
    conv = await db.conversations.find_one({"id": cid})
    last_seen = other.get("last_seen")
    online = False
    if last_seen:
        try:
            online = (now_dt() - datetime.fromisoformat(last_seen)).total_seconds() < 120
        except Exception:
            online = False
    return {
        "id": cid,
        "user": public_user(other),
        "messages": list(reversed(msgs)),
        "online": online if other.get("settings", {}).get("active_status", True) else False,
        "last_seen": last_seen if other.get("settings", {}).get("active_status", True) else None,
        "muted": conv and me["id"] in conv.get("muted_by", []),
        "is_friend": await are_friends(me["id"], user_id),
        "chat_blocked": user_id in me.get("chat_blocked", []),
        "cannot_message": user_id in me.get("chat_blocked", []) or me["id"] in other.get("chat_blocked", []),
    }


@api.post("/chat/send")
async def send_message(body: MessageCreate, me=Depends(get_current_user)):
    if not await app_feature_enabled("chat_enabled", True):
        raise HTTPException(503, "Messaging is temporarily unavailable.")
    await ensure_not_restricted(me, "messaging_restricted_until", "Messaging")
    if body.type not in {'text','photo','voice'} or (body.type=='text' and (not body.text or not body.text.strip() or len(body.text)>4000)) or (body.type!='text' and not body.media):
        raise HTTPException(400,'Enter a message or attach media')
    preview_of = lambda: body.text if body.type == "text" else ("📷 Photo" if body.type == "photo" else "🎤 Voice note")

    reply_id = body.reply_to
    if reply_id:
        reply, reply_conv = await chat_action_routes["accessible"](reply_id, me)
        expected = body.conversation_id or conv_id_for(me["id"], body.to_user or "")
        if reply_conv["id"] != expected or reply.get("removed_for_everyone"): raise HTTPException(400, "Reply message unavailable")
    # group message
    if body.conversation_id:
        conv = await db.conversations.find_one({"id": body.conversation_id, "is_group": True})
        if conv:
            if me["id"] not in conv.get("participants", []):
                raise HTTPException(403, "Not a group member")
            if conv.get("send_permission") == "admins" and me["id"] != conv.get("created_by") and me["id"] not in conv.get("admins", []):
                raise HTTPException(403, "Only group admins can send messages")
            if conv.get("disabled"):
                raise HTTPException(403, f"Group disabled. Reason: {conv.get('disabled_reason') or 'Moderation action'}")
            if not await app_feature_enabled("group_messaging_enabled", True):
                raise HTTPException(503, "Group messaging is temporarily unavailable.")
            msg = {
                "id": new_id(), "conversation_id": conv["id"], "from_user": me["id"], "to_user": None,
                "is_group": True, "type": body.type, "text": body.text, "media": body.media,
                "duration": body.duration, "reply_to": reply_id, "read_by": [me["id"]], "created_at": now_iso(),
            }
            await db.messages.insert_one(msg)
            preview = f"{me['full_name'].split(' ')[0]}: {preview_of()}"
            await db.conversations.update_one({"id": conv["id"]}, {"$set": {
                "last_message": preview, "last_message_id": msg["id"], "last_type": body.type, "updated_at": now_iso()}})
            for uid in conv.get("participants", []):
                if uid != me["id"]:
                    await notify(uid, me["id"], "message", conv["id"], f"{conv.get('name')}: {me['full_name'].split(' ')[0]}: {preview_of()[:50]}", message_id=msg["id"])
            return {
                "id": msg["id"], "from_user": me["id"], "sender_name": me["full_name"], "sender_avatar": me.get("avatar"),
                "type": msg["type"], "text": msg["text"], "media": msg["media"],
                "duration": msg["duration"], "created_at": msg["created_at"], "mine": True,
            }

    to_user = body.to_user
    if not to_user and body.conversation_id:
        parts = body.conversation_id.split("_")
        others=[x for x in parts if x != me['id']]
        if me['id'] not in parts or len(others)!=1: raise HTTPException(400,'Invalid conversation')
        to_user = others[0]
    if not to_user:
        raise HTTPException(400, "Recipient required")
    other = await db.users.find_one({"id": to_user, "deleted_at": None})
    if not other or other.get("suspended") or other.get("deactivated"):
        raise HTTPException(404, "Account not found")
    await require_message_access(me, other)
    cid = conv_id_for(me["id"], to_user)
    msg = {
        "id": new_id(), "conversation_id": cid, "from_user": me["id"], "to_user": to_user,
        "type": body.type, "text": body.text, "media": body.media,
        "duration": body.duration, "reply_to": reply_id, "status": "delivered", "created_at": now_iso(),
    }
    await db.messages.insert_one(msg)
    preview = preview_of()
    await notify(to_user, me["id"], "message", me["id"], f"{me['full_name']}: {preview[:60]}", message_id=msg["id"])
    await db.conversations.update_one(
        {"id": cid},
        {"$set": {
            "id": cid, "participants": sorted([me["id"], to_user]),
            "last_message": preview, "last_message_id": msg["id"], "last_type": body.type, "updated_at": now_iso(),
        }},
        upsert=True,
    )
    return {
        "id": msg["id"], "from_user": me["id"], "to_user": to_user,
        "type": msg["type"], "text": msg["text"], "media": msg["media"],
        "duration": msg["duration"], "status": "delivered", "created_at": msg["created_at"], "mine": True,
    }


@api.post("/chat/{conversation_id}/mute")
async def mute_chat(conversation_id: str, me=Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": conversation_id})
    if not conv or me["id"] not in conv.get("participants", []):
        raise HTTPException(403, "Conversation unavailable")
    muted = conv.get("muted_by", [])
    if me["id"] in muted:
        await db.conversations.update_one({"id": conversation_id}, {"$pull": {"muted_by": me["id"]}})
        return {"muted": False}
    await db.conversations.update_one({"id": conversation_id}, {"$addToSet": {"muted_by": me["id"]}}, upsert=True)
    return {"muted": True}


@api.post("/chat/heartbeat")
async def heartbeat(me=Depends(get_current_user)):
    await db.users.update_one({"id": me["id"]}, {"$set": {"last_seen": now_iso()}})
    return {"ok": True}


# ----------------------------- group settings + Green Tick -----------------------------
@api.post("/chat/group/{group_id}/settings")
async def update_group_settings(group_id: str, body: GroupSettingsBody, me=Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": group_id, "is_group": True})
    if not conv:
        raise HTTPException(404, "Group not found")
    if me["id"] != conv.get("created_by") and me["id"] not in conv.get("admins", []):
        raise HTTPException(403, "Group admin only")
    updates = {}
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "Group name required")
        updates["name"] = name[:80]
    if body.avatar is not None:
        updates["avatar"] = body.avatar or None
    if body.description is not None:
        updates["description"] = body.description.strip()[:500] or None
    if body.send_permission is not None:
        if body.send_permission not in {"everyone", "admins"}: raise HTTPException(400, "Invalid message permission")
        updates["send_permission"] = body.send_permission
    if updates:
        updates["updated_at"] = now_iso()
        await db.conversations.update_one({"id": group_id}, {"$set": updates})
    return {"ok": True}


def _group_verification_requirements(conv: dict, owner: dict) -> list:
    reasons = []
    created = parse_iso_datetime(conv.get("created_at"))
    if not created or (now_dt() - created).total_seconds() < 7 * 86400:
        reasons.append("Group must be at least 7 days old")
    if len(conv.get("participants", [])) < 10:
        reasons.append("Group must have at least 10 members")
    if not (conv.get("name") or "").strip():
        reasons.append("Group name is required")
    if not conv.get("avatar"):
        reasons.append("Group photo is required")
    if not (conv.get("description") or "").strip():
        reasons.append("Group description is required")
    if not owner or not owner.get("verified"):
        reasons.append("Group owner must have a verified Glint account contact")
    if owner and (owner.get("suspended") or owner.get("deleted_at")):
        reasons.append("Group owner account must be in good standing")
    if conv.get("disabled"):
        reasons.append("Disabled groups cannot be verified")
    if int(conv.get("moderation_strikes", 0) or 0) > 0:
        reasons.append("Group has active moderation violations")
    return reasons


@api.get("/messenger/groups/{group_id}/verification")
async def group_verification_status(group_id: str, me=Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": group_id, "is_group": True}, {"_id": 0})
    if not conv or me["id"] not in conv.get("participants", []):
        raise HTTPException(404, "Group not found")
    owner = await db.users.find_one({"id": conv.get("created_by")}, {"_id": 0})
    reasons = _group_verification_requirements(conv, owner)
    latest = await db.group_verifications.find_one({"group_id": group_id}, {"_id": 0}, sort=[("created_at", -1)])
    return {
        "verified": bool(conv.get("verified")),
        "status": conv.get("verification_status", "not_applied"),
        "badge": conv.get("verification_badge"),
        "eligible": len(reasons) == 0,
        "requirements": {
            "minimum_age_days": 7,
            "minimum_members": 10,
            "group_photo_required": True,
            "description_required": True,
            "owner_contact_verified": True,
            "good_standing_required": True,
        },
        "unmet": reasons,
        "application": latest,
    }


@api.post("/messenger/groups/{group_id}/verification/apply")
async def apply_group_verification(group_id: str, body: GroupVerificationApplyBody, me=Depends(get_current_user)):
    if not await app_feature_enabled("group_verification_enabled", True):
        raise HTTPException(503, "Group verification applications are temporarily unavailable.")
    conv = await db.conversations.find_one({"id": group_id, "is_group": True}, {"_id": 0})
    if not conv:
        raise HTTPException(404, "Group not found")
    if me["id"] != conv.get("created_by"):
        raise HTTPException(403, "Only the group owner can apply")
    if conv.get("verified"):
        return {"ok": True, "already_verified": True}
    owner = await db.users.find_one({"id": me["id"]}, {"_id": 0})
    reasons = _group_verification_requirements(conv, owner)
    purpose = body.purpose.strip()
    if len(purpose) < 10:
        reasons.append("Explain the group's purpose in at least 10 characters")
    if reasons:
        raise HTTPException(400, {"message": "Group is not eligible yet", "unmet": reasons})
    existing = await db.group_verifications.find_one({"group_id": group_id, "status": "pending"})
    if existing:
        return {"ok": True, "id": existing["id"], "duplicate": True}
    doc = {
        "id": new_id(), "group_id": group_id, "owner_id": me["id"],
        "purpose": purpose[:1000], "note": (body.note or "").strip()[:1000] or None,
        "status": "pending", "created_at": now_iso(), "reviewed_at": None,
        "review_reason": None, "reviewed_by": None,
    }
    await db.group_verifications.insert_one(doc)
    await db.conversations.update_one({"id": group_id}, {"$set": {"verification_status": "pending"}})
    return {"ok": True, "id": doc["id"]}


# ----------------------------- Messenger admin -----------------------------
@api.get("/messenger/admin/stats")
async def messenger_admin_stats(admin=Depends(require_messenger_admin)):
    active_since = (now_dt() - timedelta(hours=24)).isoformat()
    return {
        "users": await db.users.count_documents({"deleted_at": None}),
        "active_24h": await db.users.count_documents({"deleted_at": None, "last_seen": {"$gte": active_since}}),
        "groups": await db.conversations.count_documents({"is_group": True}),
        "disabled_groups": await db.conversations.count_documents({"is_group": True, "disabled": True}),
        "verified_groups": await db.conversations.count_documents({"is_group": True, "verified": True}),
        "pending_group_verifications": await db.group_verifications.count_documents({"status": "pending"}),
        "group_messages": await db.messages.count_documents({"is_group": True, "deleted_at": None}),
        "open_group_reports": await db.reports.count_documents({"status": "open", "target_type": {"$in": ["group", "message"]}}),
    }


@api.get("/messenger/admin/groups")
async def messenger_admin_groups(q: str = Query(""), admin=Depends(require_messenger_admin)):
    query = {"is_group": True}
    if q.strip():
        query["name"] = {"$regex": q.strip(), "$options": "i"}
    cur = db.conversations.find(query, {"_id": 0}).sort("updated_at", -1).limit(200)
    out = []
    async for g in cur:
        out.append({
            "id": g.get("id"), "name": g.get("name"), "avatar": g.get("avatar"),
            "description": g.get("description"), "created_by": g.get("created_by"),
            "member_count": len(g.get("participants", [])), "verified": bool(g.get("verified")),
            "verification_status": g.get("verification_status", "not_applied"),
            "disabled": bool(g.get("disabled")), "disabled_reason": g.get("disabled_reason"),
            "moderation_strikes": int(g.get("moderation_strikes", 0) or 0),
            "created_at": g.get("created_at"), "updated_at": g.get("updated_at"),
        })
    return out


@api.get("/messenger/admin/groups/{group_id}")
async def messenger_admin_group_detail(group_id: str, admin=Depends(require_messenger_admin)):
    g = await db.conversations.find_one({"id": group_id, "is_group": True}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    members = []
    for uid in g.get("participants", []):
        u = await db.users.find_one({"id": uid}, {"_id": 0})
        if u:
            members.append(admin_safe_user(u))
    messages = []
    cur = db.messages.find({"conversation_id": group_id}, {"_id": 0}).sort("created_at", -1).limit(100)
    async for m in cur:
        sender = await db.users.find_one({"id": m.get("from_user")}, {"_id": 0, "full_name": 1, "username": 1})
        messages.append({
            "id": m.get("id"), "from_user": m.get("from_user"),
            "sender_name": (sender or {}).get("full_name"), "sender_username": (sender or {}).get("username"),
            "type": m.get("type"), "text": m.get("text"), "media": m.get("media"),
            "created_at": m.get("created_at"), "deleted_at": m.get("deleted_at"),
            "moderation_reason": m.get("moderation_reason"),
        })
    return {**g, "member_count": len(members), "members": members, "messages": messages}


@api.get("/messenger/admin/group-verifications")
async def messenger_admin_verifications(admin=Depends(require_messenger_admin)):
    cur = db.group_verifications.find({}, {"_id": 0}).sort("created_at", -1).limit(200)
    out = []
    async for item in cur:
        g = await db.conversations.find_one({"id": item.get("group_id")}, {"_id": 0})
        owner = await db.users.find_one({"id": item.get("owner_id")}, {"_id": 0})
        item["group"] = {
            "name": (g or {}).get("name"), "avatar": (g or {}).get("avatar"),
            "member_count": len((g or {}).get("participants", [])),
            "verified": bool((g or {}).get("verified")),
        }
        item["owner"] = public_user(owner) if owner else None
        out.append(item)
    return out


@api.post("/messenger/admin/group-verifications/{application_id}/approve")
async def messenger_admin_approve_verification(application_id: str, body: MessengerAdminReasonBody, admin=Depends(require_messenger_admin)):
    appdoc = await db.group_verifications.find_one({"id": application_id})
    if not appdoc:
        raise HTTPException(404, "Application not found")
    reason = (body.reason or "Green Tick approved").strip()
    ts = now_iso()
    await db.group_verifications.update_one({"id": application_id}, {"$set": {
        "status": "approved", "reviewed_at": ts, "review_reason": reason, "reviewed_by": admin["id"]
    }})
    await db.conversations.update_one({"id": appdoc["group_id"]}, {"$set": {
        "verified": True, "verification_status": "approved", "verification_badge": "green",
        "verified_at": ts, "verified_by": admin["id"],
    }})
    await admin_notify(appdoc["owner_id"], f"Your group Green Tick was approved. Reason: {reason}", appdoc["group_id"])
    await admin_audit("approve_group_green_tick", "group", appdoc["group_id"], reason, appdoc["owner_id"], {"application_id": application_id})
    return {"ok": True}


@api.post("/messenger/admin/group-verifications/{application_id}/reject")
async def messenger_admin_reject_verification(application_id: str, body: MessengerAdminReasonBody, admin=Depends(require_messenger_admin)):
    appdoc = await db.group_verifications.find_one({"id": application_id})
    if not appdoc:
        raise HTTPException(404, "Application not found")
    reason = (body.reason or "Green Tick requirements not met").strip()
    ts = now_iso()
    await db.group_verifications.update_one({"id": application_id}, {"$set": {
        "status": "rejected", "reviewed_at": ts, "review_reason": reason, "reviewed_by": admin["id"]
    }})
    await db.conversations.update_one({"id": appdoc["group_id"]}, {"$set": {"verification_status": "rejected"}})
    await admin_notify(appdoc["owner_id"], f"Your group Green Tick application was declined. Reason: {reason}", appdoc["group_id"])
    await admin_audit("reject_group_green_tick", "group", appdoc["group_id"], reason, appdoc["owner_id"], {"application_id": application_id})
    return {"ok": True}


@api.post("/messenger/admin/groups/{group_id}/green-tick/grant")
async def messenger_admin_grant_tick(group_id: str, body: MessengerAdminReasonBody, admin=Depends(require_messenger_admin)):
    g = await db.conversations.find_one({"id": group_id, "is_group": True})
    if not g:
        raise HTTPException(404, "Group not found")
    reason = (body.reason or "Green Tick granted by admin").strip()
    await db.conversations.update_one({"id": group_id}, {"$set": {
        "verified": True, "verification_status": "approved", "verification_badge": "green",
        "verified_at": now_iso(), "verified_by": admin["id"],
    }})
    if g.get("created_by"):
        await admin_notify(g["created_by"], f"Your group received the Glint Messenger Green Tick. Reason: {reason}", group_id)
    await admin_audit("grant_group_green_tick", "group", group_id, reason, g.get("created_by"))
    return {"ok": True}


@api.post("/messenger/admin/groups/{group_id}/green-tick/remove")
async def messenger_admin_remove_tick(group_id: str, body: MessengerAdminReasonBody, admin=Depends(require_messenger_admin)):
    g = await db.conversations.find_one({"id": group_id, "is_group": True})
    if not g:
        raise HTTPException(404, "Group not found")
    reason = (body.reason or "Green Tick removed by admin").strip()
    await db.conversations.update_one({"id": group_id}, {"$set": {
        "verified": False, "verification_status": "revoked", "verification_badge": None,
        "verified_at": None, "verified_by": None,
    }})
    if g.get("created_by"):
        await admin_notify(g["created_by"], f"Your group Green Tick was removed. Reason: {reason}", group_id)
    await admin_audit("remove_group_green_tick", "group", group_id, reason, g.get("created_by"))
    return {"ok": True}


@api.post("/messenger/admin/groups/{group_id}/disable")
async def messenger_admin_disable_group(group_id: str, body: MessengerAdminReasonBody, admin=Depends(require_messenger_admin)):
    g = await db.conversations.find_one({"id": group_id, "is_group": True})
    if not g:
        raise HTTPException(404, "Group not found")
    reason = (body.reason or "Group disabled by Glint moderation").strip()
    await db.conversations.update_one({"id": group_id}, {"$set": {
        "disabled": True, "disabled_reason": reason, "verified": False,
        "verification_status": "revoked" if g.get("verified") else g.get("verification_status", "not_applied"),
        "verification_badge": None,
    }, "$inc": {"moderation_strikes": 1}})
    if g.get("created_by"):
        await admin_notify(g["created_by"], f"Your group was disabled. Reason: {reason}", group_id)
    await admin_audit("disable_group", "group", group_id, reason, g.get("created_by"))
    return {"ok": True}


@api.post("/messenger/admin/groups/{group_id}/restore")
async def messenger_admin_restore_group(group_id: str, body: MessengerAdminReasonBody, admin=Depends(require_messenger_admin)):
    g = await db.conversations.find_one({"id": group_id, "is_group": True})
    if not g:
        raise HTTPException(404, "Group not found")
    reason = (body.reason or "Group restored by admin").strip()
    await db.conversations.update_one({"id": group_id}, {"$set": {"disabled": False, "disabled_reason": None}})
    if g.get("created_by"):
        await admin_notify(g["created_by"], f"Your group was restored. {reason}", group_id)
    await admin_audit("restore_group", "group", group_id, reason, g.get("created_by"))
    return {"ok": True}


@api.post("/messenger/admin/groups/{group_id}/members/{user_id}/remove")
async def messenger_admin_remove_group_member(group_id: str, user_id: str, body: MessengerAdminReasonBody, admin=Depends(require_messenger_admin)):
    g = await db.conversations.find_one({"id": group_id, "is_group": True})
    if not g:
        raise HTTPException(404, "Group not found")
    if user_id == g.get("created_by"):
        raise HTTPException(400, "The group owner cannot be removed. Disable the group instead.")
    if user_id not in g.get("participants", []):
        raise HTTPException(404, "Member not found")
    reason = (body.reason or "Member removed by Glint moderation").strip()
    await db.conversations.update_one({"id": group_id}, {
        "$pull": {"participants": user_id, "admins": user_id}, "$set": {"updated_at": now_iso()}
    })
    await admin_notify(user_id, f"You were removed from a Messenger group by Glint moderation. Reason: {reason}", group_id)
    await admin_audit("remove_group_member", "group", group_id, reason, user_id)
    return {"ok": True}


@api.post("/messenger/admin/groups/{group_id}/messages/{message_id}/remove")
async def messenger_admin_remove_group_message(group_id: str, message_id: str, body: MessengerAdminReasonBody, admin=Depends(require_messenger_admin)):
    m = await db.messages.find_one({"id": message_id, "conversation_id": group_id, "is_group": True})
    if not m:
        raise HTTPException(404, "Message not found")
    reason = (body.reason or "Message removed by Glint moderation").strip()
    ts = now_iso()
    await db.messages.update_one({"id": message_id}, {"$set": {
        "deleted_at": ts, "moderation_reason": reason, "moderated_by": admin["id"]
    }})
    await db.conversations.update_one({"id": group_id}, {"$inc": {"moderation_strikes": 1}})
    await admin_notify(m["from_user"], f"Your group message was removed by Glint. Reason: {reason}", group_id)
    await admin_audit("remove_group_message", "message", message_id, reason, m.get("from_user"), {"group_id": group_id})
    return {"ok": True}


@api.get("/messenger/admin/users")
async def messenger_admin_users(q: str = Query(""), admin=Depends(require_messenger_admin)):
    return await admin_users(q, admin)


@api.get("/messenger/admin/users/{user_id}")
async def messenger_admin_user_detail(user_id: str, admin=Depends(require_messenger_admin)):
    return await admin_user_full(user_id, admin)


@api.post("/messenger/admin/users/{user_id}/warn")
async def messenger_admin_warn_user(user_id: str, body: AdminWarningBody, admin=Depends(require_messenger_admin)):
    return await admin_warn_user(user_id, body, admin)


@api.post("/messenger/admin/users/{user_id}/restrictions")
async def messenger_admin_restrict_user(user_id: str, body: AdminRestrictionBody, admin=Depends(require_messenger_admin)):
    return await admin_restrict_user(user_id, body, admin)


@api.post("/messenger/admin/users/{user_id}/suspend")
async def messenger_admin_suspend_user(user_id: str, body: AdminSuspendBody, admin=Depends(require_messenger_admin)):
    return await suspend_user(user_id, body, admin)


@api.post("/messenger/admin/users/{user_id}/restore")
async def messenger_admin_restore_user(user_id: str, body: AdminReasonBody, admin=Depends(require_messenger_admin)):
    return await restore_user(user_id, body, admin)


@api.post("/messenger/admin/users/{user_id}/blue-tick")
async def messenger_admin_user_blue_tick(user_id: str, body: AdminBlueTickBody, admin=Depends(require_messenger_admin)):
    return await admin_blue_tick(user_id, body, admin)


@api.post("/messenger/admin/users/{user_id}/remove")
async def messenger_admin_remove_user(user_id: str, body: AdminReasonBody, admin=Depends(require_messenger_admin)):
    reason = (body.reason or "Account removed by Glint moderation").strip()
    await admin_permanent_remove_user(user_id, reason)
    await admin_audit("messenger_remove_user", "user", user_id, reason, user_id)
    return {"ok": True}


@api.get("/messenger/admin/reports")
async def messenger_admin_reports(admin=Depends(require_messenger_admin)):
    return await admin_reports(admin)


@api.post("/messenger/admin/reports/{report_id}/remove")
async def messenger_admin_remove_reported(report_id: str, body: AdminReasonBody, admin=Depends(require_messenger_admin)):
    return await delete_reported(report_id, body, admin)


@api.post("/messenger/admin/reports/{report_id}/dismiss")
async def messenger_admin_dismiss_report(report_id: str, admin=Depends(require_messenger_admin)):
    return await dismiss_report(report_id, admin)


@api.get("/messenger/admin/audit")
async def messenger_admin_audit(admin=Depends(require_messenger_admin)):
    return await admin_audit_log(admin)


@api.get("/messenger/admin/system")
async def messenger_admin_system(admin=Depends(require_messenger_admin)):
    return await admin_system(admin)


@api.get("/messenger/admin/controls")
async def messenger_admin_get_controls(admin=Depends(require_messenger_admin)):
    cfg = await db.config.find_one({"id": "app"}, {"_id": 0, "feature_flags": 1}) or {}
    flags = cfg.get("feature_flags") or {}
    return {
        "group_creation_enabled": bool(flags.get("group_creation_enabled", True)),
        "group_verification_enabled": bool(flags.get("group_verification_enabled", True)),
        "group_messaging_enabled": bool(flags.get("group_messaging_enabled", True)),
    }


@api.post("/messenger/admin/controls")
async def messenger_admin_set_controls(body: MessengerAdminControlsBody, admin=Depends(require_messenger_admin)):
    incoming = body.dict(exclude_unset=True)
    cfg = await db.config.find_one({"id": "app"}, {"_id": 0, "feature_flags": 1}) or {}
    flags = dict(cfg.get("feature_flags") or {})
    for key in ("group_creation_enabled", "group_verification_enabled", "group_messaging_enabled"):
        if key in incoming:
            flags[key] = bool(incoming[key])
    await db.config.update_one({"id": "app"}, {"$set": {"id": "app", "feature_flags": flags}}, upsert=True)
    await admin_audit("update_messenger_controls", "config", "app", "Messenger controls updated", None, incoming)
    return {"ok": True, **{k: bool(flags.get(k, True)) for k in ("group_creation_enabled", "group_verification_enabled", "group_messaging_enabled")}}


# ----------------------------- notifications -----------------------------
@api.get("/notifications")
async def list_notifications(me=Depends(get_current_user)):
    cur = db.notifications.find({"to_user": me["id"]}).sort("created_at", -1).limit(60)
    out = []
    async for n in cur:
        actor = await db.users.find_one({"id": n["from_user"]}, {"_id": 0})
        out.append({
            "id": n["id"],
            "type": n["type"],
            "ref_id": n.get("ref_id"),
            "text": n.get("text"),
            "read": n.get("read", False),
            "created_at": n["created_at"],
            "actor": public_user(actor),
        })
    return out


@api.post("/notifications/read-all")
async def read_all_notifications(me=Depends(get_current_user)):
    await db.notifications.update_many({"to_user": me["id"]}, {"$set": {"read": True}})
    return {"ok": True}


@api.get("/notifications/unread-count")
async def unread_count(me=Depends(get_current_user)):
    return {"count": await db.notifications.count_documents({"to_user": me["id"], "read": False})}


# ----------------------------- verification -----------------------------
def verification_eligibility(user: dict) -> dict:
    age_days = 0
    raw_created = user.get("created_at")
    if raw_created:
        try:
            created = datetime.fromisoformat(str(raw_created).replace("Z", "+00:00"))
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            age_days = max(0, (datetime.now(timezone.utc) - created).days)
        except Exception:
            age_days = 0

    phone_verified = bool(user.get("phone_verified")) or bool(user.get("phone") and not user.get("email") and user.get("verified"))
    return {
        "account_age_days": age_days,
        "account_old_enough": age_days >= 60,
        "phone_added": bool(user.get("phone")),
        "phone_verified": phone_verified,
    }


@api.post("/verification")
async def submit_verification(body: VerificationSubmit, me=Depends(get_current_user)):
    if not await app_feature_enabled("verification_enabled", True):
        raise HTTPException(503, "Verification applications are temporarily unavailable.")
    existing = await db.verifications.find_one({"user_id": me["id"], "status": "pending"})
    if existing:
        raise HTTPException(400, "You already have a pending request")
    if play_billing.blue_active(me):
        raise HTTPException(400, "You are already verified")

    assert_blue_application_allowed(me)
    if not play_billing.payment_active(me):
        raise HTTPException(402, "An active Google Play subscription is required before applying")
    eligibility = verification_eligibility(me)
    if identity_name(body.full_legal_name) != identity_name(me.get("full_name")):
        raise HTTPException(400, "Your profile name must match the full name on your ID document")
    await require_owned_identity_file(body.document, me["id"], "image")
    await require_owned_identity_file(body.selfie, me["id"], "video")

    await db.verifications.insert_one({
        "id": new_id(),
        "user_id": me["id"],
        "document": body.document,
        "selfie": body.selfie,
        "full_legal_name": body.full_legal_name.strip(),
        "selfie_media_type": "video",
        "profile_name_at_submission": me.get("full_name"),
        "note": body.note,
        "eligibility_snapshot": eligibility,
        "status": "pending",
        "created_at": now_iso(),
    })
    return {"ok": True}


@api.get("/verification/me")
async def my_verification(me=Depends(get_current_user)):
    v = await db.verifications.find_one({"user_id": me["id"]}, {"_id": 0}, sort=[("created_at", -1)])
    payload = v or {"status": "none"}
    payload["eligibility"] = verification_eligibility(me)
    payload["blue_payment_confirmed"] = play_billing.payment_active(me)
    payload["blue_active"] = play_billing.blue_active(me)
    return payload


class PlayPurchaseBody(BaseModel):
    purchase_token: str = Field(min_length=1, max_length=4096)


@api.get("/blue/billing-config")
async def blue_billing_config(me=Depends(get_current_user)):
    return {"product_id": play_billing.PRODUCT_ID, "checkout_ready": bool(os.getenv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "").strip()), "account_id": play_billing.account_id(me["id"]), "intro_offer_id": play_billing.INTRO_OFFER_ID, "intro_eligible": play_billing.intro_eligible(me), "base_plan_id": "monthly"}


@api.post("/blue/purchases/verify")
async def blue_verify_purchase(body: PlayPurchaseBody, me=Depends(get_current_user)):
    try:
        result = await run_in_threadpool(play_billing.verify_subscription, body.purchase_token, me["id"])
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception:
        raise HTTPException(503, "Purchase verification is temporarily unavailable. Restore your purchase to retry.")
    if result.get("offer_id") == play_billing.INTRO_OFFER_ID:
        owner = await db.users.find_one_and_update(
            {"id": me["id"], "$or": [{"blue_intro_used_at": {"$exists": False}}, {"blue_intro_used_at": None}, {"blue_intro_purchase_token": body.purchase_token}]},
            {"$set": {"blue_intro_used_at": me.get("blue_intro_used_at") or now_iso(), "blue_intro_purchase_token": body.purchase_token}})
        if not owner:
            raise HTTPException(409, "The first-month offer has already been used on this Glint account. Contact support for this purchase.")
    await db.users.update_one({"id": me["id"]}, {"$set": {
        "blue_subscription_status": "active", "blue_subscription_ends_at": result["ends_at"],
        "blue_subscription_auto_renew": result["auto_renew"],
        "blue_purchase_token": body.purchase_token, "blue_subscription_checked_at": now_iso(),
    }})
    return {"ok": True, "payment_confirmed": True}


@api.get("/blue/entitlements")
async def blue_entitlements(me=Depends(get_current_user)):
    active = play_billing.blue_active(me)
    return {"ok": True, "blue": {
        "active": active, "source": ("admin_manual" if me.get("blue_tick_manual") or me.get("blue_manual_grant") or me.get("manual_verification_badge") in BADGES else "subscription") if active else None,
        **{key: active for key in ("badge_everywhere", "impersonation_protection", "priority_support", "video_stories", "external_links")},
        "story_video_max_seconds": 60 if active else 0, "external_links_max": 2 if active else 0,
    }, "subscription": {"status": "active" if play_billing.payment_active(me) else "inactive",
        "ends_at": me.get("blue_subscription_ends_at"), "auto_renew": bool(me.get("blue_subscription_auto_renew"))}}


class ExternalLink(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    url: str = Field(min_length=1, max_length=2048)


class ExternalLinksBody(BaseModel):
    links: List[ExternalLink] = Field(max_length=2)


async def require_blue(me=Depends(get_current_user)):
    if not play_billing.blue_active(me):
        raise HTTPException(403, "An active Blue Tick is required")
    return me


@api.get("/profile/external-links")
async def get_external_links(me=Depends(get_current_user)):
    return {"links": me.get("external_links", []) if play_billing.blue_active(me) else []}


@api.post("/profile/external-links")
async def save_external_links(body: ExternalLinksBody, me=Depends(require_blue)):
    for link in body.links:
        parsed = urllib.parse.urlparse(link.url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise HTTPException(400, "Use a valid HTTPS web address")
    await db.users.update_one({"id": me["id"]}, {"$set": {"external_links": [x.model_dump() for x in body.links]}})
    return {"ok": True}


class BlueSupportBody(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=10000)


@api.post("/blue/support")
async def blue_support(body: BlueSupportBody, me=Depends(require_blue)):
    result = await create_ticket(TicketCreate(subject=body.subject, description=body.message), me)
    await db.tickets.update_one({"id": result["id"]}, {"$set": {"priority": "blue"}})
    return result


class ImpersonationBody(BaseModel):
    reported_user_id: str
    details: Optional[str] = Field(default=None, max_length=10000)


@api.post("/blue/impersonation-report")
async def blue_impersonation(body: ImpersonationBody, me=Depends(require_blue)):
    if body.reported_user_id == me["id"] or not await db.users.find_one({"id": body.reported_user_id, "deleted_at": None}):
        raise HTTPException(400, "Choose a valid account to report")
    await db.reports.insert_one({"id": new_id(), "reporter_id": me["id"], "target_type": "user", "target_id": body.reported_user_id, "reason": "impersonation", "details": body.details, "priority": "blue", "status": "open", "created_at": now_iso()})
    return {"ok": True}


class ProfileEditV2(ProfileUpdate):
    date_of_birth: Optional[str] = None
    name_evidence_url: Optional[str] = None
    avatar_evidence_url: Optional[str] = None
    live_selfie_url: Optional[str] = None


@api.get("/profile/identity-review/me")
async def my_profile_identity_review(me=Depends(get_current_user)):
    row = await db.profile_reviews.find_one({"user_id": me["id"]}, {"_id": 0}, sort=[("created_at", -1)])
    return row or {"status": "none"}


@api.post("/profile/edit-v2")
async def profile_edit_v2(body: ProfileEditV2, me=Depends(get_current_user)):
    update = body.model_dump(exclude_unset=True, exclude={"name_evidence_url", "avatar_evidence_url", "live_selfie_url"})
    if "full_name" in update and not (update["full_name"] or "").strip():
        raise HTTPException(400, "Name cannot be empty")
    if update.get("date_of_birth"):
        try:
            datetime.strptime(update["date_of_birth"], "%Y-%m-%d")
        except ValueError:
            raise HTTPException(400, "Use a valid YYYY-MM-DD date")
    changes = {k: update[k] for k in ("full_name", "avatar") if k in update and update[k] != me.get(k)}
    review_id = None
    if play_billing.blue_active(me) and changes:
        pending = await db.profile_reviews.find_one({"user_id": me["id"], "status": "pending"})
        if pending:
            raise HTTPException(409, "Your previous identity change is still under review by the Glint Team")
        if not body.live_selfie_url:
            raise HTTPException(400, "A live selfie video is required for verified identity changes")
        selfie_path = urllib.parse.urlparse(body.live_selfie_url).path.removeprefix("/api/files/")
        if not await db.files.find_one({"path": selfie_path, "owner_id": me["id"], "content_type": {"$regex": "^video/"}}):
            raise HTTPException(400, "Record your own live selfie video")
        for key in changes:
            evidence = body.name_evidence_url if key == "full_name" else body.avatar_evidence_url
            if not evidence:
                raise HTTPException(400, "Supporting evidence is required for verified identity changes")
            file_path = urllib.parse.urlparse(evidence).path.removeprefix("/api/files/")
            if not await db.files.find_one({"path": file_path, "owner_id": me["id"]}):
                raise HTTPException(400, "Upload your own supporting evidence")
        review_id = new_id()
        await db.profile_reviews.insert_one({"id": review_id, "user_id": me["id"], "changes": changes, "name_evidence_url": body.name_evidence_url, "avatar_evidence_url": body.avatar_evidence_url, "live_selfie_url": body.live_selfie_url, "status": "pending", "created_at": now_iso()})
        for key in changes:
            update.pop(key)
    if update:
        await update_me(ProfileUpdate(**{k: v for k, v in update.items() if k != "date_of_birth"}), me)
        if "date_of_birth" in update:
            await db.users.update_one({"id": me["id"]}, {"$set": {"date_of_birth": update["date_of_birth"]}})
    return {"ok": True, "identity_review_required": bool(review_id), "review_id": review_id}


class ManualBlueBody(BaseModel):
    user_id: str
    enabled: bool


@api.post("/admin/blue/manual")
async def manual_blue(body: ManualBlueBody, admin=Depends(require_review_admin)):
    user = await db.users.find_one({"id": body.user_id, "deleted_at": None})
    if not user:
        raise HTTPException(404, "User not found")
    await set_manual_blue_tick(db, body.user_id, body.enabled)
    paid = bool(user.get("blue_identity_approved")) and play_billing.payment_active(user)
    await db.users.update_one({"id": body.user_id}, {"$set": {"golden_tick": body.enabled or paid, "blue_tick_manual": body.enabled, "blue_source": "admin_manual" if body.enabled else "subscription" if paid else None}})
    await admin_audit("manual_blue", "user", body.user_id, "Manual Blue grant updated", body.user_id)
    return {"ok": True}


class ProfileReviewBody(BaseModel):
    identity_match_confirmed: bool = False
    review_id: str
    decision: str
    note: Optional[str] = None


@api.get("/admin/profile-change/reviews")
async def pending_profile_changes(admin=Depends(require_review_admin)):
    rows = await db.profile_reviews.find({"status": "pending"}, {"_id": 0}).sort("created_at", 1).limit(100).to_list(100)
    for row in rows:
        user = await db.users.find_one({"id": row["user_id"]})
        row["current_name"] = (user or {}).get("full_name")
        row["username"] = (user or {}).get("username")
    return rows


@api.post("/admin/profile-change/review")
async def review_profile_change(body: ProfileReviewBody, admin=Depends(require_review_admin)):
    if body.decision not in {"approved", "rejected"}:
        raise HTTPException(400, "Invalid decision")
    if body.decision == "approved" and not body.identity_match_confirmed:
        raise HTTPException(400, "Confirm the document name and live selfie match the requested identity")
    review = await db.profile_reviews.find_one_and_update({"id": body.review_id, "status": "pending"}, {"$set": {"status": body.decision, "reviewed_at": now_iso(), "note": body.note}})
    if not review:
        raise HTTPException(404, "Pending review not found")
    if body.decision == "approved":
        await db.users.update_one({"id": review["user_id"], "deleted_at": None}, {"$set": review["changes"]})
    await admin_notify(review["user_id"], f"Your profile change was {body.decision}.")
    return {"ok": True}


class VideoStoryBody(BaseModel):
    media: str
    duration: float = Field(gt=0, le=60)
    caption: Optional[str] = Field(default=None, max_length=120)
    audience: str = "friends"


@api.post("/stories/video")
async def blue_video_story(body: VideoStoryBody, me=Depends(require_blue)):
    path = urllib.parse.urlparse(body.media).path.removeprefix("/api/files/")
    if not await db.files.find_one({"path": path, "owner_id": me["id"], "content_type": {"$regex": "^video/"}}):
        raise HTTPException(400, "Upload your own video first")
    return await create_story(StoryCreate(type="video", media=body.media, duration=body.duration, text=body.caption, audience=body.audience), me)


# ----------------------------- help center -----------------------------
@api.post("/tickets")
async def create_ticket(body: TicketCreate, me=Depends(get_current_user)):
    doc = {
        "id": new_id(), "user_id": me["id"], "subject": body.subject,
        "description": body.description, "screenshot": body.screenshot,
        "status": "open", "reply": None, "created_at": now_iso(),
    }
    await db.tickets.insert_one(doc)
    return {"ok": True, "id": doc["id"]}


@api.get("/tickets/me")
async def my_tickets(me=Depends(get_current_user)):
    cur = db.tickets.find({"user_id": me["id"]}, {"_id": 0}).sort("created_at", -1)
    return [t async for t in cur]


# ----------------------------- app config (broadcast/force update) -----------------------------
@api.get("/config")
async def get_config(me=Depends(get_current_user)):
    cfg = await db.config.find_one({"id": "app"}, {"_id": 0}) or {}
    return {
        "broadcast": cfg.get("broadcast"),
        "force_update": cfg.get("force_update"),
        "maintenance": cfg.get("maintenance", {"active": False, "message": ""}),
        "feature_flags": cfg.get("feature_flags", {
            "registration_enabled": True,
            "uploads_enabled": True,
            "posts_enabled": True,
            "stories_enabled": True,
            "chat_enabled": True,
            "verification_enabled": True,
        }),
    }


# ----------------------------- files -----------------------------
@api.post("/upload")
async def upload(file: UploadFile = File(...), me=Depends(get_current_user)):
    if not await app_feature_enabled("uploads_enabled", True):
        raise HTTPException(503, "Uploads are temporarily unavailable.")
    ext = (file.filename or "bin").split(".")[-1].lower()
    path = f"glint/uploads/{me['id']}/{new_id()}.{ext}"
    data = await file.read()
    if len(data) > 12 * 1024 * 1024:
        raise HTTPException(413, "File too large. Maximum size is 12 MB.")
    ct = file.content_type or "application/octet-stream"
    await db.files.insert_one({
        "id": new_id(), "path": path, "owner_id": me["id"],
        "content_type": ct, "content": data, "created_at": now_iso(),
    })
    token = make_token(me["id"])
    return {"path": path, "url": f"/api/files/{path}", "token": token}


@api.get("/files/{path:path}")
async def get_file(path: str, token: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    # auth via header or query token (web images)
    ok = False
    if authorization and authorization.startswith("Bearer "):
        try:
            decode_token(authorization.split(" ", 1)[1])
            ok = True
        except Exception:
            ok = False
    if not ok and token:
        try:
            decode_token(token)
            ok = True
        except Exception:
            ok = False
    if not ok:
        raise HTTPException(401, "Not authenticated")
    meta = await db.files.find_one({"path": path})
    if not meta or "content" not in meta:
        raise HTTPException(404, "File not found")
    return Response(content=bytes(meta["content"]), media_type=meta.get("content_type", "application/octet-stream"))


# ----------------------------- admin -----------------------------
@api.post("/admin/login")
async def admin_login(body: AdminLogin):
    email = body.email.strip().lower()
    if not any(email == e.lower() and body.password == p for e, p in ADMIN_CREDS if e and p):
        raise HTTPException(400, "Invalid admin credentials")
    token = make_token("admin", is_admin=True)
    return {"token": token, "admin": True}


@api.get("/admin/stats")
async def admin_stats(_=Depends(require_admin)):
    active_since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    return {
        "users": await db.users.count_documents({"deleted_at": None, "verified": True}),
        "active_24h": await db.users.count_documents({"deleted_at": None, "last_seen": {"$gte": active_since}}),
        "posts": await db.posts.count_documents({"deleted_at": None}),
        "comments": await db.comments.count_documents({"deleted_at": None}),
        "stories": await db.stories.count_documents({"deleted_at": None, "expires_at": {"$gt": now_iso()}}),
        "messages": await db.messages.count_documents({}),
        "pending_verifications": await db.verifications.count_documents({"status": "pending"}),
        "open_tickets": await db.tickets.count_documents({"status": "open"}),
        "open_reports": await db.reports.count_documents({"status": "open"}),
        "open_appeals": await db.appeals.count_documents({"status": "open"}),
        "warnings": await db.warnings.count_documents({}),
        "suspended_users": await db.users.count_documents({"deleted_at": None, "suspended": True}),
        "blue_tick_users": await db.users.count_documents({"deleted_at": None, "golden_tick": True}),
    }


@api.get("/admin/tickets")
async def admin_tickets(_=Depends(require_admin)):
    cur = db.tickets.find({}, {"_id": 0}).sort("created_at", -1)
    out = []
    async for t in cur:
        u = await db.users.find_one({"id": t["user_id"]}, {"_id": 0})
        t["user"] = public_user(u) if u else None
        out.append(t)
    return out


@api.post("/admin/tickets/{ticket_id}/resolve")
async def resolve_ticket(ticket_id: str, reply: str = Form(...), _=Depends(require_admin)):
    await db.tickets.update_one({"id": ticket_id}, {"$set": {"status": "resolved", "reply": reply}})
    return {"ok": True}


@api.get("/admin/verifications")
async def admin_verifications(_=Depends(require_admin)):
    cur = db.verifications.find({}, {"_id": 0}).sort("created_at", -1)
    out = []
    async for v in cur:
        u = await db.users.find_one({"id": v["user_id"]}, {"_id": 0})
        v["user"] = public_user(u) if u else None
        out.append(v)
    return out


class IdentityApprovalBody(AdminReasonBody):
    identity_match_confirmed: bool = False


@api.post("/admin/verifications/{vid}/approve")
async def approve_verification(vid: str, body: IdentityApprovalBody, _=Depends(require_admin)):
    v = await db.verifications.find_one({"id": vid})
    if not v:
        raise HTTPException(404, "Not found")
    applicant = await db.users.find_one({"id": v["user_id"]})
    if not applicant or not play_billing.payment_active(applicant):
        raise HTTPException(402, "Applicant needs an active Google Play subscription")
    if v.get("status") != "pending":
        raise HTTPException(409, "This application has already been reviewed")
    if not body.identity_match_confirmed:
        raise HTTPException(400, "Confirm the document name matches the profile name and the live selfie matches the ID")
    if identity_name(v.get("full_legal_name")) != identity_name(applicant.get("full_name")):
        raise HTTPException(409, "The profile name does not match the submitted identity")
    reason = (body.reason or "Identity verification approved").strip()
    await db.verifications.update_one({"id": vid}, {"$set": {"status": "approved", "review_reason": reason, "reviewed_at": now_iso()}})
    await db.users.update_one({"id": v["user_id"]}, {"$set": {"golden_tick": True, "blue_source": "subscription", "blue_identity_approved": True}})
    await admin_notify(v["user_id"], f"Your Blue Tick verification was approved. Reason: {reason}")
    await admin_audit("approve_verification", "verification", vid, reason, v["user_id"])
    return {"ok": True}


@api.post("/admin/verifications/{vid}/reject")
async def reject_verification(vid: str, body: AdminReasonBody = AdminReasonBody(reason="Verification requirements were not met"), _=Depends(require_admin)):
    v = await db.verifications.find_one({"id": vid})
    if not v:
        raise HTTPException(404, "Not found")
    reason = (body.reason or "Verification requirements were not met").strip()
    await db.verifications.update_one({"id": vid}, {"$set": {"status": "rejected", "review_reason": reason, "reviewed_at": now_iso()}})
    await admin_notify(v["user_id"], f"Your Blue Tick verification request was declined. Reason: {reason}")
    await admin_audit("reject_verification", "verification", vid, reason, v["user_id"])
    return {"ok": True}


@api.get("/admin/reports")
async def admin_reports(_=Depends(require_admin)):
    cur = db.reports.find({"status": "open"}, {"_id": 0}).sort("created_at", -1)
    out = []
    async for r in cur:
        target = None
        if r["target_type"] == "post":
            p = await db.posts.find_one({"id": r["target_id"]}, {"_id": 0})
            if p:
                target = {"type": "post", "text": p.get("text"), "image": p.get("image"), "author_id": p.get("author_id")}
        elif r["target_type"] == "story":
            s = await db.stories.find_one({"id": r["target_id"]}, {"_id": 0})
            if s:
                target = {"type": "story", "text": s.get("text"), "image": s.get("image")}
        elif r["target_type"] == "user":
            u = await db.users.find_one({"id": r["target_id"]}, {"_id": 0})
            if u:
                target = {"type": "user", "full_name": u.get("full_name"), "username": u.get("username"), "avatar": u.get("avatar")}
        elif r["target_type"] == "group":
            g = await db.conversations.find_one({"id": r["target_id"], "is_group": True}, {"_id": 0})
            if g:
                target = {"type": "group", "name": g.get("name"), "avatar": g.get("avatar"), "created_by": g.get("created_by")}
        elif r["target_type"] == "message":
            m = await db.messages.find_one({"id": r["target_id"], "is_group": True}, {"_id": 0})
            if m:
                target = {"type": "message", "text": m.get("text"), "media": m.get("media"), "author_id": m.get("from_user"), "group_id": m.get("conversation_id")}
        r["target"] = target
        out.append(r)
    return out


@api.post("/admin/reports/{report_id}/delete-content")
async def delete_reported(report_id: str, body: AdminReasonBody = AdminReasonBody(reason="Content violated Glint rules"), _=Depends(require_admin)):
    r = await db.reports.find_one({"id": report_id})
    if not r:
        raise HTTPException(404, "Not found")
    reason = (body.reason or "Content violated Glint rules").strip()
    ts = now_iso()
    author_id = None
    if r["target_type"] == "post":
        target = await db.posts.find_one({"id": r["target_id"]})
        author_id = target.get("author_id") if target else None
        await db.posts.update_one({"id": r["target_id"]}, {"$set": {"deleted_at": ts, "moderation_reason": reason, "moderated_by": "admin"}})
    elif r["target_type"] == "story":
        target = await db.stories.find_one({"id": r["target_id"]})
        author_id = target.get("author_id") if target else None
        await db.stories.update_one({"id": r["target_id"]}, {"$set": {"deleted_at": ts, "moderation_reason": reason, "moderated_by": "admin"}})
    elif r["target_type"] == "comment":
        target = await db.comments.find_one({"id": r["target_id"]})
        author_id = target.get("author_id") if target else None
        await db.comments.update_one({"id": r["target_id"]}, {"$set": {"deleted_at": ts, "moderation_reason": reason, "moderated_by": "admin"}})
    elif r["target_type"] == "group":
        target = await db.conversations.find_one({"id": r["target_id"], "is_group": True})
        author_id = target.get("created_by") if target else None
        await db.conversations.update_one({"id": r["target_id"]}, {"$set": {
            "disabled": True, "disabled_reason": reason, "verified": False, "verification_badge": None
        }, "$inc": {"moderation_strikes": 1}})
    elif r["target_type"] == "message":
        target = await db.messages.find_one({"id": r["target_id"], "is_group": True})
        author_id = target.get("from_user") if target else None
        await db.messages.update_one({"id": r["target_id"]}, {"$set": {
            "deleted_at": ts, "moderation_reason": reason, "moderated_by": "admin"
        }})
    elif r["target_type"] == "user":
        author_id = r["target_id"]
        await admin_permanent_remove_user(r["target_id"], reason)
    if author_id and r["target_type"] != "user":
        await admin_notify(author_id, f"Your {r['target_type']} was removed by Glint. Reason: {reason}", r["target_id"])
    await db.reports.update_one({"id": report_id}, {"$set": {"status": "resolved", "resolution_reason": reason, "resolved_at": ts}})
    await admin_audit("delete_reported_content", r["target_type"], r["target_id"], reason, author_id, {"report_id": report_id})
    return {"ok": True}


@api.post("/admin/reports/{report_id}/dismiss")
async def dismiss_report(report_id: str, _=Depends(require_admin)):
    await db.reports.update_one({"id": report_id}, {"$set": {"status": "dismissed"}})
    return {"ok": True}


async def admin_audit(action: str, target_type: str, target_id: str, reason: str = "", target_user_id: Optional[str] = None, metadata: Optional[dict] = None):
    await db.admin_audit.insert_one({
        "id": new_id(),
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "target_user_id": target_user_id,
        "reason": reason,
        "metadata": metadata or {},
        "created_at": now_iso(),
    })


async def admin_notify(user_id: str, text: str, ref_id: Optional[str] = None):
    await db.notifications.insert_one({
        "id": new_id(),
        "to_user": user_id,
        "from_user": "admin",
        "type": "admin",
        "ref_id": ref_id,
        "text": text,
        "read": False,
        "created_at": now_iso(),
    })


def admin_safe_user(u: dict) -> dict:
    d = public_user(u)
    d.update({
        "email": u.get("email"),
        "phone": u.get("phone"),
        "phone_verified": bool(u.get("phone_verified")) or bool(u.get("phone") and not u.get("email") and u.get("verified")),
        "account_contact_verified": bool(u.get("verified")),
        "contact_visibility": u.get("contact_visibility", "only_me"),
        "blue_tick": play_billing.blue_active(u),
        "sparks": u.get("sparks", 0),
        "last_seen": u.get("last_seen"),
        "suspended": bool(u.get("suspended")),
        "suspended_until": u.get("suspended_until"),
        "suspend_reason": u.get("suspend_reason"),
        "deleted_at": u.get("deleted_at"),
        "deleted_reason": u.get("deleted_reason"),
        "permanent_deleted": bool(u.get("permanent_deleted")),
        "posting_restricted_until": u.get("posting_restricted_until"),
        "messaging_restricted_until": u.get("messaging_restricted_until"),
        "restriction_reason": u.get("restriction_reason"),
        "force_logout_at": u.get("force_logout_at"),
    })
    return d


@api.get("/admin/users")
async def admin_users(q: str = Query(""), _=Depends(require_admin)):
    query = {"permanent_deleted": {"$ne": True}}
    if q.strip():
        query["$or"] = [
            {"username": {"$regex": q.strip(), "$options": "i"}},
            {"full_name": {"$regex": q.strip(), "$options": "i"}},
            {"email": {"$regex": q.strip(), "$options": "i"}},
            {"phone": {"$regex": q.strip(), "$options": "i"}},
        ]
    cur = db.users.find(query, {"_id": 0}).sort("created_at", -1).limit(100)
    out = []
    async for u in cur:
        await active_suspension(u)
        out.append(admin_safe_user(u))
    return out


@api.get("/admin/users/{user_id}/full")
async def admin_user_full(user_id: str, _=Depends(require_admin)):
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(404, "User not found")
    await active_suspension(u)

    posts = []
    async for p in db.posts.find({"author_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(50):
        posts.append({
            "id": p.get("id"), "type": p.get("type"), "text": p.get("text"), "image": p.get("image"),
            "audience": p.get("audience"), "created_at": p.get("created_at"), "deleted_at": p.get("deleted_at"),
            "moderation_reason": p.get("moderation_reason"),
        })

    comments = []
    async for cm in db.comments.find({"author_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(50):
        comments.append({
            "id": cm.get("id"), "post_id": cm.get("post_id"), "text": cm.get("text"),
            "created_at": cm.get("created_at"), "deleted_at": cm.get("deleted_at"),
            "moderation_reason": cm.get("moderation_reason"),
        })

    stories = []
    async for st in db.stories.find({"author_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(30):
        stories.append({
            "id": st.get("id"), "type": st.get("type"), "text": st.get("text"), "image": st.get("image"),
            "media": st.get("media"), "created_at": st.get("created_at"), "deleted_at": st.get("deleted_at"),
            "moderation_reason": st.get("moderation_reason"),
        })

    verifications = []
    async for v in db.verifications.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(10):
        verifications.append(v)

    warnings = [w async for w in db.warnings.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(50)]
    login_activity = [e async for e in db.login_events.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(30)]

    friends = []
    async for f in db.friendships.find({"users": user_id}, {"_id": 0}).sort("created_at", -1).limit(50):
        other_ids = [x for x in f.get("users", []) if x != user_id]
        if not other_ids:
            continue
        fu = await db.users.find_one({"id": other_ids[0], "deleted_at": None}, {"_id": 0})
        if fu:
            friends.append(public_user(fu))

    history = []
    async for a in db.admin_audit.find({"target_user_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(50):
        history.append(a)

    content_ids = []
    content_ids += await db.posts.distinct("id", {"author_id": user_id})
    content_ids += await db.comments.distinct("id", {"author_id": user_id})
    content_ids += await db.stories.distinct("id", {"author_id": user_id})

    counts = {
        "posts": await db.posts.count_documents({"author_id": user_id, "deleted_at": None}),
        "comments": await db.comments.count_documents({"author_id": user_id, "deleted_at": None}),
        "stories": await db.stories.count_documents({"author_id": user_id, "deleted_at": None}),
        "friends": await db.friendships.count_documents({"users": user_id}),
        "tickets": await db.tickets.count_documents({"user_id": user_id}),
        "reports_made": await db.reports.count_documents({"reporter_id": user_id}),
        "reports_received": await db.reports.count_documents({
            "$or": [
                {"target_type": "user", "target_id": user_id},
                {"target_id": {"$in": content_ids}} if content_ids else {"target_id": "__none__"},
            ]
        }),
        "messages_sent": await db.messages.count_documents({"from_user": user_id}),
        "warnings": await db.warnings.count_documents({"user_id": user_id}),
        "followers": await db.follows.count_documents({"following_id": user_id}),
        "following": await db.follows.count_documents({"follower_id": user_id}),
    }

    return {
        "user": admin_safe_user(u),
        "counts": counts,
        "posts": posts,
        "comments": comments,
        "stories": stories,
        "friends": friends,
        "warnings": warnings,
        "login_activity": login_activity,
        "verifications": verifications,
        "moderation_history": history,
    }


@api.post("/admin/users/{user_id}/suspend")
async def suspend_user(user_id: str, body: AdminSuspendBody = AdminSuspendBody(), _=Depends(require_admin)):
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(404, "User not found")
    reason = (body.reason or "Violation of Glint rules").strip()
    days = None
    until = None
    await db.users.update_one({"id": user_id}, {"$set": {
        "suspended": True,
        "suspended_until": None,
        "suspend_reason": reason,
    }})
    duration_text = f" until {until}" if until else " indefinitely"
    notice = f"Your Glint account has been suspended{duration_text}. Reason: {reason}"
    await admin_notify(user_id, notice)
    await send_moderation_email(u.get("email"), "Glint account suspension", notice)
    await admin_audit("suspend_user", "user", user_id, reason, user_id, {"duration_days": days, "until": until})
    return {"suspended": True, "suspended_until": until, "reason": reason}


@api.post("/admin/users/{user_id}/restore")
async def restore_user(user_id: str, body: AdminReasonBody = AdminReasonBody(reason="Suspension ended"), _=Depends(require_admin)):
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(404, "User not found")
    reason = (body.reason or "Suspension ended").strip()
    await db.users.update_one({"id": user_id}, {"$set": {
        "suspended": False, "suspended_until": None, "suspend_reason": None,
    }})
    notice = f"Your Glint account suspension has been removed. Note: {reason}"
    await admin_notify(user_id, notice)
    await send_moderation_email(u.get("email"), "Glint account restored", notice)
    await admin_audit("restore_user", "user", user_id, reason, user_id)
    return {"suspended": False}


class AdminBadgeBody(BaseModel):
    badge: Optional[str] = None
    reason: str = "Glint Team verification"

@api.post("/admin/users/{user_id}/badge")
async def admin_badge(user_id: str, body: AdminBadgeBody, _=Depends(require_admin)):
    if body.badge is not None and body.badge not in BADGES: raise HTTPException(400, "Unknown badge")
    user = await db.users.find_one({"id": user_id, "deleted_at": None})
    if not user: raise HTTPException(404, "User not found")
    await db.users.update_one({"id": user_id}, {"$set": {"manual_verification_badge": body.badge, "manual_badge_reason": body.reason.strip(), "blue_tick_manual": body.badge == "blue", "blue_manual_grant": body.badge == "blue"}})
    await admin_audit("set_verification_badge", "user", user_id, body.reason, user_id, {"badge": body.badge})
    await admin_notify(user_id, "Your verification badge has been updated by the Glint Team.")
    fresh = await db.users.find_one({"id": user_id})
    return {"ok": True, "verification_badge": display_badge(fresh, play_billing.blue_active), "benefits_active": play_billing.blue_active(fresh)}

@api.post("/admin/users/{user_id}/blue-tick")
async def admin_blue_tick(user_id: str, body: AdminBlueTickBody, _=Depends(require_admin)):
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(404, "User not found")
    reason = (body.reason or ("Approved by Glint admin" if body.verified else "Verification removed by Glint admin")).strip()
    await set_manual_blue_tick(db, user_id, body.verified, reason)
    await db.users.update_one({"id": user_id}, {"$set": {"manual_verification_badge": "blue" if body.verified else None, "golden_tick": body.verified, "blue_tick_manual": body.verified, "blue_source": "admin_manual" if body.verified else None}})
    if body.verified:
        notice = f"Your account has been granted the Glint Blue Tick. Reason: {reason}"
        action = "grant_blue_tick"
    else:
        notice = f"Your Glint Blue Tick has been removed. Reason: {reason}"
        action = "revoke_blue_tick"
    await admin_notify(user_id, notice)
    await admin_audit(action, "user", user_id, reason, user_id)
    return {"verified": body.verified}


async def admin_permanent_remove_user(user_id: str, reason: str):
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(404, "User not found")
    reason = (reason or "Violation of Glint rules").strip()
    ts = now_iso()
    notice = f"Your Glint account has been permanently removed. Reason: {reason}"
    await admin_notify(user_id, notice)
    await send_moderation_email(u.get("email"), "Glint account removed", notice)
    await db.users.update_one({"id": user_id}, {"$set": {
        "deleted_at": ts,
        "deleted_reason": reason,
        "permanent_deleted": True,
        "golden_tick": False,
        "suspended": False,
        "suspended_until": None,
        "suspend_reason": None,
    }})
    await db.posts.update_many({"author_id": user_id, "deleted_at": None}, {"$set": {"deleted_at": ts, "moderation_reason": reason, "moderated_by": "admin"}})
    await db.comments.update_many({"author_id": user_id, "deleted_at": None}, {"$set": {"deleted_at": ts, "moderation_reason": reason, "moderated_by": "admin"}})
    await db.stories.update_many({"author_id": user_id, "deleted_at": None}, {"$set": {"deleted_at": ts, "moderation_reason": reason, "moderated_by": "admin"}})
    await db.friendships.delete_many({"users": user_id})
    await db.friend_requests.delete_many({"$or": [{"from": user_id}, {"to": user_id}]})
    await db.follows.delete_many({"$or": [{"follower_id": user_id}, {"following_id": user_id}]})
    await db.users.update_many({}, {"$pull": {"inner_circle": user_id, "blocked": user_id}})
    await admin_audit("permanent_remove_user", "user", user_id, reason, user_id, {"username": u.get("username")})
    return {"ok": True}


@api.post("/admin/users/{user_id}/permanent-delete")
async def permanent_delete_user(user_id: str, body: AdminReasonBody, _=Depends(require_admin)):
    return await admin_permanent_remove_user(user_id, body.reason)


@api.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, _=Depends(require_admin)):
    # Legacy admin-client compatibility. New dashboard uses permanent-delete with a typed reason.
    return await admin_permanent_remove_user(user_id, "Removed by Glint administrator")


@api.post("/admin/posts/{post_id}/delete")
async def admin_delete_post(post_id: str, body: AdminReasonBody, _=Depends(require_admin)):
    p = await db.posts.find_one({"id": post_id})
    if not p:
        raise HTTPException(404, "Post not found")
    reason = (body.reason or "Violation of Glint rules").strip()
    await db.posts.update_one({"id": post_id}, {"$set": {
        "deleted_at": now_iso(), "moderation_reason": reason, "moderated_by": "admin",
    }})
    await admin_notify(p["author_id"], f"One of your posts was removed by Glint. Reason: {reason}", post_id)
    await admin_audit("delete_post", "post", post_id, reason, p["author_id"])
    return {"ok": True}


@api.post("/admin/comments/{comment_id}/delete")
async def admin_delete_comment(comment_id: str, body: AdminReasonBody, _=Depends(require_admin)):
    cm = await db.comments.find_one({"id": comment_id})
    if not cm:
        raise HTTPException(404, "Comment not found")
    reason = (body.reason or "Violation of Glint rules").strip()
    await db.comments.update_one({"id": comment_id}, {"$set": {
        "deleted_at": now_iso(), "moderation_reason": reason, "moderated_by": "admin",
    }})
    await admin_notify(cm["author_id"], f"One of your comments was removed by Glint. Reason: {reason}", cm.get("post_id"))
    await admin_audit("delete_comment", "comment", comment_id, reason, cm["author_id"], {"post_id": cm.get("post_id")})
    return {"ok": True}


@api.post("/admin/stories/{story_id}/delete")
async def admin_delete_story(story_id: str, body: AdminReasonBody, _=Depends(require_admin)):
    s = await db.stories.find_one({"id": story_id})
    if not s:
        raise HTTPException(404, "Story not found")
    reason = (body.reason or "Violation of Glint rules").strip()
    await db.stories.update_one({"id": story_id}, {"$set": {
        "deleted_at": now_iso(), "moderation_reason": reason, "moderated_by": "admin",
    }})
    await admin_notify(s["author_id"], f"Your story was removed by Glint. Reason: {reason}", story_id)
    await admin_audit("delete_story", "story", story_id, reason, s["author_id"])
    return {"ok": True}




@api.post("/admin/users/{user_id}/edit")
async def admin_edit_user(user_id: str, body: AdminUserEditBody, _=Depends(require_admin)):
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(404, "User not found")
    update = body.dict(exclude_unset=True)
    if "username" in update and update["username"] is not None:
        username = update["username"].strip().lower()
        if len(username) < 3:
            raise HTTPException(400, "Username must be at least 3 characters")
        exists = await db.users.find_one({"username": username, "id": {"$ne": user_id}, "deleted_at": None})
        if exists:
            raise HTTPException(400, "Username already taken")
        update["username"] = username
    if "full_name" in update and update["full_name"] is not None:
        update["full_name"] = update["full_name"].strip()
        if not update["full_name"]:
            raise HTTPException(400, "Name cannot be empty")
    if "privacy" in update and update["privacy"] not in {"public", "friends", "only_me"}:
        raise HTTPException(400, "Invalid profile privacy")
    if "contact_visibility" in update and update["contact_visibility"] not in {"public", "friends", "only_me"}:
        raise HTTPException(400, "Invalid contact visibility")
    if update:
        await db.users.update_one({"id": user_id}, {"$set": update})
        await admin_audit("edit_user_profile", "user", user_id, "Profile edited by admin", user_id, {"fields": sorted(update.keys())})
        await admin_notify(user_id, "Your Glint profile information was updated by the Glint Team.")
    fresh = await db.users.find_one({"id": user_id}, {"_id": 0})
    return admin_safe_user(fresh)


@api.post("/admin/users/{user_id}/warn")
async def admin_warn_user(user_id: str, body: AdminWarningBody, _=Depends(require_admin)):
    u = await db.users.find_one({"id": user_id, "deleted_at": None})
    if not u:
        raise HTTPException(404, "User not found")
    reason = (body.reason or "Please review Glint's community rules.").strip()
    doc = {"id": new_id(), "user_id": user_id, "reason": reason, "status": "active", "created_at": now_iso()}
    await db.warnings.insert_one(doc)
    await admin_notify(user_id, f"Glint warning: {reason}")
    await send_moderation_email(u.get("email"), "Glint account warning", reason)
    await admin_audit("warn_user", "user", user_id, reason, user_id)
    return {"ok": True, "warning": doc}


def _restriction_until(days: Optional[int]) -> Optional[str]:
    if days is None:
        return None
    if days <= 0:
        return (datetime.now(timezone.utc) + timedelta(days=3650)).isoformat()
    return (datetime.now(timezone.utc) + timedelta(days=min(days, 3650))).isoformat()


@api.post("/admin/users/{user_id}/restrictions")
async def admin_restrict_user(user_id: str, body: AdminRestrictionBody, _=Depends(require_admin)):
    u = await db.users.find_one({"id": user_id, "deleted_at": None})
    if not u:
        raise HTTPException(404, "User not found")
    reason = (body.reason or "Temporary account restriction").strip()
    update = {"restriction_reason": reason}
    metadata = {}
    if body.posting_days is not None:
        update["posting_restricted_until"] = _restriction_until(body.posting_days)
        metadata["posting_days"] = body.posting_days
    if body.messaging_days is not None:
        update["messaging_restricted_until"] = _restriction_until(body.messaging_days)
        metadata["messaging_days"] = body.messaging_days
    if len(update) == 1:
        raise HTTPException(400, "Choose at least one restriction")
    await db.users.update_one({"id": user_id}, {"$set": update})
    await admin_notify(user_id, f"Your Glint account has temporary feature restrictions. Reason: {reason}")
    await admin_audit("restrict_user", "user", user_id, reason, user_id, metadata)
    return {"ok": True, **update}


@api.post("/admin/users/{user_id}/clear-restrictions")
async def admin_clear_restrictions(user_id: str, body: AdminReasonBody = AdminReasonBody(reason="Restrictions removed"), _=Depends(require_admin)):
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(404, "User not found")
    await db.users.update_one({"id": user_id}, {"$set": {
        "posting_restricted_until": None, "messaging_restricted_until": None, "restriction_reason": None
    }})
    await admin_notify(user_id, "Your temporary Glint feature restrictions have been removed.")
    await admin_audit("clear_user_restrictions", "user", user_id, body.reason, user_id)
    return {"ok": True}


@api.post("/admin/users/{user_id}/force-logout")
async def admin_force_logout(user_id: str, body: AdminReasonBody = AdminReasonBody(reason="Security session reset"), _=Depends(require_admin)):
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(404, "User not found")
    ts = now_iso()
    await db.users.update_one({"id": user_id}, {"$set": {"force_logout_at": ts}})
    await admin_audit("force_logout", "user", user_id, body.reason, user_id)
    return {"ok": True, "force_logout_at": ts}


@api.post("/admin/posts/{post_id}/restore")
async def admin_restore_post(post_id: str, body: AdminReasonBody = AdminReasonBody(reason="Content restored after review"), _=Depends(require_admin)):
    p = await db.posts.find_one({"id": post_id})
    if not p:
        raise HTTPException(404, "Post not found")
    await db.posts.update_one({"id": post_id}, {"$set": {"deleted_at": None, "moderation_reason": None, "moderated_by": None}})
    await admin_notify(p["author_id"], f"Your post was restored by Glint. Note: {body.reason}", post_id)
    await admin_audit("restore_post", "post", post_id, body.reason, p["author_id"])
    return {"ok": True}


@api.post("/admin/comments/{comment_id}/restore")
async def admin_restore_comment(comment_id: str, body: AdminReasonBody = AdminReasonBody(reason="Content restored after review"), _=Depends(require_admin)):
    cm = await db.comments.find_one({"id": comment_id})
    if not cm:
        raise HTTPException(404, "Comment not found")
    await db.comments.update_one({"id": comment_id}, {"$set": {"deleted_at": None, "moderation_reason": None, "moderated_by": None}})
    await admin_notify(cm["author_id"], f"Your comment was restored by Glint. Note: {body.reason}", cm.get("post_id"))
    await admin_audit("restore_comment", "comment", comment_id, body.reason, cm["author_id"])
    return {"ok": True}


@api.post("/admin/stories/{story_id}/restore")
async def admin_restore_story(story_id: str, body: AdminReasonBody = AdminReasonBody(reason="Content restored after review"), _=Depends(require_admin)):
    st = await db.stories.find_one({"id": story_id})
    if not st:
        raise HTTPException(404, "Story not found")
    await db.stories.update_one({"id": story_id}, {"$set": {"deleted_at": None, "moderation_reason": None, "moderated_by": None}})
    await admin_notify(st["author_id"], f"Your story was restored by Glint. Note: {body.reason}", story_id)
    await admin_audit("restore_story", "story", story_id, body.reason, st["author_id"])
    return {"ok": True}


@api.get("/admin/content")
async def admin_content(kind: str = Query("all"), status: str = Query("all"), _=Depends(require_admin)):
    kind = kind.lower()
    status = status.lower()

    def status_query():
        if status == "active":
            return {"deleted_at": None}
        if status == "removed":
            return {"deleted_at": {"$ne": None}}
        return {}

    out = []
    if kind in {"all", "post"}:
        async for p in db.posts.find(status_query(), {"_id": 0}).sort("created_at", -1).limit(60):
            au = await db.users.find_one({"id": p.get("author_id")}, {"_id": 0})
            out.append({
                "kind": "post", "id": p.get("id"), "text": p.get("text"), "image": p.get("image"),
                "created_at": p.get("created_at"), "deleted_at": p.get("deleted_at"),
                "moderation_reason": p.get("moderation_reason"), "author": public_user(au) if au else None,
            })
    if kind in {"all", "story"}:
        async for st in db.stories.find(status_query(), {"_id": 0}).sort("created_at", -1).limit(60):
            au = await db.users.find_one({"id": st.get("author_id")}, {"_id": 0})
            out.append({
                "kind": "story", "id": st.get("id"), "text": st.get("text"), "image": st.get("image"),
                "media": st.get("media"), "created_at": st.get("created_at"), "deleted_at": st.get("deleted_at"),
                "moderation_reason": st.get("moderation_reason"), "author": public_user(au) if au else None,
            })
    if kind in {"all", "comment"}:
        async for cm in db.comments.find(status_query(), {"_id": 0}).sort("created_at", -1).limit(60):
            au = await db.users.find_one({"id": cm.get("author_id")}, {"_id": 0})
            out.append({
                "kind": "comment", "id": cm.get("id"), "text": cm.get("text"), "post_id": cm.get("post_id"),
                "created_at": cm.get("created_at"), "deleted_at": cm.get("deleted_at"),
                "moderation_reason": cm.get("moderation_reason"), "author": public_user(au) if au else None,
            })
    out.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return out[:100]


@api.get("/admin/appeals")
async def admin_appeals(_=Depends(require_admin)):
    out = []
    async for a in db.appeals.find({}, {"_id": 0}).sort("created_at", -1).limit(100):
        u = await db.users.find_one({"id": a.get("user_id")}, {"_id": 0})
        a["user"] = admin_safe_user(u) if u else None
        out.append(a)
    return out


@api.post("/admin/appeals/{appeal_id}/decision")
async def admin_appeal_decision(appeal_id: str, body: AdminAppealDecisionBody, _=Depends(require_admin)):
    appeal = await db.appeals.find_one({"id": appeal_id})
    if not appeal:
        raise HTTPException(404, "Appeal not found")
    decision = body.decision.strip().lower()
    if decision not in {"approved", "rejected"}:
        raise HTTPException(400, "Decision must be approved or rejected")
    note = body.note.strip()
    await db.appeals.update_one({"id": appeal_id}, {"$set": {
        "status": decision, "admin_note": note, "reviewed_at": now_iso()
    }})
    user_id = appeal.get("user_id")
    if decision == "approved" and body.restore_account and user_id:
        await db.users.update_one({"id": user_id}, {"$set": {
            "suspended": False, "suspended_until": None, "suspend_reason": None
        }})
    if user_id:
        await admin_notify(user_id, f"Your Glint appeal was {decision}. {note}".strip())
    await admin_audit(f"{decision}_appeal", "appeal", appeal_id, note, user_id, {"restore_account": body.restore_account})
    return {"ok": True, "status": decision}


@api.get("/admin/controls")
async def admin_get_controls(_=Depends(require_admin)):
    cfg = await db.config.find_one({"id": "app"}, {"_id": 0}) or {}
    return {
        "broadcast": cfg.get("broadcast") or {"message": "", "active": False},
        "force_update": cfg.get("force_update") or {"active": False, "message": "", "min_version": None},
        "maintenance": cfg.get("maintenance") or {"active": False, "message": ""},
        "feature_flags": cfg.get("feature_flags") or {
            "registration_enabled": True,
            "uploads_enabled": True,
            "posts_enabled": True,
            "stories_enabled": True,
            "chat_enabled": True,
            "verification_enabled": True,
        },
    }


@api.post("/admin/controls")
async def admin_set_controls(body: AdminAppControlsBody, _=Depends(require_admin)):
    incoming = body.dict(exclude_unset=True)
    cfg = await db.config.find_one({"id": "app"}, {"_id": 0}) or {}
    flags = dict(cfg.get("feature_flags") or {
        "registration_enabled": True,
        "uploads_enabled": True,
        "posts_enabled": True,
        "stories_enabled": True,
        "chat_enabled": True,
        "verification_enabled": True,
    })
    maintenance = dict(cfg.get("maintenance") or {"active": False, "message": ""})
    if "maintenance_mode" in incoming:
        maintenance["active"] = bool(incoming.pop("maintenance_mode"))
    if "maintenance_message" in incoming:
        maintenance["message"] = incoming.pop("maintenance_message") or ""
    for key in list(incoming.keys()):
        if key in flags:
            flags[key] = bool(incoming[key])
    await db.config.update_one({"id": "app"}, {"$set": {
        "id": "app", "maintenance": maintenance, "feature_flags": flags
    }}, upsert=True)
    await admin_audit("update_app_controls", "config", "app", "App controls updated", None, {"maintenance": maintenance, "feature_flags": flags})
    return {"ok": True, "maintenance": maintenance, "feature_flags": flags}


@api.get("/admin/system")
async def admin_system(_=Depends(require_admin)):
    mongo_ok = False
    try:
        await client.admin.command("ping")
        mongo_ok = True
    except Exception:
        mongo_ok = False
    return {
        "api": True,
        "mongodb": mongo_ok,
        "play_billing_configured": bool(os.getenv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "").strip()),
        "email_configured": _email_provider_configured(),
        "email_provider": "resend" if RESEND_API_KEY else ("smtp" if _email_provider_configured() else "none"),
        "sms_configured": _infobip_sms_configured() or _twilio_verify_configured(),
        "sms_provider": "infobip" if _infobip_sms_configured() else ("twilio_verify" if _twilio_verify_configured() else "none"),
        "users": await db.users.count_documents({"deleted_at": None}),
        "files": await db.files.count_documents({}),
        "open_reports": await db.reports.count_documents({"status": "open"}),
        "open_tickets": await db.tickets.count_documents({"status": "open"}),
        "open_appeals": await db.appeals.count_documents({"status": "open"}),
    }


@api.post("/appeals")
async def submit_appeal(body: AppealCreateBody, me=Depends(get_authenticated_user_allow_suspended)):
    reason = body.reason.strip()
    if len(reason) < 10:
        raise HTTPException(400, "Please explain your appeal in more detail.")
    existing = await db.appeals.find_one({"user_id": me["id"], "status": "open"})
    if existing:
        return {"ok": True, "id": existing["id"], "duplicate": True}
    doc = {
        "id": new_id(), "user_id": me["id"], "category": body.category.strip() or "account",
        "reason": reason, "status": "open", "created_at": now_iso()
    }
    await db.appeals.insert_one(doc)
    return {"ok": True, "id": doc["id"]}


@api.get("/appeals/me")
async def my_appeals(me=Depends(get_authenticated_user_allow_suspended)):
    return [a async for a in db.appeals.find({"user_id": me["id"]}, {"_id": 0}).sort("created_at", -1).limit(20)]


@api.get("/admin/audit")
async def admin_audit_log(_=Depends(require_admin)):
    cur = db.admin_audit.find({}, {"_id": 0}).sort("created_at", -1).limit(150)
    return [row async for row in cur]


@api.post("/admin/broadcast")
async def set_broadcast(body: BroadcastBody, _=Depends(require_admin)):
    await db.config.update_one(
        {"id": "app"},
        {"$set": {"id": "app", "broadcast": {"message": body.message, "active": body.active, "updated_at": now_iso()}}},
        upsert=True,
    )
    return {"ok": True}


@api.post("/admin/force-update")
async def set_force_update(body: ForceUpdateBody, _=Depends(require_admin)):
    await db.config.update_one(
        {"id": "app"},
        {"$set": {"id": "app", "force_update": {
            "active": body.active, "message": body.message, "min_version": body.min_version}}},
        upsert=True,
    )
    return {"ok": True}


@api.get("/")
async def root():
    return {"message": "Glint API"}


PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.glinttechnologies.glint"


def _share_landing_html(title: str, description: str, deep_link: str) -> str:
    safe_title = html.escape(title)
    safe_description = html.escape(description)
    safe_deep_link = html.escape(deep_link, quote=True)
    safe_play_url = html.escape(PLAY_STORE_URL, quote=True)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="theme-color" content="#67C587" />
  <meta property="og:site_name" content="Glint" />
  <meta property="og:title" content="{safe_title}" />
  <meta property="og:description" content="{safe_description}" />
  <meta name="twitter:card" content="summary" />
  <title>{safe_title}</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
      background: #f6fbf8; color: #14211a; padding: 24px;
    }}
    .card {{
      width: min(440px,100%); background: white; border: 1px solid #dce9e1;
      border-radius: 24px; padding: 28px; box-shadow: 0 18px 45px rgba(30,70,48,.10);
      text-align: center;
    }}
    .logo {{
      width: 72px; height: 72px; border-radius: 22px; margin: 0 auto 18px;
      display: grid; place-items: center; background: #67C587; color: white;
      font-size: 32px; font-weight: 800;
    }}
    h1 {{ font-size: 24px; margin: 0 0 10px; }}
    p {{ color: #607168; line-height: 1.55; margin: 0 0 24px; }}
    a.btn {{
      display: block; text-decoration: none; border-radius: 999px; padding: 14px 18px;
      font-weight: 700; margin-top: 10px;
    }}
    .primary {{ background: #49ad70; color: white; }}
    .secondary {{ background: #eef7f1; color: #24653c; border: 1px solid #d2eadb; }}
    small {{ display: block; color: #8a9890; margin-top: 18px; line-height: 1.4; }}
  </style>
</head>
<body>
  <main class="card">
    <div class="logo">G</div>
    <h1>{safe_title}</h1>
    <p>{safe_description}</p>
    <a class="btn primary" href="{safe_deep_link}">Open in Glint</a>
    <a class="btn secondary" href="{safe_play_url}">Get Glint on Google Play</a>
    <small>If Glint is installed, this link opens the exact shared content. Access to private posts and stories still follows the account's privacy settings.</small>
  </main>
  <script>
    (function() {{
      var deep = {json.dumps(deep_link)};
      // Try to hand off to the installed app. Browsers that block automatic
      // custom-scheme navigation still provide the Open in Glint button above.
      setTimeout(function() {{
        try {{ window.location.href = deep; }} catch (e) {{}}
      }}, 120);
    }})();
  </script>
</body>
</html>"""


@app.get("/share/profile/{username}", response_class=HTMLResponse)
async def share_profile_page(username: str):
    account=await db.users.find_one({'username':username.lower(),'deleted_at':None})
    if not account or account.get('suspended') or account.get('deactivated'):
        return HTMLResponse('<!doctype html><html><body><h1>Account not found</h1><p>This profile is unavailable.</p></body></html>',status_code=404)
    encoded = urllib.parse.quote(username, safe="")
    return HTMLResponse(_share_landing_html(
        "Open this Glint profile",
        f"View @{username} on Glint.",
        f"glint://share/profile/{encoded}",
    ))


@app.get("/share/post/{post_id}", response_class=HTMLResponse)
async def share_post_page(post_id: str):
    encoded = urllib.parse.quote(post_id, safe="")
    return HTMLResponse(_share_landing_html(
        "Open this Glint post",
        "View the shared post in Glint.",
        f"glint://share/post/{encoded}",
    ))


@app.get("/share/story/{user_id}", response_class=HTMLResponse)
async def share_story_page(user_id: str, storyId: Optional[str] = Query(default=None)):
    encoded_user = urllib.parse.quote(user_id, safe="")
    story_q = urllib.parse.quote(storyId or "", safe="")
    suffix = f"?storyId={story_q}" if story_q else ""
    return HTMLResponse(_share_landing_html(
        "Open this Glint story",
        "View the shared story in Glint. Stories may expire after 24 hours.",
        f"glint://share/story/{encoded_user}{suffix}",
    ))


@app.get("/share/app", response_class=HTMLResponse)
async def share_app_page():
    return HTMLResponse(_share_landing_html(
        "Open Glint",
        "Connect, share moments, message friends and discover your community.",
        "glint://share/app",
    ))


@app.get("/privacy-policy", response_class=HTMLResponse)
async def privacy_policy():
    return HTMLResponse("""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Glint Privacy Policy</title>
  <style>
    body{font-family:Arial,sans-serif;background:#f7faf8;color:#142018;margin:0}
    main{max-width:850px;margin:0 auto;padding:32px 20px 56px}
    .card{background:#fff;border:1px solid #e4ece7;border-radius:18px;padding:28px;box-shadow:0 8px 30px rgba(0,0,0,.04)}
    h1{margin:0 0 8px;color:#168a4a} h2{margin-top:28px;color:#163c28}
    p,li{line-height:1.65} .muted{color:#68756c;font-size:14px}
    a{color:#168a4a}
  </style>
</head>
<body><main><div class="card">
  <h1>Glint Privacy Policy</h1>
  <p class="muted">Effective date: September 26, 2026</p>
  <p>Glint is a social communication service operated by Glint Technologies. This Privacy Policy explains what information Glint may collect, why it is used, how it may be shared, and the choices available to users.</p>

  <h2>1. Information we collect</h2>
  <p>Depending on how you use Glint, we may collect:</p>
  <ul>
    <li>Account information such as name, username, email address or phone number, password credentials in protected form, and account status.</li>
    <li>Profile information you choose to provide, such as profile photo, cover photo, bio, date of birth, and other profile details.</li>
    <li>Content and activity such as photo posts, stories, comments, likes, saves, friend requests, friendships, messages, reports, and moderation interactions.</li>
    <li>Verification information when you apply for verification, which includes government-issued identification and a live selfie video.</li>
    <li>Service and security records needed to operate, troubleshoot, protect, and prevent abuse of Glint.</li>
  </ul>

  <h2>2. How we use information</h2>
  <ul>
    <li>To create and secure accounts and provide login and one-time-code verification.</li>
    <li>To provide profiles, posts, stories, messaging, friend features, notifications, and other Glint functionality.</li>
    <li>To review verification requests, reports, impersonation claims, copyright complaints, and other safety issues.</li>
    <li>To provide support, maintain the service, detect abuse, enforce Glint rules, and improve reliability.</li>
  </ul>

  <h2>3. Privacy controls</h2>
  <p>Glint provides privacy controls for profile and contact information. Depending on the available setting, users can limit visibility to the public, friends, or only themselves. Email addresses and phone numbers are not displayed beyond the visibility selected by the user.</p>

  <h2>4. How information may be shared</h2>
  <p>Information may be shared with other Glint users when you choose to make it visible or interact with them. Glint also uses service providers for infrastructure, database hosting, email delivery, SMS verification, and related technical services. These providers process information only as needed to provide those services. Glint does not sell personal information.</p>

  <h2>5. Account deletion and retention</h2>
  <p>You can request account deletion from within Glint. Deletion disables the account and removes or hides associated profile content from the active service. Some limited records may be retained where necessary for security, fraud prevention, dispute resolution, legal obligations, or enforcement of Glint rules.</p>

  <h2>6. Security</h2>
  <p>Glint uses reasonable technical and organizational safeguards designed to protect user information. No online service can guarantee absolute security.</p>

  <h2>7. Children</h2>
  <p>Glint is intended for adults aged 18 and over. Users under 18 are not permitted to create or use a Glint account.</p>

  <h2>8. Changes to this policy</h2>
  <p>We may update this Privacy Policy as Glint changes. The effective date at the top of this page will be updated when material changes are made.</p>

  <h2>9. Contact</h2>
  <p>For privacy questions or requests, use the Help Center inside Glint. If you cannot access your account, use the support contact shown on Glint's Google Play listing.</p>
</div></main></body></html>""")


def _delete_account_html(message: str = "", success: bool = False) -> str:
    status = ""
    if message:
        cls = "success" if success else "error"
        status = f'<div class="{cls}">{message}</div>'
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Delete Your Glint Account</title>
  <style>
    *{{box-sizing:border-box}}
    body{{font-family:Arial,sans-serif;background:#f7faf8;color:#142018;margin:0}}
    main{{max-width:780px;margin:0 auto;padding:28px 16px 56px}}
    .card{{background:#fff;border:1px solid #e4ece7;border-radius:18px;padding:26px;box-shadow:0 8px 30px rgba(0,0,0,.04)}}
    h1{{margin:0 0 8px;color:#168a4a}} h2{{margin-top:28px;color:#163c28}}
    p,li{{line-height:1.65}} .muted{{color:#68756c;font-size:14px}}
    label{{display:block;font-weight:700;margin:15px 0 6px}}
    input,textarea{{width:100%;padding:12px;border:1px solid #cfd9d2;border-radius:10px;font:inherit}}
    textarea{{min-height:90px;resize:vertical}}
    button{{margin-top:18px;background:#168a4a;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-weight:700;font-size:16px;cursor:pointer}}
    .notice{{background:#f1f7f3;border-radius:12px;padding:14px;margin:18px 0}}
    .success{{background:#eaf8ef;color:#155c31;border:1px solid #bfe4cb;border-radius:10px;padding:12px;margin:16px 0}}
    .error{{background:#fff1f1;color:#8a1f1f;border:1px solid #efc2c2;border-radius:10px;padding:12px;margin:16px 0}}
    a{{color:#168a4a}}
  </style>
</head>
<body><main><div class="card">
  <h1>Delete Your Glint Account</h1>
  <p class="muted">Glint Technologies · Account and data deletion</p>

  <p>You can delete your Glint account directly in the app. Open <strong>Glint → Settings → Account → Delete account</strong> and follow the confirmation steps.</p>

  <div class="notice">
    <strong>Can't access the app?</strong> Submit the request below. We may contact you to verify that you own the account before processing the deletion.
  </div>

  {status}

  <form method="post" action="/delete-account">
    <label for="contact">Email address or phone number used on Glint</label>
    <input id="contact" name="contact" type="text" maxlength="160" required autocomplete="email">

    <label for="username">Glint username (optional)</label>
    <input id="username" name="username" type="text" maxlength="80">

    <label for="reason">Reason or additional information (optional)</label>
    <textarea id="reason" name="reason" maxlength="500"></textarea>

    <button type="submit">Request account deletion</button>
  </form>

  <h2>What is deleted</h2>
  <p>After a verified deletion request is processed, your Glint account is disabled and your active profile, posts, and stories are removed from the service. Other account-linked content is removed or restricted where technically and legally appropriate.</p>

  <h2>Data we may retain</h2>
  <p>Limited records may be retained when necessary for security, fraud prevention, dispute resolution, enforcement of Glint rules, or legal obligations. Information retained for these purposes is kept only for as long as reasonably necessary.</p>

  <h2>Need help?</h2>
  <p>If you can still sign in, the in-app deletion option is the fastest method. You can also use Glint's Help Center for account support.</p>
</div></main></body></html>"""


@app.get("/delete-account", response_class=HTMLResponse)
async def delete_account_page():
    return HTMLResponse(_delete_account_html())


@app.post("/delete-account", response_class=HTMLResponse)
async def request_account_deletion(
    contact: str = Form(...),
    username: str = Form(""),
    reason: str = Form(""),
):
    contact = (contact or "").strip()
    username = (username or "").strip()
    reason = (reason or "").strip()

    if not contact or len(contact) > 160 or len(username) > 80 or len(reason) > 500:
        return HTMLResponse(
            _delete_account_html("Please check the information you entered and try again.", False),
            status_code=400,
        )

    request_id = new_id()
    await db.account_deletion_requests.insert_one({
        "id": request_id,
        "contact": contact,
        "username": username or None,
        "reason": reason or None,
        "status": "pending",
        "created_at": now_iso(),
    })

    note = (
        f"Glint account deletion request\n"
        f"Request ID: {request_id}\n"
        f"Contact: {contact}\n"
        f"Username: {username or 'Not provided'}\n"
        f"Reason: {reason or 'Not provided'}"
    )
    await send_moderation_email(ADMIN_EMAIL, "Glint account deletion request", note)

    return HTMLResponse(
        _delete_account_html(
            "Your deletion request has been received. Keep your account contact available in case ownership verification is required.",
            True,
        )
    )


def _delete_data_html(message: str = "", success: bool = False) -> str:
    status = ""
    if message:
        cls = "success" if success else "error"
        status = f'<div class="{cls}">{message}</div>'
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Request Deletion of Glint Data</title>
  <style>
    *{{box-sizing:border-box}}
    body{{font-family:Arial,sans-serif;background:#f7faf8;color:#142018;margin:0}}
    main{{max-width:780px;margin:0 auto;padding:28px 16px 56px}}
    .card{{background:#fff;border:1px solid #e4ece7;border-radius:18px;padding:26px;box-shadow:0 8px 30px rgba(0,0,0,.04)}}
    h1{{margin:0 0 8px;color:#168a4a}} h2{{margin-top:28px;color:#163c28}}
    p,li{{line-height:1.65}} .muted{{color:#68756c;font-size:14px}}
    label{{display:block;font-weight:700;margin:15px 0 6px}}
    input,textarea,select{{width:100%;padding:12px;border:1px solid #cfd9d2;border-radius:10px;font:inherit}}
    textarea{{min-height:90px;resize:vertical}}
    button{{margin-top:18px;background:#168a4a;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-weight:700;font-size:16px;cursor:pointer}}
    .notice{{background:#f1f7f3;border-radius:12px;padding:14px;margin:18px 0}}
    .success{{background:#eaf8ef;color:#155c31;border:1px solid #bfe4cb;border-radius:10px;padding:12px;margin:16px 0}}
    .error{{background:#fff1f1;color:#8a1f1f;border:1px solid #efc2c2;border-radius:10px;padding:12px;margin:16px 0}}
  </style>
</head>
<body><main><div class="card">
  <h1>Request Deletion of Glint Data</h1>
  <p class="muted">Glint Technologies · Delete specific data without deleting your account</p>

  <p>Glint users can delete certain content, such as their own posts, comments, and stories, directly inside the app. If you cannot access the relevant control, or want to request deletion of other account-linked data while keeping your Glint account active, use the form below.</p>

  <div class="notice">
    This form is for deleting specific data while keeping your Glint account. To delete your entire account, use the Glint account deletion page instead.
  </div>

  {status}

  <form method="post" action="/delete-data">
    <label for="contact">Email address or phone number used on Glint</label>
    <input id="contact" name="contact" type="text" maxlength="160" required>

    <label for="username">Glint username (optional)</label>
    <input id="username" name="username" type="text" maxlength="80">

    <label for="data_type">What data do you want deleted?</label>
    <select id="data_type" name="data_type" required>
      <option value="">Select one</option>
      <option value="posts">Posts</option>
      <option value="comments">Comments</option>
      <option value="stories">Stories</option>
      <option value="profile">Profile information</option>
      <option value="other">Other account data</option>
    </select>

    <label for="details">Details to identify the data (optional)</label>
    <textarea id="details" name="details" maxlength="700" placeholder="For example: post date, description, or other identifying details"></textarea>

    <button type="submit">Request data deletion</button>
  </form>

  <h2>What happens next</h2>
  <p>We may ask you to verify account ownership before processing the request. Deleting specific data through this page does not require deleting your Glint account.</p>

  <h2>Data we may retain</h2>
  <p>Limited records may be retained when necessary for security, fraud prevention, dispute resolution, enforcement of Glint rules, or legal obligations. Information retained for these purposes is kept only for as long as reasonably necessary.</p>
</div></main></body></html>"""


@app.get("/delete-data", response_class=HTMLResponse)
async def delete_data_page():
    return HTMLResponse(_delete_data_html())


@app.post("/delete-data", response_class=HTMLResponse)
async def request_data_deletion(
    contact: str = Form(...),
    username: str = Form(""),
    data_type: str = Form(...),
    details: str = Form(""),
):
    contact = (contact or "").strip()
    username = (username or "").strip()
    data_type = (data_type or "").strip()
    details = (details or "").strip()

    allowed_types = {"posts", "comments", "stories", "profile", "other"}
    if (
        not contact
        or data_type not in allowed_types
        or len(contact) > 160
        or len(username) > 80
        or len(details) > 700
    ):
        return HTMLResponse(
            _delete_data_html("Please check the information you entered and try again.", False),
            status_code=400,
        )

    request_id = new_id()
    await db.data_deletion_requests.insert_one({
        "id": request_id,
        "contact": contact,
        "username": username or None,
        "data_type": data_type,
        "details": details or None,
        "status": "pending",
        "created_at": now_iso(),
    })

    note = (
        f"Glint data deletion request\n"
        f"Request ID: {request_id}\n"
        f"Contact: {contact}\n"
        f"Username: {username or 'Not provided'}\n"
        f"Data type: {data_type}\n"
        f"Details: {details or 'Not provided'}"
    )
    await send_moderation_email(ADMIN_EMAIL, "Glint data deletion request", note)

    return HTMLResponse(
        _delete_data_html(
            "Your data deletion request has been received. Keep your account contact available in case ownership verification is required.",
            True,
        )
    )


from group_routes import install_group_management_routes
install_group_management_routes(api, db, get_current_user, now_iso)
chat_action_routes = install_chat_actions(api, lambda: db, get_current_user, now_iso, send_message, MessageCreate)
# Settings are enforced by server routes, rather than display-only switches.
DETAIL_KEYS = {
    "current_city",
    "hometown",
    "birthday",
    "gender",
    "relationship",
    "family",
    "languages",
    "work",
    "school",
    "university",
    "hobbies",
    "music",
    "tv_shows",
    "films",
    "games",
    "sports",
    "places",
}
AUDIENCES = {"public", "friends", "only_me"}
SETTINGS_DEFAULTS = {
    "followers_visibility": "public",
    "following_visibility": "public",
    "posts_audience": "public",
    "stories_audience": "friends",
    "comments": "public",
    "messages": "public",
    "tags": "public",
    "active_status": True,
    "read_receipts": True,
    "login_alerts": True,
    "data_saver": False,
    "autoplay": False,
    "font_scale": 1.0,
    "language": "en",
    "notifications": {},
    "hidden_story_users": [],
    "muted_users": [],
}


async def require_audience(owner, audience, viewer):
    if (
        not owner
        or owner.get("deleted_at")
        or owner.get("suspended")
        or owner.get("deactivated")
    ):
        raise HTTPException(404, "Account not found")
    if owner["id"] == viewer:
        return
    if viewer in owner.get("blocked", []):
        raise HTTPException(404, "Account not found")
    if audience == "only_me" or (
        audience == "friends" and not await are_friends(owner["id"], viewer)
    ):
        raise HTTPException(403, "This content is private")
    if audience == "inner" and viewer not in owner.get("inner_circle", []):
        raise HTTPException(403, "This content is private")


async def require_message_access(sender, recipient):
    if recipient["id"] in sender.get("chat_blocked", []) or sender["id"] in recipient.get("chat_blocked", []):
        raise HTTPException(403, "Messaging is blocked in this chat")
    if sender["id"] == recipient["id"]:
        raise HTTPException(400, "Choose another user")
    if recipient["id"] in sender.get("blocked", []):
        raise HTTPException(403, "Unblock this user to send a message")
    await require_audience(
        recipient, recipient.get("settings", {}).get("messages", "public"), sender["id"]
    )


def visible_details(user, viewer, friend=False):
    return {
        k: v
        for k, v in user.get("profile_details", {}).items()
        if isinstance(v, dict)
        and (
            viewer == user["id"]
            or v.get("visibility", "only_me") == "public"
            or (friend and v.get("visibility") == "friends")
        )
    }


class SettingsBody(BaseModel):
    values: dict


@api.get("/account/settings")
async def account_settings(me=Depends(get_current_user)):
    return {
        **SETTINGS_DEFAULTS,
        **me.get("settings", {}),
        "two_factor_enabled": bool(me.get("two_factor_secret")),
    }


@api.put("/account/settings")
async def save_settings(body: SettingsBody, me=Depends(get_current_user)):
    values = body.values
    for key, value in values.items():
        if key not in SETTINGS_DEFAULTS:
            raise HTTPException(400, "Unknown setting")
        if key in {
            "followers_visibility",
            "following_visibility",
            "posts_audience",
            "stories_audience",
            "comments",
            "messages",
            "tags",
        } and (not isinstance(value, str) or value not in AUDIENCES):
            raise HTTPException(400, "Invalid audience")
        if isinstance(SETTINGS_DEFAULTS[key], bool) and not isinstance(value, bool):
            raise HTTPException(400, "Invalid switch")
        if key == "notifications" and (
            not isinstance(value, dict)
            or any(
                k
                not in {
                    "reaction",
                    "comment",
                    "follow",
                    "friend_request",
                    "friend_accept",
                    "message",
                    "spark",
                    "profile",
                }
                or v not in {"everyone", "friends", "off"}
                for k, v in value.items()
            )
        ):
            raise HTTPException(400, "Invalid notification preferences")
        if key in {"hidden_story_users", "muted_users"} and (
            not isinstance(value, list)
            or len(value) > 500
            or any(not isinstance(v, str) for v in value)
        ):
            raise HTTPException(400, "Invalid user list")
        if key == "language" and value not in {"en", "ur", "ar"}:
            raise HTTPException(400, "Invalid language")
        if key == "font_scale" and value not in [1.0, 1.15, 1.3]:
            raise HTTPException(400, "Invalid text size")
    await db.users.update_one(
        {"id": me["id"]}, {"$set": {"settings." + k: v for k, v in values.items()}}
    )
    return {"ok": True}


class DetailsBody(BaseModel):
    details: dict
    avatar_character: Optional[str] = None


@api.get("/account/details")
async def own_details(me=Depends(get_current_user)):
    return {
        "details": me.get("profile_details", {}),
        "avatar_character": me.get("avatar_character"),
    }


@api.put("/account/details")
async def save_details(body: DetailsBody, me=Depends(get_current_user)):
    if any(k not in DETAIL_KEYS for k in body.details):
        raise HTTPException(400, "Unknown profile detail")
    for v in body.details.values():
        if (
            not isinstance(v, dict)
            or set(v) - {"value", "visibility"}
            or v.get("visibility") not in AUDIENCES
            or not isinstance(v.get("value"), str)
            or len(v["value"]) > 500
        ):
            raise HTTPException(400, "Invalid profile detail")
    if body.avatar_character is not None and body.avatar_character not in [
        "🙂",
        "😎",
        "👩",
        "👨",
        "🧕",
        "🧑",
        "🐱",
        "🦊",
        "🐼",
        "🦁",
        "🤖",
        "🌸",
    ]:
        raise HTTPException(400, "Choose an available avatar")
    birthday = body.details.get("birthday", {}).get("value")
    if birthday:
        try:
            birthday_date = datetime.strptime(birthday, "%Y-%m-%d").date()
            if birthday_date > now_dt().date():
                raise ValueError()
        except ValueError:
            raise HTTPException(400, "Use a valid birthday in YYYY-MM-DD format")
    await db.users.update_one(
        {"id": me["id"]},
        {
            "$set": {
                "profile_details": body.details,
                "avatar_character": body.avatar_character,
            }
        },
    )
    return {"ok": True}


class UsernameBody(BaseModel):
    username: str


@api.put("/account/username")
async def change_username(body: UsernameBody, me=Depends(get_current_user)):
    name = body.username.strip().lower()
    if not re.fullmatch(r"[a-z0-9_]{3,30}", name):
        raise HTTPException(400, "Use 3–30 letters, numbers or underscores")
    if await db.users.find_one({"username": name, "id": {"$ne": me["id"]}}):
        raise HTTPException(409, "This username is taken")
    try:
        await db.users.create_index("username", unique=True)
        await db.users.update_one({"id": me["id"]}, {"$set": {"username": name}})
    except Exception:
        raise HTTPException(409, "This username could not be reserved")
    return {"ok": True}


class SecurityBody(BaseModel):
    password: str
    new_password: Optional[str] = None
    code: Optional[str] = None


@api.post("/account/password")
async def change_password(body: SecurityBody, me=Depends(get_current_user)):
    if not verify_pw(body.password, me["password"]):
        raise HTTPException(403, "Current password is incorrect")
    if not body.new_password or not 8 <= len(body.new_password) <= 128:
        raise HTTPException(400, "Use a password of 8–128 characters")
    if me.get("two_factor_secret") and not await check_second_factor(
        me, body.code or ""
    ):
        raise HTTPException(403, "Authenticator or recovery code required")
    await db.users.update_one(
        {"id": me["id"]}, {"$set": {"password": hash_pw(body.new_password)}}
    )
    await db.sessions.update_many({"user_id": me["id"]}, {"$set": {"revoked": True}})
    await db.users.update_one(
        {"id": me["id"]}, {"$set": {"force_logout_at": now_iso()}}
    )
    return {"ok": True, "message": "Password changed. Sign in again."}


def totp_counter(secret, code):
    import struct, time

    if not re.fullmatch(r"\d{6}", code):
        return None
    key = base64.b32decode(secret)
    for delta in [-1, 0, 1]:
        counter = int(time.time() // 30) + delta
        digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
        offset = digest[-1] & 15
        value = (
            struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
        ) % 1000000
        if hmac.compare_digest(f"{value:06d}", code):
            return counter
    return None


async def check_second_factor(user, code):
    counter = totp_counter(user["two_factor_secret"], code)
    if counter is not None:
        result = await db.users.update_one(
            {
                "id": user["id"],
                "$or": [
                    {"two_factor_counter": {"$lt": counter}},
                    {"two_factor_counter": {"$exists": False}},
                ],
            },
            {"$set": {"two_factor_counter": counter}},
        )
        return bool(result.matched_count)
    digest = hashlib.sha256(code.strip().encode()).hexdigest()
    result = await db.users.update_one(
        {"id": user["id"], "recovery_codes": digest},
        {"$pull": {"recovery_codes": digest}},
    )
    return bool(result.matched_count)


@api.post("/account/2fa/setup")
async def setup_2fa(body: SecurityBody, me=Depends(get_current_user)):
    if not verify_pw(body.password, me["password"]):
        raise HTTPException(403, "Current password is incorrect")
    if me.get("two_factor_secret"):
        raise HTTPException(409, "Two-step verification is already enabled")
    secret = base64.b32encode(secrets.token_bytes(20)).decode()
    await db.users.update_one(
        {"id": me["id"]},
        {"$set": {"two_factor_pending": secret, "two_factor_pending_at": now_iso()}},
    )
    return {
        "secret": secret,
        "uri": f'otpauth://totp/Glint:{urllib.parse.quote(me["username"])}?secret={secret}&issuer=Glint',
    }


@api.post("/account/2fa/enable")
async def enable_2fa(body: SecurityBody, me=Depends(get_current_user)):
    pending = me.get("two_factor_pending")
    created = parse_iso_datetime(me.get("two_factor_pending_at"))
    if (
        not verify_pw(body.password, me["password"])
        or not pending
        or not created
        or now_dt() - created > timedelta(minutes=10)
    ):
        raise HTTPException(403, "Start setup again")
    counter = totp_counter(pending, body.code or "")
    if counter is None:
        raise HTTPException(400, "Invalid authenticator code")
    codes = [secrets.token_hex(5) for _ in range(8)]
    result = await db.users.update_one(
        {
            "id": me["id"],
            "two_factor_pending": pending,
            "two_factor_secret": {"$exists": False},
        },
        {
            "$set": {
                "two_factor_secret": pending,
                "two_factor_counter": counter,
                "recovery_codes": [
                    hashlib.sha256(c.encode()).hexdigest() for c in codes
                ],
            },
            "$unset": {"two_factor_pending": "", "two_factor_pending_at": ""},
        },
    )
    if not result.matched_count:
        raise HTTPException(409, "Setup changed. Start again.")
    return {"ok": True, "recovery_codes": codes}


@api.post("/account/2fa/disable")
async def disable_2fa(body: SecurityBody, me=Depends(get_current_user)):
    if (
        not verify_pw(body.password, me["password"])
        or not me.get("two_factor_secret")
        or not await check_second_factor(me, body.code or "")
    ):
        raise HTTPException(403, "Password and valid second-factor code required")
    await db.users.update_one(
        {"id": me["id"]},
        {
            "$unset": {
                "two_factor_secret": "",
                "two_factor_counter": "",
                "recovery_codes": "",
            }
        },
    )
    return {"ok": True}


@api.get("/account/sessions")
async def account_sessions(
    authorization: Optional[str] = Header(None), me=Depends(get_current_user)
):
    payload = decode_token(authorization.split(" ", 1)[1])
    return [
        {
            **{k: v for k, v in row.items() if k != "_id"},
            "current": row["id"] == payload.get("sid"),
        }
        async for row in db.sessions.find({"user_id": me["id"], "revoked": False}).sort(
            "created_at", -1
        )
    ]


@api.post("/account/sessions/{session_id}/revoke")
async def revoke_session(session_id: str, me=Depends(get_current_user)):
    await db.sessions.update_one(
        {"id": session_id, "user_id": me["id"]}, {"$set": {"revoked": True}}
    )
    return {"ok": True}


@api.post("/account/sessions/logout-others")
async def logout_other_sessions(
    authorization: Optional[str] = Header(None), me=Depends(get_current_user)
):
    payload = decode_token(authorization.split(" ", 1)[1])
    sid = payload.get("sid")
    if not sid:
        sid = new_id()
        await db.sessions.insert_one(
            {"id": sid, "user_id": me["id"], "created_at": now_iso(), "revoked": False}
        )
    await db.sessions.update_many(
        {"user_id": me["id"], "id": {"$ne": sid}}, {"$set": {"revoked": True}}
    )
    await db.users.update_one(
        {"id": me["id"]}, {"$set": {"legacy_sessions_revoked": True}}
    )
    payload["sid"] = sid
    return {"ok": True, "token": jwt.encode(payload, JWT_SECRET, algorithm="HS256")}


@api.post("/account/deactivate")
async def deactivate_account(body: SecurityBody, me=Depends(get_current_user)):
    if not verify_pw(body.password, me["password"]):
        raise HTTPException(403, "Current password is incorrect")
    await db.users.update_one({"id": me["id"]}, {"$set": {"deactivated": True}})
    return {"ok": True}


@api.get("/account/export")
async def export_account(me=Depends(get_current_user)):
    keys = [
        "id",
        "full_name",
        "username",
        "email",
        "phone",
        "bio",
        "created_at",
        "profile_details",
        "settings",
    ]
    result = {"account": {k: me.get(k) for k in keys}}
    for collection, query in [
        ("posts", {"author_id": me["id"]}),
        ("stories", {"author_id": me["id"]}),
        ("messages", {"from_user": me["id"]}),
        ("tickets", {"user_id": me["id"]}),
    ]:
        result[collection] = [
            v async for v in db[collection].find(query, {"_id": 0}).limit(5000)
        ]
    return result


@api.get("/account/activity")
async def account_activity(me=Depends(get_current_user)):
    return [
        v
        async for v in db.login_events.find({"user_id": me["id"]}, {"_id": 0})
        .sort("created_at", -1)
        .limit(100)
    ]


@api.get("/account/restriction")
async def restriction_status(me=Depends(get_authenticated_user_allow_suspended)):
    return {
        "suspended": bool(me.get("suspended")),
        "reason": me.get("suspend_reason"),
        "appeals": await my_appeals(me),
    }


class ArchiveBody(BaseModel):
    archived: bool


@api.put("/account/posts/{post_id}/archive")
async def archive_post(post_id: str, body: ArchiveBody, me=Depends(get_current_user)):
    result = await db.posts.update_one(
        {"id": post_id, "author_id": me["id"], "deleted_at": None},
        {"$set": {"archived": body.archived}},
    )
    if not result.matched_count:
        raise HTTPException(404, "Post not found")
    return {"ok": True}


@api.get("/account/archive")
async def archived_posts(me=Depends(get_current_user)):
    return [
        await serialize_post(p, me["id"])
        async for p in db.posts.find(
            {"author_id": me["id"], "archived": True, "deleted_at": None}
        )
        .sort("created_at", -1)
        .limit(200)
    ]

@api.get('/account/privacy-people')
async def privacy_people(kind:str=Query(...),me=Depends(get_current_user)):
    if kind not in {'hidden_story_users','muted_users'}: raise HTTPException(400,'Invalid people list')
    ids=me.get('settings',{}).get(kind,[])
    people={u['id']:u async for u in db.users.find({'id':{'$in':ids},'deleted_at':None,'suspended':{'$ne':True},'deactivated':{'$ne':True}},{'_id':0,'id':1,'full_name':1,'username':1})}
    return [{'id':uid,'name':people.get(uid,{}).get('full_name'),'username':people.get(uid,{}).get('username')} for uid in ids]

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    try:
        await db.users.create_index("username")
        await db.users.create_index("email")
        logger.info("MongoDB connection ready")

        if ACCOUNT_MIGRATION_USERNAME and ACCOUNT_MIGRATION_EMAIL:
            target = await db.users.find_one({
                "username": ACCOUNT_MIGRATION_USERNAME,
                "deleted_at": None,
            })
            if not target:
                logger.error("Account contact migration skipped: target username not found")
            elif ACCOUNT_MIGRATION_ID in target.get("contact_migrations", []):
                logger.info("Account contact migration already applied")
            else:
                conflict = await db.users.find_one({
                    "email": ACCOUNT_MIGRATION_EMAIL,
                    "verified": True,
                    "deleted_at": None,
                    "id": {"$ne": target["id"]},
                })
                if conflict:
                    logger.error("Account contact migration skipped: email already belongs to another verified account")
                else:
                    await db.users.delete_many({
                        "email": ACCOUNT_MIGRATION_EMAIL,
                        "verified": False,
                        "id": {"$ne": target["id"]},
                    })
                    await db.users.update_one(
                        {"id": target["id"]},
                        {
                            "$set": {
                                "email": ACCOUNT_MIGRATION_EMAIL,
                                "verified": True,
                            },
                            "$addToSet": {"contact_migrations": ACCOUNT_MIGRATION_ID},
                        },
                    )
                    logger.info("Account contact migration applied")
    except Exception as e:
        logger.error(f"MongoDB startup check failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
