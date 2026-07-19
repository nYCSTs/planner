/** Accent palette for task blocks and tags. */
export const TASK_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
  "#f43f5e", // rose
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#64748b", // slate
];

export function randomColor(): string {
  return TASK_COLORS[Math.floor(Math.random() * TASK_COLORS.length)];
}

/** Parse a #rrggbb string into [r, g, b] (0–255). Falls back to slate on error. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [100, 116, 139];
  const int = parseInt(m[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/** Relative luminance (0–1) per WCAG, used to pick readable foregrounds. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** `rgba()` string from a hex color and alpha (0–1). */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * CSS custom properties that describe a task's accent color for a timeline
 * block. Consumers read them via Tailwind arbitrary values so a single style
 * object drives fill, border, rail and the readable label color — and each
 * adapts to light vs dark automatically through the alpha channels.
 */
export interface BlockVars extends React.CSSProperties {
  "--accent": string;
  "--accent-strong": string;
}

export function blockVars(color: string): BlockVars {
  return {
    "--accent": color,
    "--accent-strong": color,
  };
}
