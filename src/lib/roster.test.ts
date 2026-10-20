import { describe, expect, it } from "vitest";
import { displayName, nameKey, nameKeyFor, parseCsv, parseGender, parseRosterSheet, parseYearAndCourse } from "./roster";

describe("nameKey", () => {
  it("is the same however the name is written", () => {
    const key = nameKey("Irish Nicole Abordo");
    expect(nameKey("Abordo, Irish Nicole")).toBe(key);
    expect(nameKey("ABORDO, IRISH NICOLE")).toBe(key);
    expect(nameKey("  abordo   irish nicole ")).toBe(key);
    expect(nameKeyFor("Irish Nicole", "Abordo")).toBe(key);
  });

  it("ignores middle initials, suffixes, punctuation and accents", () => {
    expect(nameKey("Gonzales , Ralph Lorenz A.")).toBe(nameKeyFor("Ralph Lorenz", "Gonzales"));
    expect(nameKey("Habbugar, Khent Bernard Jr.")).toBe(nameKeyFor("Khent Bernard", "Habbugar"));
    expect(nameKey("Peña, José")).toBe(nameKeyFor("Jose", "Pena"));
  });

  it("keeps different people apart", () => {
    expect(nameKey("Jemanel Montoya")).not.toBe(nameKey("Jamanel Montoya"));
    expect(nameKey("Justine Dela Cruz")).not.toBe(nameKey("Dela Cruz, Justin"));
    expect(nameKey("Ralph Gonzales")).not.toBe(nameKey("Ralph Lorenz Gonzales"));
  });

  it("is empty for a name with no usable words", () => {
    expect(nameKey("A.")).toBe("");
    expect(nameKey("")).toBe("");
  });
});

describe("displayName", () => {
  it("puts 'Last, First' in the usual order", () => {
    expect(displayName("Abordo, Irish Nicole")).toBe("Irish Nicole Abordo");
    expect(displayName("Calderon, Maria  Daniela D.")).toBe("Maria Daniela D. Calderon");
  });

  it("leaves other names as they are, and tidies capitals", () => {
    expect(displayName("Aisa Doon")).toBe("Aisa Doon");
    expect(displayName("Castillo Eunice ")).toBe("Castillo Eunice");
    expect(displayName("ABORDO, IRISH")).toBe("Irish Abordo");
  });
});

describe("parseGender", () => {
  it("reads the sheet's spellings", () => {
    expect(parseGender("Female")).toBe("female");
    expect(parseGender("Female ")).toBe("female");
    expect(parseGender("female")).toBe("female");
    expect(parseGender("Male ")).toBe("male");
    expect(parseGender("")).toBeNull();
    expect(parseGender("?")).toBeNull();
  });
});

describe("parseYearAndCourse", () => {
  it("splits the sheet's 'Year / Course' cell", () => {
    expect(parseYearAndCourse("2nd Year / BSBA")).toEqual({ yearLevel: 2, course: "BSBA" });
    expect(parseYearAndCourse("1st Year /  BSIT ")).toEqual({ yearLevel: 1, course: "BSIT" });
    expect(parseYearAndCourse("3rd Year / BSBA ")).toEqual({ yearLevel: 3, course: "BSBA" });
    expect(parseYearAndCourse("4th Year / BSED")).toEqual({ yearLevel: 4, course: "BSED" });
  });

  it("copes with a missing part", () => {
    expect(parseYearAndCourse("")).toEqual({ yearLevel: null, course: null });
    expect(parseYearAndCourse("2nd Year")).toEqual({ yearLevel: 2, course: null });
    expect(parseYearAndCourse("/ BSIT")).toEqual({ yearLevel: null, course: "BSIT" });
  });
});

describe("parseCsv", () => {
  it("handles quoted commas, doubled quotes and CRLF", () => {
    expect(parseCsv('a,"b, c",d\r\n"x ""y""",,z\n')).toEqual([
      ["a", "b, c", "d"],
      ['x "y"', "", "z"],
    ]);
  });

  it("keeps a last row without a line break", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

const SHEET = [
  "GRC ELEVATE HUB ATTENDANCE,,,DATE,,,",
  "Name,Gender,Year Level / Course,9/18/26,9/25/26,10/2/26,",
  '"Abordo, Irish Nicole",Female,,,,,',
  "Aisa Doon,Female,2nd Year / BSBA,,,,",
  "Bernard Gonzales,Male,1st Year / BSIT,,,,",
  "Gonzales Bernard,Male,1st Year / BSED,,,,",
  "Ehrell Dane Alfonso,Male,1st Year / BSBA,,,,",
  "Dane Ehrell Alfonso,male,,,,,",
  "Madonna,Female,,,,,",
  ",,,,,,",
].join("\n");

describe("parseRosterSheet", () => {
  const result = parseRosterSheet(SHEET);

  it("reads the names below the header, skipping the title row and blank rows", () => {
    expect(result.rows.map((r) => r.fullName)).toEqual(["Irish Nicole Abordo", "Aisa Doon", "Bernard Gonzales", "Ehrell Dane Alfonso"]);
  });

  it("reads gender, year and course", () => {
    expect(result.rows[1]).toMatchObject({ gender: "female", yearLevel: 2, course: "BSBA" });
    expect(result.rows[0]).toMatchObject({ gender: "female", yearLevel: null, course: null });
  });

  it("keeps one entry for the same name written twice, and says so", () => {
    expect(result.duplicates).toEqual([
      { kept: "Bernard Gonzales", dropped: "Gonzales Bernard" },
      { kept: "Ehrell Dane Alfonso", dropped: "Dane Ehrell Alfonso" },
    ]);
    // The kept row's own values win; the second row only fills in what was blank.
    expect(result.rows[2]).toMatchObject({ yearLevel: 1, course: "BSIT" });
  });

  it("skips a one-word name and reports it", () => {
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/Madonna/);
  });

  it("reports a sheet without a Name column", () => {
    const bad = parseRosterSheet("Student,Sex\nAna Cruz,F");
    expect(bad.rows).toEqual([]);
    expect(bad.skipped[0].reason).toMatch(/Name/);
  });
});
