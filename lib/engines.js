// AI engine callers for the visibility audit.
// Each engine is enabled by the presence of its API key in env:
//   OPENAI_API_KEY      → "ChatGPT"    (default model: gpt-4o-mini-search-preview)
//   GEMINI_API_KEY      → "Gemini"     (default model: gemini-2.5-flash, Google Search grounding)
//   PERPLEXITY_API_KEY  → "Perplexity" (default model: sonar)
// Search-enabled models matter: they answer the way the consumer product does,
// instead of guessing local businesses from training data.

const FETCH_TIMEOUT_MS = 25000;

// Consumer-style noun for each trade, used to phrase queries the way a real
// customer would ask an assistant.
const QUERY_NOUN = {
  'Garage / MOT':          'garage for an MOT',
  'Hair & beauty salon':   'hair salon',
  'Aesthetics clinic':     'aesthetics clinic',
  'Dental practice':       'dentist',
  'Plumber / electrician': 'plumber',
  'Restaurant / café':     'restaurant',
  'Letting agent':         'letting agent',
  'Accountant':            'accountant',
  'Solicitor':             'solicitor',
  'Physiotherapist':       'physiotherapist',
  'Personal trainer':      'personal trainer',
  'Cleaning company':      'cleaning company',
  'Locksmith':             'locksmith',
  'Landscaper / gardener': 'landscaper',
  'Pest control':          'pest control company',
  'Other':                 'local business',
};

export function buildQueries(trade, area) {
  const noun = QUERY_NOUN[trade] || trade.split('/')[0].trim().toLowerCase();
  return [
    { id: 'best',      text: `What is the best ${noun} in ${area}, UK? Give me specific business names.` },
    { id: 'recommend', text: `Can you recommend a reliable ${noun} near ${area}, UK? I want to book this week.` },
    { id: 'shortlist', text: `I'm in ${area}, UK and need a ${noun}. Give me a shortlist of who to call, with names.` },
  ];
}

export function availableEngines(env) {
  const engines = [];
  if (env.OPENAI_API_KEY)     engines.push({ key: 'chatgpt',    label: 'ChatGPT',    ask: (p) => askOpenAI(env, p) });
  if (env.GEMINI_API_KEY)     engines.push({ key: 'gemini',     label: 'Gemini',     ask: (p) => askGemini(env, p) });
  if (env.PERPLEXITY_API_KEY) engines.push({ key: 'perplexity', label: 'Perplexity', ask: (p) => askPerplexity(env, p) });
  return engines;
}

async function askOpenAI(env, prompt) {
  const model = env.OPENAI_MODEL || 'gpt-4o-mini-search-preview';
  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 600,
  };
  if (model.includes('search')) body.web_search_options = {};

  try {
    return await openAICompatible('https://api.openai.com/v1/chat/completions', env.OPENAI_API_KEY, body);
  } catch (err) {
    // Search-preview models come and go; fall back to the plain mini model.
    if (model !== 'gpt-4o-mini' && model.includes('search')) {
      return openAICompatible('https://api.openai.com/v1/chat/completions', env.OPENAI_API_KEY, {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
      });
    }
    throw err;
  }
}

async function askPerplexity(env, prompt) {
  return openAICompatible('https://api.perplexity.ai/chat/completions', env.PERPLEXITY_API_KEY, {
    model: env.PERPLEXITY_MODEL || 'sonar',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 600,
  });
}

async function openAICompatible(url, apiKey, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function askGemini(env, prompt) {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 800 },
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }
  );
  if (!res.ok) throw new Error(`Gemini → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
}

// ── Mention detection ────────────────────────────────────────────────

const NAME_SUFFIXES = /\b(ltd|limited|llp|plc|uk|co|company|&\s*co|&\s*sons?)\b/g;
const STOPWORDS = new Set(['the', 'and', 'of', 'a', 'an', 'in', 'at', 'for']);

function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(NAME_SUFFIXES, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mentionsBusiness(text, bizName) {
  if (!text) return false;
  const haystack = ` ${normalize(text)} `;
  const needle = normalize(bizName);
  if (!needle) return false;
  if (haystack.includes(` ${needle} `)) return true;

  // Fallback for reworded names ("Morgan Richards Garage" → "Morgan Richards"):
  // all distinctive tokens of the name must appear somewhere in the answer.
  const tokens = needle.split(' ').filter(t => t.length > 2 && !STOPWORDS.has(t));
  if (tokens.length >= 2) {
    return tokens.every(t => haystack.includes(` ${t} `));
  }
  return false;
}

// Pulls a short quote around the mention (or the opening of the answer).
export function excerptFor(text, bizName, maxLen = 260) {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  const sentences = clean.split(/(?<=[.!?])\s+/);
  const hit = sentences.find(s => mentionsBusiness(s, bizName));
  const chosen = hit || clean;
  return chosen.length > maxLen ? chosen.slice(0, maxLen).trimEnd() + '…' : chosen;
}

// One cheap structured call to list which businesses the engines recommended.
// Uses whichever engine is configured. Returns [] on any failure — this is
// enrichment, never a blocker.
export async function extractRecommendedNames(env, answers) {
  const joined = answers.filter(Boolean).join('\n---\n').slice(0, 12000);
  if (!joined) return [];
  const prompt =
    'Below are answers from AI assistants recommending local businesses. ' +
    'List the distinct business names that are recommended, most prominent first. ' +
    'Reply with ONLY a JSON array of strings, no other text.\n\n' + joined;

  try {
    let raw = '';
    if (env.OPENAI_API_KEY) {
      raw = await openAICompatible('https://api.openai.com/v1/chat/completions', env.OPENAI_API_KEY, {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0,
      });
    } else if (env.GEMINI_API_KEY) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL || 'gemini-2.5-flash'}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 300 } }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        }
      );
      const data = res.ok ? await res.json() : {};
      raw = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    } else if (env.PERPLEXITY_API_KEY) {
      raw = await openAICompatible('https://api.perplexity.ai/chat/completions', env.PERPLEXITY_API_KEY, {
        model: env.PERPLEXITY_MODEL || 'sonar',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
      });
    }
    const match = raw.match(/\[[\s\S]*?\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed.filter(n => typeof n === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}
