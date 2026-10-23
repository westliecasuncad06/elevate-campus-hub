import { formatName } from "@/lib/names";
import { isValidPhone, looksLikeEmail, normalizePhone } from "@/lib/phone";
import { parseStudentNumber } from "@/lib/student-number";
import type { Gender, Role } from "@/lib/types";

export interface AccountFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  gender: Gender | null;
  birthday: string | null;
  church: string | null;
  religion: string | null;
  /** A program from the campus's list (campuses that have one)… */
  programId: string | null;
  /** …or a typed course (campuses without one). A student has one of the two. */
  course: string | null;
  yearLevel: number | null;
  studentNumber: string | null;
}

export interface ParseOptions {
  /** "program": pick from the campus's list. "text": type it (the campus has no program list). Default "program". */
  courseMode?: "program" | "text";
  /** Registration needs the data privacy consent box; editing an existing person doesn't. Default true. */
  requireConsent?: boolean;
}

type Parsed = { ok: true; value: AccountFields } | { ok: false; error: string };

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function optional(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

/** Validates the registration/creation (or edit) form for any account type. */
export function parseAccountForm(role: Role, formData: FormData, today: string, options: ParseOptions = {}): Parsed {
  const { courseMode = "program", requireConsent = true } = options;
  // A surname typed in capitals by accident ("JARDIN") is saved as "Jardin".
  const firstName = formatName(text(formData, "first_name"));
  const lastName = formatName(text(formData, "last_name"));
  if (!firstName || !lastName) return { ok: false, error: "First name and last name are required." };
  if (firstName.length > 80 || lastName.length > 80) return { ok: false, error: "Names must be 80 characters or fewer." };

  const email = text(formData, "email").toLowerCase();
  if (!looksLikeEmail(email)) return { ok: false, error: "Enter a valid email address." };

  // Nobody's details are stored without the data privacy consent (Data Privacy Act of 2012).
  if (requireConsent && formData.get("privacy_consent") !== "on") {
    return { ok: false, error: "Confirm the data privacy consent first. Read the notice to the person, then tick the box." };
  }

  const rawPhone = text(formData, "phone");
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (role === "student" && !phone) return { ok: false, error: "Phone number is required for students." };
  if (phone && !isValidPhone(phone)) {
    return { ok: false, error: "Enter an 11-digit mobile number, like 09171234567." };
  }

  const genderRaw = text(formData, "gender");
  const gender = genderRaw === "male" || genderRaw === "female" ? genderRaw : null;
  if ((role === "student" || role === "facilitator") && !gender) {
    return { ok: false, error: "Select a gender. It decides who can chat with whom." };
  }

  const birthday = optional(formData, "birthday");
  if (birthday) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || Number.isNaN(Date.parse(birthday))) {
      return { ok: false, error: "Enter a valid birthday." };
    }
    if (birthday > today) return { ok: false, error: "Birthday can't be in the future." };
  }

  let programId: string | null = null;
  let course: string | null = null;
  let yearLevel: number | null = null;
  let studentNumber: string | null = null;
  if (role === "student") {
    // The student number is how students check in at the kiosk, so it is required and always stored dashed (2026-02-07107).
    studentNumber = parseStudentNumber(text(formData, "student_number"));
    if (!studentNumber) return { ok: false, error: "Enter the full student number, like 2026-02-07107." };
    if (!birthday) return { ok: false, error: "Birthday is required for students." };
    if (courseMode === "program") {
      programId = optional(formData, "program_id");
      if (!programId) return { ok: false, error: "Select a program." };
    } else {
      course = optional(formData, "course");
      if (!course) return { ok: false, error: "Enter the student's course." };
      if (course.length > 80) return { ok: false, error: "Keep the course under 80 characters." };
    }
    const year = Number(text(formData, "year_level"));
    if (!Number.isInteger(year) || year < 1 || year > 10) return { ok: false, error: "Select a year level." };
    yearLevel = year;
  }

  return {
    ok: true,
    value: {
      firstName,
      lastName,
      email,
      phone,
      gender,
      birthday,
      church: role === "student" ? optional(formData, "church") : null,
      religion: role === "student" ? optional(formData, "religion") : null,
      programId,
      course,
      yearLevel,
      studentNumber,
    },
  };
}

/** Which roles an actor may create. */
export function creatableRoles(actor: Role): Role[] {
  switch (actor) {
    case "super_admin":
      return ["campus_head", "facilitator", "student"];
    case "campus_head":
      return ["facilitator", "student"];
    case "facilitator":
      return ["student"];
    default:
      return [];
  }
}
