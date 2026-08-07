# Contribute evidence

Add evidence that helps isolate the effect of an agent harness.

## Inclusion rules

A main comparison must:

- vary the harness, scaffold, runtime or a named runtime component
- keep the underlying model fixed for at least one comparison
- use the same task state and grader for the matched comparison
- report an outcome that does not rely on the agent's own claim
- provide a stable public source

Provider-routed comparisons must publish the same model and effort label. Record the missing model snapshot as a limitation when the source does not provide it.

Efficiency-only diagnostics can be included if they are clearly labelled and do not claim to measure quality.

## Add a study

1. Add the study to `data/studies.json`.
2. Add exact published values to `data/observations.json`.
3. Add any qualitative or ratio-only findings to `data/claims.json`.
4. Add raw-data access details to `data/external-datasets.json`.
5. Add relevant near misses to `data/screened-sources.json` rather than forcing model-confounded rows into the review.
6. Run `npm test`.
7. Run `npm run build` and inspect the report.

## Evidence rules

- record the source URL and capture date for every value
- keep published precision rather than adding false precision
- leave missing values blank
- do not infer confidence intervals unless the row says they were calculated independently
- start chart axes at zero unless there is a documented statistical reason not to
- separate source claims from this repository's interpretation
