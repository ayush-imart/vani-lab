import { useState, type ReactNode } from "react";
import { ChipSelect } from "./chips";
import { motion, useReducedMotion } from "motion/react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, Pause, Play, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, PageTitle, Pill, Tip } from "./common";
import { versions } from "./data";
import {
  DEFAULT_SORT,
  LOWER_IS_BETTER,
  cohortBreakdown,
  compareVersions,
  createInitialFeed,
  createRng,
  cycleSort,
  kpiDefs,
  kpiUnit,
  leaderboard,
  metricDefs,
  nextCall,
  recordCall,
  sortLeaderboard,
  versionIds,
  weakestCohorts,
  type CohortRecord,
  type KpiKey,
  type MetricKey,
  type SortState,
  type VersionId,
} from "./performance-data";
import { AnimatedNumber, Crossfade } from "./motion-kit";
import { useLiveFeed, type KpiTable } from "./performance-source";

const labelOf = (key: MetricKey) => metricDefs.find((m) => m.key === key)?.label ?? key;
const shortOf = (key: MetricKey) => metricDefs.find((m) => m.key === key)?.short ?? key;
const fmtNum = (key: KpiKey, n: number) =>
  `${key === "callDuration" ? Math.round(n) : n.toFixed(1)}${kpiUnit(key)}`;
const kpiNumber = (kpis: KpiTable, id: VersionId, key: KpiKey) => (
  <AnimatedNumber value={kpis[id][key]} format={(n) => fmtNum(key, n)} />
);

function StarScore({ value, label }: { value: number; label: string }) {
  return (
    <Tip label={`${label}: ${value.toFixed(1)} / 5`}>
      <span className="star-rating" tabIndex={0}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className={i <= Math.round(value) ? "" : "empty"} />
        ))}
        <strong>
          <AnimatedNumber value={value} decimals={1} />
        </strong>
      </span>
    </Tip>
  );
}

function SortIcon({ sort, column }: { sort: SortState; column: MetricKey }) {
  if (sort.key !== column || sort.dir === 0) return <ArrowUpDown size={11} />;
  return sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />;
}

// Best version on a KPI by exact comparison (lower is better for call duration).
function bestOn(kpis: KpiTable, key: KpiKey): VersionId {
  const lowerBetter = LOWER_IS_BETTER.includes(key);
  return [...versionIds].sort(
    (a, b) => (kpis[a][key] - kpis[b][key]) * (lowerBetter ? 1 : -1),
  )[0] as VersionId;
}

function VerdictLine({ primary, kpis }: { primary: KpiKey; kpis: KpiTable }) {
  const v = compareVersions("A", "B", primary, kpis);
  const list = (keys: KpiKey[]) => keys.map((k) => shortOf(k)).join(", ");
  const id = `${v.tie}-${v.leader}-${primary}-${v.weak.join(",")}`;
  const num = (version: VersionId) => (
    <AnimatedNumber value={kpis[version][primary]} format={(n) => fmtNum(primary, n)} />
  );
  return (
    <div className="perf-verdict" role="status">
      <Crossfade id={id}>
        <strong>
          {v.tie ? (
            `A and B are level on ${labelOf(primary)}.`
          ) : (
            <>
              Version {v.leader} is performing better than {v.other} on {labelOf(primary)} (
              {num(v.leader)} vs {num(v.other)}).
            </>
          )}
        </strong>
        <span className="verdict-line">
          {v.weak.length
            ? `Version ${v.leader} is weaker than ${v.other} on: ${list(v.weak)}.`
            : `Version ${v.leader} is not behind ${v.other} on any other KPI.`}
        </span>
      </Crossfade>
    </div>
  );
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="vd-tile"
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
    >
      <span>{label}</span>
      <strong>{children}</strong>
    </motion.div>
  );
}

