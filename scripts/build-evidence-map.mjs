// Builds the aligned evidence map: the landing view that shows, per model
// family, every anchor/supporting matched result against the native harness.
//
// Reading direction is uniform across both lanes: LEFT favors the native
// harness (it leads on quality / the challenger costs more), RIGHT favors the
// challenger (it leads / it is cheaper). Quality is categorical (who leads,
// given each study's own winning interval); cost is quantitative (log ratio,
// challenger over native, axis flipped so cheaper is right).
//
// Marks from any study that contributes more than one mark to a panel get a
// grey backing (capsule) in both lanes, so one prolific source cannot
// masquerade as independent replication; clicking it spotlights the study.
//
// Reads site/data/pairs.json (run build-pairs.mjs first) and data/studies.json.
// Writes site/evidence-map.html.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pairs = JSON.parse(fs.readFileSync(path.join(root, "site", "data", "pairs.json"), "utf8"));
const studies = Object.fromEntries(
  JSON.parse(fs.readFileSync(path.join(root, "data", "studies.json"), "utf8")).map(s => [s.id, s]));

// Generated hrefs must be http(s); anything else fails the build.
for (const s of Object.values(studies)) {
  if (!/^https?:\/\//.test(s.source_url)) {
    throw new Error(`Study ${s.id} has non-http(s) source_url: ${s.source_url}`);
  }
}

const PANELS = [
  { key: "claude", family: "Claude models", native: "Claude Code" },
  { key: "gpt", family: "GPT models", native: "Codex" },
];

const COLORS = {
  Cursor: "#111111", Pi: "#7c3aed", OpenCode: "#16a34a", Copilot: "#0969da",
  Terminus: "#64748b", "ALE-Claw": "#b45309", Droid: "#ea580c", ForgeCode: "#0891b2",
  Hermes: "#ca8a04", OpenHands: "#be185d", OpenClaw: "#dc2626",
  "mini-SWE-agent": "#4d7c0f", Goose: "#334155", "Gemini CLI": "#4285f4",
};
const color = h => COLORS[h] ?? "#6b7280";
const monogram = h => h.split(/[\s-]+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// --- Orient every eligible pair row as challenger-vs-native ----------------
// pairs.json convention: delta_pp = a - b, ratios = a / b.
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
  for (const [name, v] of [["cost", cost], ["token", tokens]]) {
    if (v != null && (!Number.isFinite(v) || v <= 0)) {
      throw new Error(`Bad ${name} ratio ${v} in ${p.study_id} (${p.model ?? "?"})`);
    }
  }
  let cat = null; // null cat = cost-only row
  if (delta != null) {
    if (p.decisive === true) {
      if (delta === 0) throw new Error(`Decisive result with zero delta in ${p.study_id} (${p.model ?? "?"})`);
      cat = delta > 0 ? "challenger" : "native";
    } else if (p.decisive === false || delta === 0) {
      cat = "unclear"; // inside the interval, or exactly zero with none
    } else {
      cat = "direction"; // delta known, no interval computable
    }
  }
  return {
    challenger, delta, cost, tokens, cat,
    study_id: p.study_id, study_name: p.study_name, tier: p.weight_tier,
    model: p.model, effort: p.effort, metric: p.metric,
    interval: p.interval_pp, basis: p.interval_basis, published: p.published,
  };
}

// --- Lane geometry ----------------------------------------------------------
// Quality: three columns. "noclear" holds both inside-interval and
// direction-only results; mark shape keeps them distinguishable.
const QCOLS = [
  { id: "native", w: 150 }, { id: "noclear", w: 210 }, { id: "challenger", w: 150 },
];
const QW = QCOLS.reduce((a, c) => a + c.w, 0);

// Cost: symmetric fold-change axis centred on 1×. Distance from the centre is
// proportional to how many times cheaper one side is, so "Claude Code 2×
// cheaper" (2×) sits exactly opposite "harness 2× cheaper" (½×) and the two
// directional headers read the same way. Expensive (favors native) is left,
// cheap is right. The axis caps at FOLD_MAX so the cluster of real results
// stays spread out; anything beyond it parks in an outlier gutter on its own
// side of the axis, with its fold difference written out, so it never
// masquerades as an on-scale reading.
const FOLD_MAX = 2;
const CL = { w: 380, pad: 12 };
const OUT_W = 52; // outlier gutter width (one per side), constant for alignment
const fold = v => (v >= 1 ? v : 1 / v);
const isOutlier = v => fold(v) > FOLD_MAX + 1e-9;
const cx = v => {
  const off = ((Math.min(fold(v), FOLD_MAX) - 1) / (FOLD_MAX - 1)) * (CL.w / 2);
  return CL.pad + CL.w / 2 + (v >= 1 ? -off : off);
};
const CW = CL.w + CL.pad * 2;
const CTOT = OUT_W + CW + OUT_W; // full cost lane width incl. both gutters
const COST_TICKS = [
  { v: 2, l: "2&#215;" }, { v: 1.5, l: "1.5&#215;" }, { v: 1, l: "1&#215;" },
  { v: 1 / 1.5, l: "1.5&#215;" }, { v: 1 / 2, l: "2&#215;" },
];
// Gutter labels read as folds, matching the tick convention on each side.
const outLabel = v => { const f = fold(v); return `${f >= 10 ? f.toFixed(0) : f.toFixed(1)}&#215;`; };
const MARK_STEP = 17;
const LINE_H = 20;
const NEUTRAL = "#64748b";

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

