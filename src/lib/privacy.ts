import type { Role } from "@/lib/types";

/**
 * Version of the Data Privacy Notice. Bump it whenever the notice changes in a way people should re-accept:
 * everyone is asked to accept again at their next sign-in.
 */
export const PRIVACY_VERSION = "2026-10-20";

/** Who people can contact about their data. Optional; falls back to the Campus Head. */
export const PRIVACY_CONTACT = process.env.NEXT_PUBLIC_PRIVACY_CONTACT?.trim() || null;

export interface DataPurpose {
  data: string;
  why: string;
  /** Optional items can be left blank. */
  optional?: boolean;
  sensitive?: boolean;
}

/** What we collect and why. The registration summary and the full notice both read from this, so they never disagree. */
export const DATA_PURPOSES: DataPurpose[] = [
  {
    data: "Name, phone number and email",
    why: "To identify you, check you in (QR code or lookup), send your account invitation and notices, and let your facilitator contact you.",
  },
  {
    data: "Gender",
    why: "To pair you with a facilitator of the same gender and keep chat between people of the same gender, for everyone's safety.",
  },
  {
    data: "Birthday",
    why: "To identify you accurately and know whether you are under 18, in which case a parent or guardian's agreement applies.",
  },
  {
    data: "Program and year level",
    why: "To follow up with students by course and year.",
  },
  {
    data: "Student number",
    why: "To match you to school records if your campus asks us to.",
    optional: true,
  },
  {
    data: "Church and religion",
    why: "To help your facilitator understand where you are coming from. This is sensitive personal information: leave it blank if you prefer.",
    optional: true,
    sensitive: true,
  },
  {
    data: "Attendance and engagement notes",
    why: "To record when you joined a conversation, and whether you were engaged, heard the Gospel, accepted Jesus or want to join a DGroup, so you can be followed up. Only totals are reported outside the campus team.",
  },
  {
    data: "Chat messages",
    why: "To let you and your facilitator talk to each other.",
  },
  {
    data: "Login details",
    why: "Your email and password let you sign in. Passwords are stored in scrambled form by our sign-in provider; nobody can read them.",
  },
];

/** The fields collected for a given kind of account (staff accounts need much less than students). */
export function collectedFor(role: Role): string {
  if (role === "student") {
    return "your name, phone number, email, gender, birthday, program and year level. Student number, church and religion are optional.";
  }
  return "your name, email and gender. Phone number and birthday are optional.";
}

/** One-sentence version of WHO_CAN_SEE for the registration summary. */
export const SEE_SUMMARY =
  "Only your Campus Head, your facilitator and the IT administrators can see it. We don't sell it or use it for advertising.";

export const WHO_CAN_SEE = [
  "Your Campus Head and the facilitator(s) who follow up with you.",
  "The IT administrators (Super Admins) who keep the system running.",
  "Nobody else. We don't sell your data or use it for advertising.",
];

export const SERVICE_PROVIDERS = [
  { name: "Supabase", role: "stores the database and handles sign-in" },
  { name: "Vercel", role: "hosts the website" },
  { name: "Google (Docs / Forms)", role: "receives ministry report totals, never names of students" },
  { name: "Our email provider", role: "delivers your invitation and password emails" },
];

export const YOUR_RIGHTS = [
  "Be informed about how your data is collected and used (this notice).",
  "Access the data we hold about you.",
  "Object to how it is used, or withdraw your consent.",
  "Correct anything that is wrong or out of date.",
  "Ask us to erase or block your data when it is no longer needed.",
  "Receive a copy of your data.",
  "Claim damages if your data is misused, and file a complaint with the National Privacy Commission (privacy.gov.ph).",
];
