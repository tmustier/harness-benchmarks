// Derives matched harness pairs from observations and claims, then renders
// a forest-plot prototype. Outputs site/data/pairs.json and site/pairs.html.
//
// A pair is two harnesses measured in the same study with the same model,
// effort and metric. The quality delta carries a winning interval derived
// from the study itself: a published confidence interval or error range
// where one exists, otherwise a binomial interval from the study's task
// count. A result is decisive only when the delta exceeds the combined
// interval. Rows without any interval are direction-only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = name => JSON.parse(fs.readFileSync(path.join(root, "data", name), "utf8"));

const studies = Object.fromEntries(readJson("studies.json").map(s => [s.id, s]));
const observations = readJson("observations.json");
const claims = readJson("claims.json");

// Different studies name the same harness differently. Claude SDK stays
// separate: Warden replaced the native Claude Code prompt and tool policy,
// so it is a different configuration of the same runtime.
const ALIAS = {
  "Cursor CLI": "Cursor",
  "Hermes Agent": "Hermes",
  "Codex CLI": "Codex",
  "Terminus 2": "Terminus",
  "OpenHands-SDK": "OpenHands",
  "Copilot CLI": "Copilot",
};
const canonical = name => ALIAS[name] ?? name;

function modelFamily(model) {
  if (/^Claude/i.test(model)) return "Claude models";
  if (/^GPT|^o\d/i.test(model)) return "GPT models";
  if (/^Gemini/i.test(model)) return "Gemini models";
  return "Open-weight and other models";
}

// 95% half-width for one observation, from the study's own dispersion.
function halfWidth(row) {
  if (row.ci_low != null && row.ci_high != null) {
    return { hw: (row.ci_high - row.ci_low) / 2, basis: "published confidence interval" };
  }
  if (row.error_low != null && row.error_high != null) {
    return { hw: (row.error_high - row.error_low) / 2, basis: "published error value" };
  }
  if (Number.isFinite(row.sample_count) && row.sample_count > 0) {
    const p = Math.min(Math.max(row.performance_value / 100, 0.01), 0.99);
    return { hw: 1.96 * Math.sqrt((p * (1 - p)) / row.sample_count) * 100, basis: `binomial, n=${row.sample_count}` };
  }
  return { hw: null, basis: null };
}

const ratio = (a, b) => (a != null && b != null && b !== 0 ? a / b : null);

// --- Pairs from observations ---------------------------------------------
const groups = new Map();
for (const row of observations) {
  const key = [row.study_id, row.model, row.effort ?? "", row.performance_metric].join("|");
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

const pairs = [];
for (const rows of groups.values()) {
  const sorted = [...rows].sort((x, y) => canonical(x.harness).localeCompare(canonical(y.harness)));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (canonical(a.harness) === canonical(b.harness)) continue;
      const study = studies[a.study_id];
      const wa = halfWidth(a);
      const wb = halfWidth(b);
      const interval = wa.hw != null && wb.hw != null ? Math.sqrt(wa.hw ** 2 + wb.hw ** 2) : null;
      const delta = a.performance_value - b.performance_value;
      pairs.push({
        source: "observations",
        study_id: a.study_id,
        study_name: study.name,
        weight_tier: study.weight_tier,
        published: study.published,
        model: a.model,
        model_family: modelFamily(a.model),
        effort: a.effort ?? null,
        metric: a.performance_metric,
        harness_a: canonical(a.harness),
        harness_b: canonical(b.harness),
        value_a: a.performance_value,
        value_b: b.performance_value,
        delta_pp: Number(delta.toFixed(2)),
        interval_pp: interval != null ? Number(interval.toFixed(2)) : null,
        interval_basis: interval != null ? `${wa.basis} / ${wb.basis}` : null,
        decisive: interval != null ? Math.abs(delta) > interval : null,
        cost_ratio: ratio(a.cost_usd_per_task, b.cost_usd_per_task),
        token_ratio: ratio(a.tokens_per_task, b.tokens_per_task),
        time_ratio: ratio(a.wall_time_seconds, b.wall_time_seconds),
      });
    }
  }
}

