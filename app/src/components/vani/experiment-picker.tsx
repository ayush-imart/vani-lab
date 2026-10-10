// Top-bar experiment picker (Phase E1), Google Cloud console style: a compact trigger that names
// the selected experiment and opens a list of all experiments.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronDown, FlaskConical, Plus, Search, PanelsTopLeft } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pill } from "./common";
import { EXP_PARAM, setExperimentId, useExperimentId } from "@/lib/experiment-scope";
import {
  STATUS_TONE,
  listExperiments,
  statusLabel,
  type Experiment,
} from "@/lib/experiments-api";

const REFRESH_MS = 15000;

export type ExperimentList = { items: Experiment[]; state: "loading" | "ready" | "offline" };

export function useExperimentList(): ExperimentList & { refresh: () => void } {
  const [list, setList] = useState<ExperimentList>({ items: [], state: "loading" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      listExperiments()
        .then((items) => alive && setList({ items, state: "ready" }))
        .catch(() => alive && setList((l) => ({ items: l.items, state: "offline" })));
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [tick]);
  return { ...list, refresh: () => setTick((t) => t + 1) };
}

// Selecting writes the store (+ localStorage) and the URL search param.
export function useSelectExperiment() {
  const navigate = useNavigate();
  return (id: string, to?: string) => {
    setExperimentId(id);
    void navigate({
      to: to ?? ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, [EXP_PARAM]: id }),
    } as never);
  };
}

export function ExperimentPicker() {
  const selectedId = useExperimentId();
  const { items, state } = useExperimentList();
  const select = useSelectExperiment();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = items.find((e) => e.id === selectedId);
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return items;
    return items.filter((item) => `${item.name} ${item.id}`.toLocaleLowerCase().includes(normalized));
  }, [items, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className="exp-picker-trigger" aria-label="Switch experiment" aria-expanded={open}>
          <span className="exp-picker-icon"><FlaskConical size={16} /></span>
          <span className="exp-picker-copy">
            <span className="exp-picker-kicker">WORKSPACE</span>
            <span className="exp-picker-name">{selected?.name ?? "All experiments"}</span>
          </span>
          {selected && <span className={`exp-picker-status status-${STATUS_TONE[selected.status]}`} aria-label={statusLabel(selected.status)} />}
          <ChevronDown className="exp-picker-chevron" size={15} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={10} className="exp-picker-popover">
        <div className="exp-picker-heading">
          <div>
            <span className="exp-picker-kicker">VANI LAB</span>
            <h2>Switch experiment</h2>
          </div>
          <button
            type="button"
            className="exp-picker-new"
            onClick={() => {
              setOpen(false);
              void navigate({ to: "/setup" });
            }}
          >
            <Plus size={15} /> New
          </button>
        </div>
        <label className="exp-picker-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find an experiment"
            aria-label="Find an experiment"
          />
          <kbd>/</kbd>
        </label>
        <div className="exp-picker-options" role="listbox" aria-label="Experiments">
          {state === "offline" ? (
            <p className="exp-picker-empty">Experiments are unavailable while the backend is offline.</p>
          ) : state === "loading" && items.length === 0 ? (
            <p className="exp-picker-empty">Loading experiments…</p>
          ) : filteredItems.length === 0 ? (
            <p className="exp-picker-empty">{items.length ? "No matching experiments." : "No experiments yet. Create one to get started."}</p>
          ) : (
            filteredItems.map((experiment) => (
              <button
                key={experiment.id}
                type="button"
                role="option"
                aria-selected={experiment.id === selectedId}
                className={`exp-picker-option ${experiment.id === selectedId ? "is-selected" : ""}`}
                onClick={() => {
                  setOpen(false);
                  select(experiment.id);
                }}
              >
                <span className="exp-picker-option-icon"><FlaskConical size={15} /></span>
                <span className="exp-picker-option-copy">
                  <strong>{experiment.name}</strong>
                  <span>{experiment.baselineVersionId} vs {experiment.challengerVersionId}</span>
                </span>
                <Pill tone={STATUS_TONE[experiment.status]}>{statusLabel(experiment.status)}</Pill>
                {experiment.id === selectedId && <Check className="exp-picker-check" size={15} />}
              </button>
            ))
          )}
        </div>
        <div className="exp-picker-footer">
          <button
            type="button"
            className={`exp-picker-all ${!selectedId ? "is-current" : ""}`}
            onClick={() => {
              setOpen(false);
              setExperimentId(null);
              void navigate({ to: "/", search: {} } as never);
            }}
          >
            <PanelsTopLeft size={15} />
            <span>All experiments</span>
            {!selectedId && <Check size={14} />}
          </button>
          <span className="exp-picker-scope">Selection filters every screen</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
