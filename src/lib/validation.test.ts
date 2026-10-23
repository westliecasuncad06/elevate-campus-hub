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
  student_number: "2017-05-07107",
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

  it("requires a full student number and stores it dashed", () => {
    expect(parseAccountForm("student", form({ ...student, student_number: "" }), "2026-03-11").ok).toBe(false);
    expect(parseAccountForm("student", form({ ...student, student_number: "2017-05-0710" }), "2026-03-11").ok).toBe(false);
    const result = parseAccountForm("student", form({ ...student, student_number: "20170507107" }), "2026-03-11");
    expect(result.ok && result.value.studentNumber).toBe("2017-05-07107");
  });

  it("rejects a birthday in the future", () => {
    expect(parseAccountForm("student", form({ ...student, birthday: "2030-01-01" }), "2026-03-11").ok).toBe(false);
  });

  it("rejects a bad email", () => {
    expect(parseAccountForm("student", form({ ...student, email: "maria@" }), "2026-03-11").ok).toBe(false);
  });

  it("saves a surname typed in capitals as 'Surname'", () => {
    const result = parseAccountForm("student", form({ ...student, first_name: "James", last_name: "JARDIN" }), "2026-03-11");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.firstName).toBe("James");
      expect(result.value.lastName).toBe("Jardin");
    }
  });

  it("fixes capitals in both names and leaves normal names alone", () => {
    const shouted = parseAccountForm("student", form({ ...student, first_name: "MARIA CRISTINA", last_name: "DELA CRUZ" }), "2026-03-11");
    const normal = parseAccountForm("student", form({ ...student, first_name: "Maria", last_name: "McDonald" }), "2026-03-11");
    expect(shouted.ok && shouted.value.firstName + " " + shouted.value.lastName).toBe("Maria Cristina Dela Cruz");
    expect(normal.ok && normal.value.lastName).toBe("McDonald");
  });

  it("does the same for staff", () => {
    const result = parseAccountForm("facilitator", form({ first_name: "Ana", last_name: "REYES", email: "a@x.com", gender: "female", privacy_consent: "on" }), "2026-03-11");
    expect(result.ok && result.value.lastName).toBe("Reyes");
  });
});

describe("course: pick a program, or type it at a campus with no program list", () => {
  const typed = { ...student, course: "BS Nursing" };
  const { program_id: _program, ...withoutProgram } = student; // eslint-disable-line @typescript-eslint/no-unused-vars

  it("takes the program from the dropdown by default", () => {
    const result = parseAccountForm("student", form(student), "2026-03-11");
    expect(result.ok && result.value.programId).toBe("11111111-1111-1111-1111-111111111111");
    expect(result.ok && result.value.course).toBeNull();
  });

  it("takes a typed course when the campus has no program list", () => {
    const result = parseAccountForm("student", form({ ...withoutProgram, course: "  BS Nursing " }), "2026-03-11", { courseMode: "text" });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.course).toBe("BS Nursing");
    expect(result.ok && result.value.programId).toBeNull();
  });

  it("ignores a stray program id in text mode, and a stray typed course in program mode", () => {
    const text = parseAccountForm("student", form(typed), "2026-03-11", { courseMode: "text" });
    expect(text.ok && text.value.programId).toBeNull();
    const program = parseAccountForm("student", form(typed), "2026-03-11");
    expect(program.ok && program.value.course).toBeNull();
  });

  it("requires the course in whichever mode applies", () => {
    expect(parseAccountForm("student", form({ ...withoutProgram, course: "  " }), "2026-03-11", { courseMode: "text" }).ok).toBe(false);
    expect(parseAccountForm("student", form(withoutProgram), "2026-03-11").ok).toBe(false);
  });

  it("keeps a typed course under 80 characters", () => {
    const long = parseAccountForm("student", form({ ...withoutProgram, course: "x".repeat(81) }), "2026-03-11", { courseMode: "text" });
    expect(long.ok).toBe(false);
    expect(parseAccountForm("student", form({ ...withoutProgram, course: "x".repeat(80) }), "2026-03-11", { courseMode: "text" }).ok).toBe(true);
  });

  it("doesn't store a course for staff", () => {
    const staff = parseAccountForm(
      "facilitator",
      form({ first_name: "Ben", last_name: "Cruz", email: "ben@example.com", gender: "male", course: "Nursing", privacy_consent: "on" }),
      "2026-03-11",
      { courseMode: "text" },
    );
    expect(staff.ok && staff.value.course).toBeNull();
  });
});

describe("editing an existing person doesn't ask for consent again", () => {
  it("skips the consent check only when told to", () => {
    const data = form(student);
    data.delete("privacy_consent");
    expect(parseAccountForm("student", data, "2026-03-11").ok).toBe(false);
    expect(parseAccountForm("student", data, "2026-03-11", { requireConsent: false }).ok).toBe(true);
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
