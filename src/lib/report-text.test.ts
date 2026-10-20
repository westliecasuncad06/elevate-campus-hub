import { describe, expect, it } from "vitest";
import { formatLongDate } from "./dates";
import { formatReportText } from "./report-text";

const counts = {
  total_attendance: 37,
  students_engaged: 18,
  students_heard_gospel: 12,
  students_accepted_jesus: 12,
  students_wants_dgroup: 0,
  volunteers_count: 6,
};

describe("formatReportText", () => {
  it("writes the report in the ministry's format, with the day's date under the title", () => {
    expect(formatReportText("2026-10-20", counts)).toBe(
      [
        "Campus Hub",
        "October 20, 2026",
        "",
        "Total Attendance: 37",
        "No. of Students Engaged: 18",
        "No. of Students who hear the Gospel: 12",
        "No. of Students who accepted Jesus: 12",
        "No. of Students who wants to join a D-Group: 0",
        "No. of Volunteers: 6",
      ].join("\n"),
    );
  });

  it("keeps a zero as 0 rather than leaving it out", () => {
    const text = formatReportText("2026-10-20", { ...counts, students_wants_dgroup: 0, volunteers_count: 0 });
    expect(text).toContain("D-Group: 0");
    expect(text).toContain("Volunteers: 0");
  });

  it("has no trailing newline, so pasting doesn't add an empty line", () => {
    expect(formatReportText("2026-10-20", counts).endsWith("\n")).toBe(false);
  });
});

describe("formatLongDate", () => {
  it("does not shift the day across timezones", () => {
    expect(formatLongDate("2026-01-01")).toBe("January 1, 2026");
    expect(formatLongDate("2026-12-31")).toBe("December 31, 2026");
  });

  it("handles empty or malformed input without throwing", () => {
    expect(formatLongDate(null)).toBe("—");
    expect(formatLongDate("not-a-date")).toBe("not-a-date");
  });
});
