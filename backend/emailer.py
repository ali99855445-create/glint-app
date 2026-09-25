"""SMTP email helper for transactional OTP emails (signup / password reset).

Configure on Render with env vars:
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
When ALL are absent, the app keeps the dev-preview simulated-OTP behavior.
"""
import asyncio
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage

logger = logging.getLogger("emailer")

SMTP_VARS = ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM")


def smtp_configured() -> bool:
    """True only when the complete SMTP configuration is present."""
    return all(os.environ.get(name, "").strip() for name in SMTP_VARS)


def _send_email_sync(to: str, subject: str, text: str) -> None:
    host = os.environ["SMTP_HOST"]
    port = int(os.environ["SMTP_PORT"])
    user = os.environ["SMTP_USER"]
    password = os.environ["SMTP_PASSWORD"]
    sender = os.environ["SMTP_FROM"]

    message = EmailMessage()
    message["From"] = f"Glint <{sender}>"
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)

    tls_context = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=20, context=tls_context) as smtp:
            smtp.login(user, password)
            smtp.send_message(message)
    else:
        with smtplib.SMTP(host, port, timeout=20) as smtp:
            smtp.ehlo()
            smtp.starttls(context=tls_context)
            smtp.ehlo()
            smtp.login(user, password)
            smtp.send_message(message)


async def send_email(to: str, subject: str, text: str) -> None:
    """Run blocking smtplib work outside FastAPI's event loop."""
    if not smtp_configured():
        raise RuntimeError("SMTP is not configured")
    await asyncio.to_thread(_send_email_sync, to, subject, text)


async def send_otp_email(to: str, otp: str, purpose: str) -> None:
    subject = "Verify your Glint account" if purpose == "signup" else "Reset your Glint password"
    text = (
        f"Your Glint {purpose} verification code is: {otp}\n\n"
        "This code expires soon and can be used only once.\n"
        "If you did not request this, you can safely ignore this email.\n\n"
        "- The Glint Team"
    )
    await send_email(to, subject, text)
    logger.info(f"[OTP] emailed {purpose} code to {to}")
