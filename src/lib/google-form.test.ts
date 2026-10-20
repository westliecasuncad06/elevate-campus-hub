import { describe, expect, it } from "vitest";
import {
  buildFormBody,
  extractFormId,
  formAddresses,
  isConfirmation,
  mapFormFields,
  normalizeFormUrl,
  parseFormFields,
  parseFormTitle,
  type FormValues,
} from "./google-form";

// Same shape as the real "Elevate Engagement Report" form's embedded data (ids are from that form).
const items = [
  [1895299590, "Date", null, 9, [[1218440222, null, 1, null, null, null, null, [0, 1]]]],
  [290149101, "School/Location", null, 0, [[1423232273, null, 0]]],
  [1359001949, "No. of Individuals Engaged/Attendees\n", null, 0, [[33360207, null, 0]]],
  [569417152, "No. of Individuals who Heard the Gospel", null, 0, [[1414176622, null, 0]]],
  [959367985, "No. of Individuals who Accepted Jesus", null, 0, [[609327138, null, 0]]],
  [430050462, "No. of Individuals who are Willing to Join a Dgroup", null, 0, [[1222498924, null, 0]]],
  [1725297844, "No. of Volunteers", null, 0, [[1877585668, null, 0]]],
  [111, "A section heading", null, 8],
];
// Index 1 holds the questions; index 3 is the form's title (as in the real page).
const html = `<html><head><title>Elevate Engagement Report - Google Forms</title></head><script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify([null, ["Hello", items], "/forms", "Elevate Engagement Report"])};</script></html>`;

const values: FormValues = {
  date: "2026-10-23",
  location: "Global Reciprocal Colleges",
  attendees: 12,
  heard: 9,
  accepted: 3,
  dgroup: 4,
  volunteers: 5,
};

describe("extractFormId / formAddresses", () => {
  it("reads the id from a published form link, with or without extras", () => {
    const url = "https://docs.google.com/forms/d/e/1FAIpQLSdFavVf16RNMbL2pOXLQEXfGlkls-G5X3u3njI9LsToL_mcHQ/viewform?usp=dialog";
    expect(extractFormId(url)).toBe("1FAIpQLSdFavVf16RNMbL2pOXLQEXfGlkls-G5X3u3njI9LsToL_mcHQ");
    expect(formAddresses(url)?.response).toBe(
      "https://docs.google.com/forms/d/e/1FAIpQLSdFavVf16RNMbL2pOXLQEXfGlkls-G5X3u3njI9LsToL_mcHQ/formResponse",
    );
  });

  it("rejects anything that isn't a published form link", () => {
    expect(extractFormId("https://example.com/forms")).toBeNull();
    expect(extractFormId("https://docs.google.com/document/d/abc/edit")).toBeNull();
    expect(formAddresses("")).toBeNull();
  });
});

describe("normalizeFormUrl", () => {
  it("turns any pasted form link into the one address we store", () => {
    const id = "1FAIpQLSdFavVf16RNMbL2pOXLQEXfGlkls-G5X3u3njI9LsToL_mcHQ";
    const canonical = `https://docs.google.com/forms/d/e/${id}/viewform`;
    expect(normalizeFormUrl(`https://docs.google.com/forms/d/e/${id}/viewform?usp=dialog`)).toBe(canonical);
    expect(normalizeFormUrl(`https://docs.google.com/forms/d/e/${id}/formResponse`)).toBe(canonical);
    expect(normalizeFormUrl(canonical)).toBe(canonical);
  });

  it("returns null for anything that isn't a published form link", () => {
    expect(normalizeFormUrl("https://docs.google.com/forms/d/abc/edit")).toBeNull(); // an editor link has no response address
    expect(normalizeFormUrl("https://example.com/not-a-form")).toBeNull();
    expect(normalizeFormUrl("")).toBeNull();
  });
});

describe("parseFormTitle", () => {
  it("reads the title from the form's data", () => {
    expect(parseFormTitle(html)).toBe("Elevate Engagement Report");
  });

  it("falls back to the page title, without the Google Forms suffix", () => {
    expect(parseFormTitle("<title>Weekly check-in - Google Forms</title>")).toBe("Weekly check-in");
  });

  it("is null when the page says nothing", () => {
    expect(parseFormTitle("<html></html>")).toBeNull();
  });
});

