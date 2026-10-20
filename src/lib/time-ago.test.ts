import { describe, expect, it } from "vitest";
import { timeAgo } from "./time-ago";

const NOW = new Date("2026-03-11T12:00:00Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("timeAgo", () => {
  it("says 'just now' for the last few seconds", () => {
    expect(timeAgo(ago(10_000), NOW)).toBe("just now");
  });

  it("uses minutes, hours and days", () => {
    expect(timeAgo(ago(5 * 60_000), NOW)).toBe("5 min ago");
    expect(timeAgo(ago(3 * 3_600_000), NOW)).toBe("3 h ago");
    expect(timeAgo(ago(26 * 3_600_000), NOW)).toBe("Yesterday");
    expect(timeAgo(ago(3 * 86_400_000), NOW)).toBe("3 days ago");
  });

  it("falls back to a short date after a week", () => {
    expect(timeAgo(ago(20 * 86_400_000), NOW)).toMatch(/Feb \d+/);
  });

  it("never goes negative if the clock is a little off", () => {
    expect(timeAgo(new Date(NOW + 60_000).toISOString(), NOW)).toBe("just now");
  });
});
