# The harness (still) matters

The coding-agent harness changes performance, cost, token use and runtime. No public study identifies one harness that wins across every model and task.

This repository brings the available evidence into one review. It records matched-model results where the source provides them. It links to raw datasets when redistribution is not possible.

## What this repository contains

- a public report in `site/`
- structured study records in `data/studies.json`
- chart observations in `data/observations.json`
- directional claims in `data/claims.json`
- links and access notes for external datasets in `data/external-datasets.json`
- a reusable GOV.UK writing skill in `skills/govuk-style/`
- a zero-dependency site builder in `scripts/build-site.mjs`

## Read the report

Open `site/index.html` after running:

```bash
npm run build
```

You can also serve the repository locally:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/site/`.

## Data policy

We include derived observations when the source publishes exact values. Each row names its source and capture date.

We reference an external dataset when:

- the publisher does not provide a redistribution licence
- the data is too large to keep here
- access is gated
- only a live leaderboard exists

Blank values mean the source did not publish that measure. They do not mean zero.

## Contribute

See `CONTRIBUTING.md` before adding a study or changing an observation.

## Licence

Repository code and original content are available under the MIT licence. External datasets remain under their publishers' terms.

The GOV.UK style skill draws on public GOV.UK guidance. See `THIRD_PARTY_NOTICES.md` for attribution.
