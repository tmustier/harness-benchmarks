# How to read harness comparisons

The strongest comparison changes the harness while keeping the model, task and budget fixed.

This review does not require a study to include Pi. It excludes rows that pair each harness with a different model, even when the source calls the result an agent leaderboard.

## Check what stayed the same

Check whether the study fixes:

- the provider and exact model version
- the reasoning or effort setting
- the repository commit and task instructions
- the available time, turns and context
- the tool and permission environment
- the grader

A shared model name is not enough. Provider routing and model snapshots can still differ.

## Check what the outcome measures

Different graders answer different questions.

Hidden tests measure whether a change behaves as expected. Known-vulnerability recall measures whether the agent recognises a known root cause. Expert rubrics can measure partial scientific progress. These scores are not interchangeable.

## Check the uncertainty

Repeated trials show whether an observed difference is stable. A one-task or one-run lead may be noise.

Do not treat overlapping confidence intervals as proof that 2 systems are equal. Treat them as evidence that the study has not separated them clearly.

## Check cost and token definitions

Cached input, uncached input, reasoning tokens and output tokens have different prices. Harnesses also report them differently.

Compare costs within one study before comparing costs across studies.

When a source publishes only total cost for a common task set, the report either labels it as total cost or divides by the stated common task count and records that derivation. It does not derive a per-task value when the denominator is unclear.

## How this review weights sources

Each study carries one of 3 weights. The weight controls how the review cites a study, not whether the study appears.

- An anchor study can support a conclusion on its own.
- A supporting study corroborates a conclusion but never carries it alone.
- A contextual study appears as a single data point or diagnostic.

The review assigns the weight with 4 rules. The first rule that matches decides.

1. A study with 10 or fewer tasks, or one that measures only overhead, is contextual.
2. A study published by a vendor of a compared harness or model is at most supporting. If it also has a material defect that affects all of its results, such as undefined error values or a non-public system under test, it is contextual. A defect that affects only part of its results, such as a redefined metric on some suites, stays at supporting with a citation note that excludes the affected figures.
3. A study is an anchor when it has no compared-vendor conflict, uses a real-world or multi-suite task surface, holds the model fixed and covers about 80 or more tasks or a wide real-world distribution.
4. Every other study is supporting.

The conflict classification asks one question: does the publisher ship a system in the comparison? A buyer evaluating harnesses for its own use, and a professional evaluator whose product is the evaluation itself, both count as unconflicted. A publisher with a commercial interest in the subject but no compared product is adjacent, and the record notes the interest.

Weight and transparency are separate. An anchor with unpublished raw data keeps its weight but carries a citation note: cite the direction and rough magnitude, not exact points. A citation note can also demote a single measure below the study's tier, for example token counts that the source itself flags as anomalous.

A composite index lists its component suites with their producers. When a component suite also appears in this review as a standalone study, the record links the two. Treat the pair as one source, not as independent corroboration.

## Use the result for the right task

The public evidence does not identify one best harness. It shows that the harness is part of the evaluated system.

Several pages reuse benchmark families or live leaderboards. Treat the number of review pages as a source count, not as a count of independent replications.
