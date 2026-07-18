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

## Source weighting

Each study record carries a weight that controls how the review cites it. See
[How this review weights sources](../docs/method.md#how-this-review-weights-sources)
for the assignment rules.

- `conflict` is `none`, `adjacent` or `compared vendor`. A buyer or a
  professional evaluator with no compared product counts as `none`. `adjacent`
  means the publisher has a commercial interest in the benchmark's subject but
  ships none of the compared systems. `compared vendor` means the publisher
  ships one of the compared harnesses or models.
- `conflict_note` records the evidence or open questions behind the
  classification, with a check date where the classification relied on
  external research.
- `weight_tier` is `anchor`, `supporting` or `contextual`.
- `weight_rationale` states in one sentence why the study has its tier.
- `citation_note` restricts how the study may be cited, for example
  direction-only citation or the demotion of specific measures.
- `component_suites` describes the parts of a composite index: each entry
  records the suite `name`, `producer`, `task_count`, `provenance` and
  `overlaps_study`, the id of a study in this review built on the same suite.
  An overlap means the two records are not independent corroboration.

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
