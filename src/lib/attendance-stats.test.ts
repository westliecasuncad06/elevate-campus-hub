import { describe, expect, it } from "vitest";
import {
  computeStudentStats,
  sortRows,
  statusForRate,
  summarize,
  toCsv,
  yearCourse,
  yearLabel,
  type SheetRow,
} from "./attendance-stats";

// Six Fridays.
const sessions = ["2026-09-18", "2026-09-25", "2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23"];

describe("computeStudentStats", () => {
  it("marks each session attended or missed and works out the rate", () => {
    const s = computeStudentStats(sessions, "2026-01-01", ["2026-09-18", "2026-10-02", "2026-10-09", "2026-10-23"]);
    expect(s.cells).toEqual(["attended", "missed", "attended", "attended", "missed", "attended"]);
    expect(s.attended).toBe(4);
    expect(s.eligible).toBe(6);
    expect(s.rate).toBe(67);
    expect(s.status).toBe("regular");
    expect(s.lastAttended).toBe("2026-10-23");
    expect(s.missedStreak).toBe(0);
    expect(s.atRisk).toBe(false);
  });

  it("does not count sessions that happened before the student registered", () => {
    const s = computeStudentStats(sessions, "2026-10-09", ["2026-10-09", "2026-10-16"]);
    expect(s.cells).toEqual(["before", "before", "before", "attended", "attended", "missed"]);
    expect(s.eligible).toBe(3);
    expect(s.rate).toBe(67);
  });

  it("counts a session the student attended even if it is dated before they were registered", () => {
    const s = computeStudentStats(sessions, "2026-10-09", ["2026-09-25"]);
    expect(s.cells[1]).toBe("attended");
    expect(s.eligible).toBe(4);
  });

  it("treats the registration day itself as a session the student could have attended", () => {
    const s = computeStudentStats(sessions, "2026-10-23", []);
    expect(s.cells[5]).toBe("missed");
    expect(s.eligible).toBe(1);
  });

  it("flags someone who attended before but missed the last three sessions as at risk", () => {
    const s = computeStudentStats(sessions, "2026-01-01", ["2026-09-18", "2026-09-25"]);
    expect(s.missedStreak).toBe(4);
    expect(s.atRisk).toBe(true);
    expect(s.status).toBe("occasional");
  });

  it("does not flag at risk after only two misses, or someone who never came", () => {
    expect(computeStudentStats(sessions, "2026-01-01", ["2026-09-18", "2026-10-02", "2026-10-09"]).atRisk).toBe(false);
    const never = computeStudentStats(sessions, "2026-01-01", []);
    expect(never.atRisk).toBe(false);
    expect(never.status).toBe("rare");
    expect(never.lastAttended).toBeNull();
  });

  it("never counts today's unfinished session as missed", () => {
    const s = computeStudentStats(sessions, "2026-01-01", ["2026-09-18", "2026-10-02", "2026-10-09", "2026-10-16"], "2026-10-23");
    expect(s.cells[5]).toBe("pending");
    expect(s.eligible).toBe(5);
    expect(s.rate).toBe(80);
    expect(s.lastAttended).toBe("2026-10-16");
  });

  it("counts today as attended once the student is recorded", () => {
    const s = computeStudentStats(sessions, "2026-01-01", ["2026-10-23"], "2026-10-23");
    expect(s.cells[5]).toBe("attended");
    expect(s.attended).toBe(1);
  });

  it("counts misses back from the last finished session, skipping today", () => {
    const s = computeStudentStats(sessions, "2026-01-01", ["2026-09-18", "2026-09-25"], "2026-10-23");
    // Missed 10/02, 10/09, 10/16; 10/23 is still open.
    expect(s.missedStreak).toBe(3);
    expect(s.atRisk).toBe(true);
    const onTheEdge = computeStudentStats(sessions, "2026-01-01", ["2026-09-18", "2026-09-25", "2026-10-02"], "2026-10-23");
    expect(onTheEdge.missedStreak).toBe(2);
    expect(onTheEdge.atRisk).toBe(false);
  });

  it("is 'new' with no rate when no session has counted yet", () => {
    const s = computeStudentStats(sessions, "2026-12-01", []);
    expect(s.eligible).toBe(0);
    expect(s.rate).toBeNull();
    expect(s.status).toBe("new");
  });

  it("handles a range with no sessions at all", () => {
    const s = computeStudentStats([], "2026-01-01", []);
    expect(s.cells).toEqual([]);
    expect(s.rate).toBeNull();
  });
});

describe("statusForRate", () => {
  it("uses the documented thresholds", () => {
    expect(statusForRate(100, 6)).toBe("consistent");
    expect(statusForRate(80, 5)).toBe("consistent");
    expect(statusForRate(79, 6)).toBe("regular");
    expect(statusForRate(50, 6)).toBe("regular");
    expect(statusForRate(49, 6)).toBe("occasional");
    expect(statusForRate(20, 6)).toBe("occasional");
    expect(statusForRate(19, 6)).toBe("rare");
    expect(statusForRate(0, 6)).toBe("rare");
  });

  it("calls anyone with fewer than two counted sessions new, whatever the rate", () => {
    expect(statusForRate(100, 1)).toBe("new");
    expect(statusForRate(0, 1)).toBe("new");
    expect(statusForRate(null, 0)).toBe("new");
  });
});

