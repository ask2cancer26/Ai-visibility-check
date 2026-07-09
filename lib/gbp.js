// Google Places lookups — shared by /api/gbp-check and the audit engine.
// Requires env.GOOGLE_PLACES_API_KEY.

export const TRADE_KEYWORDS = {
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

// Looks up the business and two same-trade competitors.
// Returns { found:false } or { found:true, you, competitors }.
export async function lookupBusiness({ bizName, trade, area }, apiKey) {
  const searchQ = encodeURIComponent(`${bizName} ${area}`);
  const searchData = await gfetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${searchQ}&key=${apiKey}`
  );

  if (!searchData.results || searchData.results.length === 0) {
    return { found: false };
  }

  const mainResult = searchData.results[0];

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

  return { found: true, you, competitors };
}

async function gfetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Places API error: ${res.status}`);
  return res.json();
}
