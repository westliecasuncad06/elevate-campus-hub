import { describe, expect, it } from "vitest";
import { emailFromLink, parseRegistrationCode, placeholderName } from "./registration";

describe("placeholderName", () => {
  it("uses the part of the email before the @", () => {
    expect(placeholderName("juan.delacruz@school.edu.ph")).toBe("juan.delacruz");
  });

  it("copes with odd input", () => {
    expect(placeholderName("@x.com")).toBe("New user");
    expect(placeholderName("a".repeat(120) + "@x.com")).toHaveLength(80);
  });
});

describe("parseRegistrationCode", () => {
  it("accepts a 6-digit code, with or without spaces or a dash", () => {
    expect(parseRegistrationCode("123456")).toBe("123456");
    expect(parseRegistrationCode(" 123 456 ")).toBe("123456");
    expect(parseRegistrationCode("123-456")).toBe("123456");
    expect(parseRegistrationCode("012345")).toBe("012345"); // a leading zero is part of the code
  });

  it("also accepts the longer codes Supabase can be set to (up to 10 digits)", () => {
    expect(parseRegistrationCode("23760982")).toBe("23760982");
    expect(parseRegistrationCode("1234 5678 90")).toBe("1234567890");
  });

  it("rejects anything that can't be a code", () => {
    expect(parseRegistrationCode("12345")).toBeNull();
    expect(parseRegistrationCode("12345678901")).toBeNull();
    expect(parseRegistrationCode("12345a")).toBeNull();
    expect(parseRegistrationCode("")).toBeNull();
  });
});

describe("emailFromLink", () => {
  it("puts back a + that a link turned into a space", () => {
    expect(emailFromLink("me sch@gmail.com")).toBe("me+sch@gmail.com");
    expect(emailFromLink("me+sch@gmail.com")).toBe("me+sch@gmail.com");
  });

  it("is empty when there is nothing", () => {
    expect(emailFromLink(undefined)).toBe("");
  });
});
