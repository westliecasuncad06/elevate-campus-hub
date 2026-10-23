import { describe, expect, it } from "vitest";
import {
  CODE_LENGTH,
  codeMatches,
  generateCode,
  hashCode,
  hashToken,
  isWithinHours,
  maskEmail,
  newTrustToken,
  parseCodeInput,
  sessionIdFromToken,
} from "./email-code-core";
import { loginCodeEmail, parseSender } from "./email-templates";

describe("generateCode", () => {
  it("is always 6 digits, leading zeros included", () => {
    for (let i = 0; i < 300; i++) expect(generateCode()).toMatch(/^\d{6}$/);
    expect(CODE_LENGTH).toBe(6);
  });

  it("is not the same every time", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateCode()));
    expect(seen.size).toBeGreaterThan(40);
  });
});

describe("hashCode / codeMatches", () => {
  const secret = "test-secret";
  const hash = hashCode(secret, "user-1", "123456");

  it("accepts the right code and rejects every other", () => {
    expect(codeMatches(secret, "user-1", "123456", hash)).toBe(true);
    expect(codeMatches(secret, "user-1", "123457", hash)).toBe(false);
    expect(codeMatches(secret, "user-1", "000000", hash)).toBe(false);
  });

  it("ties a code to its person and to the secret", () => {
    expect(codeMatches(secret, "user-2", "123456", hash)).toBe(false);
    expect(codeMatches("other-secret", "user-1", "123456", hash)).toBe(false);
  });

  it("never stores the code itself and survives a garbled stored value", () => {
    expect(hash).not.toContain("123456");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(codeMatches(secret, "user-1", "123456", "zz")).toBe(false);
    expect(codeMatches(secret, "user-1", "123456", "")).toBe(false);
  });
});

describe("parseCodeInput", () => {
  it("takes 6 digits, with or without spaces and dashes", () => {
    expect(parseCodeInput("123456")).toBe("123456");
    expect(parseCodeInput(" 123 456 ")).toBe("123456");
    expect(parseCodeInput("123-456")).toBe("123456");
    expect(parseCodeInput("004217")).toBe("004217");
  });

  it("refuses anything else", () => {
    expect(parseCodeInput("12345")).toBeNull();
    expect(parseCodeInput("1234567")).toBeNull();
    expect(parseCodeInput("12345a")).toBeNull();
    expect(parseCodeInput("")).toBeNull();
    expect(parseCodeInput(undefined)).toBeNull();
    expect(parseCodeInput(123456)).toBeNull();
  });
});

describe("maskEmail", () => {
  it("shows just enough to recognise the address", () => {
    expect(maskEmail("juandelacruz@gmail.com")).toBe("ju*********@gmail.com");
    expect(maskEmail("ana@school.edu.ph")).toBe("a***@school.edu.ph");
    expect(maskEmail("westragma@gmail.com")).toBe("we*******@gmail.com");
  });

  it("copes with odd input", () => {
    expect(maskEmail("nonsense")).toBe("your email");
    expect(maskEmail("@x.com")).toBe("your email");
  });
});

describe("trust tokens", () => {
  it("are long, random and hashed with a secret", () => {
    const a = newTrustToken();
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(newTrustToken()).not.toBe(a);
    expect(hashToken("s", a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("s", a)).not.toBe(hashToken("t", a));
  });
});

describe("isWithinHours", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  it("is true inside the window and false outside it", () => {
    expect(isWithinHours("2026-10-20T08:00:00Z", 5, now)).toBe(true);
    expect(isWithinHours("2026-10-20T07:01:00Z", 5, now)).toBe(true);
    expect(isWithinHours("2026-10-20T06:59:00Z", 5, now)).toBe(false);
    expect(isWithinHours("2026-10-13T12:00:00Z", 5, now)).toBe(false);
  });

  it("refuses a time in the future and garbage", () => {
    expect(isWithinHours("2026-10-21T12:00:00Z", 5, now)).toBe(false);
    expect(isWithinHours("not a date", 5, now)).toBe(false);
  });
});

describe("sessionIdFromToken", () => {
  const token = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;
  it("reads the session id", () => {
    expect(sessionIdFromToken(token({ session_id: "3f2b8f0e-9c1a-4d5e-8a7b-1c2d3e4f5a6b" }))).toBe("3f2b8f0e-9c1a-4d5e-8a7b-1c2d3e4f5a6b");
  });
  it("returns null for anything unusable", () => {
    expect(sessionIdFromToken(token({}))).toBeNull();
    expect(sessionIdFromToken(token({ session_id: "nope" }))).toBeNull();
    expect(sessionIdFromToken("garbage")).toBeNull();
    expect(sessionIdFromToken(undefined)).toBeNull();
  });
});

describe("loginCodeEmail", () => {
  const email = loginCodeEmail({ code: "004217", minutes: 10, firstName: "Ana" });

  it("carries the code, the time limit and a greeting", () => {
    expect(email.subject).toContain("004217");
    expect(email.html).toContain("004217");
    expect(email.html).toContain("10 minutes");
    expect(email.html).toContain("Hi Ana,");
    expect(email.text).toContain("Your sign-in code: 004217");
  });

  it("has no images and no scripts", () => {
    expect(email.html).not.toMatch(/<img|<script/i);
  });

  it("escapes a name so it can't inject markup", () => {
    const evil = loginCodeEmail({ code: "111111", minutes: 10, firstName: "<b>x</b>" });
    expect(evil.html).not.toContain("<b>x</b>");
    expect(evil.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("has a test version for the Super Admin", () => {
    const test = loginCodeEmail({ code: "222222", minutes: 10, purpose: "test" });
    expect(test.subject).toMatch(/Test code/);
    expect(test.html).toMatch(/test of the emailed sign-in code/);
  });
});

describe("parseSender", () => {
  it("splits 'Name <address>' and a bare address", () => {
    expect(parseSender("Elevate Campus Hub <me@gmail.com>")).toEqual({ name: "Elevate Campus Hub", email: "me@gmail.com" });
    expect(parseSender('"Elevate, Hub" <me@gmail.com>')).toEqual({ name: "Elevate, Hub", email: "me@gmail.com" });
    expect(parseSender("me@gmail.com")).toEqual({ name: "Elevate Campus Hub", email: "me@gmail.com" });
  });
});