describe("parseFormFields", () => {
  it("reads every question's entry id, type and whether it is required", () => {
    const fields = parseFormFields(html);
    expect(fields).toHaveLength(7); // the section heading has no answer box
    expect(fields[0]).toMatchObject({ title: "Date", type: 9, entryId: "1218440222", required: true });
    expect(fields[1]).toMatchObject({ title: "School/Location", entryId: "1423232273", required: false });
  });

  it("returns nothing for a page without form data", () => {
    expect(parseFormFields("<html>sign in</html>")).toEqual([]);
    expect(parseFormFields("<script>var FB_PUBLIC_LOAD_DATA_ = [oops];</script>")).toEqual([]);
  });
});

describe("mapFormFields", () => {
  it("matches the seven questions to ours by their wording", () => {
    const { map, missing } = mapFormFields(parseFormFields(html));
    expect(missing).toEqual([]);
    expect(map.date?.entryId).toBe("1218440222");
    expect(map.location?.entryId).toBe("1423232273");
    expect(map.attendees?.entryId).toBe("33360207");
    expect(map.heard?.entryId).toBe("1414176622");
    expect(map.accepted?.entryId).toBe("609327138");
    expect(map.dgroup?.entryId).toBe("1222498924");
    expect(map.volunteers?.entryId).toBe("1877585668");
  });

  it("flags a required question we can't fill", () => {
    const extra = [...items, [222, "Facilitator's favourite colour", null, 0, [[999, null, 1]]]];
    const page = `<script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify([null, ["x", extra]])};</script>`;
    expect(mapFormFields(parseFormFields(page)).missing).toEqual(["Facilitator's favourite colour"]);
  });

  it("does not mistake the 'heard the Gospel' question for the attendees one", () => {
    const { map } = mapFormFields(parseFormFields(html));
    expect(map.heard?.title).toContain("Heard");
    expect(map.attendees?.title).toContain("Engaged/Attendees");
  });
});

describe("isConfirmation", () => {
  // What Google really returns (observed): a thin page after a recorded answer, the full form again after a refused one.
  const thin = `<html><title>Elevate Engagement Report</title><script>var FB_PUBLIC_LOAD_DATA_ = [null,[],"/forms","Elevate Engagement Report",null,0,1];</script></html>`;
  const formAgain = `${html}<input type="hidden" name="fbzx" value="123">`;

  it("accepts the thin confirmation page", () => {
    expect(isConfirmation(200, thin)).toBe(true);
  });

  it("accepts the confirmation text when Google does include it", () => {
    expect(isConfirmation(200, "<div>Your response has been recorded.</div>")).toBe(true);
  });

  it("rejects a refused answer: HTTP 400 with the form served again", () => {
    expect(isConfirmation(400, formAgain)).toBe(false);
    expect(isConfirmation(200, formAgain)).toBe(false);
  });

  it("rejects error statuses even when the body looks thin", () => {
    expect(isConfirmation(500, thin)).toBe(false);
    expect(isConfirmation(403, "<html>forbidden</html>")).toBe(false);
  });
});

describe("buildFormBody", () => {
  it("posts the date as year/month/day parts and the counts as plain answers", () => {
    const { map } = mapFormFields(parseFormFields(html));
    const body = buildFormBody(map, values, "token123");
    expect(body.get("entry.1218440222_year")).toBe("2026");
    expect(body.get("entry.1218440222_month")).toBe("10");
    expect(body.get("entry.1218440222_day")).toBe("23");
    expect(body.get("entry.1423232273")).toBe("Global Reciprocal Colleges");
    expect(body.get("entry.33360207")).toBe("12");
    expect(body.get("entry.1414176622")).toBe("9");
    expect(body.get("entry.609327138")).toBe("3");
    expect(body.get("entry.1222498924")).toBe("4");
    expect(body.get("entry.1877585668")).toBe("5");
    expect(body.get("fbzx")).toBe("token123");
  });
});
