function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Builds a "YYYY-MM-DD" string from a Date's *local* calendar fields —
 * never `toISOString()`, which reads UTC fields and would silently shift
 * the date a day earlier for any host east of UTC. */
function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Parses a "YYYY-MM-DD" string into a Date set to local midnight on that
 * day — the inverse of `toDateString`, and the only place this module
 * constructs a `Date` from a string rather than the reverse. */
function fromDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year!, month! - 1, day);
}

/** The Monday on or before `date`, as "YYYY-MM-DD" — the app's week grid
 * always starts on Monday (European convention). */
export function startOfWeekMonday(date: Date): string {
  const day = date.getDay(); // 0 (Sun) .. 6 (Sat)
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + diffToMonday);
  return toDateString(monday);
}

/** `dateStr` shifted by `n` days (negative to go backward). The `Date`
 * constructor normalizes an out-of-range day (e.g. day 32) into the next
 * month correctly, including across a DST transition, since this only ever
 * deals in whole calendar days, never a time of day. */
export function addDays(dateStr: string, n: number): string {
  const date = fromDateString(dateStr);
  const shifted = new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  return toDateString(shifted);
}

/** The 7 dates of the week starting at `weekStart` (Monday), Monday→Sunday. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** A human-readable label for the week starting at `weekStart`, e.g.
 * "Aug 24 – 30, 2026", collapsing the month/year only when they differ
 * across the week's ends. */
export function formatWeekLabel(weekStart: string): string {
  const start = fromDateString(weekStart);
  const end = fromDateString(addDays(weekStart, 6));
  const startMonth = start.toLocaleDateString("en-US", { month: "short" });
  const endMonth = end.toLocaleDateString("en-US", { month: "short" });
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  if (startYear !== endYear) {
    return `${startMonth} ${start.getDate()}, ${startYear} – ${endMonth} ${end.getDate()}, ${endYear}`;
  }
  if (startMonth !== endMonth) {
    return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${startYear}`;
  }
  return `${startMonth} ${start.getDate()} – ${end.getDate()}, ${startYear}`;
}

/** Today, as a local "YYYY-MM-DD" string — used for the today-highlight. */
export function todayString(): string {
  return toDateString(new Date());
}
