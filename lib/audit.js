// Audit engine: runs the full AI visibility audit for one business.
// Combines Google Business Profile signals with live answers from whichever
// AI engines are configured, then produces a score, findings and a fix plan.

import { lookupBusiness } from './gbp.js';
import { availableEngines, buildQueries, mentionsBusiness, excerptFor, extractRecommendedNames } from './engines.js';

// Same weighting as the on-page instant check, so the two scores agree.
export function calcGbpScore(you, competitors) {
  let score = 0;
  const avg = (key) => competitors.length
    ? competitors.reduce((s, c) => s + (c[key] || 0), 0) / competitors.length
    : (you[key] || 0);
  const avgReviews = avg('reviewCount');
  const avgPhotos  = avg('photoCount');
  const avgRating  = competitors.length
    ? competitors.reduce((s, c) => s + (c.rating || 4.0), 0) / competitors.length
    : (you.rating || 4.0);

  const rr = avgReviews > 0 ? you.reviewCount / avgReviews : 1;
  score += rr >= 1 ? 35 : rr >= 0.75 ? 25 : rr >= 0.5 ? 15 : rr >= 0.25 ? 8 : 0;
  if (you.rating) {
    const rd = you.rating - avgRating;
    score += rd >= 0 ? 30 : rd >= -0.2 ? 22 : rd >= -0.5 ? 12 : 5;
  } else { score += 5; }
  const pr = avgPhotos > 0 ? you.photoCount / avgPhotos : 1;
  score += pr >= 1 ? 20 : pr >= 0.75 ? 14 : pr >= 0.5 ? 8 : 2;
  if (you.hasWebsite) score += 15;
  return Math.min(100, score);
}

export function gradeInfo(score) {
  if (score >= 85) return { grade: 'A', label: 'Strong',   color: '#1F6F5C' };
  if (score >= 70) return { grade: 'B', label: 'Good',     color: '#4A7C59' };
  if (score >= 55) return { grade: 'C', label: 'Average',  color: '#9A6B1E' };
  if (score >= 40) return { grade: 'D', label: 'Weak',     color: '#B85C38' };
  return             { grade: 'F', label: 'Critical', color: '#A13B2E' };
}

export function canAutoAudit(env) {
  return availableEngines(env).length > 0;
}

// Runs the whole audit. Never throws — engine or Places failures degrade to
// partial results with `errors` recorded, so a report can always be produced.
export async function runAudit(lead, env) {
  const { bizName, trade, area } = lead;
  const startedAt = new Date().toISOString();
  const errors = [];

  // 1. Google Business Profile snapshot
  let gbp = { found: false };
  if (env.GOOGLE_PLACES_API_KEY) {
    try {
      gbp = await lookupBusiness({ bizName, trade, area }, env.GOOGLE_PLACES_API_KEY);
    } catch (err) {
      errors.push(`places: ${err.message}`);
    }
  }

  // 2. Live AI engine checks — every engine × every query, in parallel
  const engines = availableEngines(env);
  const queries = buildQueries(trade, area);
  const checks = [];

  const settled = await Promise.allSettled(
    engines.flatMap(engine => queries.map(async (q) => {
      const answer = await engine.ask(q.text);
      return { engine, q, answer };
    }))
  );

  for (const s of settled) {
    if (s.status === 'fulfilled') {
      const { engine, q, answer } = s.value;
      checks.push({
        engine: engine.key,
        engineLabel: engine.label,
        queryId: q.id,
        queryText: q.text,
        answered: true,
        mentioned: mentionsBusiness(answer, bizName),
        excerpt: excerptFor(answer, bizName),
        answer,
      });
    } else {
      errors.push(`engine: ${String(s.reason?.message || s.reason).slice(0, 200)}`);
    }
  }

  // 3. Who IS getting recommended
  let recommendedNames = [];
  if (checks.length) {
    recommendedNames = (await extractRecommendedNames(env, checks.map(c => c.answer)))
      .filter(n => !mentionsBusiness(n, bizName));
  }

  // 4. Scores
  const answered = checks.filter(c => c.answered);
  const mentions = answered.filter(c => c.mentioned).length;
  const mentionRate = answered.length ? mentions / answered.length : null;
  const gbpScore = gbp.found ? calcGbpScore(gbp.you, gbp.competitors || []) : 0;
  const score = mentionRate === null
    ? gbpScore
    : Math.round(60 * mentionRate + 0.4 * gbpScore);

  const audit = {
    version: 1,
    createdAt: startedAt,
    business: { bizName, trade, area },
    contact: lead.contact ? { value: lead.contact, method: lead.contactMethod || null } : null,
    gbp,
    gbpScore,
    checks: checks.map(({ answer, ...rest }) => rest), // full answers stay out of the stored report
    enginesChecked: engines.map(e => e.label),
    mentions,
    totalChecks: answered.length,
    mentionRate,
    recommendedNames,
    score,
    grade: gradeInfo(score).grade,
    errors,
  };

  audit.findings = buildFindings(audit);
  audit.fixPlan  = buildFixPlan(audit);
  return audit;
}

