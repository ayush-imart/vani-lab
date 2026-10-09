# Problem 5: build and submission plan

This guide translates the hackathon's published Problem 5 requirements and judging rubric into a practical build plan. Requirements are taken from the captured site pages in [`../provided-data/hackathon/`](../provided-data/hackathon/). Implementation suggestions are labeled as recommendations, not organizer mandates.

## What the challenge asks for

Build an end-to-end workflow that tests a VANI prompt change on a small traffic slice, measures the result, and promotes the winner. It must support:

1. Variants A and B as full prompts or smaller instruction changes.
2. Configurable traffic allocation for a fixed experiment window; the page gives 10% as an example.
3. A primary goal such as Meeting Fixed and secondary goals such as Call Duration.
4. A statistically valid winner decision followed by promotion to the remaining traffic.
5. Early stopping when a variant is clearly worse.

Expected outputs: a working A/B workflow, a report with split, metrics, significance and decision, and a demo of early stopping a worse variant.

## Judging rubric

| Criterion | Weight | What to show |
| --- | ---: | --- |
| Business Impact | 25% | Improvement on the selected success metric, especially meeting outcomes |
| Solution Completeness | 20% | The workflow runs end to end, including report and rollout decision |
| Technical Robustness | 20% | Valid assignment, metric handling, significance, early stop, and safe failure behavior |
| Voice Experience | 20% | Natural, low-latency, multilingual/Hinglish VANI calls |
| Demo & `skills.md` | 15% | A clear 5–7 minute walkthrough and a concise record of the build journey/tools |

## Recommended build sequence

### 1. Define an experiment before sending traffic

Record an immutable experiment definition: experiment ID, hypothesis, baseline A, candidate B, prompt versions, eligibility rules, traffic share, start/end, primary metric, secondary metrics, guardrails, and the decision method. Keep prompt versions and run records auditable.

### 2. Assign calls consistently

Use a stable randomized assignment keyed by experiment and call/session ID. Record the assigned variant for every eligible call. Verify the observed split against the configured split. Keep a call in the same arm across retries or resumed interactions when the product flow requires that consistency.

### 3. Define outcomes precisely

Write operational definitions for Meeting Fixed, Call Duration, and any guardrail before the run. Decide how missing, duplicate, delayed, or invalid outcomes are handled. Use Meeting Fixed as the primary outcome if it fits the demo data; treat Call Duration as secondary and do not let it override the primary result.

### 4. Make the decision statistically defensible

**Recommendation:** predefine the minimum detectable effect, sample-size target, confidence level, and analysis method. For a fixed-window test, avoid declaring a winner from repeated unadjusted peeking. For early stopping, use a sequential method or a conservative predeclared harm boundary. If evidence is insufficient, keep the baseline and report “inconclusive” rather than auto-promoting.

These statistical controls are implementation recommendations. The published challenge requires a statistically valid winner but does not mandate a particular test or threshold.

### 5. Gate promotion and retain a rollback path

Promote only after the decision rule passes and guardrails remain acceptable. Record who/what promoted, old and new prompt versions, traffic share, timestamp, and the report that justified the decision. Keep a one-step rollback to A and record every transition.

### 6. Show early stopping

Include a reproducible run where B crosses the predefined “clearly worse” boundary. Show the rule, observed evidence, stop decision, and that traffic returns to A. Do not present a hand-picked outcome as statistical proof; label simulated data clearly if used.

## Minimum demo flow (5–7 minutes)

1. State the problem, hypothesis, and primary/secondary metrics.
2. Configure A/B prompt versions, eligible traffic, split, and fixed window.
3. Run calls and show assignments and split accuracy.
4. Show outcome tracking and the report: sample counts, metrics, uncertainty/significance, guardrails, and decision.
5. Show a winner promoted to remaining traffic with an audit trail and rollback control.
6. Run the early-stop scenario for a worse B and show traffic returning to A.
7. Close with measured impact, limits, and the next validation step.

## Submission checklist

- 5–7 minute end-to-end demo video.
- Selected problem statement and short approach note.
- Sarvam Agent ID or live link.
- Solution folder containing code, `README`, `skills.md`, and sample outputs.
- `skills.md` describing the build journey and tools used.
- Team name and member details.
- Submit once per team during the published window: Sat 10 Oct 2026, 14:00–23:59 IST. The rules say late submissions are not evaluated.

## Data and key handling

- Hackathon rules say no customer data leaves the premises. Keep the provided call recordings and datasets local to the approved environment.
- Redact personal information from screenshots and shareable outputs. Prefer aggregates or synthetic examples in the demo.
- Keep Sarvam keys in ignored root `keys.env`; never commit or paste them into source, docs, chat, or demo footage.

## Source pages

- [Problem 5 statement](../provided-data/hackathon/problem-5-agent-ab-testing.md)
- [Rules and judging criteria](../provided-data/hackathon/rules.txt)
- [Schedule](../provided-data/hackathon/schedule.txt)
- [Submission checklist resource](../provided-data/hackathon/sarvam-guides/submission-checklist.txt)
- [Voice Agents resource](../provided-data/hackathon/sarvam-guides/voice-agents.txt)
