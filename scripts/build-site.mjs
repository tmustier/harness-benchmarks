import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const siteDir = path.join(root, "site");
const siteDataDir = path.join(siteDir, "data");
const siteAssetsDir = path.join(siteDir, "assets");

const studies = JSON.parse(fs.readFileSync(path.join(dataDir, "studies.json"), "utf8"));
const observations = JSON.parse(fs.readFileSync(path.join(dataDir, "observations.json"), "utf8"));
const claims = JSON.parse(fs.readFileSync(path.join(dataDir, "claims.json"), "utf8"));
const external = JSON.parse(fs.readFileSync(path.join(dataDir, "external-datasets.json"), "utf8"));
const orderedStudies = [...studies].sort((a, b) => a.section_order - b.section_order);

const escapeHtml = value => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const format = (value, digits = 1) => Number(value).toFixed(digits).replace(/\.0$/, "");
const formatStudyDate = value => {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
};
const rowsFor = id => observations.filter(row => row.study_id === id);
const claimsFor = id => claims.filter(row => row.study_id === id);

const harnessColours = {
  "Pi": "#1d70b8",
  "Claude Code": "#d4351c",
  "Claude SDK": "#d4351c",
  "Codex": "#00703c",
  "OpenCode": "#6f72af",
  "Cursor": "#f47738",
  "Cursor CLI": "#f47738",
  "OpenClaw": "#12436d",
  "Hermes Agent": "#4c2c92",
  "mini-SWE-agent": "#28a197",
  "Gemini CLI": "#912b88",
  "CORE-Agent": "#b58840"
};

function colourFor(harness) {
  return harnessColours[harness] ?? "#505a5f";
}

function niceMax(value) {
  if (value <= 1) return Math.ceil(value * 10) / 10;
  if (value <= 5) return Math.ceil(value * 2) / 2;
  if (value <= 30) return Math.ceil(value / 5) * 5;
  if (value <= 300) return Math.ceil(value / 50) * 50;
  return Math.ceil(value / 1000) * 1000;
}

