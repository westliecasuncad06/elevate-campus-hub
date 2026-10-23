import { cn } from "@/lib/utils";

/**
 * The app's loading animation: the Elevate mark is drawn in red, filled, and lifts, while soft rings ripple out behind
 * it. Shown when a page is opened or refreshed, while signing in, and while the kiosk saves a check-in.
 */
export function ElevateLoader({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col items-center justify-center text-center", className)}>
      <div className="relative grid size-44 place-items-center">
        {[0, 0.8, 1.6].map((delay) => (
          <span
            key={delay}
            aria-hidden="true"
            className="elevate-loader-ring absolute inset-0 rounded-full border-2 border-brand/40 bg-brand/5"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
        <svg viewBox="-20 -20 628 515" aria-hidden="true" className="elevate-loader-mark relative h-20 w-auto text-brand">
          <polygon
            points="0,475 372,0 530,0 588,475 437,475 403,147 150,475"
            pathLength={1}
            fill="currentColor"
            stroke="currentColor"
            strokeWidth={14}
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="mt-8 text-2xl font-semibold tracking-tight">
        {label}
        <span aria-hidden="true">
          {[0, 0.15, 0.3].map((delay) => (
            <span key={delay} className="elevate-loader-dot" style={{ animationDelay: `${delay}s` }}>
              .
            </span>
          ))}
        </span>
      </p>
    </div>
  );
}

/** The loader over the whole screen, on a soft blurred backdrop (what's underneath, like a typed form, stays as it was). */
export function LoadingOverlay({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-background/90 px-4 backdrop-blur-sm animate-in fade-in duration-200">
      <ElevateLoader label={label} />
    </div>
  );
}
