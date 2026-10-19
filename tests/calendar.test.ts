import { describe, expect, it } from "vitest";
import { addDays, addMonths, isDayKey, monthGrid, weekDays, weekdayIndex } from "@/lib/calendar";

describe("calendar helpers", () => {
  it("validates day keys", () => {
    expect(isDayKey("2026-02-28")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("tomorrow")).toBe(false);
  });
  it("adds days and months across boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
  });
  it("starts weeks on Monday", () => {
    expect(weekdayIndex("2026-10-19")).toBe(0); // Monday
    expect(weekDays("2026-10-22")[0]).toBe("2026-10-19");
  });
  it("builds a six-week month grid that contains the month", () => {
    const grid = monthGrid("2026-10-19");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-09-28");
    expect(grid).toContain("2026-10-31");
  });
});
