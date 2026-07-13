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

## Use the result for the right task

The public evidence does not identify one best harness. It shows that the harness is part of the evaluated system.

Several pages reuse benchmark families or live leaderboards. Treat the number of review pages as a source count, not as a count of independent replications.
