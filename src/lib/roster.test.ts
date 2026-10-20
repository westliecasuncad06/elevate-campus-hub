import { describe, expect, it } from "vitest";
import {
  displayName,
  markFromColour,
  nameKey,
  nameKeyFor,
  normalizeColour,
  parseCsv,
  parseGender,
  parseRosterSheet,
  parseSheetAttendance,
  parseSheetHtml,
  parseYearAndCourse,
  sheetDateToIso,
} from "./roster";

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

describe("normalizeColour", () => {
  it("reads hex and rgb colours", () => {
    expect(normalizeColour("#00FF00")).toBe("#00ff00");
    expect(normalizeColour("#0f0")).toBe("#00ff00");
    expect(normalizeColour(" rgb(255, 0, 0) ")).toBe("#ff0000");
    expect(normalizeColour("white")).toBe("");
    expect(normalizeColour("")).toBe("");
  });
});

describe("markFromColour", () => {
  it("green is present and red is absent", () => {
    expect(markFromColour("#00ff00")).toBe("present");
    expect(markFromColour("#ff0000")).toBe("absent");
    expect(markFromColour("rgb(0,255,0)")).toBe("present");
  });

  it("other colours mean nothing", () => {
    for (const colour of ["#ffffff", "#cccccc", "#ffff00", "#ffe599", "#c9daf8", "#00ffff", "#b6d7a8", ""]) {
      expect(markFromColour(colour)).toBeNull();
    }
  });
});

describe("sheetDateToIso", () => {
  it("reads the sheet's m/d/yy dates", () => {
    expect(sheetDateToIso("9/18/26")).toBe("2026-09-18");
    expect(sheetDateToIso("10/2/26")).toBe("2026-10-02");
    expect(sheetDateToIso("10/16/2026")).toBe("2026-10-16");
  });

  it("rejects anything else", () => {
    expect(sheetDateToIso("Name")).toBeNull();
    expect(sheetDateToIso("2/30/26")).toBeNull();
    expect(sheetDateToIso("")).toBeNull();
  });
});

const HTML = `
<style>.ritz .waffle .s0{background-color:#00ffff;}.ritz .waffle .s9{background-color:#ff0000;}.ritz .waffle .s10{background-color:#00ff00;}
.ritz .waffle .s6{background-color:#cccccc;}.ritz .waffle .s8{background-color:#ffffff;}</style>
<table><tbody>
<tr style="height: 20px"><th class="row-headers-background">1</th><td class="s0" colspan="3">GRC ATTENDANCE</td><td class="s6" colspan="2">DATE</td></tr>
<tr><th>2</th><td>Name</td><td>Gender</td><td>Year Level / Course</td><td class="s6">9/18/26</td><td class="s6">9/25/26</td></tr>
<tr><th>3</th><td class="s8">Abordo, Irish Nicole</td><td class="s8">Female</td><td></td><td class="s9"></td><td class="s10"></td></tr>
<tr><th>4</th><td class="s8">Aisa Doon</td><td class="s8">Female</td><td class="s8">2nd Year / BSBA</td><td class="s10"></td><td></td></tr>
<tr><th>5</th><td class="s8">Bernard Gonzales</td><td>Male</td><td></td><td class="s9"></td><td class="s9"></td></tr>
<tr><th>6</th><td class="s8">Gonzales Bernard</td><td>Male</td><td></td><td class="s10"></td><td></td></tr>
<tr><th>7</th><td class="s8">Madonna</td><td></td><td></td><td class="s10"></td><td class="s10"></td></tr>
</tbody></table>`;

describe("parseSheetHtml", () => {
  const grid = parseSheetHtml(HTML);

  it("reads the cells of each row, repeating merged cells and skipping the row numbers", () => {
    expect(grid).toHaveLength(7);
    expect(grid[0].map((c) => c.text)).toEqual(["GRC ATTENDANCE", "GRC ATTENDANCE", "GRC ATTENDANCE", "DATE", "DATE"]);
    expect(grid[2][0].text).toBe("Abordo, Irish Nicole");
  });

  it("reads each cell's background colour from its class", () => {
    expect(grid[2][3].bg).toBe("#ff0000");
    expect(grid[2][4].bg).toBe("#00ff00");
    expect(grid[3][4].bg).toBe("");
  });
});

describe("parseSheetAttendance", () => {
  const result = parseSheetAttendance(HTML);

  it("finds the date columns", () => {
    expect(result.dates).toEqual(["2026-09-18", "2026-09-25"]);
  });

  it("reads green as present and red as absent, per person", () => {
    const abordo = result.people.find((p) => p.name === "Irish Nicole Abordo");
    expect(abordo?.marks).toEqual({ "2026-09-18": "absent", "2026-09-25": "present" });
    const aisa = result.people.find((p) => p.name === "Aisa Doon");
    expect(aisa?.marks).toEqual({ "2026-09-18": "present" });
  });

  it("merges a name written twice, and green wins", () => {
    const bernard = result.people.filter((p) => p.nameKey === nameKey("Bernard Gonzales"));
    expect(bernard).toHaveLength(1);
    expect(bernard[0].marks).toEqual({ "2026-09-18": "present", "2026-09-25": "absent" });
  });

  it("ignores a one-word name, and a sheet with no header", () => {
    expect(result.people.some((p) => p.name === "Madonna")).toBe(false);
    expect(parseSheetAttendance("<table><tr><td>x</td></tr></table>")).toEqual({ dates: [], people: [] });
  });
});
