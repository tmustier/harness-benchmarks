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
const screened = JSON.parse(fs.readFileSync(path.join(dataDir, "screened-sources.json"), "utf8"));
const orderedStudies = [...studies].sort((a, b) => a.section_order - b.section_order);

const escapeHtml = value => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const format = (value, digits = 1) => Number(value).toFixed(digits).replace(/\.0$/, "");
const formatStudyDate = value => {
  const [year, month, day] = value.split("-").map(Number);
  const options = { day: "numeric", month: "short", timeZone: "UTC" };
  if (year !== 2026) options.year = "numeric";
  return new Intl.DateTimeFormat("en-GB", options)
    .format(new Date(Date.UTC(year, month - 1, day)));
};
const formatLongDate = value => {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
};
const capturedAt = [...observations, ...claims]
  .map(item => item.captured_at)
  .filter(Boolean)
  .sort()
  .at(-1);
const matchedStudyCount = studies.filter(study => study.matched_model_comparison).length;
const rowsFor = id => observations.filter(row => row.study_id === id);
const claimsFor = id => claims.filter(row => row.study_id === id);

const harnessColours = {
  "Pi": "#1d70b8",
  "Claude Code": "#d4351c",
  "Claude SDK": "#d4351c",
  "Codex": "#00703c",
  "Codex CLI": "#00703c",
  "OpenCode": "#6f72af",
  "Cursor": "#f47738",
  "Cursor CLI": "#f47738",
  "OpenClaw": "#12436d",
  "Hermes Agent": "#4c2c92",
  "mini-SWE-agent": "#28a197",
  "Gemini CLI": "#912b88",
  "CORE-Agent": "#b58840",
  "Copilot CLI": "#6f2c91",
  "Terminus 2": "#1d70b8",
  "Applied Compute": "#1d70b8",
  "Baseline LAB": "#505a5f",
  "SWE-Agent": "#00703c",
  "HAL Generalist": "#1d70b8",
  "Goose": "#00703c",
  "OpenHands-SDK": "#f47738",
  "ALE-Claw": "#1d70b8",
  "NanoBot": "#1d70b8",
  "ZeroClaw": "#6f72af",
  "GenericAgent": "#f47738",
  "Moltis": "#912b88",
  "NullClaw": "#28a197"
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

function artificialAnalysisChart(rows) {
  const groups = ["Claude Opus 4.7", "GPT-5.5"].map(model => ({
    model,
    rows: rows.filter(row => row.model === model && row.performance_metric === "Coding Agent Index")
  }));
  const W = 900, H = 450, L = 74, R = 44, panelH = 145, xMax = 3.25;
  const plotW = W - L - R;
  const x = value => L + value / xMax * plotW;
  const y = (value, top) => top + panelH - value / 100 * panelH;
  const xTicks = [0, 0.65, 1.3, 1.95, 2.6, 3.25];
  const yTicks = [0, 25, 50, 75, 100];
  const panels = groups.map((group, groupIndex) => {
    const top = 42 + groupIndex * 205;
    const grid = [
      ...xTicks.map(tick => `<line x1="${x(tick)}" y1="${top}" x2="${x(tick)}" y2="${top + panelH}" /><text x="${x(tick)}" y="${top + panelH + 22}" text-anchor="middle">$${format(tick, 2)}</text>`),
      ...yTicks.map(tick => `<line x1="${L}" y1="${y(tick, top)}" x2="${L + plotW}" y2="${y(tick, top)}" /><text x="${L - 10}" y="${y(tick, top) + 4}" text-anchor="end">${tick}</text>`)
    ].join("");
    const marks = group.rows.map((row, index) => {
      const pointX = x(row.cost_usd_per_task);
      const pointY = y(row.performance_value, top);
      const offsets = group.model === "Claude Opus 4.7"
        ? { "Claude Code": [12, 22, "start"], "Cursor CLI": [-12, 42, "end"], "OpenCode": [-12, -12, "end"] }
        : { "Codex": [-12, -10, "end"], "Cursor CLI": [12, 24, "start"] };
      const [dx, dy, anchor] = offsets[row.harness];
      const labelX = pointX + dx;
      const labelY = pointY + dy;
      return `<g><circle cx="${pointX}" cy="${pointY}" r="8" fill="${colourFor(row.harness)}" stroke="#ffffff" stroke-width="2" /><text x="${labelX}" y="${labelY}" text-anchor="${anchor}" class="point-label">${escapeHtml(row.harness)} · ${format(row.performance_value)}% · $${format(row.cost_usd_per_task, 2)}</text></g>`;
    }).join("");
    return `<g><text x="${L}" y="${top - 14}" class="panel-title">${escapeHtml(group.model)} · medium effort</text><g class="chart-grid">${grid}</g>${marks}</g>`;
  }).join("");
  return `<figure class="chart-block"><div class="chart-scroll"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="aa-title aa-desc"><title id="aa-title">Artificial Analysis performance against cost per task</title><desc id="aa-desc">Two zero-based scatter plots compare Coding Agent Index performance and API cost while holding Claude Opus 4.7 or GPT-5.5 fixed.</desc>${panels}<text transform="translate(18 214) rotate(-90)" text-anchor="middle" class="axis-title">Coding Agent Index, 0 to 100</text><text x="${L + plotW / 2}" y="447" text-anchor="middle" class="axis-title">API cost per task in US dollars</text></svg></div><p class="chart-caption">The live page also has a GPT-5.4 pair with only 2 of the current 3 component benchmarks. It is in the downloadable observations but excluded from these full-suite panels.</p></figure>`;
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
    const low = row.ci_low ?? row.error_low ?? null;
    const high = row.ci_high ?? row.error_high ?? null;
    const ci = valueField === "performance_value" && low !== null
      ? `<line class="ci" x1="${x(low)}" y1="${y + 8}" x2="${x(high)}" y2="${y + 8}" /><line class="ci" x1="${x(low)}" y1="${y + 2}" x2="${x(low)}" y2="${y + 14}" /><line class="ci" x1="${x(high)}" y1="${y + 2}" x2="${x(high)}" y2="${y + 14}" />`
      : "";
    const labelStart = high !== null ? x(high) + 9 : x(value) + 9;
    return `<g><text x="${L - 12}" y="${y + 12}" text-anchor="end" class="bar-label">${escapeHtml(`${row.model} · ${row.harness}`)}</text><rect x="${L}" y="${y}" width="${Math.max(0, x(value) - L)}" height="16" fill="${colourFor(row.harness)}" />${ci}<text x="${Math.min(W - R + 8, labelStart)}" y="${y + 12}" class="bar-value">${format(value, value < 10 ? 2 : 1)}${unit}</text></g>`;
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

function databricksChart(rows) {
  const costClaims = claimsFor("databricks").filter(claim => claim.measure === "native-to-pi cost ratio");
  const contextClaims = claimsFor("databricks").filter(claim => claim.measure === "median context tokens per task");
  const W = 900, H = 450, L = 190, R = 90;
  const plotW = W - L - R;
  const relativeMax = 1.1;
  const relativeX = value => L + value / relativeMax * plotW;
  const costTicks = [0, 0.25, 0.5, 0.75, 1];
  const costGrid = costTicks.map(tick => `<line x1="${relativeX(tick)}" y1="34" x2="${relativeX(tick)}" y2="252" /><text x="${relativeX(tick)}" y="270" text-anchor="middle">${format(tick, 2)}×</text>`).join("");
  const costMarks = costClaims.map((claim, index) => {
    const pi = rows.find(row => row.model === claim.model && row.effort === claim.effort && row.harness === "Pi");
    const native = rows.find(row => row.model === claim.model && row.effort === claim.effort && row.harness === claim.reference_harness);
    const piCost = 1 / claim.value;
    const y = 48 + index * 36;
    const shortModel = claim.model.replace("Claude ", "");
    return `<g>
      <text x="${L - 12}" y="${y + 4}" text-anchor="end" class="bar-label">${escapeHtml(`${shortModel} · ${claim.effort}`)}</text>
      <line x1="${relativeX(piCost)}" y1="${y}" x2="${relativeX(1)}" y2="${y}" stroke="#b1b4b6" stroke-width="2" />
      <circle cx="${relativeX(piCost)}" cy="${y}" r="7" fill="${colourFor("Pi")}" />
      <circle cx="${relativeX(1)}" cy="${y}" r="7" fill="#ffffff" stroke="${colourFor(claim.reference_harness)}" stroke-width="3" />
      <text x="${(relativeX(piCost) + relativeX(1)) / 2}" y="${y - 8}" text-anchor="middle" class="bar-value">${escapeHtml(claim.reference_harness)} ÷ Pi ${format(claim.value, 2)}×</text>
      <text x="${relativeX(piCost)}" y="${y + 17}" text-anchor="middle" class="bar-value">Pi · ${format(pi.performance_value)}%</text>
      <text x="${relativeX(1) + 12}" y="${y + 4}" class="bar-value">${escapeHtml(claim.reference_harness)} · ${format(native.performance_value)}%</text>
    </g>`;
  }).join("");

  const contextMax = 1400000;
  const contextX = value => L + value / contextMax * plotW;
  const contextTicks = [0, 350000, 700000, 1050000, 1400000];
  const contextGrid = contextTicks.map(tick => `<line x1="${contextX(tick)}" y1="312" x2="${contextX(tick)}" y2="408" /><text x="${contextX(tick)}" y="427" text-anchor="middle">${tick === 0 ? "0" : `${format(tick / 1000000, 2)}m`}</text>`).join("");
  const contextMarks = contextClaims.map((claim, index) => {
    const y = 316 + index * 23;
    return `<g>
      <text x="${L - 12}" y="${y + 12}" text-anchor="end" class="bar-label">${escapeHtml(`${claim.model.replace("Claude ", "")} · ${claim.harness}`)}</text>
      <rect x="${L}" y="${y}" width="${contextX(claim.value) - L}" height="14" fill="${colourFor(claim.harness)}" />
      <text x="${contextX(claim.value) + 8}" y="${y + 12}" class="bar-value">${format(claim.value / 1000, 0)}k</text>
    </g>`;
  }).join("");

  return `<figure class="chart-block databricks-chart"><div class="chart-scroll"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="databricks-title databricks-desc">
    <title id="databricks-title">Databricks matched harness comparisons</title>
    <desc id="databricks-desc">Six matched-model comparisons show Claude Code or Codex costing 1.20 to 2.08 times as much as Pi, with task completion within 7 percentage points. Four bars show lower median context use for Pi.</desc>
    <text x="${L}" y="18" class="axis-title">Relative cost and task completion</text>
    <g class="chart-grid">${costGrid}</g>${costMarks}
    <text x="${L + plotW / 2}" y="288" text-anchor="middle" class="axis-title">Relative cost · Claude Code or Codex = 1.0</text>
    <text x="${L}" y="303" class="axis-title">Median context re-fed per task</text>
    <g class="chart-grid">${contextGrid}</g>${contextMarks}
    <text x="${L + plotW / 2}" y="447" text-anchor="middle" class="axis-title">Context tokens</text>
  </svg></div><p class="chart-caption">The source publishes exact cost ratios and scores, but not exact dollar values for each matched point. Costs are indexed to Claude Code for Opus and Codex for GPT.</p></figure>`;
}

function githubCopilotChart() {
  const performance = claimsFor("github-copilot").filter(claim => claim.measure === "Copilot minus native task-resolution points");
  const tokens = claimsFor("github-copilot").filter(claim => claim.measure === "Copilot median token change percent");
  const models = ["Claude Sonnet 4.6", "Claude Opus 4.7", "GPT-5.4", "GPT-5.5"];
  const W = 900, H = 470, panelW = 390, panelH = 155;
  const panelX = index => 72 + index % 2 * 430;
  const panelY = index => 42 + Math.floor(index / 2) * 205;
  const x = (value, left) => left + (value + 70) / 80 * panelW;
  const y = (value, top) => top + panelH - (value + 20) / 40 * panelH;
  const xTicks = [-70, -50, -30, -10, 10];
  const yTicks = [-20, -10, 0, 10, 20];
  const panels = models.map((model, index) => {
    const left = panelX(index), top = panelY(index);
    const modelPerformance = performance.filter(claim => claim.model === model);
    const grid = [
      ...xTicks.map(tick => `<line x1="${x(tick, left)}" y1="${top}" x2="${x(tick, left)}" y2="${top + panelH}" /><text x="${x(tick, left)}" y="${top + panelH + 18}" text-anchor="middle">${tick}%</text>`),
      ...yTicks.map(tick => `<line x1="${left}" y1="${y(tick, top)}" x2="${left + panelW}" y2="${y(tick, top)}" /><text x="${left - 8}" y="${y(tick, top) + 4}" text-anchor="end">${tick > 0 ? "+" : ""}${tick}</text>`)
    ].join("");
    const marks = modelPerformance.map((claim, markIndex) => {
      const tokenClaim = tokens.find(item => item.model === model && item.benchmark === claim.benchmark);
      const pointX = x(tokenClaim.value, left), pointY = y(claim.value, top);
      return `<g><circle cx="${pointX}" cy="${pointY}" r="8" fill="#1d70b8" stroke="#ffffff" stroke-width="2" /><text x="${pointX}" y="${pointY + 3.5}" text-anchor="middle" class="point-number">${markIndex + 1}</text></g>`;
    }).join("");
    return `<g><text x="${left}" y="${top - 13}" class="panel-title">${escapeHtml(model)}</text><g class="chart-grid">${grid}</g>${marks}</g>`;
  }).join("");
  return `<figure class="chart-block"><div class="chart-scroll"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="github-title github-desc"><title id="github-title">GitHub Copilot task-resolution and token changes</title><desc id="github-desc">Four panels plot Copilot CLI's task-resolution difference against its median token difference from Claude Code or Codex. Most points use fewer tokens and quality differences range from minus 8 to plus 7.1 percentage points.</desc>${panels}<text transform="translate(18 235) rotate(-90)" text-anchor="middle" class="axis-title">Copilot minus native task resolution, percentage points</text><text x="450" y="467" text-anchor="middle" class="axis-title">Copilot median token change · negative means fewer tokens</text></svg></div><p class="chart-caption"><strong>1</strong> SWE-bench Verified · <strong>2</strong> SWE-bench Pro · <strong>3</strong> SkillsBench · <strong>4</strong> Win-Hill · <strong>5</strong> Terminal-Bench 2. Axes include zero; the task-resolution axis spans ±20 points, wider than the observed range. GitHub says the quality differences are within run-to-run variance.</p></figure>`;
}

function facetedCostScatter(rows, models, xField, xMax, xLabel, caption) {
  const W = 900, L = 76, R = 28, panelH = 135, gap = 64;
  const H = 32 + models.length * (panelH + gap);
  const plotW = W - L - R;
  const x = value => L + value / xMax * plotW;
  const y = (value, top) => top + panelH - value / 100 * panelH;
  const xTicks = Array.from({ length: 5 }, (_, index) => xMax / 4 * index);
  const yTicks = [0, 25, 50, 75, 100];
  let pointIndex = 0;
  const keyedRows = [];
  const panels = models.map((model, panelIndex) => {
    const top = 35 + panelIndex * (panelH + gap);
    const groupRows = rows.filter(row => row.model === model);
    const grid = [
      ...xTicks.map(tick => `<line x1="${x(tick)}" y1="${top}" x2="${x(tick)}" y2="${top + panelH}" /><text x="${x(tick)}" y="${top + panelH + 20}" text-anchor="middle">${xField.includes("cost") ? "$" : ""}${format(tick, xMax < 10 ? 2 : 0)}</text>`),
      ...yTicks.map(tick => `<line x1="${L}" y1="${y(tick, top)}" x2="${L + plotW}" y2="${y(tick, top)}" /><text x="${L - 10}" y="${y(tick, top) + 4}" text-anchor="end">${tick}</text>`)
    ].join("");
    const marks = groupRows.map(row => {
      pointIndex += 1;
      keyedRows.push({ ...row, pointIndex });
      return `<g><circle cx="${x(row[xField])}" cy="${y(row.performance_value, top)}" r="9" fill="${colourFor(row.harness)}" stroke="#ffffff" stroke-width="2" /><text x="${x(row[xField])}" y="${y(row.performance_value, top) + 4}" text-anchor="middle" class="point-number">${pointIndex}</text></g>`;
    }).join("");
    return `<g><text x="${L}" y="${top - 13}" class="panel-title">${escapeHtml(model)}</text><g class="chart-grid">${grid}</g>${marks}</g>`;
  }).join("");
  const keyRows = keyedRows.map(row => `<tr><td><span class="point-key" style="background:${colourFor(row.harness)}">${row.pointIndex}</span></td><td>${escapeHtml(row.model)}</td><td>${escapeHtml(row.harness)}</td><td>${format(row.performance_value)}% · $${format(row[xField], 2)}</td></tr>`);
  const keyTable = values => `<table class="chart-key"><thead><tr><th>Point</th><th>Model</th><th>Harness</th><th>Result · cost</th></tr></thead><tbody>${values.join("")}</tbody></table>`;
  const key = keyRows.length > 6 ? `<div class="chart-key-grid">${keyTable(keyRows.slice(0, Math.ceil(keyRows.length / 2)))}${keyTable(keyRows.slice(Math.ceil(keyRows.length / 2)))}</div>` : keyTable(keyRows);
  return `<figure class="chart-block"><div class="chart-scroll"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(xLabel)} against performance, split by model">${panels}<text transform="translate(18 ${H / 2}) rotate(-90)" text-anchor="middle" class="axis-title">Performance, 0 to 100%</text><text x="${L + plotW / 2}" y="${H - 3}" text-anchor="middle" class="axis-title">${escapeHtml(xLabel)}</text></svg></div>${key}<p class="chart-caption">${escapeHtml(caption)}</p></figure>`;
}

function agentsLastExamChart(rows) {
  return facetedCostScatter(rows, ["GPT-5.5", "Claude Opus 4.7"], "total_cost_usd", 2200, "Published total evaluation cost in US dollars", "The panels use the source's stated 152-task public set. Sonnet 4.6 ALE-CLI rows use a different 105-task subset and remain in the downloadable data.");
}

function clawSweChart(rows) {
  return facetedCostScatter(rows, ["GLM-5.1", "Qwen3.6-Flash"], "cost_usd_per_task", 2.5, "API cost per task in US dollars", "Cost per task is the published configuration total divided by the common 350-task set. Every panel and axis starts at zero.");
}

function scaffoldEffectCharts(rows) {
  const tokenRows = rows.map(row => ({ ...row, tokens_millions: row.tokens_per_solved_task / 1000000 }));
  return `<div class="paired-charts"><section><h3>Pass rate</h3>${barChart(rows, "Pass rate", "performance_value", 100, "%")}</section><section><h3>Reported tokens per solved task</h3>${barChart(tokenRows, "Reported tokens per solved task", "tokens_millions", 1.6, "m")}</section></div><p class="chart-caption">Both scales start at zero. Token accounting is harness-reported and incomplete, so treat the efficiency contrast as diagnostic.</p>`;
}

function harnessBenchPaperCharts(rows) {
  const tokenRows = rows.map(row => ({ ...row, tokens_thousands: row.tokens_per_task / 1000 }));
  return `<div class="paired-charts"><section><h3>Combined score</h3>${barChart(rows, "Harness-average combined score", "performance_value", 100, "")}</section><section><h3>Tokens per task</h3>${barChart(tokenRows, "Harness-average tokens per task", "tokens_thousands", 200, "k")}</section></div><p class="chart-caption">Each bar averages the same 8-model pool. Combined score includes process judging as well as task completion.</p>`;
}

function halChart(rows) {
  const selected = [
    ["Claude Sonnet 4.5", "high"],
    ["Claude Opus 4.1", "high"],
    ["o4-mini", "low"],
    ["GPT-5", "medium"],
    ["Gemini 2 Flash", "default"],
    ["DeepSeek R1", "default"]
  ];
  const W = 900, H = 410, L = 205, R = 88, T = 38, B = 38;
  const plotW = W - L - R;
  const x = value => L + value / 100 * plotW;
  const ticks = [0, 20, 40, 60, 80, 100];
  const grid = ticks.map(tick => `<line x1="${x(tick)}" y1="${T}" x2="${x(tick)}" y2="${H - B}" /><text x="${x(tick)}" y="${H - 10}" text-anchor="middle">${tick}%</text>`).join("");
  const marks = selected.map(([model, effort], index) => {
    const pair = rows.filter(row => row.model === model && row.effort === effort);
    const swe = pair.find(row => row.harness === "SWE-Agent");
    const hal = pair.find(row => row.harness === "HAL Generalist");
    const y = T + 23 + index * 52;
    return `<g><text x="${L - 12}" y="${y + 4}" text-anchor="end" class="bar-label">${escapeHtml(`${model} · ${effort}`)}</text><line x1="${x(Math.min(swe.performance_value, hal.performance_value))}" y1="${y}" x2="${x(Math.max(swe.performance_value, hal.performance_value))}" y2="${y}" stroke="#b1b4b6" stroke-width="2" /><circle cx="${x(swe.performance_value)}" cy="${y}" r="7" fill="${colourFor("SWE-Agent")}" /><circle cx="${x(hal.performance_value)}" cy="${y}" r="7" fill="${colourFor("HAL Generalist")}" /><text x="${x(swe.performance_value)}" y="${y - 10}" text-anchor="middle" class="point-label">SWE ${format(swe.performance_value)}% · $${format(swe.cost_usd_per_task, 2)}</text><text x="${x(hal.performance_value)}" y="${y + 20}" text-anchor="middle" class="point-label">HAL ${format(hal.performance_value)}% · $${format(hal.cost_usd_per_task, 2)}</text></g>`;
  }).join("");
  return `<figure class="chart-block"><div class="chart-scroll"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Selected HAL and SWE-Agent pass-rate and cost comparisons"><g class="chart-grid">${grid}</g>${marks}</svg></div><p class="chart-caption">Six representative pairs are shown on a zero-to-100 performance scale; all 15 pairs are in the downloadable observations. Dollar labels are published total cost divided by 50 tasks.</p></figure>`;
}

function claimChart(studyId) {
  const studyClaims = claimsFor(studyId);
  const rows = studyClaims.map(claim => ({ model: claim.claim.split(" sent")[0], harness: claim.claim.split(" sent")[0], performance_value: claim.value }));
  return `${barChart(rows, "Input prompt tokens", "performance_value", 30000, "")}<p class="chart-caption">This diagnostic measures fixed input overhead. It does not measure coding quality.</p>`;
}

function chartFor(study) {
  const rows = rowsFor(study.id);
  if (study.id === "github-copilot") return githubCopilotChart();
  if (study.id === "databricks") return databricksChart(rows);
  if (study.id === "artificial-analysis") return artificialAnalysisChart(rows);
  if (study.id === "agents-last-exam") return agentsLastExamChart(rows);
  if (study.id === "claw-swe-bench") return clawSweChart(rows);
  if (study.id === "harness-bench-paper") return harnessBenchPaperCharts(rows);
  if (study.id === "scaffold-effect") return scaffoldEffectCharts(rows);
  if (study.id === "hal-swe-mini") return halChart(rows);
  if (study.id === "portkey-harness-tax") return claimChart(study.id);
  if (!rows.length) return "";
  if (study.id === "terminal-bench") return `${barChart(rows, "Terminal-Bench 2.1 pass rate")}<p class="chart-caption">Whiskers reproduce the leaderboard's published 95% confidence intervals. The scale runs from 0 to 100%.</p>`;
  if (study.id === "harvey-lab") return `${barChart(rows, "Harvey rubric pass rate")}<p class="chart-caption">Whiskers reproduce the source's published error values. Harvey does not define them as confidence intervals. The scale runs from 0 to 100%.</p>`;
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

const summaryOverviewGroups = Object.keys(sectionNotes).map((section, index) => {
  const items = orderedStudies.filter(study => study.section === section).map(study => `<li>
    <p class="summary-item-heading"><span>${String(study.section_order).padStart(2, "0")}</span><a href="#${escapeHtml(study.id)}">${escapeHtml(study.name)}</a></p>
    <p>${escapeHtml(study.overview_summary)}</p>
  </li>`).join("");
  return `<section class="summary-overview-group"><p class="overview-number">${index + 1}</p><h3>${escapeHtml(section)}</h3><ol>${items}</ol></section>`;
}).join("");

const sourceRows = external.map(item => `<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.access)}</td><td>${escapeHtml(item.licence)}</td><td><a href="${escapeHtml(item.result_url)}">Results</a>${item.dataset_url ? ` · <a href="${escapeHtml(item.dataset_url)}">Data</a>` : ""}</td></tr>`).join("");
const formatScreenedDate = value => {
  if (!value) return "Not dated";
  if (value.length === 7) {
    const [year, month] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
  }
  return formatStudyDate(value);
};
const screenedRows = screened.map(item => `<tr><td><a href="${escapeHtml(item.url)}">${escapeHtml(item.name)}</a></td><td>${escapeHtml(formatScreenedDate(item.published))}</td><td>${escapeHtml(item.disposition)}</td><td>${escapeHtml(item.reason)}</td></tr>`).join("");

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
  <meta name="description" content="A review of public studies that compare agent harnesses while holding the model constant.">
  <title>The harness (still) matters</title>
  <style>${css}</style>
  <link rel="stylesheet" href="report.css">
</head>
<body>
  <header class="topbar"><div class="wrap"><a href="#main">The harness (still) matters</a></div></header>
  <section class="hero"><div class="wrap"><p class="eyebrow">Evidence review</p><h1>The harness (still) matters</h1><p class="lede">Public studies show that the agent harness changes performance, cost, token use and runtime. They do not identify one harness that wins across every model and task.</p><p class="date">Evidence captured on ${escapeHtml(formatLongDate(capturedAt))}</p></div></section>
  <main id="main">
    <section class="current-observations"><div class="wrap">
      <header class="current-observations-header"><p class="eyebrow">Executive summary</p><h2>Current observations</h2></header>
      <ul class="current-observations-list">
        <li><strong>Harness choice can materially change results.</strong> Claw-SWE-Bench found 12.5- to 27.4-point spreads; Harvey's intervention ranged from 0.9 points worse to 23 points better.</li>
        <li><strong>No harness wins across all models and tasks.</strong> Native CLIs led 4 of 6 current Terminal-Bench pairs, while alternative harnesses led elsewhere.</li>
        <li><strong>Efficiency differences are often clearer than quality differences.</strong> Databricks, GitHub and several smaller studies found large cost, context or token gaps beside modest quality changes.</li>
        <li><strong>The count is not 22 independent replications.</strong> Some studies reuse benchmark families or live leaderboards, and many rely on a single attempt per task.</li>
        <li><strong>We only count model-fixed comparisons as harness evidence.</strong> FrontierSWE and model-only leaderboards remain on the watchlist until they expose a matched harness comparator.</li>
        <li><strong>Teams should test harnesses on their own work.</strong> Compare at least 2 harnesses with the same model, effort and budget. Measure quality, cost and time.</li>
      </ul>
    </div></section>
    <section class="overview" id="benchmark-map"><div class="wrap">
      <div class="overview-header"><h2>Currently, we know of ${studies.length} public harness comparisons and diagnostics</h2><p class="overview-subtitle">${matchedStudyCount} hold the model fixed and measure task quality. One isolates prompt overhead.</p></div>
      <div class="overview-groups">${overviewGroups}</div>
    </div></section>
    <section class="benchmark-summaries"><div class="wrap">
      <header class="benchmark-summaries-header"><p class="eyebrow">Summary overview</p><h2>What each benchmark tells us</h2></header>
      <div class="summary-overview-groups">${summaryOverviewGroups}</div>
    </div></section>
    <div class="wrap">${orderedStudies.map(studySection).join("\n")}</div>
    <section class="appendix"><div class="wrap">
      <section><h2>Evidence matrix</h2><p>${matchedStudyCount} studies contain at least one matched-model harness comparison. Portkey is an efficiency diagnostic, not a quality benchmark.</p><p class="date-note">Dates are the publication or public-release date of the comparison used here. For live leaderboards, they mark when the referenced comparison first appeared.</p><div class="table-wrap"><table><thead><tr><th>No.</th><th>Study</th><th>Task surface</th><th>Model fixed</th><th>Includes Pi</th><th>Repeats</th><th>Cost</th></tr></thead><tbody>${studyRows}</tbody></table></div><p><a href="https://github.com/tmustier/harness-benchmarks/blob/main/docs/method.md">How to read harness comparisons</a> · <a href="data/observations.json">Download observations</a> · <a href="data/studies.json">Download study records</a></p></section>
      <section><h2>Screened but not counted</h2><p>These sources are relevant to the search, but they do not currently isolate a harness effect or they duplicate an included benchmark family.</p><div class="table-wrap"><table><thead><tr><th>Source</th><th>Date</th><th>Disposition</th><th>Reason</th></tr></thead><tbody>${screenedRows}</tbody></table></div></section>
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
for (const name of ["studies.json", "observations.json", "claims.json", "external-datasets.json", "screened-sources.json"]) {
  fs.copyFileSync(path.join(dataDir, name), path.join(siteDataDir, name));
}
console.log(`Built ${path.join(siteDir, "index.html")} from ${studies.length} studies and ${observations.length} observations.`);
