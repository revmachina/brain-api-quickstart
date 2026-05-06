"""Flask webhook listener with HMAC verification.

Binds to a port, exposes POST /webhook, verifies the X-Revmachina-Signature
header against the subscription's signing secret, then invokes the caller's
on_event handler.
"""

from __future__ import annotations

import threading
from typing import Callable

from flask import Flask, request
from werkzeug.serving import make_server

from .client import verify_webhook_signature


def start_webhook_listener(
    port: int,
    signing_secret: str,
    on_event: Callable[[dict, dict], None],
) -> "_ListenerHandle":
    """Start a background-thread Flask listener.

    on_event(event_payload: dict, headers: {"deliveryId": str, "eventType": str})
    """
    app = Flask(__name__)

    @app.post("/webhook")
    def receive():  # type: ignore[no-untyped-def]
        sig_header = request.headers.get("X-Revmachina-Signature", "")
        delivery_id = request.headers.get("X-Revmachina-Delivery-Id", "")
        event_type = request.headers.get("X-Revmachina-Event", "")
        payload = request.get_data(as_text=True)

        if not verify_webhook_signature(signing_secret, payload, sig_header):
            print(f"  [webhook] HMAC verification FAILED — rejecting delivery {delivery_id}")
            return ("invalid signature", 401)

        try:
            event = request.get_json(force=True, silent=False)
        except Exception:
            return ("invalid json", 400)

        on_event(event or {}, {"deliveryId": delivery_id, "eventType": event_type})
        return ("ok", 200)

    server = make_server("0.0.0.0", port, app)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return _ListenerHandle(server, thread)


class _ListenerHandle:
    def __init__(self, server, thread) -> None:  # type: ignore[no-untyped-def]
        self._server = server
        self._thread = thread

    def close(self) -> None:
        self._server.shutdown()
        self._thread.join(timeout=2.0)