function markShape(r, x, y, rowColor) {
  const ring = r.tier === "anchor" ? `<circle cx="${x}" cy="${y}" r="8" fill="none" stroke="${rowColor}" stroke-width="1.2" opacity="0.55"/>` : "";
  let m;
  if (r.cat === "direction") {
    m = `<rect x="${x - 4.4}" y="${y - 4.4}" width="8.8" height="8.8" transform="rotate(45 ${x} ${y})" fill="#ffffff" stroke="${rowColor}" stroke-width="1.6"/>`;
  } else if (r.cat === "unclear") {
    m = `<circle cx="${x}" cy="${y}" r="5" fill="#ffffff" stroke="${rowColor}" stroke-width="1.8"/>`;
  } else {
    m = `<circle cx="${x}" cy="${y}" r="5.5" fill="${rowColor}"/>`;
  }
  return ring + m;
}

// Lay out marks in a column, grouped by study, wrapping lines.
// Any mark whose study repeats anywhere in the panel gets a grey backing.
function layoutColumn(results, colX, colW, rowColor, isRepeated) {
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
    positions.push({ sid, cells });
  }
  const lines = Math.max(1, Math.ceil(i / perLine));
  for (const g of positions) {
    if (isRepeated(g.sid)) {
      const byLine = new Map();
      for (const c of g.cells) {
        if (!byLine.has(c.line)) byLine.set(c.line, []);
        byLine.get(c.line).push(c);
      }
      for (const cells of byLine.values()) {
        const x0 = colX + 8 + cells[0].col * MARK_STEP;
        const x1 = colX + 8 + cells[cells.length - 1].col * MARK_STEP + 12;
        const y = 10 + cells[0].line * LINE_H;
        svg += `<rect class="capsule" data-study="${esc(g.sid)}" x="${x0 - 4}" y="${y - 9}" width="${x1 - x0 + 8}" height="18" rx="9" fill="#e8e8e8" stroke="#cccccc" stroke-width="1"/>`;
      }
    }
    for (const c of g.cells) {
      const x = colX + 14 + c.col * MARK_STEP;
      const y = 10 + c.line * LINE_H;
      svg += `<g class="mark" ${tipAttrs(c.r)}>${markShape(c.r, x, y, rowColor)}</g>`;
    }
  }
  return { svg, lines };
}

function qualityLane(results, rowColor, challenger, isRepeated) {
  const byCat = { native: [], noclear: [], challenger: [] };
  for (const r of results) {
    if (!r.cat) continue;
    byCat[r.cat === "native" || r.cat === "challenger" ? r.cat : "noclear"].push(r);
  }
  const colX = {};
  let x = 0;
  for (const c of QCOLS) { colX[c.id] = x; x += c.w; }
  let marks = "", maxLines = 1;
  for (const c of QCOLS) {
    const out = layoutColumn(byCat[c.id], colX[c.id], c.w, rowColor, isRepeated);
    marks += out.svg;
    maxLines = Math.max(maxLines, byCat[c.id].length ? out.lines : 1);
  }
  const h = maxLines * LINE_H + 4;
  // direction tints: native zone neutral, challenger zone in the row's color
  let svg = `<rect x="0" y="0" width="${QCOLS[0].w}" height="${h}" fill="${NEUTRAL}" opacity="0.06"/>` +
    `<rect x="${colX.challenger}" y="0" width="${QCOLS[2].w}" height="${h}" fill="${rowColor}" opacity="0.07"/>` +
    `<text x="${colX.challenger + QCOLS[2].w - 8}" y="${h / 2 + 3.5}" text-anchor="end" font-size="9.5" letter-spacing="0.06em" fill="${rowColor}" opacity="0.5">${esc(challenger.toUpperCase())} &#8594;</text>`;
  let gx = 0;
  for (const c of QCOLS.slice(0, -1)) { gx += c.w; svg += `<line x1="${gx}" y1="0" x2="${gx}" y2="${h}" stroke="#e6e6e6"/>`; }
  return { svg: `<svg width="${QW}" height="${h}" class="lane">${svg}${marks}</svg>`, h };
}

