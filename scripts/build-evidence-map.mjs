// Builds the aligned evidence map: the landing view that shows, per model
// family, every anchor/supporting matched result against the native harness.
// Quality is categorical (who leads, given each study's own winning interval);
// cost is quantitative (log ratio, challenger over native). Same-study marks
// share a capsule so one prolific source cannot masquerade as replication.
// Reads site/data/pairs.json (run build-pairs.mjs first). Writes site/evidence-map.html.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pairs = JSON.parse(fs.readFileSync(path.join(root, "site", "data", "pairs.json"), "utf8"));
const studies = Object.fromEntries(
  JSON.parse(fs.readFileSync(path.join(root, "data", "studies.json"), "utf8")).map(s => [s.id, s]));

const PANELS = [
  { key: "claude", family: "Claude models", native: "Claude Code" },
  { key: "gpt", family: "GPT models", native: "Codex" },
];

const COLORS = {
  Cursor: "#111111", Pi: "#7c3aed", OpenCode: "#16a34a", Copilot: "#0969da",
  Terminus: "#64748b", "ALE-Claw": "#b45309", Droid: "#dc2626", ForgeCode: "#0891b2",
  Hermes: "#ca8a04", OpenHands: "#be185d", OpenClaw: "#ea580c",
  "mini-SWE-agent": "#4d7c0f", Goose: "#334155", "Gemini CLI": "#4285f4",
};
const color = h => COLORS[h] ?? "#6b7280";
const monogram = h => h.split(/[\s-]+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// --- Orient every eligible pair row as challenger-vs-native ----------------
function orient(p, native) {
  if (p.weight_tier === "contextual") return null;
  let challenger, delta, cost, tokens;
  if (p.harness_a === native) {
    challenger = p.harness_b;
    delta = p.delta_pp == null ? null : -p.delta_pp;
    cost = p.cost_ratio == null ? null : 1 / p.cost_ratio;
    tokens = p.token_ratio == null ? null : 1 / p.token_ratio;
  } else if (p.harness_b === native) {
    challenger = p.harness_a;
    delta = p.delta_pp;
    cost = p.cost_ratio;
    tokens = p.token_ratio;
  } else return null;
  const cat = p.decisive === true ? (delta > 0 ? "challenger" : "native")
    : p.decisive === false ? "unclear"
    : p.delta_pp != null ? "direction" : null; // null cat = cost-only row
  return {
    challenger, delta, cost, tokens, cat,
    study_id: p.study_id, study_name: p.study_name, tier: p.weight_tier,
    model: p.model, effort: p.effort, metric: p.metric,
    interval: p.interval_pp, basis: p.interval_basis, published: p.published,
  };
}

// --- Lane geometry ----------------------------------------------------------
const QCOLS = [
  { id: "native", w: 130 }, { id: "unclear", w: 170 },
  { id: "challenger", w: 130 }, { id: "direction", w: 130 },
];
const QW = QCOLS.reduce((a, c) => a + c.w, 0);
const CL = { min: Math.log2(1 / 10), max: Math.log2(16), w: 380, pad: 12 };
const cx = v => CL.pad + ((Math.min(Math.max(Math.log2(v), CL.min), CL.max) - CL.min) / (CL.max - CL.min)) * CL.w;
const CW = CL.w + CL.pad * 2;
const MARK_STEP = 17;
const LINE_H = 20;

function tipAttrs(r, extra = "") {
  const parts = [
    `${r.study_name} (${r.tier})`,
    `${r.model ?? ""}${r.effort ? " · effort " + r.effort : ""}`,
    r.metric,
    r.delta != null ? `Δ quality ${r.delta > 0 ? "+" : ""}${r.delta.toFixed(1)} pts vs native${r.interval != null ? ` · interval ±${r.interval.toFixed(1)} (${r.basis})` : " · no interval published"}` : null,
    r.cost != null ? `cost ${r.cost.toFixed(2)}× native` : null,
    r.tokens != null ? `tokens ${r.tokens.toFixed(2)}× native` : null,
    extra || null,
  ].filter(Boolean);
  return `data-tip="${esc(parts.join("\n"))}" data-study="${esc(r.study_id)}"`;
}

// Lay out marks in a column: grouped by study, wrapping lines; returns svg + lines used.
function layoutColumn(results, colX, colW, rowColor) {
  const perLine = Math.max(1, Math.floor((colW - 14) / MARK_STEP));
  let svg = "", i = 0;
  const groups = new Map();
  for (const r of results) {
    if (!groups.has(r.study_id)) groups.set(r.study_id, []);
    groups.get(r.study_id).push(r);
  }
  const positions = [];
  for (const [sid, rs] of groups) {
    const cells = [];
    for (const r of rs) {
      cells.push({ r, line: Math.floor(i / perLine), col: i % perLine });
      i++;
    }
    positions.push({ sid, cells, size: rs.length });
  }
  const lines = Math.max(1, Math.ceil(i / perLine));
  for (const g of positions) {
    // capsule bounding box per contiguous line segment of this study's marks
    const byLine = new Map();
    for (const c of g.cells) {
      if (!byLine.has(c.line)) byLine.set(c.line, []);
      byLine.get(c.line).push(c);
    }
    for (const cells of byLine.values()) {
      const x0 = colX + 8 + cells[0].col * MARK_STEP;
      const x1 = colX + 8 + cells[cells.length - 1].col * MARK_STEP + 12;
      const y = 10 + cells[0].line * LINE_H;
      if (g.size > 1) {
        svg += `<rect class="capsule" data-study="${esc(g.sid)}" x="${x0 - 4}" y="${y - 9}" width="${x1 - x0 + 8}" height="18" rx="9" fill="#f0f0f0"/>`;
      }
    }
    for (const c of g.cells) {
      const x = colX + 14 + c.col * MARK_STEP;
      const y = 10 + c.line * LINE_H;
      const r = c.r;
      const ring = r.tier === "anchor" ? `<circle cx="${x}" cy="${y}" r="8" fill="none" stroke="${rowColor}" stroke-width="1.2" opacity="0.55"/>` : "";
      let mark;
      if (r.cat === "direction") {
        mark = `<rect x="${x - 4.4}" y="${y - 4.4}" width="8.8" height="8.8" transform="rotate(45 ${x} ${y})" fill="#ffffff" stroke="${rowColor}" stroke-width="1.6"/>`;
      } else if (r.cat === "unclear") {
        mark = `<circle cx="${x}" cy="${y}" r="5" fill="#ffffff" stroke="${rowColor}" stroke-width="1.8"/>`;
      } else {
        mark = `<circle cx="${x}" cy="${y}" r="5.5" fill="${rowColor}"/>`;
      }
      svg += `<g class="mark" ${tipAttrs(r)}>${ring}${mark}</g>`;
    }
  }
  return { svg, lines };
}

function qualityLane(results, rowColor) {
  const byCat = { native: [], unclear: [], challenger: [], direction: [] };
  for (const r of results) if (r.cat) byCat[r.cat].push(r);
  let svg = "", maxLines = 1, x = 0;
  const colX = {};
  for (const c of QCOLS) { colX[c.id] = x; x += c.w; }
  for (const c of QCOLS) {
    const out = layoutColumn(byCat[c.id], colX[c.id], c.w, rowColor);
    svg += out.svg;
    maxLines = Math.max(maxLines, byCat[c.id].length ? out.lines : 1);
  }
  const h = maxLines * LINE_H + 4;
  let grid = "";
  let gx = 0;
  for (const c of QCOLS.slice(0, -1)) { gx += c.w; grid += `<line x1="${gx}" y1="0" x2="${gx}" y2="${h}" stroke="#e6e6e6"/>`; }
  return { svg: `<svg width="${QW}" height="${h}" class="lane">${grid}${svg}</svg>`, h };
}

function costLane(results, rowColor, challenger) {
  const withCost = results.filter(r => r.cost != null);
  const tokenOnly = results.filter(r => r.cost == null && r.tokens != null);
  const ticks = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16];
  if (!withCost.length) {
    let note = `<span class="nocost">no cost reported</span>`;
    if (tokenOnly.length) {
      const pcts = tokenOnly.map(r => (r.tokens - 1) * 100);
      note = `<span class="nocost">no cost &#183; tokens ${Math.min(...pcts).toFixed(0)}% to ${Math.max(...pcts).toFixed(0)}% vs native</span>`;
    }
    return { html: `<div class="costnote" style="width:${CW}px">${note}</div>`, h: 24 };
  }
  // sort so marks pile deterministically; wrap lines when overlapping same x region
  const sorted = [...withCost].sort((a, b) => a.cost - b.cost);
  const placed = [];
  for (const r of sorted) {
    const x = cx(r.cost);
    let line = 0;
    while (placed.some(p => p.line === line && Math.abs(p.x - x) < 13)) line++;
    placed.push({ r, x, line });
  }
  const lines = Math.max(1, ...placed.map(p => p.line + 1));
  const h = lines * LINE_H + 4;
  let svg = "";
  for (const t of ticks) {
    svg += `<line x1="${cx(t)}" y1="0" x2="${cx(t)}" y2="${h}" stroke="${t === 1 ? "#9a9a9a" : "#eeeeee"}" stroke-width="${t === 1 ? 1.4 : 1}"/>`;
  }
  for (const p of placed) {
    const y = 10 + p.line * LINE_H;
    const clipped = p.r.cost > 16 || p.r.cost < 1 / 10;
    const ring = p.r.tier === "anchor" ? `<circle cx="${p.x}" cy="${y}" r="8" fill="none" stroke="${rowColor}" stroke-width="1.2" opacity="0.55"/>` : "";
    svg += `<g class="mark" ${tipAttrs(p.r)}>${ring}<circle cx="${p.x}" cy="${y}" r="5" fill="${rowColor}"/>` +
      (clipped ? `<text x="${p.x - 10}" y="${y + 4}" font-size="10" text-anchor="end" fill="#505a5f">${p.r.cost.toFixed(1)}&#215;&#8594;</text>` : "") + `</g>`;
  }
  return { html: `<svg width="${CW}" height="${h}" class="lane">${svg}</svg>`, h };
}

