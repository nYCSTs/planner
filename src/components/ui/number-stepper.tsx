"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Short unit label shown after the value (e.g. "min", "×"). */
  suffix?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

/**
 * A compact numeric input with −/+ steppers. Clearer and easier to hit than a
 * bare number field: the buttons nudge by `step`, the value is editable
 * directly, and the result is always clamped to [min, max].
 */
export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = Infinity,
  step = 1,
  disabled = false,
  suffix,
  className,
  id,
  "aria-label": ariaLabel,
}: NumberStepperProps) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  // Local text buffer so the field can be transiently empty while typing.
  // Synced to `value` during render (no effect) via the previous-value pattern:
  // when the incoming prop changes, adopt it as the buffer's new text.
  const [text, setText] = React.useState(String(value));
  const [lastValue, setLastValue] = React.useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(String(value));
  }

  const commit = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === "" || Number.isNaN(n)) {
      setText(String(value));
      return;
    }
    const c = clamp(n);
    onChange(c);
    setText(String(c));
  };

  const bump = (delta: number) => {
    if (disabled) return;
    onChange(clamp(value + delta));
  };

  return (
    <div
      className={cn(
        "inline-flex h-8 items-stretch overflow-hidden rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Diminuir"
        onClick={() => bump(-step)}
        disabled={disabled || value <= min}
        className="grid w-7 shrink-0 place-items-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 border-x border-input px-1">
        <input
          id={id}
          aria-label={ariaLabel}
          inputMode="numeric"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value.replace(/[^\d-]/g, ""))}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
            if (e.key === "ArrowUp") { e.preventDefault(); bump(step); }
            if (e.key === "ArrowDown") { e.preventDefault(); bump(-step); }
          }}
          className="w-full min-w-0 bg-transparent text-center text-sm tabular-nums outline-none"
        />
        {suffix && <span className="shrink-0 pr-0.5 text-xs text-muted-foreground">{suffix}</span>}
      </div>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Aumentar"
        onClick={() => bump(step)}
        disabled={disabled || value >= max}
        className="grid w-7 shrink-0 place-items-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
