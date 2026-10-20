import { describe, expect, it } from "vitest";
import { creatableRoles, parseAccountForm } from "./validation";

function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

const student = {
  first_name: "Maria",
  last_name: "Santos",
  email: "Maria@Example.com",
  phone: "+63 917 123 4567",
  gender: "female",
  birthday: "2006-05-01",
  program_id: "11111111-1111-1111-1111-111111111111",
  year_level: "2",
  privacy_consent: "on",
};

describe("parseAccountForm (student)", () => {
  it("normalizes email and phone", () => {
    const result = parseAccountForm("student", form(student), "2026-03-11");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe("maria@example.com");
      expect(result.value.phone).toBe("09171234567");
      expect(result.value.yearLevel).toBe(2);
    }
  });

  it("requires a phone number, gender, program and year level", () => {
    expect(parseAccountForm("student", form({ ...student, phone: "" }), "2026-03-11").ok).toBe(false);
    expect(parseAccountForm("student", form({ ...student, gender: "" }), "2026-03-11").ok).toBe(false);
    expect(parseAccountForm("student", form({ ...student, program_id: "" }), "2026-03-11").ok).toBe(false);
    expect(parseAccountForm("student", form({ ...student, year_level: "" }), "2026-03-11").ok).toBe(false);
  });

  it("rejects a birthday in the future", () => {
    expect(parseAccountForm("student", form({ ...student, birthday: "2030-01-01" }), "2026-03-11").ok).toBe(false);
  });

  it("rejects a bad email", () => {
    expect(parseAccountForm("student", form({ ...student, email: "maria@" }), "2026-03-11").ok).toBe(false);
  });
});

describe("data privacy consent", () => {
  it("refuses to register anyone without the consent box ticked", () => {
    const data = form(student);
    data.delete("privacy_consent");
    const result = parseAccountForm("student", data, "2026-03-11");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/privacy/i);
  });

  it("applies to staff accounts too", () => {
    const base = { first_name: "Ana", last_name: "Reyes", email: "ana@example.com" };
    expect(parseAccountForm("campus_head", form(base), "2026-03-11").ok).toBe(false);
    expect(parseAccountForm("campus_head", form({ ...base, privacy_consent: "on" }), "2026-03-11").ok).toBe(true);
  });
});

describe("parseAccountForm (staff)", () => {
  it("does not require a phone or birthday for a campus head", () => {
    const result = parseAccountForm(
      "campus_head",
      form({ first_name: "Ana", last_name: "Reyes", email: "ana@example.com", privacy_consent: "on" }),
      "2026-03-11",
    );
    expect(result.ok).toBe(true);
  });

  it("requires gender for facilitators (it decides who they can chat with)", () => {
    const base = { first_name: "Ben", last_name: "Cruz", email: "ben@example.com", privacy_consent: "on" };
    expect(parseAccountForm("facilitator", form(base), "2026-03-11").ok).toBe(false);
    expect(parseAccountForm("facilitator", form({ ...base, gender: "male" }), "2026-03-11").ok).toBe(true);
  });
});

describe("creatableRoles", () => {
  it("follows the permission matrix", () => {
    expect(creatableRoles("super_admin")).toContain("campus_head");
    expect(creatableRoles("campus_head")).toEqual(["facilitator", "student"]);
    expect(creatableRoles("facilitator")).toEqual(["student"]);
    expect(creatableRoles("student")).toEqual([]);
  });
});
