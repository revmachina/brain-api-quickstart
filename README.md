# Revmachina Brain API — Quickstart

The persistent intelligence layer for AI sales agents.

This repo is a **working reference integration**. Clone it, paste your sandbox key, and have a complete end-to-end demo running in 5 minutes — fetching seller intelligence, simulating a call, posting a signal, subscribing to webhooks, and verifying an HMAC-signed delivery.

```bash
# 1. Get a 30-day sandbox key (instant, no email back-and-forth)
open https://revmachina.ai/partner-access     # use_case: voice_platform | dialer | custom

# 2. Clone + run
git clone https://github.com/revmachina/brain-api-quickstart
cd brain-api-quickstart

# TypeScript
cd typescript && cp ../.env.example .env      # paste your sandbox key into .env
npm install && npm start

# OR Python
cd python && python -m venv .venv && source .venv/bin/activate
pip install -e . && cp ../.env.example .env
python -m brain_api_quickstart
```

## What is the Revmachina Brain API?

Most AI voice agents are stateless. They call. They text. They forget. Every interaction starts from zero.

Revmachina is the persistent intelligence layer that solves that. One API surface that any AI sales agent, voice platform, dialer, or CRM plugs into:

- **Read** seller context before any interaction — `GET /leads/{id}/brief` returns who they are, why they're selling, what objections they'll raise, the top 5 objections + recommended responses ranked by historical win rate, and what to say first
- **Write** outcomes after every interaction — `POST /call-ended`, `POST /signal` triggers immediate rescore so the next agent that calls is smarter
- **Subscribe** to lead-state changes — `POST /webhooks/subscriptions` gives you HMAC-signed POSTs within seconds of score crossings, must-sell classification, deal stage transitions, owner reassignments, and more
- **Coach** mid-call — `coaching.objection_playbook` in every brief is pre-loaded with this seller's most likely objections and the response patterns that have closed similar leads in your tenant's history

Every agent connected to the same Brain API instance shares state. Every outcome calibrates the scoring engine. Every connected agent makes every other connected agent smarter.

## What this repo is

A complete working integration in two languages — pick whichever you prefer. They're functionally identical:

- **TypeScript** ([typescript/](./typescript)) — Node.js 18+, Express webhook listener, ~330 LOC across 4 source files
- **Python** ([python/](./python)) — Python 3.11+, Flask webhook listener, ~340 LOC across 4 source files

## What this repo is NOT

- **Not an SDK.** This is reference code. Lift the patterns; don't depend on the package.
- **Not a voice agent integration.** No Twilio, no audio, no third-party voice infra. The "conversation" is simulated as CLI text so you can focus on the Brain API surface.
- **Not a tutorial.** It's working code. Read [the docs](https://revmachina.ai/api-docs) for narrative depth.

## Structure

```
brain-api-quickstart/
├── README.md
├── LICENSE                            # MIT
├── .env.example                       # paste your sandbox key here
├── .github/workflows/ci.yml           # typecheck + py_compile on PRs
├── typescript/
│   └── src/
│       ├── index.ts                   # 9-step end-to-end demo runner
│       ├── client.ts                  # Brain API client + verifyWebhookSignature
│       ├── webhook-listener.ts        # Express HMAC-verified listener
│       └── demo-conversation.ts       # Simulated dialogue
└── python/
    └── src/brain_api_quickstart/
        ├── main.py                    # Same 9-step demo, identical output
        ├── client.py                  # BrainApiClient + verify_webhook_signature
        ├── webhook_listener.py        # Flask blueprint with HMAC verification
        └── demo_conversation.py
```

## What you'll see when you run it

This is the actual output from a fresh `npm start` (or `python -m brain_api_quickstart`) against the public sandbox tenant:

