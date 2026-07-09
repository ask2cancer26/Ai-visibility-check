// Renders a stored audit as the branded shareable report page.

import { gradeInfo } from './audit.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const SEVERITY = {
  critical: { label: 'Critical', color: '#A13B2E', bg: '#F5EAE7' },
  high:     { label: 'High',     color: '#B85C38', bg: '#F6EFE2' },
  medium:   { label: 'Medium',   color: '#9A6B1E', bg: '#F6EFE2' },
  good:     { label: 'Strength', color: '#1F6F5C', bg: '#EAF2EE' },
};

export function renderReport(audit, id, env = {}) {
  const b = audit.business;
  const gi = gradeInfo(audit.score);
  const notFound = !audit.gbp.found;
  const date = new Date(audit.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const ctaUrl = env.REPORT_CTA_URL || 'https://spurwise.co.uk';

  // Engine × query matrix
  const engineLabels = [...new Set(audit.checks.map(c => c.engineLabel))];
  const queryIds = [...new Set(audit.checks.map(c => c.queryId))];
  const queryTextFor = (qid) => audit.checks.find(c => c.queryId === qid)?.queryText || qid;
  const cellFor = (qid, el) => {
    const c = audit.checks.find(x => x.queryId === qid && x.engineLabel === el);
    if (!c || !c.answered) return '<td class="cell na">—</td>';
    return c.mentioned
      ? '<td class="cell yes">✓ mentioned</td>'
      : '<td class="cell no">✗ not mentioned</td>';
  };

  const matrixHtml = audit.checks.length ? `
  <section>
    <h2>What AI engines say right now</h2>
    <p class="lede">We asked ${esc(audit.enginesChecked.join(', '))} the questions your customers actually ask. Live answers, captured ${esc(date)}.</p>
    <div class="scroll"><table>
      <thead><tr><th>Customer question</th>${engineLabels.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead>
      <tbody>
        ${queryIds.map(qid => `<tr><td class="q">"${esc(queryTextFor(qid))}"</td>${engineLabels.map(el => cellFor(qid, el)).join('')}</tr>`).join('')}
      </tbody>
    </table></div>
    <p class="stat-line"><strong>${audit.mentions} of ${audit.totalChecks}</strong> checks mentioned ${esc(b.bizName)}.</p>
  </section>` : '';

  const excerpts = audit.checks.filter(c => c.answered && c.excerpt).slice(0, 4);
  const excerptsHtml = excerpts.length ? `
  <section>
    <h2>In the engines' own words</h2>
    ${excerpts.map(c => `
    <blockquote class="${c.mentioned ? 'q-yes' : 'q-no'}">
      <span class="q-meta">${esc(c.engineLabel)} · ${c.mentioned ? 'mentions you' : 'does not mention you'}</span>
      "${esc(c.excerpt)}"
    </blockquote>`).join('')}
  </section>` : '';

  const rivalsHtml = audit.recommendedNames.length ? `
  <section>
    <h2>Who AI sends your customers to instead</h2>
    <ul class="rivals">
      ${audit.recommendedNames.slice(0, 5).map(n => `<li>${esc(n)}</li>`).join('')}
    </ul>
  </section>` : '';

  let gbpHtml = '';
  if (!notFound) {
    const you = audit.gbp.you;
    const comps = audit.gbp.competitors || [];
    const rows = [
      { name: `${you.name} (you)`, you: true, r: you.reviewCount, s: you.rating, p: you.photoCount },
      ...comps.map(c => ({ name: c.name, you: false, r: c.reviewCount, s: c.rating, p: c.photoCount })),
    ];
    gbpHtml = `
  <section>
    <h2>Google profile vs local competitors</h2>
    <p class="lede">Your Google Business Profile is the first thing AI engines read about you.</p>
    <div class="scroll"><table>
      <thead><tr><th>Business</th><th>Reviews</th><th>Rating</th><th>Photos</th></tr></thead>
      <tbody>${rows.map(r => `
        <tr class="${r.you ? 'you-row' : ''}">
          <td>${esc(r.name)}</td><td>${r.r}</td><td>${r.s ? r.s.toFixed(1) + '★' : '—'}</td><td>${r.p}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
    <p class="stat-line">Website linked: <strong>${you.hasWebsite ? 'Yes ✓' : 'Not found ✗'}</strong></p>
  </section>`;
  }

  const findingsHtml = audit.findings.length ? `
  <section>
    <h2>Findings</h2>
    ${audit.findings.map(f => {
      const sv = SEVERITY[f.severity] || SEVERITY.medium;
      return `
    <div class="finding">
      <span class="pill" style="color:${sv.color};background:${sv.bg}">${sv.label}</span>
      <div><h3>${esc(f.title)}</h3><p>${esc(f.detail)}</p></div>
    </div>`;
    }).join('')}
  </section>` : '';

  const planHtml = audit.fixPlan.length ? `
  <section>
    <h2>Your 30-day fix plan</h2>
    <ol class="plan">
      ${audit.fixPlan.map(p => `
      <li><div class="plan-head"><strong>${esc(p.title)}</strong><span class="weeks">${esc(p.weeks)}</span></div>
      <p>${esc(p.why)}</p></li>`).join('')}
    </ol>
  </section>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>AI Visibility Audit — ${esc(b.bizName)} · Spurwise</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Instrument+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root{--paper:#FAF8F4;--raised:#FFF;--ink:#15171C;--soft:#5B5A54;--gold:#B68A35;--green:#1F6F5C;--rust:#A13B2E;--line:#E4DFD3;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:'Instrument Sans',system-ui,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
  .wrap{max-width:680px;margin:0 auto;padding:0 20px 60px}
  header{padding:26px 0 0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
  .brand{display:flex;align-items:center;gap:8px;font-family:'Fraunces',serif;font-weight:600;font-size:1.05rem;text-decoration:none;color:var(--ink)}
  .brand-mark{width:9px;height:9px;border-radius:50%;background:var(--gold)}
  .ref{font-family:'IBM Plex Mono',monospace;font-size:0.7rem;color:var(--soft)}
  .hero{padding:34px 0 6px}
  .eyebrow{font-family:'IBM Plex Mono',monospace;font-size:0.72rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--soft);margin:0 0 12px}
  h1{font-family:'Fraunces',serif;font-weight:500;font-size:1.9rem;line-height:1.18;margin:0 0 6px}
  .meta{color:var(--soft);font-size:0.92rem;margin:0}
  .score-card{display:flex;gap:20px;align-items:center;background:var(--raised);border:1px solid var(--line);border-radius:14px;padding:22px;margin:26px 0}
  .circle{width:76px;height:76px;border-radius:50%;border:3px solid currentColor;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0}
  .circle .g{font-family:'Fraunces',serif;font-weight:600;font-size:1.9rem;line-height:1}
  .circle .n{font-family:'IBM Plex Mono',monospace;font-size:0.62rem;margin-top:3px;opacity:0.7}
  .score-card h2{font-family:'Fraunces',serif;font-weight:500;font-size:1.15rem;margin:0 0 4px}
  .score-card p{margin:0;font-size:0.9rem;color:var(--soft)}
  section{margin-top:44px}
  h2{font-family:'Fraunces',serif;font-weight:500;font-size:1.35rem;margin:0 0 8px}
  .lede{color:var(--soft);font-size:0.94rem;margin:0 0 16px}
  .scroll{overflow-x:auto}
  table{width:100%;border-collapse:collapse;background:var(--raised);border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:0.88rem}
  th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line)}
  th{font-family:'IBM Plex Mono',monospace;font-size:0.66rem;letter-spacing:0.05em;text-transform:uppercase;color:var(--soft);background:#F4F1E9}
  tr:last-child td{border-bottom:none}
  td.q{font-style:italic;color:var(--soft);max-width:260px}
  .cell{font-family:'IBM Plex Mono',monospace;font-size:0.78rem;white-space:nowrap}
  .cell.yes{color:var(--green)} .cell.no{color:var(--rust)} .cell.na{color:var(--soft)}
  .you-row td{background:#FBF6EA;font-weight:600}
  .stat-line{font-size:0.88rem;color:var(--soft);margin:12px 0 0}
  blockquote{margin:0 0 12px;padding:14px 16px;background:var(--raised);border:1px solid var(--line);border-left:3px solid var(--line);border-radius:8px;font-size:0.9rem;color:var(--ink)}
  blockquote.q-yes{border-left-color:var(--green)} blockquote.q-no{border-left-color:var(--rust)}
  .q-meta{display:block;font-family:'IBM Plex Mono',monospace;font-size:0.66rem;letter-spacing:0.05em;text-transform:uppercase;color:var(--soft);margin-bottom:6px}
  .rivals{margin:0;padding:0;list-style:none}
  .rivals li{background:var(--raised);border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:0.92rem}
  .finding{display:flex;gap:14px;align-items:flex-start;background:var(--raised);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:10px}
  .pill{font-family:'IBM Plex Mono',monospace;font-size:0.64rem;letter-spacing:0.05em;text-transform:uppercase;padding:3px 8px;border-radius:5px;white-space:nowrap;margin-top:2px}
  .finding h3{font-family:'Fraunces',serif;font-weight:500;font-size:1rem;margin:0 0 4px}
  .finding p{margin:0;font-size:0.88rem;color:var(--soft)}
  .plan{margin:0;padding-left:22px}
  .plan li{margin-bottom:16px}
  .plan-head{display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap}
  .weeks{font-family:'IBM Plex Mono',monospace;font-size:0.7rem;color:var(--gold)}
  .plan p{margin:4px 0 0;font-size:0.88rem;color:var(--soft)}
  .cta{margin-top:48px;background:var(--ink);color:#F4F1EA;border-radius:14px;padding:28px;text-align:center}
  .cta h2{color:#fff;margin-bottom:8px}
  .cta p{font-size:0.92rem;color:rgba(244,241,234,0.75);margin:0 0 18px}
  .cta a{display:inline-block;background:var(--gold);color:var(--ink);text-decoration:none;font-weight:600;padding:13px 26px;border-radius:9px}
  .disclaimer{margin-top:36px;font-size:0.75rem;color:var(--soft);border-top:1px solid var(--line);padding-top:18px;line-height:1.6}
  @media print{.cta a{border:1px solid var(--ink)}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <a class="brand" href="https://spurwise.co.uk"><span class="brand-mark"></span> Spurwise</a>
    <span class="ref">Report #${esc(id)} · ${esc(date)}</span>
  </header>

  <div class="hero">
    <p class="eyebrow">AI Visibility Audit</p>
    <h1>${esc(b.bizName)}</h1>
    <p class="meta">${esc(b.trade)} · ${esc(b.area)}</p>
  </div>

  <div class="score-card">
    <div class="circle" style="color:${notFound && audit.score === 0 ? '#A13B2E' : gi.color}">
      <span class="g">${esc(gi.grade)}</span><span class="n">${audit.score}/100</span>
    </div>
    <div>
      <h2>${esc(gi.label)} AI visibility</h2>
      <p>${audit.mentionRate !== null
        ? `Mentioned in ${audit.mentions} of ${audit.totalChecks} live AI answers, combined with your Google profile strength against local competitors.`
        : 'Based on your Google profile strength against local competitors.'}</p>
    </div>
  </div>

  ${matrixHtml}
  ${excerptsHtml}
  ${rivalsHtml}
  ${gbpHtml}
  ${findingsHtml}
  ${planHtml}

  <div class="cta">
    <h2>Want this fixed for you?</h2>
    <p>Spurwise runs the whole plan — reviews, profile, structured data, monthly AI re-checks — so the next customer who asks AI gets sent to you.</p>
    <a href="${esc(ctaUrl)}">Book a free 15-minute call →</a>
  </div>

  <p class="disclaimer">AI engine answers are live snapshots taken on ${esc(date)} and change over time as engines update and competitors improve their signals. Google profile data via Google Places. This report is prepared for ${esc(b.bizName)} and reviewed by a person at Spurwise before delivery. © Spurwise, UK.</p>
</div>
</body>
</html>`;
}

export function renderNotFound() {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex"><title>Report not found — Spurwise</title>
<style>body{font-family:system-ui,sans-serif;background:#FAF8F4;color:#15171C;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{text-align:center;padding:20px}.box a{color:#B68A35}</style></head>
<body><div class="box"><h1>Report not found</h1><p>This audit link may have expired — reports are kept for 90 days.</p>
<p><a href="https://spurwise.co.uk/ai-visibility-check">Run a fresh check →</a></p></div></body></html>`;
}