// --- Pairs from ratio-only claims -----------------------------------------
for (const claim of claims) {
  const study = studies[claim.study_id];
  const base = {
    source: "claims",
    study_id: claim.study_id,
    study_name: study.name,
    weight_tier: study.weight_tier,
    published: study.published,
    model: claim.model ?? null,
    model_family: claim.model ? modelFamily(claim.model) : null,
    effort: claim.effort ?? null,
    delta_pp: null,
    interval_pp: null,
    interval_basis: null,
    decisive: null,
    cost_ratio: null,
    token_ratio: null,
    time_ratio: null,
  };
  if (claim.measure === "native-to-pi cost ratio") {
    // value = native cost divided by Pi cost; reference_harness is the native harness.
    // These ratios are different cuts of the same experiment that produced the
    // study's quality observations (e.g. Databricks reports quality as a chart
    // and cost ratios in text). If a matched quality pair exists for the same
    // configuration, attach the ratio to it rather than emitting a second,
    // cost-only row that would look like a separate result.
    const ha = canonical(claim.reference_harness);
    const hb = canonical(claim.harness);
    const host = pairs.find(p =>
      p.study_id === claim.study_id &&
      p.model === (claim.model ?? null) &&
      (p.effort ?? null) === (claim.effort ?? null) &&
      ((p.harness_a === ha && p.harness_b === hb) || (p.harness_a === hb && p.harness_b === ha)));
    if (host) {
      const oriented = host.harness_a === ha ? claim.value : Number((1 / claim.value).toFixed(3));
      if (host.cost_ratio != null) {
        // The observations may carry absolute dollar figures derived from this
        // same published ratio (plus a dollar anchor), so the two must agree.
        // Keep the claim's value: it is the exactly-reported number.
        const drift = Math.abs(host.cost_ratio / oriented - 1);
        if (drift > 0.08) {
          throw new Error(`Cost ratio conflict for ${claim.study_id} ${claim.model} ${claim.effort} ${ha}/${hb}: obs-derived ${host.cost_ratio} vs claimed ${oriented}`);
        }
      }
      host.cost_ratio = oriented;
    } else {
      pairs.push({
        ...base,
        metric: "cost only",
        harness_a: ha,
        harness_b: hb,
        value_a: null,
        value_b: null,
        cost_ratio: claim.value,
      });
    }
  } else if (claim.measure === "Copilot minus native task-resolution points") {
    pairs.push({
      ...base,
      metric: `${claim.benchmark} task resolution`,
      harness_a: "Copilot",
      harness_b: canonical(claim.reference_harness),
      value_a: null,
      value_b: null,
      delta_pp: claim.value,
    });
  } else if (claim.measure === "Copilot median token change percent") {
    pairs.push({
      ...base,
      metric: `${claim.benchmark} median tokens`,
      harness_a: "Copilot",
      harness_b: canonical(claim.reference_harness),
      value_a: null,
      value_b: null,
      token_ratio: Number((1 + claim.value / 100).toFixed(3)),
    });
  }
}

pairs.sort((x, y) =>
  `${x.harness_a}|${x.harness_b}`.localeCompare(`${y.harness_a}|${y.harness_b}`) ||
  x.published.localeCompare(y.published));

fs.mkdirSync(path.join(root, "site", "data"), { recursive: true });
fs.writeFileSync(path.join(root, "site", "data", "pairs.json"), JSON.stringify(pairs, null, 2) + "\n");

// --- Forest-plot prototype -------------------------------------------------
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const TIER_LABEL = { anchor: "A", supporting: "B", contextual: "C" };

// Quality panel geometry: delta axis in percentage points.
const Q = { min: -25, max: 25, width: 460, rowH: 26, pad: 40 };
const qx = v => Q.pad + ((Math.min(Math.max(v, Q.min), Q.max) - Q.min) / (Q.max - Q.min)) * Q.width;
// Cost panel geometry: log scale ratio.
const C = { min: Math.log2(0.2), max: Math.log2(5), width: 300, pad: 20 };
const cx = v => C.pad + ((Math.min(Math.max(Math.log2(v), C.min), C.max) - C.min) / (C.max - C.min)) * C.width;