function costLane(results, rowColor, challenger, isRepeated) {
  const withCost = results.filter(r => r.cost != null);
  const tokenOnly = results.filter(r => r.cost == null && r.tokens != null);
  if (!withCost.length) {
    let note = `<span class="nocost">no cost reported</span>`;
    if (tokenOnly.length) {
      const pcts = tokenOnly.map(r => (r.tokens - 1) * 100);
      note = `<span class="nocost">no cost &#183; tokens ${Math.min(...pcts).toFixed(0)}% to ${Math.max(...pcts).toFixed(0)}% vs native</span>`;
    }
    return { html: `<div class="costnote" style="width:${CTOT}px">${note}</div>`, h: 24 };
  }
  const sorted = [...withCost].sort((a, b) => a.cost - b.cost);
  const placed = [];
  for (const r of sorted) {
    const out = isOutlier(r.cost);
    // outliers park in the gutter on their own side: expensive left, cheap right
    const x = out ? (r.cost > 1 ? 34 : OUT_W + CW + 18) : OUT_W + cx(r.cost);
    let line = 0;
    while (placed.some(p => p.line === line && Math.abs(p.x - x) < 18)) line++;
    placed.push({ r, x, line, out });
  }
  const lines = Math.max(1, ...placed.map(p => p.line + 1));
  const h = lines * LINE_H + 4;
  // tints mirror the quality lane: left of 1× favors native, right favors challenger
  const c1 = OUT_W + cx(1);
  let svg = `<rect x="${OUT_W}" y="0" width="${c1 - OUT_W}" height="${h}" fill="${NEUTRAL}" opacity="0.06"/>` +
    `<rect x="${c1}" y="0" width="${OUT_W + CW - c1}" height="${h}" fill="${rowColor}" opacity="0.07"/>` +
    `<line x1="${OUT_W - 4}" y1="0" x2="${OUT_W - 4}" y2="${h}" stroke="#d9d9d9" stroke-dasharray="2,3"/>` +
    `<line x1="${OUT_W + CW + 4}" y1="0" x2="${OUT_W + CW + 4}" y2="${h}" stroke="#d9d9d9" stroke-dasharray="2,3"/>` +
    `<text x="${OUT_W + CW - 8}" y="${h / 2 + 3.5}" text-anchor="end" font-size="9.5" letter-spacing="0.06em" fill="${rowColor}" opacity="0.5">${esc(challenger.toUpperCase())} &#8594;</text>`;
  for (const t of COST_TICKS) {
    svg += `<line x1="${OUT_W + cx(t.v)}" y1="0" x2="${OUT_W + cx(t.v)}" y2="${h}" stroke="${t.v === 1 ? "#8a8a8a" : "#e9e9e9"}" stroke-width="${t.v === 1 ? 1.4 : 1}"/>`;
  }
  for (const p of placed) {
    if (isRepeated(p.r.study_id)) {
      const y = 10 + p.line * LINE_H;
      svg += `<rect class="capsule" data-study="${esc(p.r.study_id)}" x="${p.x - 9}" y="${y - 9}" width="18" height="18" rx="9" fill="#e8e8e8" stroke="#cccccc" stroke-width="1"/>`;
    }
  }
  for (const p of placed) {
    const y = 10 + p.line * LINE_H;
    const label = p.out
      ? (p.r.cost > 1
        ? `<text x="${p.x - 9}" y="${y + 3.5}" font-size="10" text-anchor="end" fill="#505a5f">${outLabel(p.r.cost)}</text>`
        : `<text x="${p.x + 9}" y="${y + 3.5}" font-size="10" text-anchor="start" fill="#505a5f">${outLabel(p.r.cost)}</text>`)
      : "";
    svg += `<g class="mark" ${tipAttrs(p.r)}>${markShape(p.r, p.x, y, rowColor)}${label}</g>`;
  }
  return { html: `<svg width="${CTOT}" height="${h}" class="lane">${svg}</svg>`, h };
}

// --- Expanded detail: cost-vs-quality quadrant scatter ----------------------
const SC = { ymin: -25, ymax: 25, h: 210, top: 16 };
const LM = 40;                       // left margin for y labels
const GUT = 88;                      // right gutter for quality-only points
const sx = v => LM + OUT_W + cx(v); // on-scale values; outliers park left of OUT
const sy = v => SC.top + ((SC.ymax - Math.min(Math.max(v, SC.ymin), SC.ymax)) / (SC.ymax - SC.ymin)) * SC.h;

