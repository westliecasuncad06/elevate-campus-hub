import { describe, expect, it } from "vitest";
import { courseLabel, usesProgramList } from "./course";

describe("courseLabel", () => {
  it("uses the program code when the student picked a program", () => {
    expect(courseLabel({ program: { code: "BSIT" }, course: null })).toBe("BSIT");
  });

  it("uses the typed course at a campus without a program list", () => {
    expect(courseLabel({ program: null, course: "BS Nursing" })).toBe("BS Nursing");
    expect(courseLabel({ course: "  BS Nursing  " })).toBe("BS Nursing");
  });

  it("prefers the program if both somehow exist", () => {
    expect(courseLabel({ program: { code: "BSED" }, course: "Education" })).toBe("BSED");
  });

  it("is null when there is nothing, including a blank course", () => {
    expect(courseLabel({})).toBeNull();
    expect(courseLabel({ program: null, course: "   " })).toBeNull();
  });
});

describe("usesProgramList", () => {
  it("is true only for a campus that has programs", () => {
    expect(usesProgramList([{ id: "a" }])).toBe(true);
    expect(usesProgramList([])).toBe(false);
  });
});