function scatterChart(rows, title) {
  const points = rows.filter(row => row.cost_usd_per_task !== null);
  const W = 900, H = 430, L = 72, R = 28, T = 28, B = 64;
  const plotW = W - L - R, plotH = H - T - B;
  const xMax = niceMax(Math.max(...points.map(row => row.cost_usd_per_task)) * 1.1);
  const x = value => L + value / xMax * plotW;
  const y = value => T + plotH - value / 100 * plotH;
  const xTicks = Array.from({ length: 6 }, (_, index) => xMax / 5 * index);
  const yTicks = [0, 20, 40, 60, 80, 100];
  const marks = points.map((row, index) => `<g>
    <circle cx="${x(row.cost_usd_per_task)}" cy="${y(row.performance_value)}" r="9" fill="${colourFor(row.harness)}" stroke="#ffffff" stroke-width="2" />
    <text x="${x(row.cost_usd_per_task)}" y="${y(row.performance_value) + 4}" text-anchor="middle" class="point-number">${index + 1}</text>
  </g>`).join("");
  const grid = [
    ...xTicks.map(tick => `<line x1="${x(tick)}" y1="${T}" x2="${x(tick)}" y2="${T + plotH}" /><text x="${x(tick)}" y="${T + plotH + 25}" text-anchor="middle">${format(tick, xMax < 5 ? 2 : 0)}</text>`),
    ...yTicks.map(tick => `<line x1="${L}" y1="${y(tick)}" x2="${L + plotW}" y2="${y(tick)}" /><text x="${L - 12}" y="${y(tick) + 4}" text-anchor="end">${tick}</text>`)
  ].join("");
  const keyRows = points.map((row, index) => `<tr><td><span class="point-key" style="background:${colourFor(row.harness)}">${index + 1}</span></td><td>${escapeHtml(row.model)}</td><td>${escapeHtml(row.harness)}</td><td>${format(row.performance_value)}% · $${format(row.cost_usd_per_task, 2)}</td></tr>`);
  const keyTable = rows => `<table class="chart-key"><thead><tr><th>Point</th><th>Model</th><th>Harness</th><th>Result · cost</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
  const key = keyRows.length > 8
    ? `<div class="chart-key-grid">${keyTable(keyRows.slice(0, 8))}${keyTable(keyRows.slice(8))}</div>`
    : keyTable(keyRows);
  return `<figure class="chart-block">
    <div class="chart-scroll"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="scatter-title-${escapeHtml(rows[0].study_id)} scatter-desc-${escapeHtml(rows[0].study_id)}">
      <title id="scatter-title-${escapeHtml(rows[0].study_id)}">${escapeHtml(title)}</title>
      <desc id="scatter-desc-${escapeHtml(rows[0].study_id)}">Performance from 0 to 100% plotted against cost per task from 0 to ${xMax} US dollars.</desc>
      <g class="chart-grid">${grid}</g>
      <text x="${L + plotW / 2}" y="${H - 8}" text-anchor="middle" class="axis-title">Cost per task in US dollars</text>
      <text transform="translate(18 ${T + plotH / 2}) rotate(-90)" text-anchor="middle" class="axis-title">Performance in %</text>
      ${marks}
    </svg></div>
    ${key}
  </figure>`;
}

function barChart(rows, title, valueField = "performance_value", max = 100, unit = "%") {
  const W = 900, rowH = 44, H = 58 + rows.length * rowH, L = 255, R = 80, T = 18, B = 34;
  const plotW = W - L - R;
  const x = value => L + value / max * plotW;
  const ticks = Array.from({ length: 6 }, (_, index) => max / 5 * index);
  const grid = ticks.map(tick => `<line x1="${x(tick)}" y1="${T}" x2="${x(tick)}" y2="${H - B}" /><text x="${x(tick)}" y="${H - 8}" text-anchor="middle">${format(tick)}${unit}</text>`).join("");
  const marks = rows.map((row, index) => {
    const value = row[valueField];
    const y = T + 17 + index * rowH;
    const ci = valueField === "performance_value" && row.ci_low !== null
      ? `<line class="ci" x1="${x(row.ci_low)}" y1="${y + 8}" x2="${x(row.ci_high)}" y2="${y + 8}" /><line class="ci" x1="${x(row.ci_low)}" y1="${y + 2}" x2="${x(row.ci_low)}" y2="${y + 14}" /><line class="ci" x1="${x(row.ci_high)}" y1="${y + 2}" x2="${x(row.ci_high)}" y2="${y + 14}" />`
      : "";
    return `<g><text x="${L - 12}" y="${y + 12}" text-anchor="end" class="bar-label">${escapeHtml(`${row.model} · ${row.harness}`)}</text><rect x="${L}" y="${y}" width="${Math.max(0, x(value) - L)}" height="16" fill="${colourFor(row.harness)}" />${ci}<text x="${Math.min(W - R + 8, x(value) + 9)}" y="${y + 12}" class="bar-value">${format(value, value < 10 ? 2 : 1)}${unit}</text></g>`;
  }).join("");
  return `<figure class="chart-block"><div class="chart-scroll"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(title)}"><g class="chart-grid">${grid}</g>${marks}</svg></div></figure>`;
}

function openBenchCharts(rows) {
  return `<div class="paired-charts"><section><h3>Mean wall time</h3>${barChart(rows, "Mean wall time per solve", "wall_time_seconds", 200, "s")}</section><section><h3>Tokens per solve</h3>${barChart([...rows].sort((a, b) => a.tokens_per_task - b.tokens_per_task), "Tokens per solve", "tokens_per_task", 100000, "")}</section></div>`;
}

function endorCharts(rows) {
  const W = 900, rowH = 55, H = 74 + rows.length * rowH, L = 265, R = 64, T = 42, B = 32;
  const plotW = W - L - R;
  const x = value => L + value / 100 * plotW;
  const ticks = [0, 20, 40, 60, 80, 100];
  const grid = ticks.map(tick => `<line x1="${x(tick)}" y1="${T}" x2="${x(tick)}" y2="${H - B}" /><text x="${x(tick)}" y="${H - 8}" text-anchor="middle">${tick}%</text>`).join("");
  const marks = rows.map((row, index) => {
    const y = T + 8 + index * rowH;
    return `<g>
      <text x="${L - 12}" y="${y + 18}" text-anchor="end" class="bar-label">${escapeHtml(`${row.model} · ${row.harness}`)}</text>
      <rect x="${L}" y="${y}" width="${x(row.performance_value) - L}" height="12" fill="#1d70b8" />
      <text x="${x(row.performance_value) + 8}" y="${y + 10}" class="bar-value">${format(row.performance_value)}%</text>
      <rect x="${L}" y="${y + 19}" width="${x(row.secondary_value) - L}" height="12" fill="#6f72af" />
      <text x="${x(row.secondary_value) + 8}" y="${y + 29}" class="bar-value">${format(row.secondary_value)}%</text>
    </g>`;
  }).join("");
  return `<figure class="chart-block"><div class="metric-key"><span><i class="functional"></i>Functional pass rate</span><span><i class="security"></i>Security pass rate</span></div><div class="chart-scroll"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Functional and security pass rates"><g class="chart-grid">${grid}</g>${marks}</svg></div></figure>`;
}

