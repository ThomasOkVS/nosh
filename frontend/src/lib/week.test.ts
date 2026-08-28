import { describe, expect, it } from "vitest";
import { addDays, formatWeekLabel, startOfWeekMonday, todayString, weekDates } from "./week";

describe("week", () => {
  describe("startOfWeekMonday", () => {
    it("returns the same date for a Monday", () => {
      // 2026-08-24 is a Monday.
      expect(startOfWeekMonday(new Date(2026, 7, 24))).toBe("2026-08-24");
    });

    it("returns the preceding Monday for a mid-week date", () => {
      // 2026-08-26 is a Wednesday.
      expect(startOfWeekMonday(new Date(2026, 7, 26))).toBe("2026-08-24");
    });

    it("treats Sunday as the last day of the week starting the prior Monday", () => {
      // 2026-08-30 is a Sunday, belonging to the week starting 2026-08-24.
      expect(startOfWeekMonday(new Date(2026, 7, 30))).toBe("2026-08-24");
    });
  });

  describe("addDays", () => {
    it("adds days within a month", () => {
      expect(addDays("2026-08-24", 3)).toBe("2026-08-27");
    });

    it("subtracts days with a negative n", () => {
      expect(addDays("2026-08-24", -7)).toBe("2026-08-17");
    });

    it("crosses a month boundary", () => {
      expect(addDays("2026-08-29", 3)).toBe("2026-09-01");
    });

    it("crosses a year boundary", () => {
      expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    });

    it("builds local date-part strings, not UTC-shifted ones", () => {
      // A naive `toISOString().slice(0, 10)` implementation would be immune
      // to this specific input, but this pins the actual local-parts
      // construction this module is built on, per the module's own doc
      // comment.
      const result = addDays("2026-01-01", 0);
      expect(result).toBe("2026-01-01");
    });

    it("produces 7 distinct, consecutive dates across a DST-transition week (Europe, spring forward)", () => {
      // The last Sunday of March 2026 (2026-03-29) is when DST starts in
      // Europe -- this week's arithmetic must not skip or duplicate a day
      // regardless of the host's timezone.
      const weekStart = "2026-03-23";
      const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
      expect(dates).toEqual([
        "2026-03-23",
        "2026-03-24",
        "2026-03-25",
        "2026-03-26",
        "2026-03-27",
        "2026-03-28",
        "2026-03-29",
      ]);
    });

    it("produces 7 distinct, consecutive dates across a DST-transition week (Europe, fall back)", () => {
      // The last Sunday of October 2026 (2026-10-25) is when DST ends.
      const weekStart = "2026-10-19";
      const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
      expect(dates).toEqual([
        "2026-10-19",
        "2026-10-20",
        "2026-10-21",
        "2026-10-22",
        "2026-10-23",
        "2026-10-24",
        "2026-10-25",
      ]);
    });
  });

  describe("weekDates", () => {
    it("returns 7 dates, Monday through Sunday", () => {
      expect(weekDates("2026-08-24")).toEqual([
        "2026-08-24",
        "2026-08-25",
        "2026-08-26",
        "2026-08-27",
        "2026-08-28",
        "2026-08-29",
        "2026-08-30",
      ]);
    });
  });

  describe("formatWeekLabel", () => {
    it("formats a week within one month", () => {
      expect(formatWeekLabel("2026-08-24")).toBe("Aug 24 – 30, 2026");
    });

    it("formats a week spanning two months", () => {
      expect(formatWeekLabel("2026-08-31")).toBe("Aug 31 – Sep 6, 2026");
    });

    it("formats a week spanning two years", () => {
      expect(formatWeekLabel("2026-12-28")).toBe("Dec 28, 2026 – Jan 3, 2027");
    });
  });

  describe("todayString", () => {
    it("returns a YYYY-MM-DD string matching the local date", () => {
      expect(todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