function detailBlock(native, challenger, results) {
  const c = color(challenger);
  const quality = results.filter(r => r.delta != null);
  const both = quality.filter(r => r.cost != null);
  const qOnly = quality.filter(r => r.cost == null);
  const cOnly = results.filter(r => r.delta == null && r.cost != null);
  const rec = {
    challenger: quality.filter(r => r.cat === "challenger").length,
    native: quality.filter(r => r.cat === "native").length,
    unclear: quality.filter(r => r.cat === "unclear").length,
    direction: quality.filter(r => r.cat === "direction").length,
  };
  const nStudies = new Set(results.filter(r => r.cat != null || r.cost != null).map(r => r.study_id));
  let html = `<p class="record"><strong>${esc(challenger)}</strong> vs ${esc(native)} across ${nStudies.size} ${nStudies.size === 1 ? "study" : "studies"}: ` +
    `${rec.challenger} clear ${esc(challenger)} lead${rec.challenger === 1 ? "" : "s"}, ${rec.native} clear ${esc(native)} lead${rec.native === 1 ? "" : "s"}, ` +
    `${rec.unclear} with no clear lead, ${rec.direction} direction-only (no interval).</p>`;

  if (quality.length || cOnly.length) {
    const plotBottom = SC.top + SC.h;
    const xLabelY = plotBottom + 16;
    const stripY = xLabelY + 24;
    const totalH = (cOnly.length ? stripY + 14 : xLabelY + 8) + 14;
    const totalW = LM + CTOT + (qOnly.length ? GUT : 0) + 8;
    let svg = `<svg width="${totalW}" height="${totalH}">`;
    // quadrant tints: up = challenger better, right = cheaper
    svg += `<rect x="${LM + OUT_W}" y="${SC.top}" width="${cx(1)}" height="${SC.h}" fill="${NEUTRAL}" opacity="0.05"/>`;
    svg += `<rect x="${sx(1)}" y="${SC.top}" width="${LM + OUT_W + CW - sx(1)}" height="${SC.h / 2}" fill="${c}" opacity="0.06"/>`;
    // outlier gutters, same convention as the hero lane: one per side
    svg += `<line x1="${LM + OUT_W - 4}" y1="${SC.top}" x2="${LM + OUT_W - 4}" y2="${plotBottom}" stroke="#d9d9d9" stroke-dasharray="2,3"/>` +
      `<line x1="${LM + OUT_W + CW + 4}" y1="${SC.top}" x2="${LM + OUT_W + CW + 4}" y2="${plotBottom}" stroke="#d9d9d9" stroke-dasharray="2,3"/>` +
      `<text x="${LM + OUT_W / 2 - 2}" y="${xLabelY}" font-size="10" text-anchor="middle" fill="#767a7e">&gt;${FOLD_MAX}&#215;</text>` +
      `<text x="${LM + OUT_W + CW + OUT_W / 2 + 2}" y="${xLabelY}" font-size="10" text-anchor="middle" fill="#767a7e">&gt;${FOLD_MAX}&#215;</text>`;
    // grid
    for (const t of [-20, -10, 0, 10, 20]) {
      svg += `<line x1="${LM + OUT_W}" y1="${sy(t)}" x2="${LM + OUT_W + CW}" y2="${sy(t)}" stroke="${t === 0 ? "#8a8a8a" : "#ececec"}"/>` +
        `<text x="${LM - 6}" y="${sy(t) + 3.5}" font-size="10" text-anchor="end" fill="#505a5f">${t > 0 ? "+" + t : t}</text>`;
    }
    for (const t of COST_TICKS) {
      svg += `<line x1="${sx(t.v)}" y1="${SC.top}" x2="${sx(t.v)}" y2="${plotBottom}" stroke="${t.v === 1 ? "#8a8a8a" : "#ececec"}"/>` +
        `<text x="${sx(t.v)}" y="${xLabelY}" font-size="10" text-anchor="middle" fill="#505a5f">${t.l}</text>`;
    }
    // quadrant labels
    const ql = (x, y, anchor, text) =>
      `<text x="${x}" y="${y}" font-size="10" font-style="italic" text-anchor="${anchor}" fill="#9ca3af">${text}</text>`;
    svg += ql(LM + OUT_W + 6, SC.top + 12, "start", `${esc(challenger)} better &#183; costs more`);
    svg += ql(LM + OUT_W + CW - 6, SC.top + 12, "end", `${esc(challenger)} better &#183; cheaper`);
    svg += ql(LM + OUT_W + 6, plotBottom - 6, "start", `worse &#183; costs more`);
    svg += ql(LM + OUT_W + CW - 6, plotBottom - 6, "end", `worse &#183; cheaper`);
    // points with both metrics
    for (const r of both) {
      const out = isOutlier(r.cost);
      const x = out ? (r.cost > 1 ? LM + 34 : LM + OUT_W + CW + 18) : sx(r.cost), y = sy(r.delta);
      if (r.interval != null) {
        const lo = sy(r.delta - r.interval), hi = sy(r.delta + r.interval);
        const clipped = r.delta - r.interval < SC.ymin || r.delta + r.interval > SC.ymax;
        svg += `<line x1="${x}" y1="${hi}" x2="${x}" y2="${lo}" stroke="#9a9a9a" stroke-width="2"${clipped ? ' stroke-dasharray="3,2"' : ""}/>`;
      }
      const label = out
        ? (r.cost > 1
          ? `<text x="${x - 9}" y="${y + 3.5}" font-size="10" text-anchor="end" fill="#505a5f">${outLabel(r.cost)}</text>`
          : `<text x="${x + 9}" y="${y + 3.5}" font-size="10" text-anchor="start" fill="#505a5f">${outLabel(r.cost)}</text>`)
        : "";
      svg += `<g class="mark" ${tipAttrs(r)}>${markShape(r, x, y, c)}${label}</g>`;
    }
    // quality-only gutter (no cost reported)
    if (qOnly.length) {
      const gx0 = LM + CTOT + 10;
      svg += `<line x1="${gx0 - 5}" y1="${SC.top}" x2="${gx0 - 5}" y2="${plotBottom}" stroke="#d9d9d9" stroke-dasharray="2,3"/>` +
        `<text x="${gx0 + GUT / 2 - 10}" y="${SC.top - 4}" font-size="9.5" text-anchor="middle" fill="#767a7e">NO COST DATA</text>`;
      qOnly.forEach((r, i) => {
        const x = gx0 + 12 + (i % 4) * 16;
        const y = sy(r.delta);
        if (r.interval != null) {
          svg += `<line x1="${x}" y1="${sy(r.delta + r.interval)}" x2="${x}" y2="${sy(r.delta - r.interval)}" stroke="#c9c9c9" stroke-width="1.6"/>`;
        }
        svg += `<g class="mark" ${tipAttrs(r)}>${markShape(r, x, y, c)}</g>`;
      });
    }
    // cost-only strip (no matched quality)
    if (cOnly.length) {
      svg += `<text x="${LM - 6}" y="${stripY + 3.5}" font-size="9.5" text-anchor="end" fill="#767a7e">COST ONLY</text>`;
      for (const r of cOnly) {
        const x = isOutlier(r.cost) ? (r.cost > 1 ? LM + 34 : LM + OUT_W + CW + 18) : sx(r.cost);
        svg += `<g class="mark" ${tipAttrs(r)}><circle cx="${x}" cy="${stripY}" r="5" fill="${c}"/></g>`;
      }
    }
    // axis titles
    svg += `<text x="${LM}" y="10" font-size="10" fill="#505a5f">quality &#916; pp vs ${esc(native)}</text>`;
    svg += `<text x="${LM + OUT_W + CW / 2}" y="${xLabelY + (cOnly.length ? 38 : 14)}" font-size="10" text-anchor="middle" fill="#505a5f">cost vs ${esc(native)}</text>`;
    svg += `</svg>`;
    html += svg;
  }
  if (both.length || cOnly.length) {
    const costs = [...both, ...cOnly];
    html += `<p class="record">Cost, ${esc(challenger)} relative to ${esc(native)}: ` +
      costs.map(r => `${r.cost.toFixed(2)}&#215; <span class="dim">(${esc(r.study_name)}, ${esc(r.model ?? "")}${r.effort ? ", " + esc(r.effort) : ""})</span>`).join(" · ") + `</p>`;
  }
  html += `<p class="record dim">Sources: ` + [...nStudies].map(sid =>
    `<a href="${esc(studies[sid].source_url)}">${esc(studies[sid].name)}</a>` +
    (studies[sid].conflict !== "none" ? ` (${esc(studies[sid].conflict)})` : "")).join(" · ") + `</p>`;
  return html;
}

