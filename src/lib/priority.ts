import type { Priority } from "@/types";

export const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export interface PriorityMeta {
  value: Priority;
  label: string;
  /** Solid dot / flag color (Tailwind class). */
  dot: string;
  /** Same color as a hex, for inline styles (accent bars etc.). */
  dotHex: string;
  /** Chip classes (bg + text) for light & dark. */
  chip: string;
  /** Accent used for the flag icon. */
  flag: string;
}

export const PRIORITY_META: Record<Priority, PriorityMeta> = {
  high: {
    value: "high",
    label: "Alta",
    dot: "bg-red-500",
    dotHex: "#ef4444",
    chip: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
    flag: "text-red-500",
  },
  medium: {
    value: "medium",
    label: "Média",
    dot: "bg-amber-500",
    dotHex: "#f59e0b",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    flag: "text-amber-500",
  },
  low: {
    value: "low",
    label: "Baixa",
    dot: "bg-sky-500",
    dotHex: "#0ea5e9",
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
    flag: "text-sky-500",
  },
};

export const PRIORITY_OPTIONS: PriorityMeta[] = [
  PRIORITY_META.high,
  PRIORITY_META.medium,
  PRIORITY_META.low,
];
