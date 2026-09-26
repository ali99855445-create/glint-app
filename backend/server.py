import os
import uuid
import random
import logging
import smtplib
import ssl
import json
import urllib.request
import urllib.error
import urllib.parse
import base64
from email.message import EmailMessage
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Header, Query
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
import jwt
import bcrypt

import storage_helper

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ.get("MONGO_URL", "mongodb://127.0.0.1:27017")
client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
db = client[os.environ.get("DB_NAME", "glint")]

JWT_SECRET = os.environ.get("JWT_SECRET") or uuid.uuid4().hex
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@glinttest.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ADMIN_CREDS = [
    (ADMIN_EMAIL, ADMIN_PASSWORD),
    (os.environ.get('ADMIN_EMAIL_2', ''), os.environ.get('ADMIN_PASSWORD_2', '')),
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
    until = user.get("suspended_until")
    if until:
        try:
            until_dt = datetime.fromisoformat(str(until).replace("Z", "+00:00"))
            if until_dt.tzinfo is None:
                until_dt = until_dt.replace(tzinfo=timezone.utc)
            if until_dt <= datetime.now(timezone.utc):
                await db.users.update_one(
                    {"id": user["id"]},
                    {"$set": {"suspended": False, "suspended_until": None, "suspend_reason": None}},
                )
                user["suspended"] = False
                user["suspended_until"] = None
                user["suspend_reason"] = None
                return None
        except Exception:
            pass
    return {
        "reason": user.get("suspend_reason") or "Violation of Glint rules",
        "until": until,
    }


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
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])


async def get_current_user(authorization: Optional[str] = Header(None)):
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
    if user.get("deleted_at"):
        reason = user.get("deleted_reason") or "This account has been removed by Glint."
        raise HTTPException(403, f"Account removed. Reason: {reason}")
    suspension = await active_suspension(user)
    if suspension:
        until_text = f" Until: {suspension['until']}." if suspension.get("until") else ""
        raise HTTPException(403, f"Account suspended. Reason: {suspension['reason']}.{until_text}")
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
        "location": u.get("location"),
        "verified": u.get("golden_tick", False),
        "privacy": u.get("privacy", "public"),
        "created_at": u.get("created_at"),
    }


async def are_friends(a: str, b: str) -> bool:
    f = await db.friendships.find_one({"users": {"$all": [a, b]}})
    return f is not None