function claimChart(studyId) {
  const studyClaims = claimsFor(studyId);
  if (studyId === "databricks") {
    const rows = [
      { model: "Cost ratio", harness: "Lower-cost harness", performance_value: 1 },
      { model: "Cost ratio", harness: "Higher-cost harness", performance_value: 2 },
      { model: "Context ratio", harness: "Pi", performance_value: 1 },
      { model: "Context ratio", harness: "Native harness", performance_value: 3 }
    ];
    return `${barChart(rows, "Reported relative cost and context", "performance_value", 3.5, "×")}<p class="chart-caption">The source reports ‘more than 2 times’ for cost and ‘about 3 times’ for context. These are directional ratios, not exact run-level values.</p>`;
  }
  const rows = studyClaims.map(claim => ({ model: claim.claim.split(" sent")[0], harness: claim.claim.split(" sent")[0], performance_value: claim.value }));
  return `${barChart(rows, "Input prompt tokens", "performance_value", 30000, "")}<p class="chart-caption">This diagnostic measures fixed input overhead. It does not measure coding quality.</p>`;
}

function chartFor(study) {
  const rows = rowsFor(study.id);
  if (study.id === "databricks" || study.id === "portkey-harness-tax") return claimChart(study.id);
  if (!rows.length) return "";
  if (study.id === "openbench") return openBenchCharts(rows);
  if (study.id === "endor") return endorCharts(rows);
  if (rows.every(row => row.cost_usd_per_task !== null)) return scatterChart(rows, `${study.name}: performance and cost per task`);
  return barChart(rows, `${study.name}: ${rows[0].performance_metric}`);
}

function studySection(study) {
  const source = external.find(item => item.source_id === study.id);
  const repeatText = study.repeated_trials === true ? "yes" : study.repeated_trials === false ? "no" : "not clear";
  return `<article class="study" id="${escapeHtml(study.id)}">
    <header class="study-header">
      <p class="study-position"><span>${String(study.section_order).padStart(2, "0")}</span><span class="study-section">${escapeHtml(study.section)}</span><time datetime="${escapeHtml(study.published)}">${escapeHtml(formatStudyDate(study.published))}</time></p>
      <h2>${escapeHtml(study.slide_lead)}</h2>
    </header>
    <div class="study-layout">
      <aside class="study-context">
        <section><h3>What they did</h3><p>${escapeHtml(study.method_summary)}</p></section>
        <dl class="study-meta">
          <div><dt>Tasks</dt><dd>${study.task_count ?? "Not published"}</dd></div>
          <div><dt>Repeated trials</dt><dd>${repeatText}</dd></div>
          <div><dt>Grader</dt><dd>${escapeHtml(study.grader)}</dd></div>
        </dl>
        <section><h3>What we observe</h3><p>${escapeHtml(study.conclusion)}</p></section>
        <section class="study-limit"><h3>Limit</h3><p>${escapeHtml(study.limitation)}</p></section>
        <p class="source-line"><a href="${escapeHtml(study.source_url)}">${escapeHtml(study.publisher)} results</a>${source?.dataset_url ? `<br><a href="${escapeHtml(source.dataset_url)}">Dataset or repository</a>` : ""}</p>
      </aside>
      <section class="study-result" aria-label="Published results"><h3>Published results</h3><p class="chart-scroll-hint">Swipe charts horizontally to see every label and value.</p>${chartFor(study)}</section>
    </div>
    <p class="back-to-map"><a href="#benchmark-map">Back to benchmark map</a></p>
  </article>`;
}

