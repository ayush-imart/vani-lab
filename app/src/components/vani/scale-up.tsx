import { useState } from "react";
import { ChipSelect } from "./chips";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Info,
  Layers,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PageTitle, Pill, Avatar, Modal, Note, EmptyState } from "./common";
import { versions } from "./data";
import { Autoscale } from "./autoscale";
import { RolloutPanel } from "./rollout-panel";
import { Reveal } from "./motion-kit";
export function ScaleUp() {
  const [key, setKey] = useState("GLID");
  const [map, setMap] = useState<Record<string, Record<number, string>>>({
    GLID: { 0: "A", 1: "A", 2: "B", 3: "C" },
    Mobile: { 0: "A", 1: "A", 8: "B" },
  });
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [version, setVersion] = useState("B");
  const [digits, setDigits] = useState<number[]>([]);
  const [detail, setDetail] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [history, setHistory] = useState<{ version: string; key: string; digits: number[] }[]>([]);
  const [start, setStart] = useState("2026-10-15T10:00");
  const [end, setEnd] = useState("2026-10-22T10:00");
  const [view, setView] = useState("ready");
  const occupied = map[key] || {};
  const overlap = digits.filter((d) => occupied[d] && occupied[d] !== version);
  const next = () => {
    setStep(Math.min(2, step + 1));
  };
  const confirm = () => {
    const updated = { ...occupied };
    digits.forEach((d) => (updated[d] = version));
    setMap({ ...map, [key]: updated });
    setHistory([...history, { version, key, digits: [...digits] }]);
    setConfirmed(true);
    setOpen(false);
    toast.success(
      `Simulated scale-up · Version ${version} assigned to ${digits.length * 10}% of eligible calls`,
    );
  };
  return (
    <>
      <PageTitle
        eyebrow="EXPERIMENT / SCALE-UP"
        title="Grow the winner. Keep control."
        description="A clear view of every segment, and a deliberate next step for your rollout."
        action={
          <Button
            onClick={() => {
              setStep(0);
              setDigits([]);
              setOpen(true);
            }}
          >
            <Layers />
            Scale to segment
          </Button>
        }
      />
      <RolloutPanel />
      <Autoscale />
      <div className="segments-page">
        <div className="section-heading">
          <div>
            <div className="section-kicker">
              <h2>Your segment map</h2>
              <Pill>Local preview</Pill>
            </div>
            <p>See which version is live on each ending digit. Select a segment for details.</p>
          </div>
          <Pill tone="green">
            <ShieldCheck size={11} />
            No conflicting allocations
          </Pill>
        </div>
        <div className="segment-key">
          <div className="segmented">
            {["GLID", "Mobile"].map((k) => (
              <Button
                key={k}
                variant="ghost"
                className={key === k ? "active" : ""}
                onClick={() => setKey(k)}
              >
                {k === "GLID" ? "GLID ending digit" : "Mobile ending digit"}
              </Button>
            ))}
          </div>
          <span className="neutral-text text-[10px]">Each digit ≈ 10% of eligible calls</span>
        </div>
        {view !== "ready" ? (
          <EmptyState state={view} onRetry={() => setView("ready")} />
        ) : (
          <div className="segment-map">
            {Array.from({ length: 10 }, (_, d) => (
              <Button
                variant="ghost"
                className={`segment-block ${occupied[d] ? `occupied version-${occupied[d]}` : ""}`}
                key={d}
                onClick={() => setDetail(d)}
                aria-label={`Digit ${d}, ${occupied[d] ? `Version ${occupied[d]}` : "Free"}`}
              >
                <strong>{d}</strong>
                <span>
                  {occupied[d]
                    ? `Version ${occupied[d]}${occupied[d] === "A" ? " · Baseline" : ""}`
                    : "Free"}{" "}
                  {occupied[d] && <i className="legend-dot ml-1" />}
                </span>
              </Button>
            ))}
          </div>
        )}
        <div className="segment-legend">
          {versions.map((v) => (
            <span key={v.id} className={`version-${v.id}`}>
              <i className="legend-dot" />
              Version {v.id}
              {v.id === "A" ? " · Baseline" : ""}
            </span>
          ))}
          <span>
            <i className="legend-dot bg-muted" />
            Free
          </span>
        </div>
        <div className="scale-recap">
          <div>
            <h3>{confirmed ? "Rollout preview updated." : "No winner has been promoted yet."}</h3>
            <p>
              {confirmed
                ? "This is a simulated allocation. Your team approves the real rollout."
                : "The baseline remains live until your evidence supports a decision."}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setStep(0);
              setOpen(true);
            }}
          >
            Preview scale-up
            <ArrowUpRight />
          </Button>
        </div>
        <section className="rollout-history">
          <div className="section-heading">
            <h2>Recent allocations</h2>
            <ChipSelect
              value={view}
              onChange={setView}
              ariaLabel="Segment preview state"
              options={[
                { value: "ready", label: "Ready" },
                { value: "empty", label: "Empty" },
                { value: "loading", label: "Loading" },
                { value: "error", label: "Error" },
              ]}
            />
          </div>
          {history.length ? (
            history.map((h, i) => (
              <div className="history-row" key={i}>
                <Avatar id={h.version} />
                <div>
                  <strong>
                    Version {h.version} · {h.key} ending {h.digits.join(", ")}
                  </strong>
                  <p>{h.digits.length * 10}% of eligible calls · Simulated allocation</p>
                </div>
                <Pill tone="green">Preview confirmed</Pill>
                <Button
                  variant="ghost"
                  onClick={() => {
                    const updated = { ...map[h.key] };
                    h.digits.forEach((d) => delete updated[d]);
                    setMap({ ...map, [h.key]: updated });
                    setHistory(history.filter((_, index) => index !== i));
                    toast("Simulated rollout rolled back");
                  }}
                >
                  <RotateCcw />
                  Roll back
                </Button>
              </div>
            ))
          ) : (
            <div className="history-row">
              <Avatar id="A" />
              <div>
                <strong>Baseline A · GLID ending 0, 1</strong>
                <p>Shorter opening vs baseline · 08 Oct, 10:00 IST</p>
              </div>
              <small>20% of eligible calls</small>
              <Pill tone="green">Live</Pill>
            </div>
          )}
        </section>
      </div>
      <Modal
        open={detail !== null}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
        title={`${key} ending digit ${detail}`}
      >
        <div className="form-summary">
          <span>Live version</span>
          <strong>
            {detail !== null && occupied[detail]
              ? `Version ${occupied[detail]}`
              : "Free · no allocation"}
          </strong>
        </div>
        <div className="form-summary">
          <span>Experiment</span>
          <strong>
            {detail !== null && occupied[detail] ? "Shorter opening vs baseline" : "None"}
          </strong>
        </div>
        <div className="form-summary">
          <span>Since</span>
          <strong>{detail !== null && occupied[detail] ? "08 Oct, 10:00 IST" : "—"}</strong>
        </div>
        <Note>Synthetic segment · masked example GLID ••••482. No real seller data.</Note>
      </Modal>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Scale to a new segment"
        description="Controlled rollout preview · no production traffic is changed."
      >
        <div className="wizard">
          <div className="form-stepper">
            {["Version", "Segment", "Review"].map((s, i) => (
              <Button
                key={s}
                variant="ghost"
                className={i === step ? "active" : ""}
                onClick={() => {
                  if (i <= step) setStep(i);
                }}
              >
                <span className="step-number">{i < step ? <Check size={11} /> : i + 1}</span>
                {s}
              </Button>
            ))}
          </div>
          {step === 0 ? (
            <>
              <label className="field-label">Which version should reach more sellers?</label>
              {versions.map((v) => (
                <Button
                  variant="ghost"
                  key={v.id}
                  className={`wizard-version ${version === v.id ? "selected" : ""}`}
                  onClick={() => setVersion(v.id)}
                >
                  <Avatar id={v.id} />
                  <div>
                    <strong>
                      Version {v.id} <Pill>{v.id === "A" ? "Baseline" : "Candidate"}</Pill>
                    </strong>
                    <p>{v.title}</p>
                  </div>
                  {version === v.id && <Check size={16} />}
                </Button>
              ))}
              <Note>
                Candidate scale-up is a preview only. An approved decision is required before a real
                rollout.
              </Note>
            </>
          ) : step === 1 ? (
            <>
              <div className="segmented mb-5">
                {["GLID", "Mobile"].map((k) => (
                  <Button
                    key={k}
                    variant="ghost"
                    className={key === k ? "active" : ""}
                    onClick={() => {
                      setKey(k);
                      setDigits([]);
                    }}
                  >
                    {k} ending digit
                  </Button>
                ))}
              </div>
              <label className="field-label">Select ending digits</label>
              <div className="segment-map">
                {Array.from({ length: 10 }, (_, d) => (
                  <Button
                    key={d}
                    variant="ghost"
                    className={`segment-block ${digits.includes(d) ? "selected" : occupied[d] ? `occupied version-${occupied[d]}` : ""}`}
                    aria-label={`Select digit ${d}`}
                    aria-pressed={digits.includes(d)}
                    onClick={() =>
                      setDigits(
                        digits.includes(d) ? digits.filter((n) => n !== d) : [...digits, d].sort(),
                      )
                    }
                  >
                    <strong>{d}</strong>
                    <span>
                      {occupied[d] ? `Version ${occupied[d]}` : "Free"}
                      {digits.includes(d) && <Check size={10} className="inline ml-1" />}
                    </span>
                  </Button>
                ))}
              </div>
              <div className="flex justify-between text-[11px]">
                <span>Selected traffic</span>
                <strong>{digits.length * 10}% of eligible calls</strong>
              </div>
              <div className={`scale-progress w-${digits.length * 10}`}>
                <span />
              </div>
              <Reveal show={overlap.length > 0}>
                <div className="early-banner mt-4">
                  <p>
                    Overlaps another running test on digit{overlap.length > 1 ? "s" : ""}{" "}
                    {overlap.join(", ")}. Choose free segments to continue.
                  </p>
                </div>
              </Reveal>
              <div className="field-grid mt-5">
                <div>
                  <label className="field-label">Start · IST</label>
                  <input
                    className="form-input"
                    type="datetime-local"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">End · IST</label>
                  <input
                    className="form-input"
                    type="datetime-local"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>
              </div>
              <Reveal show={end <= start}>
                <p className="validation-error">End must be after start.</p>
              </Reveal>
            </>
          ) : (
            <>
              <h3>A deliberate next step</h3>
              {[
                ["Version", `Version ${version}`],
                ["Segment", `${key} ending ${digits.join(", ")}`],
                ["Traffic share", `${digits.length * 10}% of eligible calls`],
                ["Time window", `${start.replace("T", " ")} → ${end.replace("T", " ")} IST`],
                [
                  "Primary metric",
                  `Meeting Fixed rate · ${versions.find((v) => v.id === version)?.rate}% in sample`,
                ],
              ].map(([k, v]) => (
                <div className="form-summary" key={k}>
                  <span>{k}</span>
                  <strong className="text-right max-w-[65%]">{v}</strong>
                </div>
              ))}
              <div className="segment-map mt-5">
                {Array.from({ length: 10 }, (_, d) => (
                  <div
                    className={`segment-block ${digits.includes(d) ? "selected" : occupied[d] ? `occupied version-${occupied[d]}` : ""}`}
                    key={d}
                  >
                    <strong>{d}</strong>
                    <span>
                      {digits.includes(d)
                        ? `Version ${version}`
                        : occupied[d]
                          ? `Version ${occupied[d]}`
                          : "Free"}
                    </span>
                  </div>
                ))}
              </div>
              <Note>
                Decision strategy is pending product approval. Confirming changes the UI preview
                only.
              </Note>
            </>
          )}
          <div className="form-actions">
            <Button
              variant="outline"
              onClick={() => (step === 0 ? setOpen(false) : setStep(step - 1))}
            >
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step < 2 ? (
              <Button
                disabled={step === 1 && (!digits.length || !!overlap.length || end <= start)}
                onClick={next}
              >
                Continue
                <ArrowRight />
              </Button>
            ) : (
              <Button onClick={confirm}>
                Confirm scale-up
                <Check />
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
