// Cloudflare Pages Function: GET /report/:id
// Serves a stored audit as a branded, shareable report page.
// Requires KV binding: AUDITS

import { loadAudit } from '../../lib/audit.js';
import { renderReport, renderNotFound } from '../../lib/report-html.js';

export async function onRequestGet(context) {
  const { params, env } = context;
  const audit = await loadAudit(env, params.id);

  if (!audit) {
    return new Response(renderNotFound(), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return new Response(renderReport(audit, params.id, env), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