const studyRows = orderedStudies.map(study => `<tr><td>${String(study.section_order).padStart(2, "0")}</td><td><a href="#${escapeHtml(study.id)}">${escapeHtml(study.name)}</a></td><td>${escapeHtml(study.task_surface)}</td><td>${study.matched_model_comparison ? "yes" : "no"}</td><td>${study.includes_pi ? "yes" : "no"}</td><td>${study.repeated_trials === true ? "yes" : study.repeated_trials === false ? "no" : "not clear"}</td><td>${study.reports_cost ? "yes" : "no"}</td></tr>`).join("");

const sectionNotes = {
  "Operational and broad evidence": "Start here: larger, more operational or more extensively reported comparisons.",
  "Focused domain evidence": "Strong task-specific evidence, but conclusions may not transfer outside the domain.",
  "Small and diagnostic evidence": "Useful signals with limited task counts or no direct measure of coding quality."
};

const overviewGroups = Object.entries(sectionNotes).map(([section, note], index) => {
  const items = orderedStudies.filter(study => study.section === section).map(study => `<li><a href="#${escapeHtml(study.id)}"><span>${String(study.section_order).padStart(2, "0")}</span><span>${escapeHtml(study.name)}</span><time datetime="${escapeHtml(study.published)}">${escapeHtml(formatStudyDate(study.published))}</time></a></li>`).join("");
  return `<section class="overview-group"><p class="overview-number">${index + 1}</p><h3>${escapeHtml(section)}</h3><p>${escapeHtml(note)}</p><ol>${items}</ol></section>`;
}).join("");

const sourceRows = external.map(item => `<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.access)}</td><td>${escapeHtml(item.licence)}</td><td><a href="${escapeHtml(item.result_url)}">Results</a>${item.dataset_url ? ` · <a href="${escapeHtml(item.dataset_url)}">Data</a>` : ""}</td></tr>`).join("");

