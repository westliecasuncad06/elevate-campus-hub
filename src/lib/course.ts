/**
 * A student's course is either one of their campus's programs (a dropdown, stored as program_id) or, at a campus
 * with no program list, whatever they typed (stored in `course`). These helpers hide that difference.
 */

/** "BSIT" for a program, or the typed course, or null when neither is set. */
export function courseLabel(student: { program?: { code: string } | null; course?: string | null }): string | null {
  return student.program?.code ?? (student.course?.trim() || null);
}

/** Does this campus use a program dropdown? Only when it has programs of its own. */
export function usesProgramList(programs: readonly unknown[]): boolean {
  return programs.length > 0;
}
