import { type ReactNode } from "react";
import { Info, ChevronRight, Check, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { versions } from "./data";
export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Avatar({ id, small = false }: { id: string; small?: boolean }) {
  const v = versions.find((v) => v.id === id);
  return (
    <span className={`version-avatar version-${id} ${small ? "small" : ""}`}>
      {v ? <img src={v.image} alt={v.name} width="40" height="40" /> : id}
    </span>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="vani-modal">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {description || "Synthetic demo · no live calls or production changes."}
        </DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="inline-note">
      <Info size={15} />
      <span>{children}</span>
    </div>
  );
}
// Shared tooltip: keyboard-focusable trigger, token-styled content. Needs the app-level TooltipProvider.
export function Tip({
  label,
  children,
  side = "bottom",
}: {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} collisionPadding={12}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
export function Regression() {
  return (
    <Tip label="Placeholder: regression metric is pending product definition">
      <span className="regression" tabIndex={0}>
        <Check size={12} /> No regression on previous scenarios <Info size={11} />
      </span>
    </Tip>
  );
}
export function Evidence() {
  return (
    <div className="evidence">
      <div className="flex justify-between">
        <strong>More evidence, not a premature winner.</strong>
        <Pill tone="amber">Inconclusive</Pill>
      </div>
      <p>B is ahead by 1.7 percentage points. The sample is still too small to conclude.</p>
      <div className="evidence-grid">
        <div>
          <small>Calls collected / needed</small>
          <strong>916 / 1,500</strong>
        </div>
        <div>
          <small>Illustrative 95% interval · B vs A</small>
          <strong>−0.8 to +4.2 pp</strong>
        </div>
      </div>
      <Note>
        Decision method and sample target are illustrative placeholders, pending product approval.
      </Note>
    </div>
  );
}
export function TextLink({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <Button variant="link" size="sm" onClick={onClick}>
      {children}
      <ChevronRight size={14} />
    </Button>
  );
}
export function EmptyState({ state = "empty", onRetry }: { state?: string; onRetry?: () => void }) {
  return (
    <div className="empty-state">
      <Info size={24} />
      <h3>
        {state === "loading"
          ? "Collecting results…"
          : state === "error"
            ? "Results couldn’t be loaded"
            : "No results yet"}
      </h3>
      <p>
        {state === "error"
          ? "Your experiment is safe. Try loading the results again."
          : "Results will appear when the next calls are evaluated."}
      </p>
      {state === "error" && (
        <Button variant="outline" onClick={onRetry}>
          Try again
          <ArrowUpRight />
        </Button>
      )}
    </div>
  );
}
