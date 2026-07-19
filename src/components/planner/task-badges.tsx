"use client";

import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { rgba } from "@/lib/colors";
import { PRIORITY_META } from "@/lib/priority";
import type { Priority, Tag } from "@/types";

/** Small filled pill showing a task's priority. */
export function PriorityBadge({
  priority,
  className,
}: {
  priority: Priority;
  className?: string;
}) {
  const m = PRIORITY_META[priority];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none",
        m.chip,
        className,
      )}
    >
      <Flag className="h-2.5 w-2.5 fill-current" />
      {m.label}
    </span>
  );
}

/** A flag icon tinted by priority, for dense rows where a full badge is too much. */
export function PriorityFlag({
  priority,
  className,
}: {
  priority: Priority;
  className?: string;
}) {
  const m = PRIORITY_META[priority];
  return (
    <Flag className={cn("h-3 w-3 fill-current", m.flag, className)} aria-label={`Prioridade ${m.label}`} />
  );
}

/** A colored label chip for a tag. */
export function TagChip({
  tag,
  onRemove,
  className,
}: {
  tag: Tag;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none",
        className,
      )}
      style={{ backgroundColor: rgba(tag.color, 0.16), color: tag.color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: tag.color }}
      />
      {tag.label}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-0.5 ml-0.5 rounded-full opacity-60 transition hover:opacity-100"
          aria-label={`Remover etiqueta ${tag.label}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
