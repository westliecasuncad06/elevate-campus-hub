/**
 * Submits the ministry's "Elevate Engagement Report" Google Form from the server.
 *
 * Nothing about the form is hard-coded: the form's public page is read at submit time, its questions are matched by
 * their wording (so a reordered or renamed-a-little form keeps working), and the answers are posted to the same
 * /formResponse address the browser would use. The form must accept responses without a Google sign-in.
 */

export type FieldKey = "date" | "location" | "attendees" | "heard" | "accepted" | "dgroup" | "volunteers";

export interface FormField {
  title: string;
  /** Google's question type code (9 = date, 0 = short answer). */
  type: number;
  entryId: string;
  required: boolean;
}

export interface FormValues {
  /** YYYY-MM-DD */
  date: string;
  location: string;
  attendees: number;
  heard: number;
  accepted: number;
  dgroup: number;
  volunteers: number;
}

export const FIELD_LABEL: Record<FieldKey, string> = {
  date: "Date",
  location: "School/Location",
  attendees: "No. of Individuals Engaged/Attendees",
  heard: "No. of Individuals who Heard the Gospel",
  accepted: "No. of Individuals who Accepted Jesus",
  dgroup: "No. of Individuals who are Willing to Join a Dgroup",
  volunteers: "No. of Volunteers",
};

/** The id inside ".../forms/d/e/<id>/viewform", or null if this isn't a published Google Form link. */
export function extractFormId(url: string): string | null {
  return url.match(/\/forms\/d\/e\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

export function formAddresses(url: string): { view: string; response: string } | null {
  const id = extractFormId(url);
  if (!id) return null;
  const base = `https://docs.google.com/forms/d/e/${id}`;
  return { view: `${base}/viewform`, response: `${base}/formResponse` };
}

/** The one canonical address we store for a form, whatever extras ("?usp=dialog", "/edit") the pasted link had. */
export function normalizeFormUrl(url: string): string | null {
  return formAddresses(url)?.view ?? null;
}

/** The JSON Google embeds in the form page (questions, title, …), or null if the page isn't a form. */
function parseFormData(html: string): unknown[] | null {
  const match = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\])\s*;\s*<\/script>/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/** The form's title, for naming a saved form. */
export function parseFormTitle(html: string): string | null {
  const embedded = parseFormData(html)?.[3];
  if (typeof embedded === "string" && embedded.trim()) return embedded.trim();
  const tag = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.replace(/\s+-\s+Google Forms\s*$/i, "").trim();
  return tag || null;
}

/** Reads the questions out of the form page's embedded data. */
export function parseFormFields(html: string): FormField[] {
  const data = parseFormData(html);
  const items = (data as unknown[][] | null)?.[1]?.[1];
  if (!Array.isArray(items)) return [];

  const fields: FormField[] = [];
  for (const item of items as unknown[][]) {
    const answers = item?.[4] as unknown[][] | undefined;
    const first = answers?.[0];
    if (!Array.isArray(first) || typeof first[0] !== "number") continue; // section headers have no answer box
    fields.push({
      title: String(item[1] ?? "").trim(),
      type: Number(item[3]),
      entryId: String(first[0]),
      required: first[2] === 1,
    });
  }
  return fields;
}

/** Matches the form's questions to ours by wording. */
export function mapFormFields(fields: FormField[]): { map: Partial<Record<FieldKey, FormField>>; missing: string[] } {
  const map: Partial<Record<FieldKey, FormField>> = {};

  for (const field of fields) {
    const t = field.title.toLowerCase();
    let key: FieldKey | null = null;
    if (field.type === 9 || /^date\b/.test(t)) key = "date";
    else if (t.includes("school") || t.includes("location")) key = "location";
    else if (t.includes("heard")) key = "heard";
    else if (t.includes("accepted")) key = "accepted";
    else if (t.includes("dgroup") || t.includes("d-group") || t.includes("d group")) key = "dgroup";
    else if (t.includes("volunteer")) key = "volunteers";
    else if (t.includes("attendee") || t.includes("engaged")) key = "attendees";
    if (key && !map[key]) map[key] = field;
  }

  // A question we can't fill is only a problem if the form insists on it.
  const missing = fields.filter((f) => f.required && !Object.values(map).includes(f)).map((f) => f.title);
  if (!map.date) missing.push("Date");
  return { map, missing };
}

export function buildFormBody(
  map: Partial<Record<FieldKey, FormField>>,
  values: FormValues,
  fbzx?: string | null,
): URLSearchParams {
  const body = new URLSearchParams();
  const [year, month, day] = values.date.split("-").map(Number);

  if (map.date) {
    body.set(`entry.${map.date.entryId}_year`, String(year));
    body.set(`entry.${map.date.entryId}_month`, String(month));
    body.set(`entry.${map.date.entryId}_day`, String(day));
  }
  const set = (key: FieldKey, value: string | number) => {
    if (map[key]) body.set(`entry.${map[key]!.entryId}`, String(value));
  };
  set("location", values.location);
  set("attendees", values.attendees);
  set("heard", values.heard);
  set("accepted", values.accepted);
  set("dgroup", values.dgroup);
  set("volunteers", values.volunteers);

  body.set("fvv", "1");
  body.set("pageHistory", "0");
  if (fbzx) {
    body.set("fbzx", fbzx);
    body.set("partialResponse", JSON.stringify([null, null, fbzx]));
  }
  return body;
}

/**
 * Did Google record the answers? The confirmation page is drawn in the browser, so its text isn't in the HTML.
 * What Google does send: HTTP 200 and a thin page with no question list and no form token. A refused answer
 * (HTTP 400, e.g. a required question left empty) serves the full form again instead.
 */
export function isConfirmation(status: number, html: string): boolean {
  if (status < 200 || status >= 300) return false;
  if (/has been recorded|freebirdFormviewerViewResponseConfirmationMessage/.test(html)) return true;
  return !/name="fbzx"/.test(html) && parseFormFields(html).length === 0;
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; ElevateCampusHub/1.0)",
  "Accept-Language": "en-US,en;q=0.9",
};