function buildFindings(a) {
  const f = [];
  const { gbp } = a;

  if (a.totalChecks > 0) {
    if (a.mentions === 0) {
      f.push({
        severity: 'critical',
        title: 'Invisible to AI engines',
        detail: `We asked ${a.enginesChecked.join(', ')} ${a.totalChecks} real customer questions about a ${a.business.trade.toLowerCase()} in ${a.business.area}. ${a.business.bizName} was not mentioned once. Every one of those customers would have been sent to a competitor.`,
      });
    } else if (a.mentions < a.totalChecks) {
      const missing = [...new Set(a.checks.filter(c => c.answered && !c.mentioned).map(c => c.engineLabel))];
      f.push({
        severity: 'high',
        title: 'Patchy AI visibility',
        detail: `Mentioned in ${a.mentions} of ${a.totalChecks} checks. Gaps on: ${missing.join(', ')}. Inconsistent signals mean AI engines only recommend you when the question is phrased a certain way.`,
      });
    } else {
      f.push({
        severity: 'good',
        title: 'AI engines are recommending you',
        detail: `Mentioned in all ${a.totalChecks} checks across ${a.enginesChecked.join(', ')}. The job now is defending that position — these answers shift as competitors improve their signals.`,
      });
    }
  }

  if (a.recommendedNames.length) {
    f.push({
      severity: 'high',
      title: 'Who AI recommends instead',
      detail: `Businesses named in the answers: ${a.recommendedNames.slice(0, 5).join(', ')}. These are the profiles winning the signals comparison below.`,
    });
  }

  if (!gbp.found) {
    f.push({
      severity: 'critical',
      title: 'Google Business Profile not found',
      detail: 'We could not match a Google Business Profile to this name and area. AI engines lean on this profile more than any other source — without it there is nothing for them to read.',
    });
    return f;
  }

  const you = gbp.you;
  const comp = gbp.competitors || [];
  const avgR = comp.length ? comp.reduce((s, c) => s + c.reviewCount, 0) / comp.length : you.reviewCount;
  const avgP = comp.length ? comp.reduce((s, c) => s + c.photoCount, 0) / comp.length : you.photoCount;
  const avgStar = comp.length ? comp.reduce((s, c) => s + (c.rating || 4), 0) / comp.length : (you.rating || 4);

  if (you.reviewCount < avgR) {
    f.push({
      severity: 'high',
      title: 'Review count below local competitors',
      detail: `You have ${you.reviewCount} reviews vs a competitor average of ${Math.round(avgR)}. Review volume is the single strongest signal AI engines use to build confidence in a recommendation.`,
    });
  }
  if ((you.rating || 0) < avgStar) {
    f.push({
      severity: 'medium',
      title: 'Star rating trails the local average',
      detail: `Your rating is ${you.rating ? you.rating.toFixed(1) : 'unrated'} vs a local average of ${avgStar.toFixed(1)}.`,
    });
  }
  if (you.photoCount < avgP) {
    f.push({
      severity: 'medium',
      title: 'Photo gallery is thin',
      detail: `${you.photoCount} photos vs a competitor average of ${Math.round(avgP)}. Sparse galleries read as low-activity businesses.`,
    });
  }
  if (!you.hasWebsite) {
    f.push({
      severity: 'high',
      title: 'No website linked on your profile',
      detail: 'AI engines cross-reference your profile with your website. No linked site means no service pages, no structured data, and much lower confidence.',
    });
  }
  return f;
}

function buildFixPlan(a) {
  const plan = [];
  const has = (title) => a.findings.some(f => f.title === title);

  if (has('Google Business Profile not found')) {
    plan.push({ title: 'Claim and complete your Google Business Profile', weeks: 'Week 1', why: 'This is the primary source AI engines read. Full categories, services, hours, service area and description.' });
  }
  if (has('Review count below local competitors') || has('Invisible to AI engines')) {
    plan.push({ title: 'Switch on a review-velocity system', weeks: 'Weeks 1–4', why: 'Automated post-job review requests via SMS/WhatsApp. Closing the review gap is the fastest single lever on AI recommendations.' });
  }
  if (has('Photo gallery is thin')) {
    plan.push({ title: 'Upload 15–20 real photos', weeks: 'Week 1', why: 'Work in progress, results, premises, team. Refresh monthly so the profile reads as active.' });
  }
  if (has('No website linked on your profile')) {
    plan.push({ title: 'Link a website with LocalBusiness structured data', weeks: 'Weeks 2–3', why: 'Even a one-page site with JSON-LD schema (services, area, reviews) gives AI engines machine-readable proof of what you do.' });
  } else {
    plan.push({ title: 'Add LocalBusiness structured data to your website', weeks: 'Week 2', why: 'JSON-LD schema for services, area and reviews — the format AI crawlers parse directly.' });
  }
  plan.push({ title: 'Fix name/address/phone consistency across directories', weeks: 'Weeks 2–4', why: 'Yell, Yelp, Trustpilot, Bing Places, Checkatrade. AI engines cross-check these; inconsistencies lower confidence.' });
  plan.push({ title: 'Monthly AI visibility re-check', weeks: 'Ongoing', why: 'These answers move. Re-run the same customer questions monthly and track mentions vs competitors.' });

  return plan.slice(0, 6);
}

// ── Storage ──────────────────────────────────────────────────────────

const REPORT_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

export async function storeAudit(env, audit) {
  if (!env.AUDITS) return null;
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await env.AUDITS.put(`audit:${id}`, JSON.stringify(audit), { expirationTtl: REPORT_TTL_SECONDS });
  return id;
}

export async function loadAudit(env, id) {
  if (!env.AUDITS || !/^[a-f0-9]{16}$/.test(id)) return null;
  const raw = await env.AUDITS.get(`audit:${id}`);
  return raw ? JSON.parse(raw) : null;
}
