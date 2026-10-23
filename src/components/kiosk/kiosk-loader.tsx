import { cn } from "@/lib/utils";

/**
 * The kiosk's loading animation: the Elevate mark is drawn in red, filled, and lifts, while soft rings ripple out
 * behind it. Used while the kiosk opens and while a check-in or a new account is being saved.
 */
export function KioskLoader({ label, className }: { label: string; className?: string }) {
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