function qualityRowSvg(p, y) {
  const parts = [];
  const clippedLo = p.delta_pp - (p.interval_pp ?? 0) < Q.min;
  const clippedHi = p.delta_pp + (p.interval_pp ?? 0) > Q.max;
  if (p.interval_pp != null) {
    parts.push(`<line x1="${qx(p.delta_pp - p.interval_pp)}" y1="${y}" x2="${qx(p.delta_pp + p.interval_pp)}" y2="${y}" stroke="#9a9a9a" stroke-width="2"${clippedLo || clippedHi ? ' stroke-dasharray="3,2"' : ""}/>`);
  }
  const fill = p.decisive === true ? "#1d70b8" : p.decisive === false ? "#ffffff" : "#b1b4b6";
  const stroke = p.decisive === true ? "#1d70b8" : p.decisive === false ? "#505a5f" : "#b1b4b6";
  parts.push(`<circle cx="${qx(p.delta_pp)}" cy="${y}" r="5" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>`);
  return parts.join("");
}

function pairBlock(key, rows) {
  const [a, b] = key.split("|");
  const quality = rows.filter(r => r.delta_pp != null).sort((x, y) => (TIER_LABEL[x.weight_tier] + x.published).localeCompare(TIER_LABEL[y.weight_tier] + y.published));
  const costs = rows.filter(r => r.cost_ratio != null);
  if (!quality.length && !costs.length) return "";

  let html = `<section class="pair"><h3>${escapeHtml(a)} vs ${escapeHtml(b)}</h3>`;

  if (quality.length) {
    const wins = quality.filter(r => r.decisive === true && r.delta_pp > 0).length;
    const losses = quality.filter(r => r.decisive === true && r.delta_pp < 0).length;
    const unclear = quality.length - wins - losses;
    html += `<p class="record">Quality, ${quality.length} matched results: <strong>${wins}</strong> decisive for ${escapeHtml(a)}, <strong>${losses}</strong> for ${escapeHtml(b)}, <strong>${unclear}</strong> inside the noise or direction-only.</p>`;
    const h = quality.length * Q.rowH + 48;
    let svg = `<svg viewBox="0 0 ${Q.pad * 2 + Q.width + 560} ${h}" role="img" aria-label="Quality deltas for ${escapeHtml(a)} versus ${escapeHtml(b)}">`;
    for (const t of [-20, -10, 0, 10, 20]) {
      svg += `<line x1="${qx(t)}" y1="4" x2="${qx(t)}" y2="${h - 42}" stroke="${t === 0 ? "#505a5f" : "#e6e6e6"}" stroke-width="${t === 0 ? 1.5 : 1}"/>`;
      svg += `<text x="${qx(t)}" y="${h - 28}" font-size="11" text-anchor="middle" fill="#505a5f">${t > 0 ? "+" + t : t}</text>`;
    }
    quality.forEach((p, i) => {
      const y = 14 + i * Q.rowH;
      svg += qualityRowSvg(p, y);
      const label = `${p.study_name} · ${p.model}${p.effort ? " · " + p.effort : ""} · ${p.metric}`;
      svg += `<text x="${Q.pad * 2 + Q.width + 8}" y="${y + 4}" font-size="11.5" fill="#0b0c0c">${escapeHtml(label)} <tspan fill="#505a5f">[${TIER_LABEL[p.weight_tier]}]</tspan></text>`;
    });
    svg += `<text x="${qx(Q.min)}" y="${h - 8}" font-size="11" text-anchor="start" fill="#505a5f">&#8592; ${escapeHtml(b)} leads</text>`;
    svg += `<text x="${qx(Q.max)}" y="${h - 8}" font-size="11" text-anchor="end" fill="#505a5f">${escapeHtml(a)} leads &#8594;</text>`;
    svg += "</svg>";
    html += svg;
  }

  if (costs.length) {
    const h = costs.length * Q.rowH + 48;
    let svg = `<svg viewBox="0 0 ${C.pad * 2 + C.width + 700} ${h}" role="img" aria-label="Cost ratios for ${escapeHtml(a)} versus ${escapeHtml(b)}">`;
    for (const t of [0.25, 0.5, 1, 2, 4]) {
      svg += `<line x1="${cx(t)}" y1="4" x2="${cx(t)}" y2="${h - 42}" stroke="${t === 1 ? "#505a5f" : "#e6e6e6"}" stroke-width="${t === 1 ? 1.5 : 1}"/>`;
      svg += `<text x="${cx(t)}" y="${h - 28}" font-size="11" text-anchor="middle" fill="#505a5f">${t}&#215;</text>`;
    }
    costs.forEach((p, i) => {
      const y = 14 + i * Q.rowH;
      svg += `<circle cx="${cx(p.cost_ratio)}" cy="${y}" r="5" fill="#f47738"/>`;
      const label = `${p.study_name} · ${p.model ?? ""}${p.effort ? " · " + p.effort : ""} · cost ${p.cost_ratio.toFixed(2)}× · ${p.metric}`;
      svg += `<text x="${C.pad * 2 + C.width + 8}" y="${y + 4}" font-size="11.5" fill="#0b0c0c">${escapeHtml(label)} <tspan fill="#505a5f">[${TIER_LABEL[p.weight_tier]}]</tspan></text>`;
    });
    svg += `<text x="${cx(0.25)}" y="${h - 8}" font-size="11" text-anchor="start" fill="#505a5f">&#8592; cheaper</text>`;
    svg += `<text x="${cx(4)}" y="${h - 8}" font-size="11" text-anchor="end" fill="#505a5f">costs more &#8594;</text>`;
    html += `<p class="record">Cost of ${escapeHtml(a)} relative to ${escapeHtml(b)}:</p>${svg}</svg>`;
  }

  return html + "</section>";
}

