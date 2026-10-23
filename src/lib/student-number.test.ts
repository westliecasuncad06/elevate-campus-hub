import { describe, expect, it } from "vitest";
import { formatStudentNumberInput, parseStudentNumber } from "./student-number";

describe("formatStudentNumberInput", () => {
  it("adds the dashes as digits are typed", () => {
    expect(formatStudentNumberInput("2017")).toBe("2017");
    expect(formatStudentNumberInput("20170")).toBe("2017-0");
    expect(formatStudentNumberInput("201705")).toBe("2017-05");
    expect(formatStudentNumberInput("2017050")).toBe("2017-05-0");
    expect(formatStudentNumberInput("20170507107")).toBe("2017-05-07107");
  });

  it("ignores letters and extra digits", () => {
    expect(formatStudentNumberInput("2017-05-07107999")).toBe("2017-05-07107");
    expect(formatStudentNumberInput("20a17 05")).toBe("2017-05");
  });

  it("lets the dash be deleted back to digits", () => {
    expect(formatStudentNumberInput("2017-")).toBe("2017");
  });
});

describe("parseStudentNumber", () => {
  it("accepts a full number typed any way", () => {
    expect(parseStudentNumber("2017-05-07107")).toBe("2017-05-07107");
    expect(parseStudentNumber("20170507107")).toBe("2017-05-07107");
    expect(parseStudentNumber(" 2017 05 07107 ")).toBe("2017-05-07107");
  });

  it("rejects a partial or oversized number", () => {
    expect(parseStudentNumber("2017-05-0710")).toBeNull();
    expect(parseStudentNumber("2017-05-071077")).toBeNull();
    expect(parseStudentNumber("")).toBeNull();
  });
});
