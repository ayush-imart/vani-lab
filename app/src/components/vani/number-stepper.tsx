// Number stepper: tap for one step, hold to repeat. The interaction idea comes from the "Drag stepper"
// block on bencho.dev (its code was not copied); styling uses the shared Button and tokens.
import { useEffect, useRef } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const HOLD_DELAY_MS = 350;
const HOLD_REPEAT_MS = 90;

export function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 0.5,
  unit = "",
  id,
  ariaLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  id?: string;
  ariaLabel: string;
}) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 100) / 100));
  const bump = (direction: 1 | -1) => {
    const next = clamp(valueRef.current + direction * step);
    valueRef.current = next;
    onChange(next);
  };
  const stop = () => {
    if (delayRef.current) clearTimeout(delayRef.current);
    if (repeatRef.current) clearInterval(repeatRef.current);
    delayRef.current = null;
    repeatRef.current = null;
  };
  const start = (direction: 1 | -1) => {
    bump(direction);
    delayRef.current = setTimeout(() => {
      repeatRef.current = setInterval(() => bump(direction), HOLD_REPEAT_MS);
    }, HOLD_DELAY_MS);
  };
  useEffect(() => stop, []);

  return (
    <div className="number-stepper" role="group" aria-label={ariaLabel}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Decrease"
        disabled={value <= min}
        onPointerDown={() => start(-1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !e.repeat && bump(-1)}
      >
        <Minus />
      </Button>
      <span className="number-stepper-value" id={id} aria-live="polite">
        {value}
        {unit}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Increase"
        disabled={value >= max}
        onPointerDown={() => start(1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !e.repeat && bump(1)}
      >
        <Plus />
      </Button>
    </div>
  );
}