```
[1/9] Fetching brief for sandbox lead Maria Sandbox-Demo...
   Score: 94 (hot)
   Must sell: no_signal
   Motivation: Foreclosure auction in 18 days. Seller out of state, cannot manage repairs. Floor $175K to cover payoff. Wants fast clean close — financial urgency is the lever.
   Top objection in playbook: "need_to_think" (win rate: 0.46)

[2/9] Logging call started...
   call_id: call_b8e0024a-bb...

[3/9] Simulating 60-second conversation (no audio, no LLM — just dialogue text)...
   Agent:  "Hi Maria, this is Alex with Revmachina — I understand you're dealing with a tight timeline on the property. Got a couple minutes?"
   Seller: "Yeah, I have a minute. The auction is in 18 days, I just need this done."
   Agent:  "I hear you. Most folks in your spot are weighing two things — the highest number on paper, and the number that actually closes before the auction date. Which matters more?"
   Seller: "I need it to close. But your offer's too low. I was expecting more."
   Agent:  "Totally fair. The number reflects what we can pay given the timeline you're working with — auction in 18 days. A retail sale at full asking takes 60 to 90 days. What's your hard floor?"
   Seller: "I'd need at least 175. Anything below that doesn't cover what I owe."
   Agent:  "Understood. Let me run the numbers and get back to you in 24 hours with our best offer at that floor or as close as we can get. Sound good?"
   Seller: "Yeah, that works. Call me tomorrow afternoon."

[4/9] Posting objection signal...
   signal_id: sig_482e4aae-363...
   Lead rescored: new=80 (hot)

[5/9] Logging call ended...
   Disposition: callback_scheduled
   Lead rescored: new=80 (hot)

[6/9] Creating webhook subscription...
   Subscription ID: f56f3f09-89dd-4760-bc4b-245399ba8054
   URL: https://webhook.site/<your-disposable-id>
   Signing secret: whsec_768514f3... (saved in memory for HMAC verification)

[7/9] Triggering sandbox demo event (lead.score_changed)...
   Triggered lead.score_changed. Cron worker fires every minute; expect delivery within 60s if you have an active subscription matching this event type.
   Delivery estimate: <60s
   Active subscriptions in sandbox tenant: 2

[8/9] Webhook delivery is queued.
   Within ~60s, your subscription URL receives a POST with:
     Headers:  X-Revmachina-Event, X-Revmachina-Delivery-Id, X-Revmachina-Signature
     Payload:  { "event_type": "lead.score_changed", "data": { old_band, new_band, ... } }
   Verify the signature header per the verifyWebhookSignature() helper.

[9/9] Cleanup: deleting subscription so this demo is repeatable...
   Subscription deleted.

✓ Integration verified. You're ready to build.
```

The TypeScript and Python demos produce **functionally identical output** — same step structure, same data, same dialogue. Pick whichever language fits your stack.

## HMAC verification (the part most teams get wrong)

Revmachina signs every delivery with HMAC-SHA256, Stripe-pattern. Header format:

```
X-Revmachina-Signature: t=<unix_ts>,v1=<hex_hmac>
```

where `hmac = HMAC_SHA256(signing_secret, "${unix_ts}.${request_body}")`.

Verifier (TypeScript — see [typescript/src/client.ts](typescript/src/client.ts) for the full helper):

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto'

function verify(rawBody: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=', 2)))
  const ts = Number(parts.t)
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false  // 5-min replay window
  const expected = createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex')
  return timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))
}
```

Python equivalent in [python/src/brain_api_quickstart/client.py](python/src/brain_api_quickstart/client.py) (`verify_webhook_signature`).

Three things matter:
1. **Verify before you deserialize.** Hash the raw bytes the server signed.
2. **Reject deliveries older than 5 minutes.** Replay protection.
3. **Constant-time compare.** `timingSafeEqual` / `hmac.compare_digest`, never `==`.

## Idempotency

Every delivery includes `X-Revmachina-Delivery-Id`. Dedupe on this. The cron retries on 5xx with exponential backoff (30s, 5min, 1hr, then dead-letter at attempt 4) — your endpoint may receive the same delivery twice if our retry window collides with your endpoint coming back online.

## Sandbox details

- **Tenant UUID:** `00000000-0000-0000-0000-000000000001`
- **5 demo leads** seeded with realistic scoring + objection playbooks. UUIDs are returned in the response when you issue a sandbox key at [revmachina.ai/partner-access](https://revmachina.ai/partner-access).
- **All sandbox demo leads have `sms_opt_out=true`** — accidental real-world side effects are impossible.
- **State is reset hourly** so the demo stays demo-able across runs.

## Going to production

1. **Validate against sandbox.** Run this quickstart, verify HMAC works, confirm your retry handling is right.
2. **Email** `revmachina.ai@gmail.com` with your validated integration. Production keys carry full scope and bind to a real tenant after a signed integration agreement.
3. **Read** the [OpenAPI 1.3.2 spec](https://revmachina.ai/openapi.yaml) for the full surface area + response shapes.

## Useful links

- [API documentation](https://revmachina.ai/api-docs) — narrative integration guide
- [OpenAPI spec](https://revmachina.ai/openapi.yaml) — machine-readable contract
- [Postman collection](https://revmachina.ai/postman-collection.json) — same flow without writing code

## Questions

Open a GitHub issue or email `revmachina.ai@gmail.com`.

## License

MIT. Use freely. Lift patterns. Build things.
