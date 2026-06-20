// Cloudflare Pages Function: POST /api/visibility-lead
// Env vars required: MAKE_WEBHOOK_URL

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

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid body' }, 400);
  }

  const webhookUrl = env.MAKE_WEBHOOK_URL;

  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source:     'ai-visibility-check',
          receivedAt: new Date().toISOString(),
          ...body,
        }),
      });
    } catch (err) {
      // Webhook failure must not block the confirmation UX
      console.error('Webhook error:', err);
    }
  }

  return json({ success: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
