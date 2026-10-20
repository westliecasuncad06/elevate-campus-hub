import { cn } from "@/lib/utils";

/**
 * The Elevate mark: the inverted V (the red "A" in the ELEVATE logo).
 * Geometry traced from the supplied logo file; viewBox is the shape's own bounding box.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 588 475" aria-hidden="true" className={cn("h-7 w-auto shrink-0 text-brand", className)}>
      <polygon fill="currentColor" points="0,475 372,0 530,0 588,475 437,475 403,147 150,475" />
    </svg>
  );
}

/** Mark + wordmark. `tone` is the background it sits on: "dark" (black) or "light" (white). */
export function Brand({
  className,
  tone = "light",
  size = "md",
}: {
  className?: string;
  tone?: "light" | "dark";
  size?: "md" | "lg";
}) {
  const dark = tone === "dark";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <LogoMark className={size === "lg" ? "h-10" : "h-7"} />
      <div className="leading-none">
        <p className={cn("display text-lg", size === "lg" && "text-2xl", dark ? "text-white" : "text-foreground")}>Elevate</p>
        <p className={cn("mt-1 text-[0.7rem] font-medium tracking-[0.2em]", dark ? "text-white/60" : "text-muted-foreground")}>
          CAMPUS HUB
        </p>
      </div>
    </div>
  );
}
