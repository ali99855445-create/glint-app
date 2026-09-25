"""Object storage helper (sync, call via threadpool).

Priority:
  1. User's own S3-compatible bucket (AWS S3 / Cloudflare R2) when ALL of:
     S3_ENDPOINT_URL, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY are set.
  2. Emergent Managed Object Storage (dev/preview fallback).
"""
import os
import requests

APP_NAME = "glint"

_storage_key = None
_s3_client = None

S3_VARS = ("S3_ENDPOINT_URL", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY")


def s3_enabled() -> bool:
    return all((os.environ.get(name) or "").strip() for name in S3_VARS)


def _s3():
    global _s3_client
    if _s3_client is None:
        import boto3
        from botocore.config import Config

        _s3_client = boto3.client(
            "s3",
            endpoint_url=os.environ["S3_ENDPOINT_URL"].strip(),
            region_name=os.environ["S3_REGION"].strip(),
            aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"].strip(),
            aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"].strip(),
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
    return _s3_client


def _urls():
    base = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
    return base.rstrip("/") + "/objstore/api/v1/storage"


def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    STORAGE_URL = _urls()
    key = os.environ.get("EMERGENT_LLM_KEY")
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": key}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _reset():
    global _storage_key
    _storage_key = None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    if s3_enabled():
        import io

        _s3().upload_fileobj(
            io.BytesIO(data),
            os.environ["S3_BUCKET"].strip(),
            path,
            ExtraArgs={"ContentType": content_type or "application/octet-stream"},
        )
        return {"path": path}

    STORAGE_URL = _urls()
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 503:
        _reset()
        key = init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    if s3_enabled():
        obj = _s3().get_object(Bucket=os.environ["S3_BUCKET"].strip(), Key=path)
        return obj["Body"].read(), obj.get("ContentType", "application/octet-stream")

    STORAGE_URL = _urls()
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    if resp.status_code == 503:
        _reset()
        key = init_storage()
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60,
        )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
