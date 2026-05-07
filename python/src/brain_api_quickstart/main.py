"""Revmachina Brain API — end-to-end reference demo (Python).

9-step flow that exercises every Brain API surface area against the public
sandbox tenant. Run with:
    python -m brain_api_quickstart

Set REVMACHINA_API_KEY in .env (get one at https://revmachina.ai/partner-access).
"""

from __future__ import annotations

import datetime as dt
import os
import sys
import uuid

from dotenv import load_dotenv

from .client import BrainApiClient, BrainApiError
from .demo_conversation import FORECLOSURE_DIALOGUE, play_dialogue

# Sandbox tenant demo lead — Maria Sandbox-Demo, foreclosure, 18 days to auction.
SANDBOX_LEAD_ID = "0228a09a-13a5-4f71-b692-b57bc25a2968"
SANDBOX_TENANT_ID = "00000000-0000-0000-0000-000000000001"


def _now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def main() -> int:
    # Force UTF-8 stdout so dialogue + check/cross marks render correctly
    # on Windows consoles that default to cp1252.
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except Exception:
            pass
    load_dotenv()
    api_key = os.environ.get("REVMACHINA_API_KEY")
    if not api_key or api_key.startswith("rm_test_revm_REPLACE_ME"):
        print("REVMACHINA_API_KEY missing.")
        print("Get an instant 30-day sandbox key at https://revmachina.ai/partner-access (use_case: voice_platform).")
        print("Then paste it into .env and rerun.")
        return 1

    client = BrainApiClient(api_key=api_key)
    subscription_id: str | None = None

    try:
        # ─── Step 1 — Fetch brief ──────────────────────────────────────────
        print("[1/9] Fetching brief for sandbox lead Maria Sandbox-Demo...")
        brief = client.get_brief(SANDBOX_LEAD_ID)
        seller = brief.get("seller", {})
        intel = brief.get("intelligence", {})
        coaching = brief.get("coaching", {})
        playbook = coaching.get("objection_playbook") or []
        print(f"   Score: {seller.get('score')} ({seller.get('score_band')})")
        print(f"   Must sell: {seller.get('motivation_classification') or 'no_signal'}")
        print(f"   Motivation: {intel.get('motivation_summary')}")
        if playbook:
            top = playbook[0]
            print(f"   Top objection in playbook: \"{top.get('objection_key')}\" (win rate: {top.get('win_rate')})")
        else:
            print("   No objection_playbook entries (tenant has no objection_library yet).")

        # ─── Step 2 — Log call started ─────────────────────────────────────
        # The server returns a call_id. We use that exact value for Step 5's
        # idempotency key so the call lifecycle is correlated end-to-end.
        dial_id = f"dial_{uuid.uuid4()}"
        print("\n[2/9] Logging call started...")
        cs = client.post_call_started(SANDBOX_LEAD_ID, {
            "agent_type": "ai_voice",
            "agent_id":   "quickstart_demo_agent",
            "channel":    "outbound_call",
            "dial_id":    dial_id,
            "started_at": _now_iso(),
        })
        call_id = cs["call_id"]
        print(f"   call_id: {call_id[:16]}...")

        # ─── Step 3 — Simulate a 60-second conversation ────────────────────
        print("\n[3/9] Simulating 60-second conversation (no audio, no LLM — just dialogue text)...")
        play_dialogue(FORECLOSURE_DIALOGUE, per_turn_ms=350)

        # ─── Step 4 — Post objection signal ────────────────────────────────
        # channel uses SignalRequest enum from OpenAPI: [call, sms, email, web, other].
        # The CallStartedRequest enum (outbound_call/inbound_call/etc.) is a
        # separate vocabulary used only on call lifecycle endpoints.
        print("\n[4/9] Posting objection signal...")
        sig = client.post_signal(SANDBOX_LEAD_ID, {
            "signal_type":   "objection_raised",
            "channel":       "call",
            "content":       "Seller objected: price too low. Requested floor $175K.",
            "occurred_at":   _now_iso(),
            "source_system": "quickstart_demo",
        })
        print(f"   signal_id: {(sig.get('signal_id') or 'n/a')[:16]}...")
        if sig.get("lead_rescored"):
            print(f"   Lead rescored: new={sig.get('new_priority_score')} ({sig.get('new_score_band')})")

        # ─── Step 5 — Log call ended ───────────────────────────────────────
        # Use the SAME call_id the server returned in Step 2 — the call lifecycle
        # is correlated by this id end-to-end.
        print("\n[5/9] Logging call ended...")
        ce = client.post_call_ended(SANDBOX_LEAD_ID, {
            "call_id":          call_id,
            "ended_at":         _now_iso(),
            "duration_seconds": 67,
            "disposition":      "callback_scheduled",
            "notes":            "Seller engaged. Floor 175K. Callback tomorrow afternoon.",
        })
        print("   Disposition: callback_scheduled")
        if ce.get("lead_rescored"):
            print(f"   Lead rescored: new={ce.get('new_priority_score')} ({ce.get('new_score_band')})")

        # ─── Step 6 — Create webhook subscription ──────────────────────────
        print("\n[6/9] Creating webhook subscription...")
        webhook_id = uuid.uuid4()
        webhook_url = os.environ.get("WEBHOOK_PUBLIC_URL") or f"https://webhook.site/{webhook_id}"
        sub = client.create_webhook_subscription({
            "url":          webhook_url,
            "event_types":  ["lead.score_changed"],
            "description":  "brain-api-quickstart demo subscription",
        })
        subscription_id = sub.get("id")
        signing_secret = sub.get("signing_secret") or ""
        print(f"   Subscription ID: {sub.get('id')}")
        print(f"   URL: {sub.get('url')}")
        print(f"   Signing secret: {signing_secret[:14]}... (saved in memory for HMAC verification)")
        print(f"   (Inspect deliveries at {webhook_url}, or set WEBHOOK_PUBLIC_URL + ngrok to verify HMAC locally.)")

        # ─── Step 7 — Trigger sandbox demo event ───────────────────────────
        print("\n[7/9] Triggering sandbox demo event (lead.score_changed)...")
        trig = client.trigger_sandbox_event({
            "lead_id":    SANDBOX_LEAD_ID,
            "event_type": "lead.score_changed",
        })
        print(f"   {trig.get('message')}")
        print(f"   Delivery estimate: {trig.get('delivery_estimate')}")
        print(f"   Active subscriptions in sandbox tenant: {trig.get('subscription_count')}")

        # ─── Step 8 — Reminder about webhook delivery ──────────────────────
        print("\n[8/9] Webhook delivery is queued.")
        print("   The Vercel cron worker fires every minute. Within ~60s, your subscription URL")
        print(f"   ({webhook_url}) will receive a POST with:")
        print("     Headers:  X-Revmachina-Event, X-Revmachina-Delivery-Id, X-Revmachina-Signature")
        print("     Payload:  { \"event_type\": \"lead.score_changed\", \"data\": { old_band, new_band, ... } }")
        print("   Verify the signature header per the verify_webhook_signature() helper in client.py.")

        # ─── Step 9 — Cleanup ──────────────────────────────────────────────
        print("\n[9/9] Cleanup: deleting subscription so this demo is repeatable...")
        if subscription_id:
            client.delete_webhook_subscription(subscription_id)
            print("   Subscription deleted.")
            subscription_id = None

        print("\n✓ Integration verified. You're ready to build.")
        print("  Next: clone the patterns, point at your tenant, request production keys at revmachina.ai@gmail.com.")
        return 0

    except BrainApiError as e:
        print(f"\n✗ Brain API error {e.status}: {e}")
        print(f"  Envelope: {e.envelope}")
        return 1
    except Exception as e:  # pragma: no cover
        print(f"\n✗ Unexpected error: {e}")
        return 1
    finally:
        if subscription_id:
            try:
                client.delete_webhook_subscription(subscription_id)
            except Exception:
                pass
        client.close()


if __name__ == "__main__":
    sys.exit(main())
