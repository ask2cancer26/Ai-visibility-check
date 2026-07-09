# AI Visibility Audit — Product Scope

**One-liner:** "Is your business recommended when people ask ChatGPT for a plumber near them?" A brand-new fear, no incumbent vendors. The audit is a free door-opener; the money is the monthly retainer to fix and defend the result.

---

## 1. Offer ladder

| Rung | Offer | Price | Purpose |
|---|---|---|---|
| 1 | **Instant check** (existing page) | Free | 15-second GBP-vs-competitors score. Captures the lead. |
| 2 | **Full AI Visibility Audit** | Free (positioned as "£99 value") | Automated ChatGPT/Gemini/Perplexity check + branded report, human-reviewed and delivered by WhatsApp/email within 60 min. The door-opener. |
| 3 | **AI Visibility Retainer** | **£199/mo** (core), £149/mo lite, £349/mo pro | The product. See deliverables below. Month-to-month, no contract — reduces sale friction. |
| 4 | **AI Receptionist** (pairing with product #1) | £149–£299/mo add-on | Upsell once trust is established: "AI now recommends you — make sure a missed call doesn't waste it." |

**Retainer deliverables (core, £199/mo):**
- Review-velocity system: automated post-job review requests (SMS/WhatsApp), response templates
- GBP management: photos, posts, categories, Q&A, service listings
- LocalBusiness structured data (JSON-LD) on their website
- Directory/citation consistency (Yell, Yelp, Trustpilot, Bing Places, Checkatrade)
- **Monthly AI visibility re-audit** — the same branded report, showing movement. This is the retention engine: the report *is* the proof of work.

Lite (£149) drops citations + posts; Pro (£349) adds a landing page/service pages and review responding done-for-you.

## 2. Funnel

```
Ad / door-knock / referral
  → /ai-visibility-check (instant GBP score — the hook)
  → lead captured (WhatsApp preferred; higher reply rate than email)
  → automated audit runs in background (~60–90s)
  → operator gets Make webhook with report link + summary
  → operator reviews, adds 2 personal lines, forwards link via WhatsApp
  → "want this fixed?" → 15-min call → retainer
```

**Why keep the human forward step:** the page promises "verified by a person, not just a script" — that's a differentiator, keep it honest. It also forces a personal touch on every delivery, which is what converts. Fulfillment cost drops from ~30 min/lead (manual checking) to ~2 min/lead (review + forward).

**Prospecting mode:** `/api/run-audit` lets you generate a report *before* contact. Walk into a garage with their own F-grade report printed out. Highest-converting cold opener available.

## 3. Unit economics (assumptions to validate)

- Audit cost: ~9 LLM calls on cheap search models + 3 Places calls ≈ **£0.03–£0.08 per audit**
- Instant-check → lead capture: assume 25–40% (page is well-optimized)
- Lead → call booked: target 20% (WhatsApp delivery of a personal report)
- Call → retainer: target 30%
- → roughly **1 retainer per 40–70 instant checks**. At £199/mo and ~12-month average retention, one customer ≈ £2,400 LTV vs pennies of COGS. Ad spend is the real CAC; door-knocking/local Facebook groups are near-zero-CAC channels to start.

## 4. KPIs

Track in Plausible (already wired) + Make/sheet:
1. Instant checks started / completed
2. Lead capture rate (`LeadCaptured` event exists)
3. Audit-ready → report forwarded time (SLA: 60 min business hours)
4. Report link opens (report views can be seen in Cloudflare analytics)
5. Calls booked, retainers signed, monthly churn

## 5. What's built (Phase 0 — this repo)

- Free instant check (landing page + `/api/gbp-check`)
- **Audit engine** (`lib/audit.js`): live queries to ChatGPT/Gemini/Perplexity (search-enabled models), mention detection, competitor extraction, combined score (60% AI mentions, 40% GBP signals), rule-based findings + 30-day fix plan
- **Branded report** at `/report/:id` (Cloudflare KV, 90-day expiry, noindex)
- **Auto-audit on lead capture**: background run + `audit-ready` webhook event to Make with report link
- **Operator endpoint** `/api/run-audit` (token-protected) for prospecting/re-runs
- Graceful degradation: with no engine keys configured, everything behaves exactly as before (manual fulfillment)

## 6. Roadmap

**Phase 1 — sell it (weeks 1–4).** No more code needed to start selling. Configure keys, set up the Make scenario (audit-ready → WhatsApp notification to operator), write the 3-message WhatsApp delivery script, print-run 20 prospect audits, do the calls. Validate pricing before building more.

**Phase 2 — retention engine (when ~5 retainers).**
- Monthly re-audit cron (Cloudflare Cron Trigger) for retainer clients, with before/after deltas in the report ("mentions: 1/9 → 6/9")
- Simple client list in KV; email/WhatsApp the monthly report automatically
- Report "compare" view: this month vs last month

**Phase 3 — scale (when ~15 retainers).**
- White-label reports for agencies (multiplier channel: agencies buy audits at £25/ea, resell at £99+)
- Self-serve paid instant deep audit (£29–£49, Stripe) as a second monetization of non-retainer traffic
- AI receptionist cross-sell flow inside the report CTA

## 7. Open decisions (owner's call, defaults chosen)

1. **Retainer price:** defaulted to £199/mo core. Test £249 once close rate >25%.
2. **Audit price:** defaulted to free ("£99 value" framing). If lead volume overwhelms fulfillment, gate with £29 fully-refunded-against-retainer.
3. **Engines:** OpenAI + Gemini + Perplexity. Perplexity's `sonar` is the cheapest and most search-native — if you configure only one key to start, make it Perplexity, and add OpenAI next (ChatGPT is the name that sells).