// Expanded detail: forest plot of quality deltas + cost list + study links.
const F = { min: -25, max: 25, w: 420, pad: 36 };
const fx = v => F.pad + ((Math.min(Math.max(v, F.min), F.max) - F.min) / (F.max - F.min)) * F.w;
function detailBlock(native, challenger, results) {
  const quality = results.filter(r => r.delta != null).sort((a, b) => (a.tier + a.published).localeCompare(b.tier + b.published));
  const costs = results.filter(r => r.cost != null);
  const rec = {
    challenger: quality.filter(r => r.cat === "challenger").length,
    native: quality.filter(r => r.cat === "native").length,
    unclear: quality.filter(r => r.cat === "unclear").length,
    direction: quality.filter(r => r.cat === "direction").length,
  };
  const nStudies = new Set(results.map(r => r.study_id));
  let html = `<p class="record"><strong>${esc(challenger)}</strong> vs ${esc(native)} across ${nStudies.size} ${nStudies.size === 1 ? "study" : "studies"}: ` +
    `${rec.challenger} clear ${esc(challenger)} lead${rec.challenger === 1 ? "" : "s"}, ${rec.native} clear ${esc(native)} lead${rec.native === 1 ? "" : "s"}, ` +
    `${rec.unclear} inside the noise, ${rec.direction} direction-only.</p>`;
  if (quality.length) {
    const h = quality.length * 24 + 40;
    let svg = `<svg width="${F.pad * 2 + F.w + 560}" height="${h}">`;
    for (const t of [-20, -10, 0, 10, 20]) {
      svg += `<line x1="${fx(t)}" y1="4" x2="${fx(t)}" y2="${h - 34}" stroke="${t === 0 ? "#505a5f" : "#e6e6e6"}"/>` +
        `<text x="${fx(t)}" y="${h - 20}" font-size="10.5" text-anchor="middle" fill="#505a5f">${t > 0 ? "+" + t : t}</text>`;
    }
    quality.forEach((r, i) => {
      const y = 16 + i * 24;
      if (r.interval != null) {
        svg += `<line x1="${fx(r.delta - r.interval)}" y1="${y}" x2="${fx(r.delta + r.interval)}" y2="${y}" stroke="#9a9a9a" stroke-width="2"${(r.delta - r.interval < F.min || r.delta + r.interval > F.max) ? ' stroke-dasharray="3,2"' : ""}/>`;
      }
      const c = color(r.challenger);
      if (r.cat === "direction") {
        const dx = fx(r.delta);
        svg += `<rect x="${dx - 4.4}" y="${y - 4.4}" width="8.8" height="8.8" transform="rotate(45 ${dx} ${y})" fill="#ffffff" stroke="${c}" stroke-width="1.6"/>`;
      } else {
        svg += `<circle cx="${fx(r.delta)}" cy="${y}" r="5" fill="${r.cat === "unclear" ? "#ffffff" : c}" stroke="${c}" stroke-width="1.8"/>`;
      }
      svg += `<text x="${F.pad * 2 + F.w + 6}" y="${y + 4}" font-size="11">${esc(`${r.study_name} · ${r.model}${r.effort ? " · " + r.effort : ""} · ${r.metric}`)} <tspan fill="#505a5f">[${r.tier === "anchor" ? "A" : "B"}]</tspan></text>`;
    });
    svg += `<text x="${fx(F.min)}" y="${h - 4}" font-size="10.5" fill="#505a5f">&#8592; ${esc(native)} leads</text>` +
      `<text x="${fx(F.max)}" y="${h - 4}" font-size="10.5" text-anchor="end" fill="#505a5f">${esc(challenger)} leads &#8594;</text></svg>`;
    html += svg;
  }
  if (costs.length) {
    html += `<p class="record">Cost, ${esc(challenger)} relative to ${esc(native)}: ` +
      costs.map(r => `${r.cost.toFixed(2)}&#215; <span class="dim">(${esc(r.study_name)}, ${esc(r.model ?? "")}${r.effort ? ", " + esc(r.effort) : ""})</span>`).join(" · ") + `</p>`;
  }
  html += `<p class="record dim">Sources: ` + [...nStudies].map(sid =>
    `<a href="${esc(studies[sid].source_url)}">${esc(studies[sid].name)}</a>` +
    (studies[sid].conflict !== "none" ? ` (${esc(studies[sid].conflict)})` : "")).join(" · ") + `</p>`;
  return html;
}