// --- Assemble ----------------------------------------------------------------
// --- The field at a glance: origin-centred cost-quality plane ---------------
// The aggregated analog of a single study's Pareto scatter. Absolute units do
// not survive aggregation across benchmarks, but every matched result's
// position relative to its own study's native baseline does: quality delta in
// points (y, gated by the study's winning interval) and cost fold (x, the
// same capped symmetric axis as the cost lane). The native harness IS the
// origin. A mark up and to the right beat the native on both counts at once
// -- the cross-study equivalent of sitting on the frontier.
const PLN = { lm: 44, top: 30, h: 300, gut: 116 };
function planeView(panel, results, isRepeated, rowOrder) {
  const native = panel.native;
  const withQ = results.filter(r => r.delta != null);
  const both = withQ.filter(r => r.cost != null);
  const qOnly = withQ.filter(r => r.cost == null);
  const YMAX = 25;
  const clampD = v => Math.max(-YMAX, Math.min(YMAX, v));
  const sy = v => PLN.top + ((YMAX - clampD(v)) / (2 * YMAX)) * PLN.h;
  const sx = v => PLN.lm + OUT_W + cx(v);
  const bottom = PLN.top + PLN.h;
  const ic0 = PLN.lm + OUT_W, ic1 = PLN.lm + OUT_W + CW; // in-scale span
  const gx0 = PLN.lm + CTOT + 14;                        // no-cost strip
  const W = qOnly.length ? gx0 + PLN.gut + 4 : PLN.lm + CTOT + 4;
  const H = bottom + 36;
  const cx1 = ic0 + cx(1);
  const y0 = sy(0);
  const ql = (x, y, anchor, text) =>
    `<text x="${x}" y="${y}" font-size="9.5" text-anchor="${anchor}" fill="#8a9096" letter-spacing="0.04em">${text}</text>`;

  let svg = `<svg width="${W}" height="${H}" class="lane">`;
  // quadrant tints: up-right = dominates the native, down-left = dominated
  svg += `<rect x="${cx1}" y="${PLN.top}" width="${ic1 - cx1}" height="${y0 - PLN.top}" fill="#16a34a" opacity="0.06"/>` +
    `<rect x="${ic0}" y="${y0}" width="${cx1 - ic0}" height="${bottom - y0}" fill="${NEUTRAL}" opacity="0.05"/>`;
  // grid + ticks
  for (const t of [-20, -10, 10, 20]) {
    svg += `<line x1="${ic0}" y1="${sy(t)}" x2="${ic1}" y2="${sy(t)}" stroke="#f0f0f0"/>` +
      `<text x="${PLN.lm - 6}" y="${sy(t) + 3.5}" font-size="10" text-anchor="end" fill="#505a5f">${t > 0 ? "+" + t : t}</text>`;
  }
  svg += `<text x="${PLN.lm - 6}" y="${y0 + 3.5}" font-size="10" text-anchor="end" fill="#505a5f">0</text>`;
  for (const t of COST_TICKS) {
    svg += `<line x1="${ic0 + cx(t.v)}" y1="${PLN.top}" x2="${ic0 + cx(t.v)}" y2="${bottom}" stroke="${t.v === 1 ? "#c7c7c7" : "#f0f0f0"}"/>` +
      `<text x="${ic0 + cx(t.v)}" y="${bottom + 16}" font-size="10" text-anchor="middle" fill="#505a5f">${t.l}</text>`;
  }
  // origin lines
  svg += `<line x1="${ic0}" y1="${y0}" x2="${ic1}" y2="${y0}" stroke="#8a8a8a"/>`;
  // outlier gutters, same convention as the cost lane
  svg += `<line x1="${ic0 - 4}" y1="${PLN.top}" x2="${ic0 - 4}" y2="${bottom}" stroke="#d9d9d9" stroke-dasharray="2,3"/>` +
    `<line x1="${ic1 + 4}" y1="${PLN.top}" x2="${ic1 + 4}" y2="${bottom}" stroke="#d9d9d9" stroke-dasharray="2,3"/>` +
    `<text x="${PLN.lm + OUT_W / 2 - 2}" y="${bottom + 16}" font-size="10" text-anchor="middle" fill="#767a7e">&gt;${FOLD_MAX}&#215;</text>` +
    `<text x="${ic1 + OUT_W / 2 + 2}" y="${bottom + 16}" font-size="10" text-anchor="middle" fill="#767a7e">&gt;${FOLD_MAX}&#215;</text>`;
  // directional headers + quadrant labels
  svg += `<text x="${ic0}" y="${PLN.top - 16}" font-size="9.5" letter-spacing="0.06em" fill="#505a5f">&#8592; ${esc(native.toUpperCase())} CHEAPER</text>` +
    `<text x="${ic1}" y="${PLN.top - 16}" font-size="9.5" letter-spacing="0.06em" text-anchor="end" fill="#505a5f">HARNESS CHEAPER &#8594;</text>`;
  svg += ql(ic0 + 6, PLN.top + 11, "start", "harness better &#183; costs more");
  svg += ql(ic1 - 6, PLN.top + 11, "end", "harness better &#183; cheaper");
  svg += ql(ic0 + 6, bottom - 5, "start", "worse &#183; costs more");
  svg += ql(ic1 - 6, bottom - 5, "end", "worse &#183; cheaper");
  svg += `<text transform="rotate(-90 11 ${y0})" x="11" y="${y0}" font-size="10" text-anchor="middle" fill="#505a5f">&#916; quality (pp)</text>`;

  // place marks with both metrics
  const placed = both.map(r => {
    const out = isOutlier(r.cost);
    const x = out ? (r.cost > 1 ? PLN.lm + 34 : ic1 + 18) : sx(r.cost);
    return { r, x, y: sy(r.delta), out };
  });
  // no-cost strip keeps the true quality position; collisions shift right
  if (qOnly.length) {
    svg += `<line x1="${gx0 - 8}" y1="${PLN.top}" x2="${gx0 - 8}" y2="${bottom}" stroke="#d9d9d9" stroke-dasharray="2,3"/>` +
      `<text x="${gx0 + PLN.gut / 2 - 8}" y="${PLN.top - 16}" font-size="9.5" letter-spacing="0.06em" text-anchor="middle" fill="#767a7e">NO COST DATA</text>`;
    for (const r of [...qOnly].sort((a, b) => b.delta - a.delta)) {
      const y = sy(r.delta);
      const k = placed.filter(p => p.strip && Math.abs(p.y - y) < 13).length;
      placed.push({ r, x: gx0 + 6 + k * 15, y, strip: true });
    }
  }
  // capsules behind, whiskers, then marks
  for (const p of placed) {
    if (isRepeated(p.r.study_id)) {
      svg += `<rect class="capsule" data-study="${esc(p.r.study_id)}" x="${p.x - 9}" y="${p.y - 9}" width="18" height="18" rx="9" fill="#e8e8e8" stroke="#cccccc" stroke-width="1"/>`;
    }
  }
  for (const p of placed) {
    if (p.r.interval == null) continue;
    const lo = sy(p.r.delta - p.r.interval), hi = sy(p.r.delta + p.r.interval);
    const clipped = Math.abs(p.r.delta - p.r.interval) > YMAX || Math.abs(p.r.delta + p.r.interval) > YMAX;
    svg += `<line x1="${p.x}" y1="${hi}" x2="${p.x}" y2="${lo}" stroke="#b3b3b3" stroke-width="1.4"${clipped ? ' stroke-dasharray="3,2"' : ""}/>`;
  }
  for (const p of placed) {
    const label = p.out
      ? (p.r.cost > 1
        ? `<text x="${p.x - 9}" y="${p.y + 3.5}" font-size="10" text-anchor="end" fill="#505a5f">${outLabel(p.r.cost)}</text>`
        : `<text x="${p.x + 9}" y="${p.y + 3.5}" font-size="10" text-anchor="start" fill="#505a5f">${outLabel(p.r.cost)}</text>`)
      : "";
    svg += `<g class="mark" ${tipAttrs(p.r)}>${markShape(p.r, p.x, p.y, color(p.r.challenger))}${label}</g>`;
  }
  svg += `</svg>`;

  const seen = new Set(withQ.map(r => r.challenger));
  const chips = rowOrder.filter(ch => seen.has(ch)).map(ch =>
    `<span class="lg"><span class="dot" style="background:${color(ch)}"></span>${esc(ch)}</span>`).join("");
  return `
  <div class="planecard">
    <div class="lanetitle">The field at a glance &#8212; every matched result, cost &#215; quality, vs ${esc(native)}</div>
    <div class="legend2">${chips}</div>
    ${svg}
    <p class="provnote">${native === "Claude Code" ? "Claude Code" : "Codex"} sits at the origin. ${both.length} results report cost and quality together; ${qOnly.length} report quality only (right strip). Same mark language as the lanes below: filled = clear lead, open = inside the study's interval, diamond = direction only; whiskers show the interval; grey backing = same study.</p>
  </div>`;
}