async def notify(to_user: str, from_user: str, ntype: str, ref_id: Optional[str], text: str):
    if to_user == from_user:
        return
    await db.notifications.insert_one({
        "id": new_id(), "to_user": to_user, "from_user": from_user,
        "type": ntype, "ref_id": ref_id, "text": text,
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
    aud = post.get("audience", "public")
    if author["id"] == viewer_id:
        return True
    if aud == "inner":
        return viewer_id in author.get("inner_circle", [])
    if aud == "friends" or author.get("privacy") == "friends":
        return post["author_id"] in friend_ids
    return True


async def enrich_author(user_id: str) -> dict:
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    return public_user(u)


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


class PostCreate(BaseModel):
    type: str = "text"  # text | photo | poll
    text: Optional[str] = ""
    image: Optional[str] = None
    poll_options: Optional[List[str]] = None
    audience: str = "public"  # public | friends | inner


class StoryCreate(BaseModel):
    type: str  # photo | text | voice
    image: Optional[str] = None
    text: Optional[str] = None
    bg_color: Optional[str] = None
    media: Optional[str] = None
    duration: Optional[float] = None
    audience: str = "friends"  # friends | inner


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


class GroupCreate(BaseModel):
    name: str
    member_ids: List[str]
    avatar: Optional[str] = None


class VerificationSubmit(BaseModel):
    document: str
    selfie: str
    full_legal_name: str
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
        "email_configured": email_ok,
        "email_provider": "resend" if RESEND_API_KEY else ("smtp" if email_ok else "none"),
        "sms_configured": _infobip_sms_configured() or _twilio_verify_configured(),
        "sms_provider": "infobip" if _infobip_sms_configured() else ("twilio_verify" if _twilio_verify_configured() else "none"),
    }



# ----------------------------- auth -----------------------------
@api.post("/auth/register-init")
async def register_init(body: RegisterInit):
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
    token = make_token(body.user_id)
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
    u = await db.users.find_one({
        "$or": [{"email": contact}, {"phone": contact}, {"username": contact}],
    })
    if not u or not verify_pw(body.password, u["password"]):
        raise HTTPException(400, "Invalid credentials")
    if u.get("deleted_at"):
        reason = u.get("deleted_reason") or "This account has been removed by Glint."
        raise HTTPException(403, f"Account removed. Reason: {reason}")
    if not u.get("verified"):
        raise HTTPException(403, "Please verify your account first")
    suspension = await active_suspension(u)
    if suspension:
        until_text = f" Until: {suspension['until']}." if suspension.get("until") else ""
        raise HTTPException(403, f"Account suspended. Reason: {suspension['reason']}.{until_text}")
    await db.users.update_one({"id": u["id"]}, {"$set": {"last_seen": now_iso()}})
    token = make_token(u["id"])
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
    await db.users.update_one({"id": u["id"]}, {"$set": {"otp": code, "otp_purpose": "reset"}})
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
    if not u or u.get("otp") != body.code:
        raise HTTPException(400, "Invalid reset code")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    await db.users.update_one({"id": body.user_id}, {"$set": {"password": hash_pw(body.password), "otp": None}})
    token = make_token(body.user_id)
    fresh = await db.users.find_one({"id": body.user_id}, {"_id": 0})
    return {"token": token, "user": public_user(fresh)}


# ----------------------------- users -----------------------------
@api.get("/users/me")
async def get_me(me=Depends(get_current_user)):
    saved = await db.saved.count_documents({"user_id": me["id"]})
    friends = await db.friendships.count_documents({"users": me["id"]})
    posts = await db.posts.count_documents({"author_id": me["id"], "deleted_at": None})
    data = public_user(me)
    data.update({
        "email": me.get("email"),
        "phone": me.get("phone"),
        "phone_verified": bool(me.get("phone_verified")) or bool(me.get("phone") and not me.get("email") and me.get("verified")),
        "is_admin": bool(me.get("email")) and any(
            me.get("email", "").strip().lower() == admin_email.strip().lower()
            for admin_email, _ in ADMIN_CREDS if admin_email
        ),
        "sparks": me.get("sparks", 0),
        "inner_circle_count": len(me.get("inner_circle", [])),
        "counts": {"saved": saved, "friends": friends, "posts": posts},
    })
    return data


@api.put("/users/me")
async def update_me(body: ProfileUpdate, me=Depends(get_current_user)):
    # Fields explicitly sent as null should be cleared; omitted fields stay unchanged.
    update = {k: v for k, v in body.dict(exclude_unset=True).items()}
    if update:
        await db.users.update_one({"id": me["id"]}, {"$set": update})
    fresh = await db.users.find_one({"id": me["id"]}, {"_id": 0})
    return public_user(fresh)


@api.get("/users/search")
async def search_users(q: str = Query(""), me=Depends(get_current_user)):
    q = q.strip().lower()
    if not q:
        return []
    blocked = set(me.get("blocked", []))
    cur = db.users.find({
        "deleted_at": None,
        "verified": True,
        "id": {"$ne": me["id"]},
        "$or": [
            {"username": {"$regex": q, "$options": "i"}},
            {"full_name": {"$regex": q, "$options": "i"}},
        ],
    }, {"_id": 0}).limit(30)
    out = []
    async for u in cur:
        if u["id"] in blocked:
            continue
        out.append(public_user(u))
    return out


@api.get("/users/{username}")
async def get_user(username: str, me=Depends(get_current_user)):
    u = await db.users.find_one({"username": username.lower(), "deleted_at": None}, {"_id": 0})
    if not u:
        raise HTTPException(404, "User not found")
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
    data["friend_status"] = fr_status
    data["is_me"] = u["id"] == me["id"]
    data["is_blocked"] = u["id"] in set(me.get("blocked", []))
    data["is_inner"] = u["id"] in me.get("inner_circle", [])
    can_view = (u.get("privacy") != "friends") or friend or data["is_me"]
    data["can_view"] = can_view
    data["counts"] = {
        "friends": await db.friendships.count_documents({"users": u["id"]}),
        "posts": await db.posts.count_documents({"author_id": u["id"], "deleted_at": None}),
    }
    if can_view:
        posts = await feed_posts_for_author(u["id"], me["id"])
        data["posts"] = posts
    else:
        data["posts"] = []
    return data


@api.delete("/users/me")
async def delete_account(me=Depends(get_current_user)):
    ts = now_iso()
    await db.users.update_one({"id": me["id"]}, {"$set": {"deleted_at": ts, "verified": False}})
    await db.posts.update_many({"author_id": me["id"]}, {"$set": {"deleted_at": ts}})
    await db.stories.update_many({"author_id": me["id"]}, {"$set": {"deleted_at": ts}})
    return {"ok": True}


@api.post("/users/{user_id}/block")
async def block_user(user_id: str, me=Depends(get_current_user)):
    await db.users.update_one({"id": me["id"]}, {"$addToSet": {"blocked": user_id}})
    # remove friendship + requests
    await db.friendships.delete_many({"users": {"$all": [me["id"], user_id]}})
    await db.friend_requests.delete_many({"$or": [
        {"from": me["id"], "to": user_id}, {"from": user_id, "to": me["id"]}]})
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
        if u:
            incoming.append(public_user(u))
    outgoing = []
    async for r in db.friend_requests.find({"from": me["id"], "status": "pending"}):
        u = await db.users.find_one({"id": r["to"], "deleted_at": None}, {"_id": 0})
        if u:
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
    cur = db.users.find({"deleted_at": None, "verified": True, "id": {"$nin": list(exclude)}}, {"_id": 0}).limit(20)
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
    cur = db.posts.find({"author_id": author_id, "deleted_at": None}).sort("created_at", -1).limit(50)
    out = []
    async for p in cur:
        out.append(await serialize_post(p, me_id))
    return out


@api.post("/posts")
async def create_post(body: PostCreate, me=Depends(get_current_user)):
    active, _, _, _ = golden_window()
    doc = {
        "id": new_id(),
        "author_id": me["id"],
        "type": body.type,
        "text": (body.text or "").strip(),
        "image": body.image,
        "audience": body.audience if body.audience in ("public", "friends", "inner") else "public",
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
    blocked = me.get("blocked", [])
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


@api.get("/posts/{post_id}")
async def get_post(post_id: str, me=Depends(get_current_user)):
    p = await db.posts.find_one({"id": post_id, "deleted_at": None})
    if not p:
        raise HTTPException(404, "Post not found")
    return await serialize_post(p, me["id"])


@api.post("/posts/{post_id}/react")
async def react_post(post_id: str, body: ReactionBody, me=Depends(get_current_user)):
    p = await db.posts.find_one({"id": post_id, "deleted_at": None})
    if not p:
        raise HTTPException(404, "Post not found")
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
    cur = db.comments.find({"post_id": post_id, "deleted_at": None}).sort("created_at", 1)
    out = []
    async for c in cur:
        out.append({
            "id": c["id"],
            "author": await enrich_author(c["author_id"]),
            "text": c["text"],
            "created_at": c["created_at"],
            "is_mine": c["author_id"] == me["id"],
        })
    return out


@api.post("/posts/{post_id}/comments")
async def add_comment(post_id: str, body: CommentCreate, me=Depends(get_current_user)):
    p = await db.posts.find_one({"id": post_id, "deleted_at": None})
    if not p:
        raise HTTPException(404, "Post not found")
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
    await db.reports.insert_one({
        "id": new_id(), "reporter_id": me["id"], "target_type": body.target_type,
        "target_id": body.target_id, "reason": body.reason, "status": "open",
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
    doc = {
        "id": new_id(),
        "author_id": me["id"],
        "type": body.type,
        "image": body.image,
        "text": body.text,
        "bg_color": body.bg_color,
        "media": body.media,
        "duration": body.duration,
        "audience": body.audience if body.audience in ("friends", "inner") else "friends",
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
    blocked = me.get("blocked", [])
    cur = db.stories.find({
        "deleted_at": None,
        "expires_at": {"$gt": now},
        "author_id": {"$in": friend_ids, "$nin": blocked},
    }).sort("created_at", 1)
    grouped = {}
    authors_cache = {}
    async for s in cur:
        aid = s["author_id"]
        if aid not in authors_cache:
            authors_cache[aid] = await db.users.find_one({"id": aid}, {"_id": 0})
        au = authors_cache[aid]
        if not au:
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


# ----------------------------- chat -----------------------------
def conv_id_for(a: str, b: str) -> str:
    return "_".join(sorted([a, b]))


@api.get("/chat/conversations")
async def conversations(me=Depends(get_current_user)):
    cur = db.conversations.find({"participants": me["id"]}).sort("updated_at", -1)
    out = []
    async for c in cur:
        if c.get("is_group"):
            unread = await db.messages.count_documents({
                "conversation_id": c["id"], "from_user": {"$ne": me["id"]}, "read_by": {"$ne": me["id"]}})
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
        if not u:
            continue
        unread = await db.messages.count_documents({
            "conversation_id": c["id"], "to_user": me["id"], "status": {"$ne": "read"}})
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
            "online": online,
            "last_seen": last_seen,
        })
    return out


@api.post("/chat/groups")
async def create_group(body: GroupCreate, me=Depends(get_current_user)):
    if not body.name.strip():
        raise HTTPException(400, "Group name required")
    members = list({*body.member_ids, me["id"]})
    if len(members) < 3:
        raise HTTPException(400, "Add at least 2 friends to create a group")
    gid = new_id()
    await db.conversations.insert_one({
        "id": gid, "is_group": True, "name": body.name.strip(), "avatar": body.avatar,
        "participants": members, "created_by": me["id"], "muted_by": [],
        "last_message": f"{me['full_name']} created the group", "last_type": "system",
        "updated_at": now_iso(), "created_at": now_iso(),
    })
    return {"id": gid}


@api.get("/chat/group/{group_id}")
async def get_group(group_id: str, me=Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": group_id, "is_group": True})
    if not conv or me["id"] not in conv.get("participants", []):
        raise HTTPException(404, "Group not found")
    await db.messages.update_many(
        {"conversation_id": group_id, "from_user": {"$ne": me["id"]}, "read_by": {"$ne": me["id"]}},
        {"$addToSet": {"read_by": me["id"]}})
    members = []
    for uid in conv.get("participants", []):
        mu = await db.users.find_one({"id": uid}, {"_id": 0})
        if mu:
            members.append(public_user(mu))
    cur = db.messages.find({"conversation_id": group_id}).sort("created_at", 1).limit(300)
    msgs = []
    async for m in cur:
        sender = await db.users.find_one({"id": m["from_user"]}, {"_id": 0})
        msgs.append({
            "id": m["id"], "from_user": m["from_user"],
            "sender_name": (sender or {}).get("full_name", "User"),
            "sender_avatar": (sender or {}).get("avatar"),
            "type": m.get("type", "text"), "text": m.get("text"),
            "media": m.get("media"), "duration": m.get("duration"),
            "created_at": m["created_at"], "mine": m["from_user"] == me["id"],
        })
    return {
        "id": group_id, "is_group": True, "name": conv.get("name"), "avatar": conv.get("avatar"),
        "members": members, "member_count": len(members), "messages": msgs,
        "muted": me["id"] in conv.get("muted_by", []),
    }


@api.get("/chat/with/{user_id}")
async def get_conversation(user_id: str, me=Depends(get_current_user)):
    cid = conv_id_for(me["id"], user_id)
    other = await db.users.find_one({"id": user_id, "deleted_at": None}, {"_id": 0})
    if not other:
        raise HTTPException(404, "User not found")
    # mark delivered/read
    await db.messages.update_many(
        {"conversation_id": cid, "to_user": me["id"], "status": {"$ne": "read"}},
        {"$set": {"status": "read"}})
    cur = db.messages.find({"conversation_id": cid}).sort("created_at", 1).limit(200)
    msgs = []
    async for m in cur:
        msgs.append({
            "id": m["id"], "from_user": m["from_user"], "to_user": m["to_user"],
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
        "messages": msgs,
        "online": online,
        "last_seen": last_seen,
        "muted": conv and me["id"] in conv.get("muted_by", []),
        "is_friend": await are_friends(me["id"], user_id),
    }


@api.post("/chat/send")
async def send_message(body: MessageCreate, me=Depends(get_current_user)):
    preview_of = lambda: body.text if body.type == "text" else ("📷 Photo" if body.type == "photo" else "🎤 Voice note")

    # group message
    if body.conversation_id:
        conv = await db.conversations.find_one({"id": body.conversation_id, "is_group": True})
        if conv:
            if me["id"] not in conv.get("participants", []):
                raise HTTPException(403, "Not a group member")
            msg = {
                "id": new_id(), "conversation_id": conv["id"], "from_user": me["id"], "to_user": None,
                "is_group": True, "type": body.type, "text": body.text, "media": body.media,
                "duration": body.duration, "read_by": [me["id"]], "created_at": now_iso(),
            }
            await db.messages.insert_one(msg)
            preview = f"{me['full_name'].split(' ')[0]}: {preview_of()}"
            await db.conversations.update_one({"id": conv["id"]}, {"$set": {
                "last_message": preview, "last_type": body.type, "updated_at": now_iso()}})
            for uid in conv.get("participants", []):
                if uid != me["id"]:
                    await notify(uid, me["id"], "message", conv["id"], f"{conv.get('name')}: {me['full_name'].split(' ')[0]}: {preview_of()[:50]}")
            return {
                "id": msg["id"], "from_user": me["id"], "sender_name": me["full_name"], "sender_avatar": me.get("avatar"),
                "type": msg["type"], "text": msg["text"], "media": msg["media"],
                "duration": msg["duration"], "created_at": msg["created_at"], "mine": True,
            }

    to_user = body.to_user
    if not to_user and body.conversation_id:
        parts = body.conversation_id.split("_")
        to_user = [x for x in parts if x != me["id"]][0]
    if not to_user:
        raise HTTPException(400, "Recipient required")
    cid = conv_id_for(me["id"], to_user)
    msg = {
        "id": new_id(), "conversation_id": cid, "from_user": me["id"], "to_user": to_user,
        "type": body.type, "text": body.text, "media": body.media,
        "duration": body.duration, "status": "delivered", "created_at": now_iso(),
    }
    await db.messages.insert_one(msg)
    preview = preview_of()
    await notify(to_user, me["id"], "message", me["id"], f"{me['full_name']}: {preview[:60]}")
    await db.conversations.update_one(
        {"id": cid},
        {"$set": {
            "id": cid, "participants": sorted([me["id"], to_user]),
            "last_message": preview, "last_type": body.type, "updated_at": now_iso(),
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
    muted = conv.get("muted_by", []) if conv else []
    if me["id"] in muted:
        await db.conversations.update_one({"id": conversation_id}, {"$pull": {"muted_by": me["id"]}})
        return {"muted": False}
    await db.conversations.update_one({"id": conversation_id}, {"$addToSet": {"muted_by": me["id"]}}, upsert=True)
    return {"muted": True}


@api.post("/chat/heartbeat")
async def heartbeat(me=Depends(get_current_user)):
    await db.users.update_one({"id": me["id"]}, {"$set": {"last_seen": now_iso()}})
    return {"ok": True}


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
    existing = await db.verifications.find_one({"user_id": me["id"], "status": "pending"})
    if existing:
        raise HTTPException(400, "You already have a pending request")
    if me.get("golden_tick"):
        raise HTTPException(400, "You are already verified")

    eligibility = verification_eligibility(me)
    if not eligibility["account_old_enough"]:
        raise HTTPException(400, "Account must be at least 2 months old")
    if not eligibility["phone_verified"]:
        raise HTTPException(400, "A verified phone number is required")

    await db.verifications.insert_one({
        "id": new_id(),
        "user_id": me["id"],
        "document": body.document,
        "selfie": body.selfie,
        "full_legal_name": body.full_legal_name,
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
    return payload


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
    }


# ----------------------------- files -----------------------------
@api.post("/upload")
async def upload(file: UploadFile = File(...), me=Depends(get_current_user)):
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
    return {
        "users": await db.users.count_documents({"deleted_at": None, "verified": True}),
        "posts": await db.posts.count_documents({"deleted_at": None}),
        "stories": await db.stories.count_documents({"deleted_at": None, "expires_at": {"$gt": now_iso()}}),
        "pending_verifications": await db.verifications.count_documents({"status": "pending"}),
        "open_tickets": await db.tickets.count_documents({"status": "open"}),
        "open_reports": await db.reports.count_documents({"status": "open"}),
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


@api.post("/admin/verifications/{vid}/approve")
async def approve_verification(vid: str, body: AdminReasonBody = AdminReasonBody(reason="Identity verification approved"), _=Depends(require_admin)):
    v = await db.verifications.find_one({"id": vid})
    if not v:
        raise HTTPException(404, "Not found")
    reason = (body.reason or "Identity verification approved").strip()
    await db.verifications.update_one({"id": vid}, {"$set": {"status": "approved", "review_reason": reason, "reviewed_at": now_iso()}})
    await db.users.update_one({"id": v["user_id"]}, {"$set": {"golden_tick": True}})
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
    if author_id:
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
        "blue_tick": bool(u.get("golden_tick")),
        "sparks": u.get("sparks", 0),
        "last_seen": u.get("last_seen"),
        "suspended": bool(u.get("suspended")),
        "suspended_until": u.get("suspended_until"),
        "suspend_reason": u.get("suspend_reason"),
        "deleted_at": u.get("deleted_at"),
        "deleted_reason": u.get("deleted_reason"),
        "permanent_deleted": bool(u.get("permanent_deleted")),
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

    verifications = []
    async for v in db.verifications.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(10):
        verifications.append(v)

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
        "reports_received": await db.reports.count_documents({"target_id": {"$in": content_ids}}) if content_ids else 0,
    }

    return {
        "user": admin_safe_user(u),
        "counts": counts,
        "posts": posts,
        "comments": comments,
        "verifications": verifications,
        "moderation_history": history,
    }


@api.post("/admin/users/{user_id}/suspend")
async def suspend_user(user_id: str, body: AdminSuspendBody = AdminSuspendBody(), _=Depends(require_admin)):
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(404, "User not found")
    reason = (body.reason or "Violation of Glint rules").strip()
    days = body.duration_days
    until = None
    if days is not None and days > 0:
        until = (datetime.now(timezone.utc) + timedelta(days=min(days, 3650))).isoformat()
    await db.users.update_one({"id": user_id}, {"$set": {
        "suspended": True,
        "suspended_until": until,
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


@api.post("/admin/users/{user_id}/blue-tick")
async def admin_blue_tick(user_id: str, body: AdminBlueTickBody, _=Depends(require_admin)):
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(404, "User not found")
    reason = (body.reason or ("Approved by Glint admin" if body.verified else "Verification removed by Glint admin")).strip()
    await db.users.update_one({"id": user_id}, {"$set": {"golden_tick": body.verified}})
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
    except Exception as e:
        logger.error(f"MongoDB startup check failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
