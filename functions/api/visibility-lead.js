// Cloudflare Pages Function: POST /api/visibility-lead
//
// 1. Forwards the lead to Make immediately (event: "lead") — same as before.
// 2. If AI engine keys are configured, runs the full visibility audit in the
//    background and posts a second webhook event (event: "audit-ready") with
//    the report link, so the operator can review and forward it to the lead.
//
// Env vars: MAKE_WEBHOOK_URL, plus (optional, enables auto-audit)
// OPENAI_API_KEY / GEMINI_API_KEY / PERPLEXITY_API_KEY, GOOGLE_PLACES_API_KEY,
// and the AUDITS KV binding for stored reports.

import { runAudit, storeAudit, canAutoAudit } from '../../lib/audit.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const DEDUPE_TTL_SECONDS = 60 * 60 * 24; // one auto-audit per business per day

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid body' }, 400);
  }

  const webhookUrl = env.MAKE_WEBHOOK_URL;
  const origin = new URL(request.url).origin;

  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source:     'ai-visibility-check',
          event:      'lead',
          receivedAt: new Date().toISOString(),
          ...body,
        }),
      });
    } catch (err) {
      // Webhook failure must not block the confirmation UX
      console.error('Webhook error:', err);
    }
  }

  // Kick off the automated audit after responding — the lead sees the
  // confirmation instantly; the operator gets the finished report via webhook.
  if (canAutoAudit(env) && body.bizName && body.trade && body.area) {
    context.waitUntil(runAuditInBackground(env, body, origin, webhookUrl));
  }

  return json({ success: true });
}

async function runAuditInBackground(env, lead, origin, webhookUrl) {
  try {
    if (await isDuplicate(env, lead)) return;

    const audit = await runAudit(lead, env);
    const id = await storeAudit(env, audit);

    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source:      'ai-visibility-check',
          event:       'audit-ready',
          receivedAt:  new Date().toISOString(),
          bizName:     lead.bizName,
          trade:       lead.trade,
          area:        lead.area,
          contact:     lead.contact,
          contactMethod: lead.contactMethod,
          reportUrl:   id ? `${origin}/report/${id}` : null,
          score:       audit.score,
          grade:       audit.grade,
          mentions:    audit.mentions,
          totalChecks: audit.totalChecks,
          recommendedNames: audit.recommendedNames,
          topFinding:  audit.findings[0]?.title || null,
          errors:      audit.errors,
        }),
      });
    }
  } catch (err) {
    console.error('Background audit error:', err);
  }
}

async function isDuplicate(env, lead) {
  if (!env.AUDITS) return false;
  const key = 'dedupe:' + encodeURIComponent(`${lead.bizName}|${lead.area}`.toLowerCase());
  if (await env.AUDITS.get(key)) return true;
  await env.AUDITS.put(key, '1', { expirationTtl: DEDUPE_TTL_SECONDS });
  return false;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