export type SubmitResult = { ok: true } | { ok: false; error: string };

const SIGN_IN = /accounts\.google\.com\/(ServiceLogin|v3\/signin)/;
const SIGN_IN_ERROR = "The form needs a Google sign-in. Set it to accept responses from anyone with the link.";
const CLOSED_ERROR = "The form is closed and no longer accepting responses.";

export interface LoadedForm {
  addresses: { view: string; response: string };
  title: string | null;
  map: Partial<Record<FieldKey, FormField>>;
  /** Questions the form requires that the system can't answer. */
  missing: string[];
  fbzx: string | null;
}

/** Fetches the live form and works out which of its questions we can answer. */
export async function loadForm(formUrl: string): Promise<{ ok: true; form: LoadedForm } | { ok: false; error: string }> {
  const addresses = formAddresses(formUrl);
  if (!addresses) {
    return { ok: false, error: "That isn't a Google Form link. It should look like docs.google.com/forms/d/e/…/viewform." };
  }

  try {
    const page = await fetch(addresses.view, { headers: BROWSER_HEADERS, redirect: "follow", signal: AbortSignal.timeout(20_000) });
    const html = await page.text();
    if (page.status === 404) return { ok: false, error: "Google couldn't find that form. Check the link." };
    if (!page.ok || SIGN_IN.test(page.url)) return { ok: false, error: SIGN_IN_ERROR };
    if (/no longer accepting responses/i.test(html)) return { ok: false, error: CLOSED_ERROR };

    const fields = parseFormFields(html);
    if (fields.length === 0) return { ok: false, error: "Couldn't read the questions from the form. Check the link." };

    const { map, missing } = mapFormFields(fields);
    return {
      ok: true,
      form: { addresses, title: parseFormTitle(html), map, missing, fbzx: html.match(/name="fbzx"\s+value="([^"]+)"/)?.[1] ?? null },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't reach Google Forms." };
  }
}

export type InspectResult = { ok: true; url: string; title: string | null } | { ok: false; error: string };

/** Checks a pasted link before it is saved: it must be a reachable form whose questions we can answer. */
export async function inspectGoogleForm(formUrl: string): Promise<InspectResult> {
  const loaded = await loadForm(formUrl);
  if (!loaded.ok) return loaded;
  const { form } = loaded;
  if (form.missing.length > 0) {
    return { ok: false, error: `This form asks for something the system doesn't have: ${form.missing.join(", ")}.` };
  }
  return { ok: true, url: form.addresses.view, title: form.title };
}

/** Reads the live form, fills it in, and submits it. */
export async function submitToGoogleForm(formUrl: string, values: FormValues): Promise<SubmitResult> {
  const loaded = await loadForm(formUrl);
  if (!loaded.ok) return loaded;
  const { form } = loaded;
  if (form.missing.length > 0) {
    return { ok: false, error: `The form asks for something the system doesn't have: ${form.missing.join(", ")}.` };
  }

  try {
    const response = await fetch(form.addresses.response, {
      method: "POST",
      headers: { ...BROWSER_HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
      body: buildFormBody(form.map, values, form.fbzx),
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    const result = await response.text();

    if (/no longer accepting responses/i.test(result)) return { ok: false, error: CLOSED_ERROR };
    if (SIGN_IN.test(response.url)) return { ok: false, error: SIGN_IN_ERROR };
    if (isConfirmation(response.status, result)) return { ok: true };
    return { ok: false, error: "Google didn't accept the response (the form may have changed). Nothing was recorded." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't reach Google Forms." };
  }
}
