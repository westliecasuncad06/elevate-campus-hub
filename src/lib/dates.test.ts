import { describe, expect, it } from "vitest";
import { formatDate, todayInTimezone } from "./dates";

describe("todayInTimezone", () => {
  it("uses the campus clock, not UTC", () => {
    // 2026-03-10 23:30 UTC is already 7:30 AM on the 11th in Manila (UTC+8).
    const instant = new Date("2026-03-10T23:30:00Z");
    expect(todayInTimezone("Asia/Manila", instant)).toBe("2026-03-11");
    expect(todayInTimezone("UTC", instant)).toBe("2026-03-10");
  });

  it("keeps the morning and the evening of one Manila day on the same date", () => {
    // 00:30 and 23:30 Manila time on 2026-03-11 (= 16:30 UTC on the 10th, and 15:30 UTC on the 11th).
    expect(todayInTimezone("Asia/Manila", new Date("2026-03-10T16:30:00Z"))).toBe("2026-03-11");
    expect(todayInTimezone("Asia/Manila", new Date("2026-03-11T15:30:00Z"))).toBe("2026-03-11");
  });
});

describe("formatDate", () => {
  it("does not shift plain dates across timezones", () => {
    expect(formatDate("2026-03-11")).toBe("Wed, Mar 11, 2026");
  });

  it("shows a dash for empty values", () => {
    expect(formatDate(null)).toBe("—");
  });
});
