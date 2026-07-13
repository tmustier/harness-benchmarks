import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(name) {
  const file = path.join(root, "data", name);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const studies = readJson("studies.json");
const observations = readJson("observations.json");
const claims = readJson("claims.json");
const external = readJson("external-datasets.json");
const screened = readJson("screened-sources.json");

const errors = [];
const studyIds = new Set();
const sectionOrders = new Set();

for (const study of studies) {
  if (!study.id || !study.name || !study.source_url) errors.push(`Study is missing a required field: ${JSON.stringify(study)}`);
  if (!study.section || !study.overview_summary || !study.slide_lead || !study.method_summary || !Number.isInteger(study.section_order)) errors.push(`Study is missing presentation metadata: ${study.id}`);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(study.published) || !study.date_basis) errors.push(`Study needs an exact publication date and date basis: ${study.id}`);
  if (studyIds.has(study.id)) errors.push(`Duplicate study id: ${study.id}`);
  if (sectionOrders.has(study.section_order)) errors.push(`Duplicate section order: ${study.section_order}`);
  studyIds.add(study.id);
  sectionOrders.add(study.section_order);
}

const sourceIds = new Set(external.map(item => item.source_id));
for (const study of studies) {
  if (!sourceIds.has(study.id)) errors.push(`Study has no external source record: ${study.id}`);
}

const observationKeys = new Set();
for (const row of observations) {
  if (!studyIds.has(row.study_id)) errors.push(`Unknown study in observations: ${row.study_id}`);
  if (!sourceIds.has(row.source_id)) errors.push(`Unknown source in observations: ${row.source_id}`);
  if (!row.model || !row.harness || !row.performance_metric) errors.push(`Observation is missing model, harness or metric: ${JSON.stringify(row)}`);
  if (!Number.isFinite(row.performance_value) || row.performance_value < 0 || row.performance_value > 100) errors.push(`Performance must be between 0 and 100: ${JSON.stringify(row)}`);
  if (row.cost_usd_per_task !== null && (!Number.isFinite(row.cost_usd_per_task) || row.cost_usd_per_task < 0)) errors.push(`Cost must be null or non-negative: ${JSON.stringify(row)}`);
  if ((row.ci_low === null) !== (row.ci_high === null)) errors.push(`Confidence interval must have both bounds: ${JSON.stringify(row)}`);
  if (row.ci_low !== null && (row.ci_low > row.performance_value || row.ci_high < row.performance_value)) errors.push(`Confidence interval does not contain the estimate: ${JSON.stringify(row)}`);
  if ((row.error_low === undefined) !== (row.error_high === undefined)) errors.push(`Published error range must have both bounds: ${JSON.stringify(row)}`);
  if (row.error_low !== undefined && (row.error_low > row.performance_value || row.error_high < row.performance_value)) errors.push(`Published error range does not contain the estimate: ${JSON.stringify(row)}`);
  const key = [row.study_id, row.model, row.harness, row.effort, row.performance_metric].join("|");
  if (observationKeys.has(key)) errors.push(`Duplicate observation: ${key}`);
  observationKeys.add(key);
}

for (const claim of claims) {
  if (!studyIds.has(claim.study_id)) errors.push(`Unknown study in claims: ${claim.study_id}`);
  if (!sourceIds.has(claim.source_id)) errors.push(`Unknown source in claims: ${claim.source_id}`);
  if (!claim.claim || !claim.measure || !Number.isFinite(claim.value)) errors.push(`Claim is missing required data: ${JSON.stringify(claim)}`);
}

for (const item of screened) {
  if (!item.name || !item.url || !item.disposition || !item.reason) errors.push(`Screened source is missing required data: ${JSON.stringify(item)}`);
  if (item.published !== null && !/^20\d{2}-\d{2}(?:-\d{2})?$/.test(item.published)) errors.push(`Screened source has an invalid date: ${JSON.stringify(item)}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Validated ${studies.length} studies, ${observations.length} observations, ${claims.length} claims and ${screened.length} screened sources.`);