const css = `
:root{--ink:#0b0c0c;--muted:#505a5f;--line:#b1b4b6;--paper:#ffffff;--wash:#f3f2f1;--blue:#1d70b8;--blue-dark:#003078;--green:#00703c;--yellow:#ffdd00;--red:#d4351c;--max:1120px}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.5;font-weight:400}a{color:var(--blue);text-decoration-thickness:2px;text-underline-offset:3px}a:hover{color:var(--blue-dark)}a:focus{outline:3px solid transparent;background:var(--yellow);box-shadow:0 -2px var(--yellow),0 4px var(--ink);color:var(--ink);text-decoration:none}.wrap{width:min(var(--max),calc(100% - 40px));margin:0 auto}.topbar{border-top:10px solid var(--blue);padding:20px 0;border-bottom:1px solid var(--line)}.topbar a{font-weight:500;color:var(--ink);text-decoration:none}.hero{padding:72px 0 64px;background:var(--wash);border-bottom:1px solid var(--line)}.eyebrow{margin:0 0 10px;color:var(--blue);font-size:16px;font-weight:500}.hero h1{max-width:850px;margin:0;font-size:64px;line-height:1.02;letter-spacing:-1.6px;font-weight:500}.hero .lede{max-width:820px;margin:28px 0 0;font-size:28px;line-height:1.3}.hero .date{margin:28px 0 0;color:var(--muted)}main{padding-bottom:80px}.summary{padding:54px 0;border-bottom:1px solid var(--line)}.summary h2,.method h2,.sources h2{font-size:38px;line-height:1.15;font-weight:500;margin:0 0 24px}.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}.summary-grid section{border-top:5px solid var(--ink);padding-top:16px}.summary-grid h3{font-size:22px;line-height:1.2;font-weight:500;margin:0 0 10px}.summary-grid p{margin:0}.method{padding:54px 0;border-bottom:1px solid var(--line)}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:16px}th{text-align:left;font-weight:500;border-bottom:3px solid var(--ink);padding:10px 12px 10px 0;vertical-align:bottom}td{border-bottom:1px solid var(--line);padding:12px 12px 12px 0;vertical-align:top}.study{padding:70px 0;border-bottom:4px solid var(--ink)}.study h2{font-size:44px;line-height:1.08;font-weight:500;margin:0;max-width:900px}.study-lead{font-size:25px;line-height:1.35;max-width:900px;margin:20px 0 30px}.study-meta{display:grid;grid-template-columns:2fr .6fr .8fr 1.4fr;margin:0 0 36px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.study-meta div{padding:16px 18px 16px 0}.study-meta dt{font-size:15px;color:var(--muted);margin-bottom:5px}.study-meta dd{margin:0;font-size:16px}.chart-block{margin:28px 0 22px}.chart-svg{display:block;width:100%;height:auto;overflow:visible}.chart-grid line{stroke:#b1b4b6;stroke-width:1}.chart-grid text,.axis-title,.bar-label,.bar-value{fill:#505a5f;font-family:Arial,Helvetica,sans-serif;font-size:13px}.axis-title{font-size:14px}.bar-label{fill:#0b0c0c}.bar-value{fill:#0b0c0c;font-weight:500}.point-number{fill:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:500}.ci{stroke:#0b0c0c;stroke-width:2}.chart-key{margin-top:8px}.chart-key th,.chart-key td{padding-top:8px;padding-bottom:8px}.point-key{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;color:#ffffff;font-size:13px}.paired-charts{display:grid;grid-template-columns:1fr 1fr;gap:30px}.paired-charts h3{font-size:21px;font-weight:500;border-top:4px solid var(--ink);padding-top:10px;margin:0}.paired-charts .bar-label,.paired-charts .bar-value{font-size:11px}.chart-caption{color:var(--muted);font-size:15px;margin:-10px 0 25px}.caveat{max-width:900px;border-left:8px solid var(--yellow);background:var(--wash);padding:18px 22px;margin:28px 0}.caveat h3{font-size:20px;font-weight:500;margin:0 0 6px}.caveat p{margin:0}.source-line{font-size:16px}.sources{padding:70px 0}.site-footer{background:var(--wash);border-top:1px solid var(--line);padding:35px 0}.site-footer p{margin:0;font-size:16px}
@media(max-width:800px){body{font-size:17px}.hero{padding:48px 0}.hero h1{font-size:44px}.hero .lede{font-size:23px}.summary-grid,.paired-charts{grid-template-columns:1fr}.study-meta{grid-template-columns:1fr 1fr}.study h2{font-size:36px}.study-lead{font-size:22px}.chart-key{font-size:14px}}
@media(max-width:520px){.wrap{width:min(var(--max),calc(100% - 28px))}.hero h1{font-size:38px}.study-meta{grid-template-columns:1fr}.study-meta div{border-bottom:1px solid var(--line)}.study{padding:48px 0}.study h2{font-size:32px}}
@page{size:A4 landscape;margin:10mm}
@media print{body{font-size:8.5pt;line-height:1.32}.wrap{width:100%;max-width:none}.topbar{display:none}.hero{padding:13mm 0 8mm}.hero h1{font-size:27pt}.hero .lede{font-size:14pt;max-width:190mm}.hero .date{margin-top:7mm}.summary,.method{padding:7mm 0}.summary h2,.method h2,.sources h2{font-size:21pt}.summary-grid{gap:6mm}.summary-grid h3{font-size:12pt}.method table,.sources table{font-size:7.2pt}.study{break-before:page;break-after:page;padding:4mm 0 0;border-bottom:0;zoom:.74;width:135%}.study h2{font-size:21pt}.study-lead{font-size:11.5pt;margin:3mm 0 4mm}.study-meta{margin:0 0 4mm}.study-meta div{padding:2.5mm 3mm 2.5mm 0}.study-meta dt{font-size:7pt}.study-meta dd{font-size:7.8pt}.chart-block{break-inside:avoid;margin:2mm 0}.chart-svg{max-height:82mm}.chart-key{font-size:6.8pt;margin-top:1mm}.chart-key th,.chart-key td{padding:1mm 2mm 1mm 0}.point-key{width:5mm;height:5mm;font-size:6pt}.paired-charts{gap:5mm;break-inside:avoid}.paired-charts h3{font-size:10pt}.paired-charts .chart-svg{max-height:73mm}.caveat{padding:2.5mm 3mm;margin:3mm 0;border-left-width:2mm}.caveat h3{font-size:9pt}.caveat p,.source-line,.chart-caption{font-size:7.5pt}.sources{break-before:page;padding-top:4mm}.site-footer{display:none}a{color:inherit;text-decoration:none}}
`;

