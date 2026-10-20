import { describe, expect, it } from "vitest";
import { googleCallbackError, googleEnabledFromSettings, signedInWithGoogle } from "./google-login";
import { safeNext } from "./redirects";

describe("googleEnabledFromSettings", () => {
  it("is true only when Supabase says the Google provider is on", () => {
    expect(googleEnabledFromSettings({ external: { google: true, email: true } })).toBe(true);
    expect(googleEnabledFromSettings({ external: { google: false, email: true } })).toBe(false);
  });

  it("is false for anything unexpected", () => {
    expect(googleEnabledFromSettings(null)).toBe(false);
    expect(googleEnabledFromSettings({})).toBe(false);
    expect(googleEnabledFromSettings({ external: { google: "true" } })).toBe(false);
  });
});

describe("signedInWithGoogle", () => {
  it("recognises an oauth sign-in in the token's authentication methods", () => {
    expect(signedInWithGoogle({ amr: [{ method: "oauth", timestamp: 1 }] })).toBe(true);
    expect(signedInWithGoogle({ amr: [{ method: "password", timestamp: 1 }, { method: "oauth", timestamp: 2 }] })).toBe(true);
  });

  it("is false for password, email-link and missing data", () => {
    expect(signedInWithGoogle({ amr: [{ method: "password", timestamp: 1 }] })).toBe(false);
    expect(signedInWithGoogle({ amr: [{ method: "otp", timestamp: 1 }] })).toBe(false);
    expect(signedInWithGoogle({})).toBe(false);
    expect(signedInWithGoogle(undefined)).toBe(false);
    expect(signedInWithGoogle({ amr: "oauth" })).toBe(false);
  });
});

describe("googleCallbackError", () => {
  it("has no error when Supabase sent a code", () => {
    expect(googleCallbackError(new URLSearchParams("code=abc&next=%2Fstudent"))).toBeNull();
  });

  it("turns away a Google account nobody invited", () => {
    const fromCode = new URLSearchParams("error=server_error&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+provider");
    expect(googleCallbackError(fromCode)).toBe("google_not_invited");
    const fromText = new URLSearchParams("error=server_error&error_description=Signups%20not%20allowed%20for%20this%20provider");
    expect(googleCallbackError(fromText)).toBe("google_not_invited");
  });

  it("treats a cancelled or failed sign-in as 'try again'", () => {
    expect(googleCallbackError(new URLSearchParams("error=access_denied&error_description=User+cancelled"))).toBe("google_failed");
    expect(googleCallbackError(new URLSearchParams("error=server_error&error_code=unexpected_failure"))).toBe("google_failed");
  });
});

describe("safeNext", () => {
  it("keeps same-site paths, including their query string", () => {
    expect(safeNext("/student")).toBe("/student");
    expect(safeNext("/campus-head/reports?date=2026-05-01")).toBe("/campus-head/reports?date=2026-05-01");
  });

  it("refuses anything that could leave the site", () => {
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("/\\evil.example")).toBeNull();
    expect(safeNext("https://evil.example")).toBeNull();
    expect(safeNext("javascript:alert(1)")).toBeNull();
    expect(safeNext("")).toBeNull();
    expect(safeNext(null)).toBeNull();
    expect(safeNext(42)).toBeNull();
  });
});
