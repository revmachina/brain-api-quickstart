# Revmachina Brain API — Python Quickstart

Python 3.11+. Flask webhook listener. ~260 lines total.

```bash
cd python
python -m venv .venv
source .venv/bin/activate     # or: .venv\Scripts\activate on Windows
pip install -e .
cp ../.env.example .env
# Paste your sandbox key into REVMACHINA_API_KEY
python -m brain_api_quickstart
```

## Files

- [src/brain_api_quickstart/client.py](src/brain_api_quickstart/client.py) — Brain API client + `verify_webhook_signature()`.
- [src/brain_api_quickstart/webhook_listener.py](src/brain_api_quickstart/webhook_listener.py) — Flask blueprint with HMAC verification.
- [src/brain_api_quickstart/demo_conversation.py](src/brain_api_quickstart/demo_conversation.py) — Same simulated dialogue as the TS version.
- [src/brain_api_quickstart/main.py](src/brain_api_quickstart/main.py) — 9-step end-to-end demo runner. Output is functionally identical to the TS version.
