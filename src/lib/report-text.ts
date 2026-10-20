import { formatLongDate } from "@/lib/dates";

/** First line of the copied report. */
export const REPORT_TITLE = "Campus Hub";

export interface ReportCounts {
  total_attendance: number;
  students_engaged: number;
  students_heard_gospel: number;
  students_accepted_jesus: number;
  students_wants_dgroup: number;
  volunteers_count: number;
}

/**
 * The plain-text report people paste into a chat, in the ministry's usual wording:
 *
 *   Campus Hub
 *   October 20, 2026
 *
 *   Total Attendance: 37
 *   No. of Students Engaged: 18
 *   ...
 *
 * @param date YYYY-MM-DD, the day the report is for
 */
export function formatReportText(date: string, counts: ReportCounts): string {
  return [
    REPORT_TITLE,
    formatLongDate(date),
    "",
    `Total Attendance: ${counts.total_attendance}`,
    `No. of Students Engaged: ${counts.students_engaged}`,
    `No. of Students who hear the Gospel: ${counts.students_heard_gospel}`,
    `No. of Students who accepted Jesus: ${counts.students_accepted_jesus}`,
    `No. of Students who wants to join a D-Group: ${counts.students_wants_dgroup}`,
    `No. of Volunteers: ${counts.volunteers_count}`,
  ].join("\n");
}
