/** Pulls the document ID out of a Google Docs/Forms URL (".../d/<id>/edit"). */
export function extractGoogleDocId(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export interface DocsReportPayload {
  type: "docs";
  docId: string;
  campusName: string;
  /** The "School/Location" the ministry's report uses. */
  location: string;
  dateFrom: string;
  dateTo: string;
  totalAttendance: number;
  studentsEngaged: number;
  studentsHeardGospel: number;
  studentsAcceptedJesus: number;
  studentsWantsDgroup: number;
  volunteersCount: number;
  submittedBy: string;
}

/**
 * POSTs a report to the Google Apps Script web app (see docs/google-apps-script/Code.gs).
 * Apps Script answers with a 302 to the result, which fetch follows automatically.
 */
export async function sendToAppsScript(
  webhookUrl: string,
  payload: DocsReportPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });

    const text = await response.text();
    let json: { success?: boolean; error?: string } | null = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Not JSON: Apps Script returned an HTML error page (usually a permissions problem).
    }

    if (!response.ok) return { ok: false, error: `Google responded with HTTP ${response.status}.` };
    if (!json) {
      return {
        ok: false,
        error: "Google returned an unexpected page. Check that the Apps Script web app is deployed for “Anyone”.",
      };
    }
    if (!json.success) return { ok: false, error: json.error ?? "The Apps Script reported a failure." };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not reach the Google Apps Script.",
    };
  }
}
