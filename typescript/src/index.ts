// Revmachina Brain API — end-to-end reference demo.
//
// 9-step flow that exercises every Brain API surface area against the
// public sandbox tenant. Run with:
//   npm install && npm start
//
// Set REVMACHINA_API_KEY in .env (get one at https://revmachina.ai/partner-access).

import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { BrainApiClient, BrainApiError } from './client.js'
import { startWebhookListener } from './webhook-listener.js'
import { FORECLOSURE_DIALOGUE, playDialogue } from './demo-conversation.js'

// Sandbox tenant demo lead — Maria Sandbox-Demo, foreclosure, 18 days to auction.
// (Sandbox tenant UUID is 00000000-0000-0000-0000-000000000001; the API
// derives it from the bearer key, so we don't pass it explicitly.)
const SANDBOX_LEAD_ID = '0228a09a-13a5-4f71-b692-b57bc25a2968'

async function main() {
  const apiKey = process.env.REVMACHINA_API_KEY
  if (!apiKey || apiKey.startsWith('rm_test_revm_REPLACE_ME')) {
    console.error('REVMACHINA_API_KEY missing.')
    console.error('Get an instant 30-day sandbox key at https://revmachina.ai/partner-access (use_case: voice_platform).')
    console.error('Then paste it into .env and rerun.')
    process.exit(1)
  }

  const port = parseInt(process.env.WEBHOOK_LISTENER_PORT ?? '4000', 10)
  const client = new BrainApiClient({ apiKey })

  let subscriptionId: string | null = null
  let listener: { close: () => Promise<void> } | null = null

  try {
    // ─── Step 1 — Fetch brief ──────────────────────────────────────────────
    console.log('[1/9] Fetching brief for sandbox lead Maria Sandbox-Demo...')
    const brief = await client.getBrief(SANDBOX_LEAD_ID)
    console.log(`   Score: ${brief.seller.score} (${brief.seller.score_band})`)
    console.log(`   Must sell: ${brief.seller.motivation_classification ?? 'no_signal'}`)
    console.log(`   Motivation: ${brief.intelligence.motivation_summary}`)
    const top = brief.coaching.objection_playbook[0]
    if (top) {
      console.log(`   Top objection in playbook: "${top.objection_key}" (win rate: ${top.win_rate ?? 'n/a'})`)
    } else {
      console.log('   No objection_playbook entries (tenant has no objection_library yet).')
    }

    // ─── Step 2 — Log call started ─────────────────────────────────────────
    // The server returns a call_id. We use that exact value for Step 5's
    // idempotency key so the call lifecycle is correlated end-to-end.
    const dialId = `dial_${randomUUID()}`
    console.log('\n[2/9] Logging call started...')
    const callStart = await client.postCallStarted(SANDBOX_LEAD_ID, {
      agent_type: 'ai_voice',
      agent_id:   'quickstart_demo_agent',
      channel:    'outbound_call',
      dial_id:    dialId,
      started_at: new Date().toISOString(),
    })
    const callId = callStart.call_id
    console.log(`   call_id: ${callId.slice(0, 16)}...`)

    // ─── Step 3 — Simulate a 60-second conversation ─────────────────────────
    console.log('\n[3/9] Simulating 60-second conversation (no audio, no LLM — just dialogue text)...')
    await playDialogue(FORECLOSURE_DIALOGUE, { perTurnMs: 350 })

    // ─── Step 4 — Post objection signal ────────────────────────────────────
    // channel uses SignalRequest enum from OpenAPI: [call, sms, email, web, other].
    // The CallStartedRequest enum (outbound_call/inbound_call/etc.) is a
    // separate vocabulary used only on call lifecycle endpoints.
    console.log('\n[4/9] Posting objection signal...')
    const signal = await client.postSignal(SANDBOX_LEAD_ID, {
      signal_type:    'objection_raised',
      channel:        'call',
      content:        'Seller objected: price too low. Requested floor $175K.',
      occurred_at:    new Date().toISOString(),
      source_system:  'quickstart_demo',
    })
    console.log(`   signal_id: ${signal.signal_id?.slice(0, 16) ?? 'n/a'}...`)
    if (signal.lead_rescored) {
      console.log(`   Lead rescored: new=${signal.new_priority_score} (${signal.new_score_band})`)
    }

    // ─── Step 5 — Log call ended ───────────────────────────────────────────
    // Use the SAME call_id the server returned in Step 2 — the call lifecycle
    // is correlated by this id end-to-end.
    console.log('\n[5/9] Logging call ended...')
    const callEnd = await client.postCallEnded(SANDBOX_LEAD_ID, {
      call_id:          callId,
      ended_at:         new Date().toISOString(),
      duration_seconds: 67,
      disposition:      'callback_scheduled',
      notes:            'Seller engaged. Floor 175K. Callback tomorrow afternoon.',
    })
    console.log(`   Disposition: callback_scheduled`)
    if (callEnd.lead_rescored) {
      console.log(`   Lead rescored: new=${callEnd.new_priority_score} (${callEnd.new_score_band})`)
    }

    // ─── Step 6 — Create webhook subscription ──────────────────────────────
    // The cron worker fans deliveries to the subscription URL every minute.
    // For a real partner deployment, this URL is your public webhook endpoint.
    // For this demo we use webhook.site (a free disposable URL service) so
    // local-only runs can still see the signed delivery without ngrok setup.
    console.log('\n[6/9] Creating webhook subscription...')
    const webhookId = randomUUID()
    const webhookUrl =
      process.env.WEBHOOK_PUBLIC_URL ?? `https://webhook.site/${webhookId}`
    const sub = await client.createWebhookSubscription({
      url:           webhookUrl,
      event_types:   ['lead.score_changed'],
      description:   'brain-api-quickstart demo subscription',
    })
    subscriptionId = sub.id
    console.log(`   Subscription ID: ${sub.id}`)
    console.log(`   URL: ${sub.url}`)
    console.log(`   Signing secret: ${sub.signing_secret.slice(0, 14)}... (saved in memory for HMAC verification)`)

    // Optional: also start a local listener if you have ngrok or similar
    // public-tunneling. Skipped by default to keep the quickstart zero-deps.
    if (process.env.WEBHOOK_PUBLIC_URL) {
      listener = startWebhookListener({
        port:          port,
        signingSecret: sub.signing_secret,
        onEvent: (event, hdrs) => {
          console.log(`\n[8/9] Webhook received via local listener:`)
          console.log(`   X-Revmachina-Event: ${hdrs.eventType}`)
          console.log(`   X-Revmachina-Delivery-Id: ${hdrs.deliveryId}`)
          console.log(`   HMAC verification: ✓ valid`)
          console.log(`   Payload: ${JSON.stringify(event.data ?? {}).slice(0, 200)}`)
        },
      })
      console.log(`   Local listener bound on http://localhost:${port}/webhook`)
    } else {
      console.log(`   (Inspect deliveries at ${webhookUrl.replace(/^https:\/\//, 'https://')}, or set WEBHOOK_PUBLIC_URL + ngrok to verify HMAC locally.)`)
    }

    // ─── Step 7 — Trigger sandbox demo event ───────────────────────────────
    console.log('\n[7/9] Triggering sandbox demo event (lead.score_changed)...')
    const trig = await client.triggerSandboxEvent({
      lead_id:    SANDBOX_LEAD_ID,
      event_type: 'lead.score_changed',
    })
    console.log(`   ${trig.message}`)
    console.log(`   Delivery estimate: ${trig.delivery_estimate}`)
    console.log(`   Active subscriptions in sandbox tenant: ${trig.subscription_count}`)

    // ─── Step 8 — Reminder about webhook delivery ──────────────────────────
    console.log('\n[8/9] Webhook delivery is queued.')
    console.log('   The Vercel cron worker fires every minute. Within ~60s, your subscription URL')
    console.log(`   (${webhookUrl}) will receive a POST with:`)
    console.log('     Headers:  X-Revmachina-Event, X-Revmachina-Delivery-Id, X-Revmachina-Signature')
    console.log('     Payload:  { event_type: "lead.score_changed", data: { old_band, new_band, ... } }')
    console.log('   Verify the signature header per the verifyWebhookSignature() helper in client.ts.')

    // ─── Step 9 — Cleanup ──────────────────────────────────────────────────
    console.log('\n[9/9] Cleanup: deleting subscription so this demo is repeatable...')
    if (subscriptionId) {
      await client.deleteWebhookSubscription(subscriptionId)
      console.log('   Subscription deleted.')
      subscriptionId = null
    }

    console.log('\n✓ Integration verified. You\'re ready to build.')
    console.log('  Next: clone the patterns, point at your tenant, request production keys at revmachina.ai@gmail.com.')
  } catch (err) {
    if (err instanceof BrainApiError) {
      console.error(`\n✗ Brain API error ${err.status}:`, err.message)
      console.error('  Envelope:', JSON.stringify(err.envelope))
    } else {
      console.error('\n✗ Unexpected error:', err)
    }
    process.exitCode = 1
  } finally {
    if (subscriptionId) {
      try { await new BrainApiClient({ apiKey: apiKey! }).deleteWebhookSubscription(subscriptionId) } catch { /* noop */ }
    }
    if (listener) {
      await listener.close()
    }
  }
}

main()
