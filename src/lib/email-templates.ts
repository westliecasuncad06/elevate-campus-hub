/**
 * The email that carries a sign-in code. Plain HTML with no images (nothing can show up broken, and an email app that
 * blocks pictures still looks right), in the same black / red style as the invitation. No imports: also loaded by tests.
 */
export interface LoginCodeEmailInput {
  code: string;
  minutes: number;
  firstName?: string | null;
  /** "test" is the Super Admin checking that email works before switching the step on. */
  purpose?: "signin" | "test";
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function loginCodeEmail({ code, minutes, firstName, purpose = "signin" }: LoginCodeEmailInput) {
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi,";
  const subject = purpose === "test" ? `Test code ${code} for Elevate Campus Hub` : `Your Elevate Campus Hub code: ${code}`;
  const intro =
    purpose === "test"
      ? "This is a test of the emailed sign-in code. If you can read this and the code below, email sending works."
      : "Type this code on the sign-in page to finish signing in.";
  const warning =
    purpose === "test"
      ? "Nothing else is needed. You can ignore this email after you have typed the code."
      : "Didn't try to sign in? Someone may know your password. Ignore this email, and change your password under Account &amp; security.";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f5f5f2;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f5f5f2;">Your sign-in code is ${code}. It works for ${minutes} minutes.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f2;">
      <tr>
        <td align="center" style="padding:28px 14px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;">
            <tr>
              <td bgcolor="#0a0a0a" style="background-color:#0a0a0a;border-radius:14px 14px 0 0;padding:24px 28px 20px 28px;">
                <div style="font-family:'Arial Black',Impact,Arial,Helvetica,sans-serif;font-size:30px;line-height:32px;font-weight:900;font-style:italic;letter-spacing:1px;color:#ffffff;text-transform:uppercase;">Elevate</div>
                <div style="margin-top:3px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;font-weight:bold;letter-spacing:5px;color:#c9c9c4;text-transform:uppercase;">Campus Hub</div>
              </td>
            </tr>
            <tr><td height="5" bgcolor="#ed482d" style="background-color:#ed482d;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr>
              <td bgcolor="#ffffff" style="background-color:#ffffff;border-left:1px solid #e1e1dc;border-right:1px solid #e1e1dc;padding:34px 30px 30px 30px;font-family:Arial,Helvetica,sans-serif;color:#0a0a0a;">
                <h1 style="margin:0 0 14px 0;font-size:24px;line-height:30px;font-weight:bold;color:#0a0a0a;">${greeting}</h1>
                <p style="margin:0 0 20px 0;font-size:16px;line-height:25px;color:#0a0a0a;">${intro}</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
                  <tr>
                    <td align="center" bgcolor="#f5f5f2" style="background-color:#f5f5f2;border:1px solid #e1e1dc;border-radius:10px;padding:18px 10px 16px 10px;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;color:#5a5a56;margin:0 0 6px 0;">Your sign-in code</div>
                      <div style="font-family:'Courier New',Courier,monospace;font-size:40px;line-height:46px;font-weight:bold;letter-spacing:10px;color:#0a0a0a;">${code}</div>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 12px 0;font-size:14px;line-height:22px;color:#0a0a0a;">The code works once and stops working in ${minutes} minutes. Never share it with anyone: we will never ask for it.</p>
                <p style="margin:0;font-size:13px;line-height:20px;color:#5a5a56;">${warning}</p>
              </td>
            </tr>
            <tr>
              <td bgcolor="#0a0a0a" align="center" style="background-color:#0a0a0a;border-radius:0 0 14px 14px;padding:15px 12px;font-family:'Arial Black',Impact,Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;font-weight:bold;font-style:italic;letter-spacing:2px;color:#ffffff;text-transform:uppercase;">Change the campus one student at a time.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    firstName ? `Hi ${firstName},` : "Hi,",
    "",
    intro,
    "",
    `Your sign-in code: ${code}`,
    "",
    `The code works once and stops working in ${minutes} minutes. Never share it with anyone.`,
    purpose === "test"
      ? "Nothing else is needed."
      : "Didn't try to sign in? Ignore this email, and change your password under Account & security.",
  ].join("\n");

  return { subject, html, text };
}

/** "Elevate Campus Hub <me@x.com>" -> { name, email } */
export function parseSender(from: string): { name: string; email: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  if (match) return { name: match[1].trim() || "Elevate Campus Hub", email: match[2].trim() };
  return { name: "Elevate Campus Hub", email: from.trim() };
}
