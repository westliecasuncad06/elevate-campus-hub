import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "./password";

describe("validateNewPassword", () => {
  it("accepts a normal strong password", () => {
    expect(validateNewPassword("Tamad-na-Pusa-2026!")).toBeNull();
    expect(validateNewPassword("kape at pandesal sa umaga")).toBeNull();
  });

  it("needs at least 10 characters", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
    expect(validateNewPassword("Abcd123!x")).toMatch(/at least 10/);
    expect(validateNewPassword("Abcd123!xy")).toBeNull();
  });

  it("refuses the passwords everybody tries first, however they are dressed up", () => {
    expect(validateNewPassword("password123")).toMatch(/common/);
    expect(validateNewPassword("PASSWORD-123")).toMatch(/common/);
    expect(validateNewPassword("qwerty1234")).toMatch(/common/);
    expect(validateNewPassword("iloveyou123")).toMatch(/common/);
    expect(validateNewPassword("Elevate Campus Hub")).toMatch(/common/);
  });

  it("refuses repeats and runs", () => {
    expect(validateNewPassword("aaaaaaaaaaaa")).toMatch(/easy to guess/);
    expect(validateNewPassword("1111111111")).toMatch(/easy to guess/);
    expect(validateNewPassword("12345678901")).toMatch(/easy to guess|common/);
    expect(validateNewPassword("abcdefghijk")).toMatch(/easy to guess/);
    expect(validateNewPassword("9876543210")).toMatch(/common|easy to guess/);
  });

  it("refuses a password that contains the email name", () => {
    expect(validateNewPassword("juandelacruz2026!", "juandelacruz@gmail.com")).toMatch(/email/);
    expect(validateNewPassword("JUAN.DELA.CRUZ#9", "juan.dela.cruz@gmail.com")).toMatch(/email/);
    // A short local part (under 4 letters) isn't worth checking.
    expect(validateNewPassword("ana-Rose-Maple-77", "ana@gmail.com")).toBeNull();
    expect(validateNewPassword("Maple-Rose-Tulip-77", "juandelacruz@gmail.com")).toBeNull();
  });

  it("has an upper limit so a giant string can't be used to slow the server down", () => {
    expect(validateNewPassword("a1B!".repeat(40))).toMatch(/at most/);
  });
});
