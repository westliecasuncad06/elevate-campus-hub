import { DATA_PURPOSES, PRIVACY_CONTACT, PRIVACY_VERSION, SERVICE_PROVIDERS, WHO_CAN_SEE, YOUR_RIGHTS } from "@/lib/privacy";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-3 font-heading text-xl font-bold">
        <span className="h-5 w-1.5 -skew-x-[18deg] bg-brand" aria-hidden="true" />
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[0.98rem] leading-relaxed">{children}</div>
    </section>
  );
}

/** The full Data Privacy Notice (Data Privacy Act of 2012, RA 10173). Shared by /privacy and /accept-privacy. */
export function PrivacyNotice() {
  const contact = PRIVACY_CONTACT ?? "your Campus Head";

  return (
    <article className="max-w-3xl">
      <p className="text-sm text-muted-foreground">Version {PRIVACY_VERSION}</p>
      <p className="mt-3 text-lg leading-relaxed">
        Elevate Campus Hub helps our campus ministry teams look after students. This notice explains what personal
        information we collect, why, who can see it, and what you can do about it, as required by the Data Privacy Act of
        2012 (Republic Act 10173).
      </p>

      <Section title="Who is responsible for your data">
        <p>
          The Elevate campus ministry team at your campus decides what is collected and why. Questions or requests about
          your data go to <strong>{contact}</strong>.
        </p>
      </Section>

      <Section title="What we collect, and why">
        <div className="overflow-hidden rounded-2xl border bg-card">
          <ul className="divide-y">
            {DATA_PURPOSES.map((row) => (
              <li key={row.data} className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_1fr] sm:gap-6">
                <p className="font-semibold">
                  {row.data}
                  {row.optional ? <span className="ml-2 text-xs font-medium text-muted-foreground">Optional</span> : null}
                </p>
                <p className="text-muted-foreground">{row.why}</p>
              </li>
            ))}
          </ul>
        </div>
        <p>
          Church and religion are <strong>sensitive personal information</strong>. We only keep them if you choose to give
          them, and only with your consent.
        </p>
      </Section>

      <Section title="Your consent">
        <p>
          We collect and use your data only with your consent, for the purposes above and no others. When someone on the
          team registers you, they confirm that you (or, if you are under 18, your parent or guardian) have been told about
          this notice and agree. You confirm it yourself again when you set up your account. You can withdraw your consent
          at any time by contacting {contact}. Withdrawing means we stop using your data and, unless the law requires us to
          keep it, delete it.
        </p>
      </Section>

      <Section title="Who can see your data">
        <ul className="list-disc space-y-1.5 pl-5">
          {WHO_CAN_SEE.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>
          Each campus is kept separate: a Campus Head only sees their own campus. A student only sees their own
          information and their facilitator&apos;s name and contact details. Reports sent to the wider ministry contain
          totals only, never students&apos; names.
        </p>
      </Section>

      <Section title="Who helps us run it">
        <p>These providers process data on our behalf, only to run the service:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          {SERVICE_PROVIDERS.map((p) => (
            <li key={p.name}>
              <strong>{p.name}</strong>: {p.role}.
            </li>
          ))}
        </ul>
        <p>Your data may therefore be stored on servers outside the Philippines. We do not sell it or share it for any other purpose.</p>
      </Section>

      <Section title="How we protect it">
        <p>
          The service is used over an encrypted connection. Access depends on your role, and your password is stored in
          scrambled form that nobody on the team can read. We only give accounts to people the ministry has registered.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep your data while you are part of the campus ministry and for as long as it is needed for the purposes
          above. When it is no longer needed, or when you ask, we delete or anonymise it.
        </p>
      </Section>

      <Section title="Your rights">
        <p>Under the Data Privacy Act you have the right to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          {YOUR_RIGHTS.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p>
          To use any of these, contact {contact}. If you are not satisfied with the answer you can complain to the National
          Privacy Commission at privacy.gov.ph.
        </p>
      </Section>

      <Section title="Changes to this notice">
        <p>
          If this notice changes in a way that matters, the version number above changes and everyone is asked to read and
          accept it again the next time they sign in.
        </p>
      </Section>
    </article>
  );
}