const html = `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="A review of public studies that compare coding-agent harnesses while holding the model constant.">
  <title>The harness (still) matters</title>
  <style>${css}</style>
  <link rel="stylesheet" href="report.css">
</head>
<body>
  <header class="topbar"><div class="wrap"><a href="#main">The harness (still) matters</a></div></header>
  <section class="hero"><div class="wrap"><p class="eyebrow">Evidence review</p><h1>The harness (still) matters</h1><p class="lede">Public studies show that the coding-agent harness changes performance, cost, token use and runtime. They do not identify one harness that wins across every model and task.</p><p class="date">Evidence captured on 12 July 2026</p></div></section>
  <main id="main">
    <section class="current-observations"><div class="wrap">
      <header class="current-observations-header"><p class="eyebrow">Executive summary</p><h2>Current observations</h2></header>
      <ul class="current-observations-list">
        <li><strong>Harness choice can materially change results.</strong> Studies that hold the model fixed find differences in quality, cost, token use and runtime.</li>
        <li><strong>No harness wins across all models and tasks.</strong> Different harnesses lead on different models, tasks and measures. Some gaps are too uncertain to call.</li>
        <li><strong>Efficiency differences are often clearer than quality differences.</strong> Similar success rates can hide large differences in cost, context use and completion time.</li>
        <li><strong>The evidence is useful but still limited.</strong> Several benchmarks use small task sets, single runs or live leaderboards. Few publish enough data to estimate uncertainty.</li>
        <li><strong>Teams should test harnesses on their own work.</strong> Compare at least 2 harnesses with the same model. Measure quality, cost and time. Repeat the test when either changes.</li>
      </ul>
    </div></section>
    <section class="overview" id="benchmark-map"><div class="wrap">
      <div class="overview-header"><h2>Currently, we know of 13 benchmarks that evaluate multiple coding-agent harnesses</h2></div>
      <div class="overview-groups">${overviewGroups}</div>
    </div></section>
    <div class="wrap">${orderedStudies.map(studySection).join("\n")}</div>
    <section class="appendix"><div class="wrap">
      <section><h2>Evidence matrix</h2><p>Twelve studies contain at least one matched-model harness comparison. Portkey is an efficiency diagnostic, not a quality benchmark.</p><p class="date-note">Dates are the publication or public-release date of the comparison used here. For live leaderboards, they mark when the referenced comparison first appeared.</p><div class="table-wrap"><table><thead><tr><th>No.</th><th>Study</th><th>Task surface</th><th>Model fixed</th><th>Includes Pi</th><th>Repeats</th><th>Cost</th></tr></thead><tbody>${studyRows}</tbody></table></div><p><a href="https://github.com/tmustier/harness-benchmarks/blob/main/docs/method.md">How to read harness comparisons</a> · <a href="data/observations.json">Download observations</a> · <a href="data/studies.json">Download study records</a></p></section>
      <section><h2>Data and source access</h2><p>External datasets remain under their publishers' terms. This repository stores derived observations and links to the original data.</p><div class="table-wrap"><table><thead><tr><th>Source</th><th>Access</th><th>Licence note</th><th>Links</th></tr></thead><tbody>${sourceRows}</tbody></table></div></section>
    </div></section>
  </main>
  <footer class="site-footer"><div class="wrap"><p>Original code and review content are MIT licensed. Cite the original studies when using their results.</p></div></footer>
  <script>
    if (window.location.hash) {
      const scrollToHash = () => {
        const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
        if (target) target.scrollIntoView({ block: "start", inline: "nearest" });
      };
      const loaded = document.readyState === "complete"
        ? Promise.resolve()
        : new Promise(resolve => window.addEventListener("load", resolve, { once: true }));
      const fontsLoaded = document.fonts ? document.fonts.ready : Promise.resolve();
      Promise.all([loaded, fontsLoaded]).then(() => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(scrollToHash));
      });
    }
  </script>
</body>
</html>`;

fs.mkdirSync(siteDataDir, { recursive: true });
fs.mkdirSync(siteAssetsDir, { recursive: true });
fs.writeFileSync(path.join(siteDir, "index.html"), html);
fs.copyFileSync(path.join(root, "styles", "report.css"), path.join(siteDir, "report.css"));
fs.copyFileSync(path.join(root, "assets", "fonts", "Archivo-latin-VF.woff2"), path.join(siteAssetsDir, "Archivo-latin-VF.woff2"));
for (const name of ["studies.json", "observations.json", "claims.json", "external-datasets.json"]) {
  fs.copyFileSync(path.join(dataDir, name), path.join(siteDataDir, name));
}
console.log(`Built ${path.join(siteDir, "index.html")} from ${studies.length} studies and ${observations.length} observations.`);
