import Link from "next/link";
import { Brand, LogoMark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    title: "Start engage",
    text: "Open a batch for the students you're about to talk with.",
  },
  {
    title: "Add students",
    text: "Scan their QR card, look them up by phone or email, or register a first timer on the spot.",
  },
  {
    title: "Record and finish",
    text: "Note how each conversation went: who heard the Gospel, who accepted Jesus, who wants a DGroup. Then finish the batch.",
  },
];

/** Public front page: the tagline, our mission and vision, and a way in. */
export function Landing() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Hero: black, with the mark cropped off the right edge */}
      <section className="relative isolate overflow-hidden bg-sidebar text-white [clip-path:polygon(0_0,100%_0,100%_calc(100%-3.5rem),0_100%)] pb-28 sm:pb-36">
        {/* The mark sits in the lower right, clear of the header button and the paragraph. */}
        <LogoMark className="pointer-events-none absolute right-0 bottom-0 -z-10 h-auto w-[92%] translate-y-[8%] text-brand/25 sm:w-[43%] sm:translate-y-0 sm:text-brand" />

        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
          <Brand tone="dark" size="lg" />
          <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "font-bold")}>
            Sign in
          </Link>
        </header>

        <div className="mx-auto w-full max-w-6xl px-5 pt-12 sm:px-8 sm:pt-20">
          <h1 className="display text-[clamp(1.9rem,5.4vw,4.8rem)] leading-[1.02]">
            <span className="block">Change the campus</span>
            <span className="block">one student</span>
            <span className="block">at a time.</span>
          </h1>
          <p className="mt-8 max-w-xl text-lg text-white/75">
            Elevate Campus Hub is where our campus teams check students in, follow up with every conversation, and
            move students toward a DGroup, so no one is missed.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "h-12 px-7 text-base font-bold")}>
              Sign in to your campus
            </Link>
            <a href="#why" className="text-sm font-medium text-white/70 underline-offset-4 hover:text-white hover:underline">
              Why we do this
            </a>
          </div>
        </div>
      </section>

      {/* Mission and vision */}
      <section id="why" className="mx-auto -mt-10 w-full max-w-6xl scroll-mt-8 px-5 pt-20 pb-20 sm:px-8">
        <div className="grid gap-12 md:grid-cols-2 md:gap-0">
          <article className="md:border-r md:pr-14">
            <h2 className="flex items-center gap-3 font-heading text-sm font-bold tracking-[0.2em] text-primary">
              <span className="h-5 w-2 -skew-x-[18deg] bg-brand" aria-hidden="true" />
              MISSION
            </h2>
            <p className="mt-5 text-2xl leading-snug font-semibold text-balance sm:text-[1.9rem]">
              To honor God and make Christ-committed students who make Christ-committed students.
            </p>
          </article>

          <article className="md:pl-14">
            <h2 className="flex items-center gap-3 font-heading text-sm font-bold tracking-[0.2em] text-primary">
              <span className="h-5 w-2 -skew-x-[18deg] bg-brand" aria-hidden="true" />
              VISION
            </h2>
            <p className="mt-5 text-2xl leading-snug font-semibold text-balance sm:text-[1.9rem]">
              A movement of millions of Christ-committed students meeting in small groups (DGroups) and transforming
              lives, campuses, families, and nations for God&apos;s glory.
            </p>
          </article>
        </div>
      </section>

      {/* How a team uses it: this really is a sequence */}
      <section className="border-t bg-card">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
          <h2 className="display max-w-2xl text-3xl sm:text-4xl">Built for the conversation, not the paperwork</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative rounded-2xl border bg-background p-6">
                <span className="display text-4xl text-brand">{i + 1}</span>
                <h3 className="mt-3 text-lg font-bold">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 max-w-2xl text-muted-foreground">
            Campus Heads see who is facilitating right now and who they&apos;re with, and keep a history of every
            batch.
          </p>
        </div>
      </section>

      <footer className="mt-auto bg-sidebar text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 sm:px-8">
          <Brand tone="dark" />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="display text-sm text-white/70">Change the campus one student at a time.</p>
            <Link href="/privacy" className="text-sm text-white/70 underline underline-offset-4 hover:text-white">
              Data Privacy Notice
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
