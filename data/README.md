# Data

This directory separates exact observations from source claims.

## Files

- `studies.json` describes each benchmark and its method
- `observations.json` records exact published configuration-level values
- `claims.json` records ratio-only or diagnostic findings that do not fit the observation table
- `external-datasets.json` links to raw data, repositories and access notes

The `section`, `section_order`, `slide_lead` and `method_summary` fields in
`studies.json` control the report sequence and give each benchmark page enough
context to stand alone.

## Missing values

`null` means that the source did not publish the value in a form we could record. It does not mean zero.

## Confidence intervals

The confidence interval fields reproduce the source unless a note says otherwise. This repository does not calculate missing intervals.

## Cost

`cost_usd_per_task` uses the source's reported provider or API cost. It excludes subscriptions, labour, infrastructure and supervision unless the source says otherwise.

Some sources report total benchmark cost. We divide by the published number of tasks only when that calculation is explicit in the report and source notes.

## Capture date

Live result pages can change. Every observation includes the date on which we captured it.