const byFamily = new Map();
for (const p of pairs) {
  const family = p.model_family ?? "Unstated model";
  if (!byFamily.has(family)) byFamily.set(family, new Map());
  const key = `${p.harness_a}|${p.harness_b}`;
  const fam = byFamily.get(family);
  if (!fam.has(key)) fam.set(key, []);
  fam.get(key).push(p);
}

const familyOrder = ["Claude models", "GPT models", "Gemini models", "Open-weight and other models", "Unstated model"];
let body = "";
for (const family of familyOrder) {
  const fam = byFamily.get(family);
  if (!fam) continue;
  const blocks = [...fam.entries()]
    .sort((x, y) => y[1].length - x[1].length)
    .map(([key, rows]) => pairBlock(key, rows))
    .filter(Boolean);
  if (!blocks.length) continue;
  body += `<h2>${escapeHtml(family)}</h2>${blocks.join("")}`;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Matched harness pairs: forest plots</title>
<link rel="stylesheet" href="report.css">
<style>
  .pairs-wrap { max-width: 1180px; margin: 0 auto; padding: 24px; }
  .pair { margin: 20px 0 34px; }
  .pair h3 { margin-bottom: 4px; }
  .pair svg { display: block; width: 100%; height: auto; max-width: 1180px; }
  .record { color: #0b0c0c; font-size: 0.95rem; margin: 2px 0 6px; }
  .legend { color: #505a5f; font-size: 0.9rem; }
</style>
</head>
<body>
<div class="pairs-wrap">
<h1>Matched harness pairs</h1>
<p class="legend">Each row is one matched result: same study, model, effort and metric. The whisker is the winning interval derived from that study's own dispersion: a published confidence interval or error value where one exists, otherwise a binomial interval from the study's task count. A filled dot clears its interval; a hollow dot does not; a grey dot has no interval and shows direction only. [A] anchor, [B] supporting, [C] contextual.</p>
${body}
</div>
</body>
</html>
`;
fs.writeFileSync(path.join(root, "site", "pairs.html"), html);

const qualityRows = pairs.filter(p => p.delta_pp != null);
const decisive = qualityRows.filter(p => p.decisive === true).length;
const inNoise = qualityRows.filter(p => p.decisive === false).length;
const directionOnly = qualityRows.filter(p => p.decisive === null).length;
console.log(`Derived ${pairs.length} pair rows (${qualityRows.length} with quality deltas: ${decisive} decisive, ${inNoise} inside noise, ${directionOnly} direction-only). Wrote site/data/pairs.json and site/pairs.html.`);
