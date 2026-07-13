# Data

This directory separates exact observations from source claims.

## Files

- `studies.json` describes each benchmark and its method
- `observations.json` records exact published configuration-level values
- `claims.json` records ratio-only or diagnostic findings that do not fit the observation table
- `external-datasets.json` links to raw data, repositories and access notes
- `screened-sources.json` records relevant sources that do not yet isolate a harness effect or duplicate an included family

The `section`, `section_order`, `slide_lead` and `method_summary` fields in
`studies.json` control the report sequence and give each benchmark page enough
context to stand alone.

## Missing values

`null` means that the source did not publish the value in a form we could record. It does not mean zero.

## Confidence intervals

The confidence interval fields reproduce the source unless a note says otherwise. This repository does not calculate missing intervals.

Some sources publish an error value without defining it as a confidence interval. Those rows use `error_low` and `error_high`, and the report labels the whiskers as published error values.

## Cost

`cost_usd_per_task` uses the source's reported provider or API cost. It excludes subscriptions, labour, infrastructure and supervision unless the source says otherwise.

Some sources report total benchmark cost. We divide by the published number of tasks only when that calculation is explicit in the report and source notes.

`total_cost_usd`, `total_wall_time_hours`, `total_tokens` and `tokens_per_solved_task` preserve source measures that do not fit the per-task columns. Charts label these measures directly rather than treating them as interchangeable.

## Capture date

Live result pages can change. Every observation includes the date on which we captured it.

Each study record also includes an exact `published` date and a `date_basis`. For a static article or paper, this is its publication or public-release date. For a live leaderboard, it is the date the comparison used in this review first appeared.

The `overview_summary` field is the short, conclusion-first description used in the report's grouped benchmark summary.

For a composite index, `sample_count` is the number of unique tasks represented by that row. Partial-suite rows must use a distinct `performance_metric` and must not be ranked against full-suite rows.
