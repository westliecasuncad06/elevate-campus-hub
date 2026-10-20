import { looksLikeEmail, normalizePhone } from "@/lib/phone";
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
  programId: string | null;
  yearLevel: number | null;
  studentNumber: string | null;
}

type Parsed = { ok: true; value: AccountFields } | { ok: false; error: string };

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function optional(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

/** Validates the registration/creation form for any account type. */
export function parseAccountForm(role: Role, formData: FormData, today: string): Parsed {
  const firstName = text(formData, "first_name");
  const lastName = text(formData, "last_name");
  if (!firstName || !lastName) return { ok: false, error: "First name and last name are required." };
  if (firstName.length > 80 || lastName.length > 80) return { ok: false, error: "Names must be 80 characters or fewer." };

  const email = text(formData, "email").toLowerCase();
  if (!looksLikeEmail(email)) return { ok: false, error: "Enter a valid email address." };

  // Nobody's details are stored without the data privacy consent (Data Privacy Act of 2012).
  if (formData.get("privacy_consent") !== "on") {
    return { ok: false, error: "Confirm the data privacy consent first. Read the notice to the person, then tick the box." };
  }

  const rawPhone = text(formData, "phone");
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (role === "student" && !phone) return { ok: false, error: "Phone number is required for students." };
  if (phone && (phone.length < 7 || phone.length > 15)) {
    return { ok: false, error: "Enter a valid phone number." };
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
  let yearLevel: number | null = null;
  if (role === "student") {
    if (!birthday) return { ok: false, error: "Birthday is required for students." };
    programId = optional(formData, "program_id");
    if (!programId) return { ok: false, error: "Select a program." };
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
      yearLevel,
      studentNumber: role === "student" ? optional(formData, "student_number") : null,
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
