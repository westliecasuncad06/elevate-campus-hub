import { describe, expect, it } from "vitest";
import { tooManyMessage } from "./wait-message";

describe("tooManyMessage", () => {
  it("counts seconds under a minute", () => {
    expect(tooManyMessage(45)).toBe("Too many incorrect attempts. Please wait 45 seconds and try again.");
    expect(tooManyMessage(1)).toBe("Too many incorrect attempts. Please wait 1 second and try again.");
    expect(tooManyMessage(0)).toMatch(/1 second /);
    expect(tooManyMessage(59.2)).toMatch(/60 seconds|a minute/);
  });

  it("switches to minutes from a minute up", () => {
    expect(tooManyMessage(60)).toMatch(/a minute/);
    expect(tooManyMessage(61)).toMatch(/2 minutes/);
    expect(tooManyMessage(900)).toMatch(/15 minutes/);
  });
});
