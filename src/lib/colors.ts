/** Accent palette for task blocks. */
export const TASK_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f59e0b", // amber
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#3b82f6", // blue
];

export function randomColor(): string {
  return TASK_COLORS[Math.floor(Math.random() * TASK_COLORS.length)];
}