let body = "";
for (const panel of PANELS) {
  const oriented = pairs
    .filter(p => p.model_family === panel.family)
    .map(p => orient(p, panel.native))
    .filter(Boolean);
  // A result is hero-plottable if it draws at least one mark. Token-only rows
  // feed the textual token note but must not inflate ranking or coverage.
  const isPlottable = r => r.cat != null || r.cost != null;
  const plottable = oriented.filter(isPlottable);
  // Panel-scope mark counts per study drive the same-study backing.
  const markCount = new Map();
  for (const r of oriented) {
    const n = (r.cat ? 1 : 0) + (r.cost != null ? 1 : 0);
    if (n) markCount.set(r.study_id, (markCount.get(r.study_id) ?? 0) + n);
  }
  const isRepeated = sid => (markCount.get(sid) ?? 0) > 1;

  const byChallenger = new Map();
  for (const r of oriented) {
    if (!byChallenger.has(r.challenger)) byChallenger.set(r.challenger, []);
    byChallenger.get(r.challenger).push(r);
  }
  // Rank by breadth of evidence (distinct studies) before volume, so one
  // prolific source cannot claim the top row; count only plottable results.
  const nStud = rs => new Set(rs.filter(isPlottable).map(r => r.study_id)).size;
  const nPlot = rs => rs.filter(isPlottable).length;
  const rows = [...byChallenger.entries()].sort((a, b) =>
    nStud(b[1]) - nStud(a[1]) || nPlot(b[1]) - nPlot(a[1]));
  const nResults = plottable.length;
  const nStudies = new Set(plottable.map(r => r.study_id)).size;
  const nCostStudies = new Set(plottable.filter(r => r.cost != null).map(r => r.study_id)).size;

  const axis = `<svg width="${CTOT}" height="22" class="lane">` +
    `<text x="${OUT_W / 2 - 2}" y="14" font-size="10.5" text-anchor="middle" fill="#767a7e">&gt;${FOLD_MAX}&#215;</text>` +
    `<text x="${OUT_W + CW + OUT_W / 2 + 2}" y="14" font-size="10.5" text-anchor="middle" fill="#767a7e">&gt;${FOLD_MAX}&#215;</text>` +
    COST_TICKS.map(t =>
      `<text x="${OUT_W + cx(t.v)}" y="14" font-size="10.5" text-anchor="middle" fill="#505a5f">${t.l}</text>`).join("") + `</svg>`;

  let rowsHtml = "";
  for (const [challenger, results] of rows) {
    const rowColor = color(challenger);
    const q = qualityLane(results, rowColor, challenger, isRepeated);
    const cl = costLane(results, rowColor, challenger, isRepeated);
    const id = `${panel.key}-${slug(challenger)}`;
    rowsHtml += `
<div class="row" id="${id}">
  <button class="rowhead" aria-expanded="false" data-target="${id}-detail">
    <span class="chip" style="background:${rowColor}">${esc(monogram(challenger))}</span>
    <span class="hname">${esc(challenger)}</span>
    <span class="caret">&#9656;</span>
  </button>
  <div class="qcell">${q.svg}</div>
  <div class="ccell">${cl.html}</div>
</div>
<div class="detail" id="${id}-detail" hidden>${detailBlock(panel.native, challenger, results)}</div>`;
  }

  const plane = planeView(panel, oriented, isRepeated, rows.map(([ch]) => ch));
  body += `
<section class="panel">
  <h2>Using ${esc(panel.family)} <span class="vs">&mdash; every harness compared with ${esc(panel.native)}</span></h2>
  <p class="coverage">${nResults} matched results &#183; ${nStudies} studies &#183; ${nCostStudies} report cost. Anchor and supporting studies only; each mark is one published matched result.</p>
  ${plane}
  <div class="row lanehead">
    <div class="rowhead"></div>
    <div class="qcell">
      <div class="lanetitle">Quality &#8212; vs ${esc(panel.native)}</div>
      <div class="qheads">${QCOLS.map(col => `<span style="width:${col.w}px">${{
        native: `&#8592; ${esc(panel.native)} leads`, noclear: "no clear lead", challenger: "harness leads &#8594;",
      }[col.id]}</span>`).join("")}</div>
    </div>
    <div class="ccell">
      <div class="lanetitle">Cost &#8212; vs ${esc(panel.native)}</div>
      <div class="qheads costheads"><span>&#8592; ${esc(panel.native)} cheaper</span><span>harness cheaper &#8594;</span></div>
      ${axis}
    </div>
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
  .qcell { width: ${QW}px; flex: none; }
  .ccell { width: ${CTOT}px; flex: none; margin-left: 26px; padding-left: 14px; border-left: 3px solid #e5e7eb; }
  .lanetitle { font-size: 0.8rem; font-weight: 700; color: #1f2937; margin-bottom: 4px; }
  .qheads { display: flex; }
  .costheads { width: ${CTOT}px; justify-content: space-between; }
  .costheads span:last-child { text-align: right; padding-right: 8px; padding-left: 0; }
  .qheads span { display: inline-block; font-size: 0.72rem; text-transform: uppercase;
                 letter-spacing: 0.04em; color: #505a5f; padding-left: 8px; }
  .qheads span:last-child { text-align: right; padding-right: 8px; padding-left: 0; }
  .lane { display: block; }
  .costnote { padding: 2px 0 0 12px; }
  .nocost { color: #b1b4b6; font-size: 0.78rem; font-style: italic; }
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
  .planecard { margin: 10px 0 30px; }
  .legend2 { color: #3d4247; font-size: 0.9rem; margin: 8px 0 2px; }
  .legend2 .lg { margin-right: 18px; }
  .legend2 .dot { display: inline-block; width: 11px; height: 11px; border-radius: 50%; vertical-align: -1px; margin-right: 6px; }
  .provnote { color: #767a7e; font-size: 0.82rem; max-width: 940px; margin-top: 6px; }
</style>
</head>
<body>
<div class="map-wrap">
<h1>Which harness should I run?</h1>
<p class="lede2">Every published matched comparison against the harness you would use by default. One rule for reading it: <strong>left favors the default harness, right favors the challenger</strong> &mdash; on quality (who leads, given each study's own dispersion) and on cost (how much the same runs cost, cheaper to the right). Hover any mark for the study behind it; click a harness for its cost&ndash;quality detail; click any mark to spotlight its study everywhere it appears.</p>
<p class="legend">
  <svg class="sw" width="14" height="14"><circle cx="7" cy="7" r="5.5" fill="#505a5f"/></svg> clear lead (outside the study's winning interval)
  <svg class="sw" width="14" height="14"><circle cx="7" cy="7" r="5" fill="#fff" stroke="#505a5f" stroke-width="1.8"/></svg> inside it
  <svg class="sw" width="14" height="14"><rect x="2.6" y="2.6" width="8.8" height="8.8" transform="rotate(45 7 7)" fill="#fff" stroke="#505a5f" stroke-width="1.6"/></svg> direction only, no interval
  <svg class="sw" width="18" height="14"><circle cx="9" cy="7" r="8" fill="none" stroke="#505a5f" opacity="0.55"/><circle cx="9" cy="7" r="4" fill="#505a5f"/></svg> ringed = anchor study
  <svg class="sw" width="26" height="14"><rect x="1" y="1" width="24" height="12" rx="6" fill="#ececec"/><circle cx="8" cy="7" r="3.6" fill="#505a5f"/><circle cx="17" cy="7" r="3.6" fill="#505a5f"/></svg> grey backing = same study
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
      var y = e.clientY + 16;
      if (y + tip.offsetHeight > window.innerHeight - 8) y = e.clientY - tip.offsetHeight - 12;
      tip.style.top = y + "px";
    } else tip.style.display = "none";
  });
  document.querySelectorAll(".rowhead[data-target]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var d = document.getElementById(btn.getAttribute("data-target"));
      var open = d.hidden;
      d.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      var rowId = btn.closest(".row").id;
      if (open) history.replaceState(null, "", "#" + rowId);
      else if (location.hash === "#" + rowId) history.replaceState(null, "", location.pathname + location.search);
    });
  });
  var note = document.getElementById("studynote");
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-study]");
    if (!el) return;
    var sid = el.getAttribute("data-study");
    var body = document.body;
    var already = body.classList.contains("spot") && body.getAttribute("data-spot") === sid;
    body.classList.toggle("spot", !already);
    body.setAttribute("data-spot", already ? "" : sid);
    document.querySelectorAll("[data-study]").forEach(function (m) {
      m.classList.toggle("lit", !already && m.getAttribute("data-study") === sid);
    });
    note.textContent = already ? "" : "Spotlight: results from one study, across every row and both lanes. Click it again to clear.";
  });
  if (location.hash) {
    var row = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (row) { var b = row.querySelector(".rowhead[data-target]"); if (b) b.click(); row.scrollIntoView(); }
  }
})();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(root, "site", "evidence-map.html"), html);

const eligible = PANELS.map(panel => {
  const o = pairs.filter(p => p.model_family === panel.family).map(p => orient(p, panel.native))
    .filter(r => r && (r.cat != null || r.cost != null));
  return `${panel.family}: ${o.length} plottable results, ${new Set(o.map(r => r.study_id)).size} studies, ${new Set(o.map(r => r.challenger)).size} challengers`;
});
console.log(`Built site/evidence-map.html. ${eligible.join(" | ")}`);
