// Cloudflare Pages Function: POST /api/gbp-check
// Env vars required: GOOGLE_PLACES_API_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const TRADE_KEYWORDS = {
  'Garage / MOT':          'garage MOT',
  'Hair & beauty salon':   'hair salon beauty',
  'Aesthetics clinic':     'aesthetics clinic',
  'Dental practice':       'dentist dental',
  'Plumber / electrician': 'plumber electrician',
  'Restaurant / café':     'restaurant cafe',
  'Letting agent':         'estate agent letting',
  'Accountant':            'accountant',
  'Solicitor':             'solicitor law',
  'Physiotherapist':       'physiotherapist physio',
  'Personal trainer':      'personal trainer gym',
  'Cleaning company':      'cleaning company',
  'Locksmith':             'locksmith',
  'Landscaper / gardener': 'landscaper gardener',
  'Pest control':          'pest control',
  'Other':                 'local business',
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
    // Step 1: Find the business
    const searchQ = encodeURIComponent(`${bizName} ${area}`);
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${searchQ}&key=${apiKey}`;
    const searchData = await gfetch(searchUrl);

    if (!searchData.results || searchData.results.length === 0) {
      return json({ found: false });
    }

    const mainResult = searchData.results[0];

    // Step 2: Full details for main business
    const detailsData = await gfetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${mainResult.place_id}&fields=name,rating,user_ratings_total,photos,website&key=${apiKey}`
    );
    const d = detailsData.result || mainResult;

    const you = {
      name:        d.name || mainResult.name,
      rating:      d.rating ?? mainResult.rating ?? null,
      reviewCount: d.user_ratings_total ?? mainResult.user_ratings_total ?? 0,
      photoCount:  (d.photos || mainResult.photos || []).length,
      hasWebsite:  !!(d.website),
    };

    // Step 3: Competitors (same trade, same area)
    const tradeKw  = TRADE_KEYWORDS[trade] || trade.toLowerCase();
    const compQ    = encodeURIComponent(`${tradeKw} ${area}`);
    const compData = await gfetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${compQ}&key=${apiKey}`
    );

    const competitors = (compData.results || [])
      .filter(p => p.place_id !== mainResult.place_id)
      .slice(0, 2)
      .map(p => ({
        name:        p.name,
        rating:      p.rating ?? null,
        reviewCount: p.user_ratings_total ?? 0,
        photoCount:  (p.photos || []).length,
        hasWebsite:  false,
      }));

    return json({ found: true, you, competitors });

  } catch (err) {
    console.error('gbp-check error:', err);
    return json({ found: false });
  }
}

async function gfetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Places API error: ${res.status}`);
  return res.json();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
