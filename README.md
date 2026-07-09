# AI Visibility Check — Spurwise

Lead-gen funnel + productized AI visibility audit for local businesses.
"Would ChatGPT recommend you, or your competitor?"

Runs on **Cloudflare Pages** (static page + Pages Functions). Product/pricing scope: [docs/PRODUCT_SCOPE.md](docs/PRODUCT_SCOPE.md).

## How it works

```
index.html                     Landing page: instant Google-profile check → lead capture
functions/api/gbp-check.js     POST /api/gbp-check    — live GBP vs 2 local competitors
functions/api/visibility-lead.js POST /api/visibility-lead — lead → Make webhook,
                               then runs the full AI audit in the background and
                               posts an "audit-ready" event with the report link
functions/api/run-audit.js     POST /api/run-audit    — operator-only on-demand audit
functions/report/[id].js       GET  /report/:id       — branded shareable audit report
lib/                           Shared: Places lookup, AI engine callers, audit engine, report HTML
```

The audit asks ChatGPT, Gemini and Perplexity (search-enabled models) real customer questions ("best garage in Welling — who should I call?"), detects whether the business is mentioned, extracts who *is* recommended, merges Google profile signals, and produces a scored report with findings and a 30-day fix plan.

## Configuration (Cloudflare Pages → Settings)

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | yes | Instant check + audit GBP data |
| `MAKE_WEBHOOK_URL` | yes | Lead + audit-ready events to Make.com |
| `OPENAI_API_KEY` | any one of these three enables auto-audits | "ChatGPT" checks (default model `gpt-4o-mini-search-preview`) |
| `GEMINI_API_KEY` | ↑ | Gemini checks with Google Search grounding (`gemini-2.5-flash`) |
| `PERPLEXITY_API_KEY` | ↑ | Perplexity checks (`sonar`) — cheapest, most search-native |
| `AUDIT_ADMIN_TOKEN` | for /api/run-audit | Long random string; `Authorization: Bearer <token>` |
| `OPENAI_MODEL` / `GEMINI_MODEL` / `PERPLEXITY_MODEL` | no | Override default models |
| `REPORT_CTA_URL` | no | Booking link on the report CTA (default spurwise.co.uk) |

### KV binding

Create a KV namespace and bind it as **`AUDITS`** (Pages → Settings → Bindings). Stores reports (90-day expiry) and per-business audit dedupe (24 h). Without it, audits still run and the summary still reaches Make — there's just no stored report link.

**With none of the AI keys configured, the site behaves exactly as before** (instant check + lead webhook, manual fulfillment).

## Webhook events (Make.com)

Both events POST to `MAKE_WEBHOOK_URL` with a `source: "ai-visibility-check"` field:

- `event: "lead"` — immediately on capture: `bizName, trade, area, score, grade, contact, contactMethod, gdprConsent, timestamp`
- `event: "audit-ready"` — ~60–90 s later: everything above plus `reportUrl, mentions, totalChecks, recommendedNames, topFinding, errors`

Suggested Make scenario: on `audit-ready`, notify the operator (WhatsApp/Slack/email) with the report link → operator reviews and forwards to the lead with a personal message.

## Operator: run an audit on demand

```bash
curl -X POST https://<your-site>/api/run-audit \
  -H "Authorization: Bearer $AUDIT_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bizName":"Morgan Richards Garage","trade":"Garage / MOT","area":"Welling"}'
# → { "id": "…", "reportUrl": "https://…/report/…", "score": 42, "grade": "D", … }
```

Trade must be one of the values in the landing-page dropdown (see `lib/gbp.js` / `lib/engines.js` maps); unknown trades fall back to sensible defaults.

## Local development

```bash
npx wrangler pages dev . --kv AUDITS
```

Put secrets in `.dev.vars` (gitignored):

```
GOOGLE_PLACES_API_KEY=...
MAKE_WEBHOOK_URL=...
PERPLEXITY_API_KEY=...
AUDIT_ADMIN_TOKEN=dev-token
```

## Cost guardrails

Each audit = up to 3 queries × 3 engines on cheap models + 1 extraction call + 3 Places calls (≈ £0.03–£0.08). Auto-audits are deduped per business+area per 24 h via KV. `/api/run-audit` is token-gated.