function VersionDetail({
  id,
  feed,
  kpis,
  onClose,
}: {
  id: VersionId | null;
  feed: CohortRecord[];
  kpis: KpiTable;
  onClose: () => void;
}) {
  const row = id ? leaderboard(feed).find((r) => r.id === id) : undefined;
  const v = versions.find((x) => x.id === id);
  const noData = <span className="vd-nodata">No data</span>;
  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="version-dialog"
        onOpenAutoFocus={(e) => {
          // Focus the dialog itself so no score tooltip opens on entry and Esc closes the dialog.
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
      >
        {id && row && (
          <>
            <DialogHeader className="vd-head">
              <Avatar id={id} />
              <div>
                <DialogTitle>
                  Version {id} · {v?.title}
                </DialogTitle>
                <DialogDescription>
                  Detailed stats · {row.calls} calls across {row.cohorts} of 10 cohorts · Sample
                  data
                </DialogDescription>
              </div>
              <div className="vd-chips">
                {id === "A" && <Pill>Baseline</Pill>}
                <Pill tone="neutral">Rank #{row.rank}</Pill>
              </div>
            </DialogHeader>
            <div className="vd-body">
              <section role="group" aria-labelledby="vd-kpis">
                <h3 id="vd-kpis">KPIs</h3>
                <div className="vd-grid">
                  {kpiDefs.map((m) => {
                    const value = kpis[id][m.key as KpiKey];
                    return (
                      <Tile key={m.key} label={m.label}>
                        {typeof value === "number" && Number.isFinite(value)
                          ? kpiNumber(kpis, id, m.key as KpiKey)
                          : noData}
                      </Tile>
                    );
                  })}
                </div>
              </section>
              <section role="group" aria-labelledby="vd-scores">
                <h3 id="vd-scores">Scores (1 to 5)</h3>
                <div className="vd-grid">
                  {metricDefs.map((m) => (
                    <Tile key={m.key} label={m.label}>
                      <StarScore value={row.scores[m.key]} label={m.label} />
                    </Tile>
                  ))}
                </div>
              </section>
              <section role="group" aria-labelledby="vd-cohorts">
                <h3 id="vd-cohorts">Cohorts (GLID last digit)</h3>
                <div className="vd-grid vd-cohorts">
                  {cohortBreakdown(feed, id).map((c) => (
                    <Tile key={c.digit} label={`Ends in ${c.digit} · ${c.calls} calls`}>
                      {c.overall === null ? noData : c.overall.toFixed(1)}
                    </Tile>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function Performance() {
  const [isPaused, setIsPaused] = useState(false);
  const [primary, setPrimary] = useState<KpiKey>("meetingFixed");
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [detail, setDetail] = useState<VersionId | null>(null);
  const { feed, kpis, mode } = useLiveFeed(isPaused);

  const board = sortLeaderboard(leaderboard(feed), sort);
  const weak = weakestCohorts(feed, "overall");
  const secondary = kpiDefs.filter((m) => m.key !== primary);
  const bestPrimary = bestOn(kpis, primary);

  if (mode === "probing") {
    return (
      <>
        <PageTitle
          eyebrow="PERFORMANCE"
          title="How every version is doing, live."
          description="Loading the latest numbers..."
        />
        <div className="perf-skeleton" aria-busy="true" aria-label="Loading performance">
          <Skeleton className="h-14 w-full" />
          <div className="perf-big-grid">
            {versionIds.map((id) => (
              <Skeleton key={id} className="h-28 w-full" />
            ))}
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageTitle
        eyebrow="PERFORMANCE"
        title="How every version is doing, live."
        description="Your main number first, the rest on demand."
        action={
          <Button variant="outline" onClick={() => setIsPaused(!isPaused)}>
            {isPaused ? <Play /> : <Pause />}
            {isPaused ? "Resume live" : "Pause live"}
          </Button>
        }
      />
      <VerdictLine primary={primary} kpis={kpis} />
      <section aria-labelledby="perf-primary-title" className="perf-primary">
        <div className="section-heading">
          <div className="section-kicker">
            <h2 id="perf-primary-title">{labelOf(primary)}</h2>
            <Pill>Primary</Pill>
            <Pill tone={isPaused ? "neutral" : "green"}>
              {!isPaused && <i className="live-dot" />}
              {isPaused ? "Paused" : "Live"}
            </Pill>
            <Pill tone={mode === "backend" ? "green" : "amber"}>
              {mode === "backend" ? "Live backend" : "Sample data"}
            </Pill>
          </div>
          <ChipSelect
            value={primary}
            onChange={(v) => setPrimary(v as KpiKey)}
            ariaLabel="Primary metric"
            options={kpiDefs.map((m) => ({ value: m.key, label: m.short }))}
          />
        </div>
        <div className="perf-big-grid">
          {versionIds.map((id) => (
            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.99 }}
              transition={{ duration: 0.12 }}
              className={`perf-big version-${id}`}
              key={id}
              data-best={id === bestPrimary}
              aria-label={`Open details for Version ${id}`}
              onClick={() => setDetail(id)}
            >
              <div className="score-version">
                <Avatar id={id} small />
                <span>Version {id}</span>
                {id === bestPrimary && <Pill tone="green">Best</Pill>}
              </div>
              <strong>{kpiNumber(kpis, id, primary)}</strong>
            </motion.button>
          ))}
        </div>
      </section>
      <section aria-labelledby="perf-secondary-title" className="perf-secondary">
        <h2 id="perf-secondary-title">Other KPIs</h2>
        <div className="score-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>KPI</th>
                {versionIds.map((id) => (
                  <th key={id}>Version {id}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {secondary.map((m) => {
                const key = m.key as KpiKey;
                const best = bestOn(kpis, key);
                return (
                  <tr key={m.key}>
                    <td>{m.label}</td>
                    {versionIds.map((id) => (
                      <td key={id} className={id === best ? "positive" : ""}>
                        {kpiNumber(kpis, id, key)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <div className="perf-insight">
        <div>
          <strong>Weakest cohorts right now</strong>
          <p>Cohort = every GLID ending in the same digit (10 cohorts). Overall score.</p>
        </div>
        <div className="perf-chips">
          {weak.map((w) => (
            <Tip key={w.digit} label={`${w.calls} calls`}>
              <span className="perf-chip" tabIndex={0}>
                {w.label}
                <b>{w.mean.toFixed(1)}</b>
              </span>
            </Tip>
          ))}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/prompts">
            Create a version
            <ArrowUpRight />
          </Link>
        </Button>
      </div>
      <section aria-labelledby="perf-board-title" className="perf-board">
        <div className="section-heading">
          <div>
            <h2 id="perf-board-title">Leaderboard</h2>
            <p>Ranked by overall score. Click a column to sort, click a row for details.</p>
          </div>
        </div>
        <div className="score-scroll">
          <table className="data-table score-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Prompt version</th>
                {metricDefs.map((m) => (
                  <th
                    key={m.key}
                    aria-sort={
                      sort.key === m.key && sort.dir
                        ? sort.dir === 1
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className={sort.key === m.key && sort.dir ? "active-column" : ""}
                  >
                    <Button variant="ghost" onClick={() => setSort(cycleSort(sort, m.key))}>
                      {m.key === "overall" ? "Overall quality" : m.short}
                      <SortIcon sort={sort} column={m.key} />
                    </Button>
                  </th>
                ))}
                <th>Cohorts served</th>
                <th>
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {board.map((r) => (
                <motion.tr
                  layout="position"
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  key={r.id}
                  className="perf-row"
                  tabIndex={0}
                  onClick={() => setDetail(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDetail(r.id);
                    }
                  }}
                >
                  <td>
                    <span className="perf-rank">#{r.rank}</span>
                  </td>
                  <td>
                    <div className="score-version">
                      <Avatar id={r.id} />
                      <div>
                        <strong>
                          Version {r.id} {r.id === "A" && <Pill>Baseline</Pill>}
                        </strong>
                        <small>{versions.find((x) => x.id === r.id)?.title}</small>
                      </div>
                    </div>
                  </td>
                  {metricDefs.map((m) => (
                    <td key={m.key}>
                      <StarScore value={r.scores[m.key]} label={m.label} />
                    </td>
                  ))}
                  <td>{r.cohorts} of 10</td>
                  <td>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Details for Version ${r.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetail(r.id);
                      }}
                    >
                      Details
                    </Button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>Star mapping and weights are product placeholders. Synthetic data.</span>
        </div>
      </section>
      <VersionDetail id={detail} feed={feed} kpis={kpis} onClose={() => setDetail(null)} />
    </>
  );
}
