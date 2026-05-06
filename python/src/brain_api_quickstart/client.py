"""Revmachina Brain API client + HMAC webhook verifier.

Reference Python implementation. Lift the patterns; don't depend on the package.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from dataclasses import dataclass
from typing import Any

import httpx

DEFAULT_BASE = "https://revmachina.ai/api/v1"


class BrainApiError(Exception):
    """Raised when the Brain API returns a non-2xx response."""

    def __init__(self, status: int, envelope: Any) -> None:
        self.status = status
        self.envelope = envelope
        msg = "Brain API error"
        if isinstance(envelope, dict):
            err = envelope.get("error")
            if isinstance(err, dict) and isinstance(err.get("message"), str):
                msg = err["message"]
        super().__init__(f"{msg} (status={status})")


class BrainApiClient:
    """Synchronous Brain API client.

    Mirrors the TypeScript client.ts: GET brief, POST call lifecycle, POST signal,
    manage webhook subscriptions, trigger sandbox demo events.
    """

    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._http = httpx.Client(timeout=30.0)

    # ─── Reads ─────────────────────────────────────────────────────────────
    def get_brief(self, lead_id: str) -> dict:
        return self._request("GET", f"/leads/{lead_id}/brief")

    # ─── Writes — call lifecycle ───────────────────────────────────────────
    def post_call_started(self, lead_id: str, body: dict) -> dict:
        return self._request("POST", f"/leads/{lead_id}/call-started", body=body)

    def post_call_ended(self, lead_id: str, body: dict) -> dict:
        return self._request(
            "POST",
            f"/leads/{lead_id}/call-ended",
            body=body,
            idempotency_key=body.get("call_id"),
        )

    # ─── Writes — signal injection ─────────────────────────────────────────
    def post_signal(self, lead_id: str, body: dict) -> dict:
        return self._request("POST", f"/leads/{lead_id}/signal", body=body)

    # ─── Webhook subscription management ───────────────────────────────────
    def create_webhook_subscription(self, body: dict) -> dict:
        return self._request("POST", "/webhooks/subscriptions", body=body)

    def delete_webhook_subscription(self, subscription_id: str) -> None:
        self._request("DELETE", f"/webhooks/subscriptions/{subscription_id}")

    def trigger_sandbox_event(self, body: dict) -> dict:
        return self._request("POST", "/webhooks/sandbox/trigger-demo-event", body=body)

    def close(self) -> None:
        self._http.close()

    # ─── Internals ─────────────────────────────────────────────────────────
    def _request(
        self,
        method: str,
        path: str,
        body: dict | None = None,
        idempotency_key: str | None = None,
    ) -> Any:
        headers: dict[str, str] = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        res = self._http.request(method, f"{self._base_url}{path}", headers=headers, json=body)
        if res.status_code >= 400:
            try:
                env = res.json()
            except Exception:
                env = {"error": {"message": res.text}}
            raise BrainApiError(res.status_code, env)
        if res.status_code == 204:
            return None
        return res.json()


# ─── Webhook signature verification (Stripe-pattern) ──────────────────────
#
# Header format: `X-Revmachina-Signature: t=<unix_ts>,v1=<hex_hmac>`
# where hmac = HMAC_SHA256(signing_secret, "${unix_ts}.${request_body}").
#
# Verification:
#   1. Parse t and v1 from the header.
#   2. Reject deliveries older than tolerance_sec (default 300s = 5 min) — replay.
#   3. Recompute HMAC over the same concatenation; constant-time compare.
def verify_webhook_signature(
    signing_secret: str,
    payload: str,
    signature_header: str,
    tolerance_sec: int = 300,
) -> bool:
    parts: dict[str, str] = {}
    for piece in signature_header.split(","):
        piece = piece.strip()
        eq = piece.find("=")
        if eq <= 0:
            continue
        parts[piece[:eq]] = piece[eq + 1 :]

    try:
        ts = int(parts.get("t", ""))
    except ValueError:
        return False
    v1 = parts.get("v1", "")
    if not ts or not v1:
        return False
    if abs(time.time() - ts) > tolerance_sec:
        return False

    expected = hmac.new(
        signing_secret.encode("utf-8"),
        f"{ts}.{payload}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, v1)


# ─── Light response-shape stubs (for type-hint convenience) ───────────────
# Full schema at https://revmachina.ai/openapi.yaml. These dataclasses are
# illustrative; the client returns plain dicts so partner code can ignore
# them entirely if preferred.

@dataclass
class WebhookSubscriptionCreated:
    id: str
    url: str
    event_types: list[str]
    signing_secret: str
    signing_secret_prefix: str
    active: bool
    created_at: str

    @classmethod
    def from_dict(cls, d: dict) -> "WebhookSubscriptionCreated":
        return cls(
            id=d["id"],
            url=d["url"],
            event_types=list(d.get("event_types") or []),
            signing_secret=d["signing_secret"],
            signing_secret_prefix=d["signing_secret_prefix"],
            active=bool(d.get("active", True)),
            created_at=d["created_at"],
        )
