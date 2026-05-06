# Revmachina Brain API — TypeScript Quickstart

Node.js 18+. Express webhook listener. ~280 lines total.

```bash
cp ../.env.example .env
# Paste your sandbox key into REVMACHINA_API_KEY (get one at https://revmachina.ai/partner-access)
npm install
npm start
```

`npm run typecheck` runs `tsc --noEmit` (no build artifacts produced).

## Files

- [src/client.ts](src/client.ts) — Brain API client: GET brief, POST call lifecycle, POST signal, manage webhook subscriptions, HMAC verify.
- [src/webhook-listener.ts](src/webhook-listener.ts) — Express listener that verifies the `X-Revmachina-Signature` header before invoking your handler.
- [src/demo-conversation.ts](src/demo-conversation.ts) — Hardcoded simulated dialogue. No audio, no LLM — just the API surface.
- [src/index.ts](src/index.ts) — 9-step end-to-end demo runner.
