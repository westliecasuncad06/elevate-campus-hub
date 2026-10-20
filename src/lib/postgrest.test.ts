import { describe, expect, it } from "vitest";
import { isUuid, searchTerm } from "./postgrest";

describe("searchTerm", () => {
  it("keeps ordinary names, emails and numbers", () => {
    expect(searchTerm("Maria Santos")).toBe("Maria Santos");
    expect(searchTerm("juan.delacruz+church@gmail.com")).toBe("juan.delacruz+church@gmail.com");
    expect(searchTerm("09171234567")).toBe("09171234567");
    expect(searchTerm("O'Brien-Reyes")).toBe("O'Brien-Reyes");
    expect(searchTerm("Peña")).toBe("Peña");
  });

  it("removes the characters that are filter syntax", () => {
    expect(searchTerm("a,b")).toBe("a b");
    expect(searchTerm("x),email.neq.null,(y")).toBe("x email.neq.null y");
    expect(searchTerm('he said "hi"')).toBe("he said hi");
    expect(searchTerm("100%*_\\")).toBe("100");
  });

  it("is harmless against SQL-looking input (queries never contain it as text anyway)", () => {
    expect(searchTerm("'; DROP TABLE profiles; --")).toBe("' DROP TABLE profiles --");
    expect(searchTerm("1 OR 1=1")).toBe("1 OR 1 1");
    expect(searchTerm("<script>alert(1)</script>")).toBe("script alert 1 script");
  });

  it("limits the length and copes with non-text", () => {
    expect(searchTerm("a".repeat(500))).toHaveLength(60);
    expect(searchTerm(undefined)).toBe("");
    expect(searchTerm(42)).toBe("");
    expect(searchTerm("   ")).toBe("");
  });
});

describe("isUuid", () => {
  it("accepts a UUID and nothing else", () => {
    expect(isUuid("3f2b8f0e-9c1a-4d5e-8a7b-1c2d3e4f5a6b")).toBe(true);
    expect(isUuid("3F2B8F0E-9C1A-4D5E-8A7B-1C2D3E4F5A6B")).toBe(true);
    expect(isUuid("3f2b8f0e-9c1a-4d5e-8a7b-1c2d3e4f5a6b,id.neq.0")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});
