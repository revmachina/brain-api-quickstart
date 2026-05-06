// Revmachina Brain API client + HMAC webhook verifier.
// Reference TypeScript implementation. Lift the patterns; don't depend on the package.

import { createHmac, timingSafeEqual } from 'node:crypto'

export interface BrainApiClientOptions {
  apiKey:   string
  baseUrl?: string
}

const DEFAULT_BASE = 'https://revmachina.ai/api/v1'

export class BrainApiClient {
  private apiKey:  string
  private baseUrl: string

  constructor(opts: BrainApiClientOptions) {
    this.apiKey  = opts.apiKey
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE
  }

  // ─── Reads ─────────────────────────────────────────────────────────────
  async getBrief(leadId: string): Promise<LeadBrief> {
    return this.request('GET', `/leads/${leadId}/brief`)
  }

  // ─── Writes — call lifecycle ───────────────────────────────────────────
  async postCallStarted(leadId: string, body: CallStartedRequest): Promise<CallStartedResponse> {
    return this.request('POST', `/leads/${leadId}/call-started`, body)
  }

  async postCallEnded(leadId: string, body: CallEndedRequest): Promise<CallEndedResponse> {
    return this.request('POST', `/leads/${leadId}/call-ended`, body, { idempotencyKey: body.call_id })
  }

  // ─── Writes — signal injection ─────────────────────────────────────────
  async postSignal(leadId: string, body: SignalRequest): Promise<SignalResponse> {
    return this.request('POST', `/leads/${leadId}/signal`, body)
  }

  // ─── Webhook subscription management ───────────────────────────────────
  async createWebhookSubscription(body: {
    url:           string
    event_types?:  string[]
    description?:  string
  }): Promise<WebhookSubscription & { signing_secret: string }> {
    return this.request('POST', '/webhooks/subscriptions', body)
  }

  async deleteWebhookSubscription(id: string): Promise<void> {
    await this.request('DELETE', `/webhooks/subscriptions/${id}`)
  }

  async triggerSandboxEvent(body: {
    lead_id:    string
    event_type: string
  }): Promise<{ ok: boolean; lead_id: string; event_type: string; delivery_estimate: string; subscription_count: number; message: string }> {
    return this.request('POST', '/webhooks/sandbox/trigger-demo-event', body)
  }

  // ─── Internals ─────────────────────────────────────────────────────────
  private async request<T>(
    method: string,
    path:   string,
    body?:  unknown,
    opts?:  { idempotencyKey?: string },
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    }
    if (opts?.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const env = await res.json().catch(() => ({}))
      throw new BrainApiError(res.status, env)
    }
    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
  }
}

export class BrainApiError extends Error {
  constructor(public status: number, public envelope: unknown) {
    const env = envelope as { error?: { message?: string; code?: string } } | undefined
    super(env?.error?.message ?? `Brain API error ${status}`)
    this.name = 'BrainApiError'
  }
}

// ─── Webhook signature verification (Stripe-pattern) ─────────────────────
//
// Header format: `X-Revmachina-Signature: t=<unix_ts>,v1=<hex_hmac>`
// where hmac = HMAC_SHA256(signing_secret, "${unix_ts}.${request_body}").
//
// Verification:
//   1. Parse t and v1 from the header.
//   2. Reject deliveries older than `toleranceSec` (default 300s = 5 min) — replay protection.
//   3. Recompute HMAC over the SAME concatenation; constant-time compare.
export function verifyWebhookSignature(opts: {
  signingSecret:    string
  payload:          string
  signatureHeader:  string
  toleranceSec?:    number
}): boolean {
  const tolerance = opts.toleranceSec ?? 300
  const parts = Object.fromEntries(
    opts.signatureHeader.split(',').map((p) => {
      const eq = p.indexOf('=')
      return [p.slice(0, eq), p.slice(eq + 1)] as [string, string]
    }),
  )
  const ts = parseInt(parts.t ?? '', 10)
  const v1 = parts.v1 ?? ''
  if (!ts || !v1) return false
  if (Math.abs(Date.now() / 1000 - ts) > tolerance) return false

  const expected = createHmac('sha256', opts.signingSecret)
    .update(`${ts}.${opts.payload}`)
    .digest('hex')

  if (expected.length !== v1.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1))
}

// ─── Type definitions ────────────────────────────────────────────────────
// Minimal subset of the Brain API response shapes — full schema at
// https://revmachina.ai/openapi.yaml. Extended-beta fields are tolerated
// via the [k: string]: unknown index signature on LeadBrief.

export interface LeadBrief {
  lead_id:      string
  tenant_id:    string
  generated_at: string
  seller: {
    name:                       string | null
    phone:                      string | null
    property_address:           string | null
    score:                      number
    score_band:                 'hot' | 'warm' | 'potential' | 'cold' | 'dead'
    must_sell:                  boolean
    motivation_classification:  string | null
    days_since_last_contact:    number
  }
  intelligence: {
    motivation_summary: string
    deal_brief:         string | null
    top_signals:        string[]
    objection_flags:    string[]
    has_offer:          boolean
    deal_stage:         string | null
  }
  coaching: {
    opening_recommendation: string
    close_path:             string | null
    say_this_first:         string | null
    call_framing:           string | null
    the_one_lever:          string | null
    warnings:               string[]
    objection_playbook: Array<{
      objection_key:        string
      objection_category:   string
      match_keywords:       string[]
      recommended_response: string
      win_rate:             number | null
      sample_size:          number | null
    }>
  }
  memory:           Record<string, unknown>
  next_best_action: { action: string; urgency: string; reason: string | null }
  owner:            Record<string, unknown> | null
  [k: string]:      unknown // Extended-beta fields (badge_card, closer_brief, etc.)
}

export interface CallStartedRequest {
  agent_type: 'ai_voice' | 'ai_sms' | 'ai_email' | 'human_rep'
  agent_id:   string
  channel:    'outbound_call' | 'inbound_call' | 'outbound_sms' | 'outbound_email'
  dial_id:    string
  started_at: string
}
export interface CallStartedResponse {
  call_id:         string
  coaching_config: Record<string, unknown>
}

export interface CallEndedRequest {
  call_id:          string
  ended_at:         string
  duration_seconds: number
  disposition:      string
  transcript?:      string
  notes?:           string
}
export interface CallEndedResponse {
  call_id:           string
  processed:         boolean
  lead_rescored:     boolean
  new_priority_score?: number
  new_score_band?:   string
}

export interface SignalRequest {
  signal_type:    string
  channel?:       string
  content?:       string
  occurred_at:    string
  source_system?: string
}
export interface SignalResponse {
  signal_id:           string
  processed:           boolean
  lead_rescored:       boolean
  new_priority_score?: number
  new_score_band?:     string
}

export interface WebhookSubscription {
  id:                    string
  url:                   string
  event_types:           string[]
  signing_secret_prefix: string
  active:                boolean
  created_at:            string
}
