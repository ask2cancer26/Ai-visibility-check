// Cloudflare Pages Function: POST /api/gbp-check
// Env vars required: GOOGLE_PLACES_API_KEY

import { lookupBusiness } from '../../lib/gbp.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

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
  const apiKey = env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    return json({ found: false, error: 'API key not configured' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ found: false, error: 'Invalid request body' }, 400);
  }

  const { bizName, trade, area } = body;
  if (!bizName || !trade || !area) {
    return json({ found: false, error: 'Missing fields' }, 400);
  }

  try {
    return json(await lookupBusiness({ bizName, trade, area }, apiKey));
  } catch (err) {
    console.error('gbp-check error:', err);
    return json({ found: false });
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