// --- Assemble ----------------------------------------------------------------
let body = "";
for (const panel of PANELS) {
  const oriented = pairs
    .filter(p => p.model_family === panel.family)
    .map(p => orient(p, panel.native))
    .filter(Boolean);
  const byChallenger = new Map();
  for (const r of oriented) {
    if (!byChallenger.has(r.challenger)) byChallenger.set(r.challenger, []);
    byChallenger.get(r.challenger).push(r);
  }
  // Rank by breadth of evidence (distinct studies) before volume, so one
  // prolific source cannot claim the top row.
  const nStud = rs => new Set(rs.map(r => r.study_id)).size;
  const rows = [...byChallenger.entries()].sort((a, b) =>
    nStud(b[1]) - nStud(a[1]) || b[1].length - a[1].length);
  const nResults = oriented.length;
  const nStudies = new Set(oriented.map(r => r.study_id)).size;
  const nCostStudies = new Set(oriented.filter(r => r.cost != null).map(r => r.study_id)).size;

  const ticks = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16];
  const axis = `<svg width="${CW}" height="22" class="lane">` + ticks.map(t =>
    `<text x="${cx(t)}" y="14" font-size="10.5" text-anchor="middle" fill="#505a5f">${t < 1 ? "&#8539;&#188;&#189;".charAt(0) && (t === 0.125 ? "&#8539;" : t === 0.25 ? "&#188;" : "&#189;") : t}&#215;</text>`).join("") + `</svg>`;

  let rowsHtml = "";
  for (const [challenger, results] of rows) {
    const rowColor = color(challenger);
    const q = qualityLane(results, rowColor);
    const c = costLane(results, rowColor, challenger);
    const id = `${panel.key}-${slug(challenger)}`;
    rowsHtml += `
<div class="row" id="${id}">
  <button class="rowhead" aria-expanded="false" data-target="${id}-detail">
    <span class="chip" style="background:${rowColor}">${esc(monogram(challenger))}</span>
    <span class="hname">${esc(challenger)}</span>
    <span class="caret">&#9656;</span>
  </button>
  <div class="qcell">${q.svg}</div>
  <div class="ccell">${c.html}</div>
</div>
<div class="detail" id="${id}-detail" hidden>${detailBlock(panel.native, challenger, results)}</div>`;
  }

  body += `
<section class="panel">
  <h2>Using ${esc(panel.family)} <span class="vs">&mdash; compared with ${esc(panel.native)}</span></h2>
  <p class="coverage">${nResults} matched results &#183; ${nStudies} studies &#183; ${nCostStudies} report cost. Anchor and supporting studies only; each mark is one published matched result.</p>
  <div class="row lanehead">
    <div class="rowhead"></div>
    <div class="qcell">
      <div class="qheads">${QCOLS.map(c => `<span style="width:${c.w}px">${{
        native: `${esc(panel.native)} leads`, unclear: "unclear", challenger: "challenger leads", direction: "no interval",
      }[c.id]}</span>`).join("")}</div>
    </div>
    <div class="ccell"><div class="chead">cost, challenger &#247; ${esc(panel.native)} (log)</div>${axis}</div>
  </div>
  ${rowsHtml}
</section>`;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Which harness should I run? The matched evidence</title>
<link rel="stylesheet" href="report.css">
<style>
  body { background: #ffffff; }
  .map-wrap { max-width: 1280px; margin: 0 auto; padding: 28px 24px 80px; }
  .map-wrap h1 { margin-bottom: 6px; }
  .lede2 { color: #383f43; max-width: 900px; }
  .legend { color: #505a5f; font-size: 0.85rem; margin: 10px 0 6px; }
  .legend .sw { display:inline-block; vertical-align:-2px; margin: 0 3px 0 10px; }
  .panel { margin-top: 34px; }
  .panel h2 { margin-bottom: 2px; }
  .panel .vs { font-weight: 400; color: #505a5f; font-size: 0.75em; }
  .coverage { color: #505a5f; font-size: 0.9rem; margin: 2px 0 10px; }
  .row { display: flex; align-items: flex-start; border-top: 1px solid #eee; padding: 6px 0; }
  .row:not(.lanehead) .rowhead { margin-top: 2px; }
  .row.lanehead { border-top: none; align-items: flex-end; padding-bottom: 0; }
  .rowhead { width: 170px; flex: none; display: flex; align-items: center; gap: 8px;
             background: none; border: none; cursor: pointer; font: inherit; text-align: left; padding: 0; }
  .lanehead .rowhead { cursor: default; }
  .chip { width: 24px; height: 24px; border-radius: 6px; color: #fff; font-size: 10.5px; font-weight: 700;
          display: inline-flex; align-items: center; justify-content: center; flex: none; }
  .hname { font-weight: 600; font-size: 0.95rem; white-space: nowrap; }
  .caret { color: #909396; transition: transform 0.15s; }
  .rowhead[aria-expanded="true"] .caret { transform: rotate(90deg); }
  .qcell { width: ${QW}px; flex: none; border-right: 1px solid #e6e6e6; }
  .ccell { width: ${CW}px; flex: none; padding-left: 4px; }
  .qheads { display: flex; }
  .qheads span, .chead { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: #505a5f; }
  .qheads span { display: inline-block; padding-left: 8px; }
  .chead { padding-left: 12px; }
  .lane { display: block; }
  .costnote { padding: 2px 0 0 12px; }
  .nocost { color: #767a7e; font-size: 0.85rem; font-style: italic; }
  .detail { margin: 0 0 8px 170px; padding: 10px 14px; background: #fafafa; border-left: 3px solid #d0d0d0; }
  .detail .record { font-size: 0.92rem; margin: 4px 0; }
  .dim { color: #505a5f; }
  .mark { cursor: pointer; }
  .capsule { cursor: pointer; }
  body.spot .mark, body.spot .capsule { opacity: 0.18; }
  body.spot .mark.lit, body.spot .capsule.lit { opacity: 1; }
  #tip { position: fixed; z-index: 10; max-width: 340px; background: #0b0c0c; color: #fff;
         font-size: 12px; line-height: 1.45; padding: 8px 10px; border-radius: 4px;
         white-space: pre-line; pointer-events: none; display: none; }
  .studynote { color: #505a5f; font-size: 0.85rem; margin-top: 4px; display: none; }
  body.spot .studynote { display: block; }
</style>
</head>
<body>
<div class="map-wrap">
<h1>Which harness should I run?</h1>
<p class="lede2">Every published matched comparison against the harness you would use by default. Quality on the left: does the study's own dispersion let the challenger and the native harness be told apart? Cost on the right: what the same studies measured, as a ratio. Hover any mark for the study behind it; click a harness for the full detail; click a grey capsule to spotlight one study's results.</p>
<p class="legend">
  <svg class="sw" width="14" height="14"><circle cx="7" cy="7" r="5.5" fill="#505a5f"/></svg> clears the study's winning interval
  <svg class="sw" width="14" height="14"><circle cx="7" cy="7" r="5" fill="#fff" stroke="#505a5f" stroke-width="1.8"/></svg> inside it
  <svg class="sw" width="14" height="14"><rect x="2.6" y="2.6" width="8.8" height="8.8" transform="rotate(45 7 7)" fill="#fff" stroke="#505a5f" stroke-width="1.6"/></svg> direction only, no interval
  <svg class="sw" width="18" height="14"><circle cx="9" cy="7" r="8" fill="none" stroke="#505a5f" opacity="0.55"/><circle cx="9" cy="7" r="4" fill="#505a5f"/></svg> ringed = anchor study
  <svg class="sw" width="26" height="14"><rect x="1" y="1" width="24" height="12" rx="6" fill="#f0f0f0"/><circle cx="8" cy="7" r="3.6" fill="#505a5f"/><circle cx="17" cy="7" r="3.6" fill="#505a5f"/></svg> same study
</p>
<p class="studynote" id="studynote"></p>
${body}
<p class="dim" style="margin-top:28px">Comparisons that involve neither native harness, contextual-tier studies and open-weight model pools are in the <a href="pairs.html">full pairwise forest plots</a>. Method: <a href="https://github.com/tmustier/harness-benchmarks/blob/main/docs/method.md">how this review weights sources</a>.</p>
</div>
<div id="tip"></div>
<script>
(function () {
  var tip = document.getElementById("tip");
  document.addEventListener("mousemove", function (e) {
    var g = e.target.closest("[data-tip]");
    if (g) {
      tip.textContent = g.getAttribute("data-tip");
      tip.style.display = "block";
      var x = Math.min(e.clientX + 14, window.innerWidth - 360);
      tip.style.left = x + "px";
      tip.style.top = (e.clientY + 16) + "px";
    } else tip.style.display = "none";
  });
  document.querySelectorAll(".rowhead[data-target]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var d = document.getElementById(btn.getAttribute("data-target"));
      var open = d.hidden;
      d.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      if (open) history.replaceState(null, "", "#" + btn.closest(".row").id);
    });
  });
  var note = document.getElementById("studynote");
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-study]");
    var body = document.body;
    if (el && (e.target.classList.contains("capsule") || e.target.closest(".capsule"))) {
      var sid = el.getAttribute("data-study");
      var already = body.classList.contains("spot") && body.getAttribute("data-spot") === sid;
      body.classList.toggle("spot", !already);
      body.setAttribute("data-spot", already ? "" : sid);
      document.querySelectorAll("[data-study]").forEach(function (m) {
        m.classList.toggle("lit", !already && m.getAttribute("data-study") === sid);
      });
      note.textContent = already ? "" : "Spotlight: results from one study. Click the capsule again to clear.";
    }
  });
  if (location.hash) {
    var row = document.querySelector(location.hash);
    if (row) { var b = row.querySelector(".rowhead[data-target]"); if (b) b.click(); row.scrollIntoView(); }
  }
})();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(root, "site", "evidence-map.html"), html);

const eligible = PANELS.map(panel => {
  const o = pairs.filter(p => p.model_family === panel.family).map(p => orient(p, panel.native)).filter(Boolean);
  return `${panel.family}: ${o.length} results, ${new Set(o.map(r => r.study_id)).size} studies, ${new Set(o.map(r => r.challenger)).size} challengers`;
});
console.log(`Built site/evidence-map.html. ${eligible.join(" | ")}`);
