import { localDate } from "./domain.js";
export type FocusRun = {
  id: string;
  taskId: string;
  title: string;
  mode: "up" | "down";
  targetSeconds: number;
  segments: Record<string, number>;
  startedAt: number | null;
};
export function durationMs(run: FocusRun) {
  return Object.values(run.segments).reduce((a, n) => a + n, 0);
}
export function settled(run: FocusRun, now: number): FocusRun {
  const next = { ...run, segments: { ...run.segments }, startedAt: null };
  if (run.startedAt === null) return next;
  const cap = (run.mode === "down" ? run.targetSeconds : 86400) * 1000;
  let cursor = run.startedAt;
  const end = Math.max(
    cursor,
    Math.min(now, cursor + Math.max(0, cap - durationMs(run))),
  );
  while (cursor < end) {
    const day = localDate(new Date(cursor));
    const midnight = new Date(cursor);
    midnight.setHours(24, 0, 0, 0);
    const stop = Math.min(end, +midnight);
    next.segments[day] = (next.segments[day] || 0) + stop - cursor;
    cursor = stop;
  }
  return next;
}
export function elapsedSeconds(run: FocusRun, now = Date.now()) {
  return Math.floor(durationMs(settled(run, now)) / 1000);
}
export function timeEntries(run: FocusRun, now = Date.now()) {
  return Object.entries(settled(run, now).segments)
    .map(([date, ms]) => ({ date, seconds: Math.floor(ms / 1000) }))
    .filter((e) => e.seconds > 0);
}
export function clockText(seconds: number) {
  const n = Math.max(0, Math.floor(seconds));
  return n >= 3600
    ? `${String(Math.floor(n / 3600)).padStart(2, "0")}:${String(Math.floor(n / 60) % 60).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`
    : `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
