# VANI Lab frontend handoff

This is a frontend-only TypeScript prototype. It does not connect to production calls, persist data, authenticate users, or make backend requests. All sample data is synthetic. State resets on page reload.

## Integrating the team's Vercel backend

- Shared synthetic data and version identities live in `src/components/vani/data.ts`; replace sample reads with your typed API adapter.
- UI modules are ordinary React components. They can be ported into a Next.js frontend; only TanStack route navigation, route metadata and the root shell need replacing with Next.js equivalents. This workspace itself must retain TanStack Start.
- Experiment lifecycle: create definition, validate allocation and time window, review pre-prod results, lock definition, start test, pause/resume, gather results, record decision, allocate new segments, rollback.
- Prompt lifecycle: immutable saved records; duplication creates an editable draft; saving always creates a new version with a changelog.
- Suggested typed interfaces: experiment (id, hypothesis, versions, segmentKey, digits, split, start/end, locked, primaryMetric); promptVersion (id, text, status, changelog, author, timestamp); result (metric, valuesByVersion, delta, interval, sampleSize, targetSize, significant); allocation (key, digit, versionId, experimentId, since); notification (id, title, experimentId, timestamp, unread).
- Backend enforcement is required for immutable records, overlap checks, experiment locks, authentication, privacy, decision rules and approved promotion/rejection/rollback. UI validation alone is not a safety boundary.
- Replace the simulated early-stop timer with your backend event stream. Do not implement decisions based on the illustrative scores or sample thresholds here.
- CSV export is a browser-only export of synthetic results.

## Pending product inputs

Exact public IndiaMART brand blue could not be confirmed; the central token uses an IndiaMART-inspired functional blue. Approved decision rules, rejection rules, early-stop thresholds, star mapping, regression checks and sample targets remain placeholders.

Mascots are modern Indian women per the updated brief. Paired 3×3 placeholder sprite sheets use subtle transformed portraits, not final eye-direction/expression artwork. Final expressions and cursor-facing frames can replace the imported sheets without changing the component interface.

## Vercel Eve

No specific Eve API contract was supplied or verified. The frontend is backend-agnostic; this handoff does not claim a tested Eve integration or deployment compatibility. Supply your team's API contracts when connecting production data.
