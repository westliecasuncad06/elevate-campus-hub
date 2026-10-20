import { describe, expect, it } from "vitest";
import { extractGoogleDocId } from "./google";

describe("extractGoogleDocId", () => {
  it("reads the id from a normal edit link", () => {
    expect(extractGoogleDocId("https://docs.google.com/document/d/1AbC-dEf_123/edit")).toBe("1AbC-dEf_123");
  });

  it("works with query strings and tabs", () => {
    expect(extractGoogleDocId("https://docs.google.com/document/d/1AbC-dEf_123/edit?tab=t.0#heading=h.x")).toBe("1AbC-dEf_123");
  });

  it("returns null when there is no id", () => {
    expect(extractGoogleDocId("https://example.com/page")).toBeNull();
    expect(extractGoogleDocId("")).toBeNull();
  });
});