describe("yearLabel / yearCourse", () => {
  it("writes ordinals like the ministry's sheet", () => {
    expect([1, 2, 3, 4, 5, 11, 12, 13, 21].map(yearLabel)).toEqual([
      "1st Year",
      "2nd Year",
      "3rd Year",
      "4th Year",
      "5th Year",
      "11th Year",
      "12th Year",
      "13th Year",
      "21st Year",
    ]);
    expect(yearLabel(null)).toBe("");
  });

  it("joins year and course, leaving out whatever is missing", () => {
    expect(yearCourse(2, "BSBA")).toBe("2nd Year / BSBA");
    expect(yearCourse(null, "BSIT")).toBe("BSIT");
    expect(yearCourse(3, null)).toBe("3rd Year");
    expect(yearCourse(null, null)).toBe("");
  });
});

function row(over: Partial<SheetRow>): SheetRow {
  return {
    id: "x",
    name: "Name",
    gender: "female",
    course: "BSBA",
    yearLevel: 2,
    facilitatorId: null,
    facilitator: null,
    cells: [],
    attended: 0,
    eligible: 0,
    rate: null,
    status: "new",
    atRisk: false,
    missedStreak: 0,
    lastAttended: null,
    ...over,
  };
}

describe("summarize", () => {
  it("averages across everyone's counted sessions, not across students", () => {
    const rows = [
      row({ attended: 6, eligible: 6, status: "consistent" }),
      row({ attended: 0, eligible: 2, status: "rare", atRisk: false }),
      row({ attended: 1, eligible: 4, status: "occasional", atRisk: true }),
    ];
    expect(summarize(rows, 6)).toEqual({ students: 3, sessions: 6, averageRate: 58, consistent: 1, atRisk: 1 });
  });

  it("has no average when nothing has counted", () => {
    expect(summarize([row({})], 0).averageRate).toBeNull();
    expect(summarize([], 0)).toEqual({ students: 0, sessions: 0, averageRate: null, consistent: 0, atRisk: 0 });
  });
});

describe("sortRows", () => {
  const rows = [
    row({ id: "b", name: "Bea", rate: 50, lastAttended: "2026-10-09" }),
    row({ id: "a", name: "Ana", rate: 90, lastAttended: "2026-10-23" }),
    row({ id: "n", name: "Nina", rate: null, lastAttended: null }),
    row({ id: "c", name: "Cara", rate: 50, lastAttended: "2026-10-16" }),
  ];

  it("sorts by name", () => {
    expect(sortRows(rows, "name").map((r) => r.id)).toEqual(["a", "b", "c", "n"]);
  });

  it("puts the least consistent first, brand-new students last, ties by name", () => {
    expect(sortRows(rows, "rate-asc").map((r) => r.id)).toEqual(["b", "c", "a", "n"]);
  });

  it("puts the most consistent first, brand-new students last", () => {
    expect(sortRows(rows, "rate-desc").map((r) => r.id)).toEqual(["a", "b", "c", "n"]);
  });

  it("puts the most recent attenders first", () => {
    expect(sortRows(rows, "recent").map((r) => r.id)).toEqual(["a", "c", "b", "n"]);
  });

  it("does not change the list it was given", () => {
    const copy = [...rows];
    sortRows(rows, "rate-asc");
    expect(rows).toEqual(copy);
  });
});

describe("toCsv", () => {
  it("writes the sheet's columns, one per session, then the totals", () => {
    const stats = computeStudentStats(sessions.slice(0, 3), "2026-01-01", ["2026-09-18", "2026-10-02"]);
    const csv = toCsv(
      sessions.slice(0, 3),
      [row({ ...stats, name: "Doon, Aisa", yearLevel: 2, course: "BSBA", facilitator: "Joy Cruz" })],
    );
    const [header, line] = csv.split("\r\n");
    expect(header).toBe(
      "Name,Gender,Year Level / Course,Facilitator,2026-09-18,2026-09-25,2026-10-02,Attended,Sessions counted,Rate %,Status,At risk,Last attended",
    );
    expect(line).toBe('"Doon, Aisa",Female,2nd Year / BSBA,Joy Cruz,Attended,Not attended,Attended,2,3,67,Regular,,2026-10-02');
  });

  it("leaves sessions before registration blank and escapes quotes", () => {
    const stats = computeStudentStats(sessions.slice(0, 2), "2026-09-25", ["2026-09-25"]);
    const line = toCsv(sessions.slice(0, 2), [row({ ...stats, name: 'Ann "Annie" Lee' })]).split("\r\n")[1];
    expect(line).toContain('"Ann ""Annie"" Lee"');
    expect(line).toContain(",,Attended,"); // blank for the session before they registered
  });

  it("stops a name that starts with = from running as a spreadsheet formula", () => {
    const line = toCsv([], [row({ name: "=HYPERLINK(1)" })]).split("\r\n")[1];
    expect(line.startsWith("'=HYPERLINK(1)")).toBe(true);
  });
});
