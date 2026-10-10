import { useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  TrendingDown,
  FlaskConical,
  Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { PageTitle, Pill, Note } from "./common";
import {
  type KpiKey,
  kpiDefs,
  kpiUnit,
  LOWER_IS_BETTER,
} from "./performance-data";

// Weekly date ranges (columns)
const WEEKS = [
  "06 - 12 Sep '26",
  "13 - 19 Sep '26",
  "20 - 26 Sep '26",
  "27 - 03 Oct '26",
] as const;

type WeekLabel = (typeof WEEKS)[number];

// Synthetic overall KPI data across 100% users, per week.
const WEEKLY_DATA: Record<KpiKey, Record<WeekLabel, number> & { bestEver: number }> = {
  meetingFixed: {
    "06 - 12 Sep '26": 11.8,
    "13 - 19 Sep '26": 12.3,
    "20 - 26 Sep '26": 11.9,
    "27 - 03 Oct '26": 11.2,
    bestEver: 13.1,
  },
  callDuration: {
    "06 - 12 Sep '26": 72,
    "13 - 19 Sep '26": 74,
    "20 - 26 Sep '26": 73,
    "27 - 03 Oct '26": 76,
    bestEver: 68,
  },
  answerRate: {
    "06 - 12 Sep '26": 69.2,
    "13 - 19 Sep '26": 70.1,
    "20 - 26 Sep '26": 69.8,
    "27 - 03 Oct '26": 68.4,
    bestEver: 72.5,
  },
  locationConfirmed: {
    "06 - 12 Sep '26": 61.4,
    "13 - 19 Sep '26": 62.8,
    "20 - 26 Sep '26": 63.1,
    "27 - 03 Oct '26": 63.9,
    bestEver: 63.9,
  },
  callbackRequested: {
    "06 - 12 Sep '26": 7.8,
    "13 - 19 Sep '26": 7.5,
    "20 - 26 Sep '26": 8.1,
    "27 - 03 Oct '26": 8.4,
    bestEver: 7.2,
  },
};

function getDelta(key: KpiKey): { value: number; improved: boolean } {
  const data = WEEKLY_DATA[key];
  const current = data[WEEKS[WEEKS.length - 1]!];
  const previous = data[WEEKS[WEEKS.length - 2]!];
  const rawDelta = Math.round((current - previous) * 10) / 10;
  const improved = LOWER_IS_BETTER.includes(key) ? rawDelta < 0 : rawDelta > 0;
  return { value: rawDelta, improved };
}

function DeltaCell({ kpiKey }: { kpiKey: KpiKey }) {
  const { value, improved } = getDelta(kpiKey);
  const unit = kpiUnit(kpiKey);
  const abs = Math.abs(value);

  if (abs < 0.05) {
    return (
      <span className="delta-badge delta-neutral">
        <Minus size={12} /> 0{unit}
      </span>
    );
  }
  return (
    <span className={`delta-badge ${improved ? "delta-positive" : "delta-negative"}`}>
      {improved ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      {value > 0 ? "+" : ""}{value}{unit}
    </span>
  );
}

function AbTestCta() {
  return (
    <Button asChild variant="outline" size="sm" className="ab-test-cta">
      <Link to="/setup">
        <FlaskConical size={14} />
        Launch A/B test
      </Link>
    </Button>
  );
}

export function WeekOnWeek() {
  const kpiKeys = kpiDefs.map((m) => m.key as KpiKey);
  const negativeKpis = kpiKeys.filter((k) => {
    const { improved, value } = getDelta(k);
    return !improved && Math.abs(value) >= 0.05;
  });

  return (
    <>
      <PageTitle
        eyebrow="EXPERIMENT / WEEK-ON-WEEK"
        title="Track the trend."
        description="Compare overall KPI scores week over week across all users. Spot regressions early and launch targeted experiments."
      />

      <div className="section-heading">
        <div>
          <div className="section-kicker">
            <h2>Week-on-week KPI comparison</h2>
            <Pill>Sample data</Pill>
          </div>
          <p>Overall metrics across 100% of users.</p>
        </div>
        {negativeKpis.length > 0 && (
          <Pill tone="amber">
            <TrendingDown size={13} /> {negativeKpis.length} KPI{negativeKpis.length > 1 ? "s" : ""} declined
          </Pill>
        )}
      </div>

      <div className="score-scroll">
        <table className="data-table score-table wow-table">
          <thead>
            <tr>
              <th>KPIs</th>
              <th>Best Ever</th>
              {WEEKS.map((w) => (
                <th key={w}>{w}</th>
              ))}
              <th>(+/-) Last Week</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {kpiKeys.map((key) => {
              const def = kpiDefs.find((m) => m.key === key)!;
              const data = WEEKLY_DATA[key];
              const unit = kpiUnit(key);
              const { improved, value: deltaValue } = getDelta(key);
              const isNegative = !improved && Math.abs(deltaValue) >= 0.05;

              return (
                <tr key={key} className={isNegative ? "wow-row-negative" : ""}>
                  <td>
                    <strong className="wow-kpi-label">{def.label}</strong>
                  </td>
                  <td className="wow-value wow-best">
                    {data.bestEver}{unit}
                  </td>
                  {WEEKS.map((w) => (
                    <td key={w} className="wow-value">
                      {data[w]}{unit}
                    </td>
                  ))}
                  <td>
                    <DeltaCell kpiKey={key} />
                  </td>
                  <td>
                    {isNegative && <AbTestCta />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {negativeKpis.length > 0 && (
        <Note>
          {negativeKpis.length} metric{negativeKpis.length > 1 ? "s" : ""} show{negativeKpis.length === 1 ? "s" : ""} a
          week-on-week decline. Consider launching an A/B test to experiment with prompt improvements.
        </Note>
      )}

      <div className="table-footer">
        <span>Synthetic data. Week boundaries are illustrative.</span>
      </div>
    </>
  );
}
