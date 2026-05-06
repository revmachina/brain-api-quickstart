// Express webhook listener with HMAC verification.
// Binds to a port, exposes POST /webhook, verifies the X-Revmachina-Signature
// header against the subscription's signing secret, then invokes the caller's
// onEvent handler.

import express from 'express'
import type { Request, Response } from 'express'
import { verifyWebhookSignature } from './client.js'

export interface WebhookEvent {
  event_id:    string
  event_type:  string
  tenant_id:   string
  lead_id:     string | null
  occurred_at: string
  data:        Record<string, unknown>
}

export function startWebhookListener(opts: {
  port:           number
  signingSecret:  string
  onEvent:        (event: WebhookEvent, headers: { deliveryId: string; eventType: string }) => void
}): { close: () => Promise<void> } {
  const app = express()
  // RAW body required so we can verify HMAC over the exact bytes the server signed.
  app.use(express.raw({ type: 'application/json' }))

  app.post('/webhook', (req: Request, res: Response) => {
    const sigHeader  = String(req.header('X-Revmachina-Signature') ?? '')
    const eventType  = String(req.header('X-Revmachina-Event') ?? '')
    const deliveryId = String(req.header('X-Revmachina-Delivery-Id') ?? '')
    const payload    = (req.body as Buffer).toString('utf-8')

    const valid = verifyWebhookSignature({
      signingSecret:   opts.signingSecret,
      payload,
      signatureHeader: sigHeader,
    })
    if (!valid) {
      console.error(`  [webhook] HMAC verification FAILED — rejecting delivery ${deliveryId}`)
      return res.status(401).send('invalid signature')
    }

    let event: WebhookEvent
    try {
      event = JSON.parse(payload) as WebhookEvent
    } catch {
      return res.status(400).send('invalid json')
    }

    opts.onEvent(event, { deliveryId, eventType })
    res.status(200).send('ok')
  })

  const server = app.listen(opts.port)
  return {
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      }),
  }
}
