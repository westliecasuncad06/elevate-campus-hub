import { describe, expect, it } from "vitest";
import { looksLikeEmail, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("leaves a local 11-digit number alone", () => {
    expect(normalizePhone("09171234567")).toBe("09171234567");
  });

  it("converts +63 and 63 prefixes", () => {
    expect(normalizePhone("+63 917 123 4567")).toBe("09171234567");
    expect(normalizePhone("63917-123-4567")).toBe("09171234567");
  });

  it("adds the leading zero to a 10-digit mobile number", () => {
    expect(normalizePhone("9171234567")).toBe("09171234567");
  });

  it("strips spaces and punctuation from other numbers", () => {
    expect(normalizePhone("(02) 8123-4567")).toBe("0281234567");
  });
});

describe("looksLikeEmail", () => {
  it("accepts normal addresses", () => {
    expect(looksLikeEmail("juan@school.edu.ph")).toBe(true);
    expect(looksLikeEmail("  juan@school.edu.ph ")).toBe(true);
  });

  it("rejects phone numbers and half-typed addresses", () => {
    expect(looksLikeEmail("09171234567")).toBe(false);
    expect(looksLikeEmail("juan@")).toBe(false);
    expect(looksLikeEmail("juan@school")).toBe(false);
  });
});
