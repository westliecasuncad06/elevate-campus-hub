export type Role = "super_admin" | "campus_head" | "facilitator" | "student";
export type Gender = "male" | "female";
export type EntryMethod = "qr" | "phone" | "email" | "manual";

export interface Campus {
  id: string;
  code: string;
  name: string;
  timezone: string;
  target_google_doc_id: string | null;
  google_form_webhook_url: string | null;
  /** Default "School/Location" on the report forms, e.g. "Global Reciprocal Colleges". */
  report_location: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Program {
  id: string;
  campus_id: string | null;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

export interface Profile {
  id: string;
  campus_id: string | null;
  role: Role;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  gender: Gender | null;
  birthday: string | null;
  church: string | null;
  religion: string | null;
  program_id: string | null;
  /** Typed course, used when the student's campus has no program list (otherwise program_id is set). */
  course: string | null;
  year_level: number | null;
  student_number: string | null;
  qr_token: string | null;
  is_active: boolean;
  password_changed: boolean;
  /** False for someone invited by email only, until they register and fill in their own details. */
  details_complete: boolean;
  invitation_sent_at: string | null;
  invitation_accepted_at: string | null;
  created_by: string | null;
  created_at: string;
  /** Consent recorded when the account was registered (by whom, which notice version). */
  data_consent_at: string | null;
  data_consent_version: string | null;
  data_consent_by: string | null;
  /** The person's own acceptance of the Data Privacy Notice. */
  privacy_accepted_at: string | null;
  privacy_accepted_version: string | null;
}

export interface AttendanceLog {
  id: string;
  campus_id: string;
  student_id: string;
  log_date: string;
  time_in: string;
  time_out: string | null;
  purpose: string | null;
  scanned_by: string;
  entry_method: EntryMethod;
}

export interface EngagementLog {
  id: string;
  attendance_log_id: string;
  student_id: string;
  facilitator_id: string;
  campus_id: string;
  is_engaged: boolean;
  heard_gospel: boolean;
  accepted_jesus: boolean;
  wants_dgroup: boolean;
}

/** One student inside a batch, with their engagement (null until the facilitator records it). */
export interface BatchStudent {
  logId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  addedAt: string;
  /** When the engagement was recorded; the gap from addedAt is how long the engagement took. */
  timeOut: string | null;
  engagement: {
    isEngaged: boolean;
    heardGospel: boolean;
    acceptedJesus: boolean;
    wantsDgroup: boolean;
  } | null;
}

export interface Batch {
  id: string;
  number: number;
  date: string;
  status: "open" | "finished";
  startedAt: string;
  finishedAt: string | null;
  facilitatorId: string;
  facilitatorName: string;
  students: BatchStudent[];
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  campus_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

/** Result shape returned by every server action so forms can show a message. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string };

export function fullName(p: Pick<Profile, "first_name" | "last_name">): string {
  return `${p.first_name} ${p.last_name}`.trim();
}
