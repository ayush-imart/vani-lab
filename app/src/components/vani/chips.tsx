// Chip-style single select (replaces dropdowns). Up to `max` options show as chips; the rest go
// into a compact "More" popover. Built on the shared ToggleGroup so keyboard + aria-checked work.
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type ChipOption = { value: string; label: string };

export function ChipSelect({
  value,
  onChange,
  options,
  ariaLabel,
  max = 5,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ChipOption[];
  ariaLabel: string;
  max?: number;
  disabled?: boolean;
}) {
  const needsMore = options.length > max;
  const shown = needsMore ? options.slice(0, max - 1) : options;
  const rest = needsMore ? options.slice(max - 1) : [];
  const selectedRest = rest.find((o) => o.value === value);
  return (
    <div className="chip-select">
      <ToggleGroup
        type="single"
        value={shown.some((o) => o.value === value) ? value : ""}
        onValueChange={(v) => v && onChange(v)}
        aria-label={ariaLabel}
        disabled={disabled}
        className="chip-group"
      >
        {shown.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} className="chip">
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {needsMore && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="chip chip-more"
              data-state={selectedRest ? "on" : "off"}
              disabled={disabled}
              aria-label={`${ariaLabel}: more options`}
            >
              {selectedRest ? selectedRest.label : "More"}
              <ChevronDown size={12} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="chip-menu">
            {rest.map((o) => (
              <button
                key={o.value}
                type="button"
                className="chip-menu-item"
                onClick={() => onChange(o.value)}
              >
                <span>{o.label}</span>
                {o.value === value && <Check size={13} />}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
