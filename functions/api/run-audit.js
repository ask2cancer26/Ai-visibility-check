// Cloudflare Pages Function: POST /api/run-audit
// Operator-only endpoint: run (or re-run) a full audit on demand and get the
// report link back. Useful for prospecting — run an audit before you walk in.
//
//   curl -X POST https://<site>/api/run-audit \
//     -H "Authorization: Bearer $AUDIT_ADMIN_TOKEN" \
//     -H "Content-Type: application/json" \
//     -d '{"bizName":"Morgan Richards Garage","trade":"Garage / MOT","area":"Welling"}'
//
// Env vars required: AUDIT_ADMIN_TOKEN, plus at least one engine key
// (OPENAI_API_KEY / GEMINI_API_KEY / PERPLEXITY_API_KEY) and the AUDITS KV binding.

import { runAudit, storeAudit, canAutoAudit } from '../../lib/audit.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const token = env.AUDIT_ADMIN_TOKEN;
  const auth = request.headers.get('Authorization') || '';
  if (!token || auth !== `Bearer ${token}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { bizName, trade, area } = body;
  if (!bizName || !trade || !area) {
    return json({ error: 'Required: bizName, trade, area' }, 400);
  }
  if (!canAutoAudit(env)) {
    return json({ error: 'No AI engine keys configured (OPENAI_API_KEY / GEMINI_API_KEY / PERPLEXITY_API_KEY)' }, 503);
  }

  const audit = await runAudit(body, env);
  const id = await storeAudit(env, audit);
  const origin = new URL(request.url).origin;

  return json({
    id,
    reportUrl: id ? `${origin}/report/${id}` : null,
    score: audit.score,
    grade: audit.grade,
    mentions: audit.mentions,
    totalChecks: audit.totalChecks,
    recommendedNames: audit.recommendedNames,
    errors: audit.errors,
    note: id ? undefined : 'AUDITS KV binding missing — audit ran but was not stored',
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
