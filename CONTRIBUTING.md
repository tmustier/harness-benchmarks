# Contribute evidence

Add evidence that helps isolate the effect of a coding-agent harness.

## Inclusion rules

A main comparison must:

- vary the harness or scaffold
- keep the underlying model fixed for at least one comparison
- use the same task state and grader for the matched comparison
- report an outcome that does not rely on the agent's own claim
- provide a stable public source

Efficiency-only diagnostics can be included if they are clearly labelled and do not claim to measure quality.

## Add a study

1. Add the study to `data/studies.json`.
2. Add exact published values to `data/observations.json`.
3. Add any qualitative or ratio-only findings to `data/claims.json`.
4. Add raw-data access details to `data/external-datasets.json`.
5. Run `npm test`.
6. Run `npm run build` and inspect the report.

## Evidence rules

- record the source URL and capture date for every value
- keep published precision rather than adding false precision
- leave missing values blank
- do not infer confidence intervals unless the row says they were calculated independently
- start chart axes at zero unless there is a documented statistical reason not to
- separate source claims from this repository's interpretation
