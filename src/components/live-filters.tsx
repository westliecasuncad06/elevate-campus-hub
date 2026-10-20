"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2Icon, XIcon } from "lucide-react";
import { FormSelect, type Option } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Filters that work as you type or pick: the list on the page updates by itself, with no Filter button.
 * The choices live in the address (?q=…&role=…), so a filtered list can be bookmarked or shared, and the page itself
 * (a server page) does the filtering, so long lists never have to be sent to the browser.
 *
 *   <LiveFilters params={["q", "role"]} className="grid …">
 *     <LiveSearch placeholder="Name, email or phone" />
 *     <LiveSelect label="Role" param="role" options={…} />
 *   </LiveFilters>
 */

interface LiveContext {
  update: (changes: Record<string, string | null>) => void;
  pending: boolean;
}

const LiveFilterContext = React.createContext<LiveContext | null>(null);

function useLive(): LiveContext {
  const ctx = React.useContext(LiveFilterContext);
  if (!ctx) throw new Error("LiveSearch and LiveSelect go inside <LiveFilters>.");
  return ctx;
}

/** The box around the filters. Its last cell shows "Updating…" while the list refreshes, or "Clear" when something is filtered. */
export function LiveFilters({
  params,
  className,
  children,
}: {
  /** The address parameters this bar controls (so "Clear" only resets these). */
  params: string[];
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const update = React.useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "" || value === "all") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  const active = params.some((key) => {
    const value = searchParams.get(key);
    return Boolean(value) && value !== "all";
  });

  return (
    <LiveFilterContext.Provider value={{ update, pending }}>
      <div className={cn("rounded-xl border bg-card p-3", className)}>
        {children}
        <div className="flex min-h-9 items-center text-sm text-muted-foreground" aria-live="polite">
          {pending ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
              Updating…
            </span>
          ) : active ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const reset: Record<string, null> = {};
                for (const key of params) reset[key] = null;
                update(reset);
              }}
            >
              <XIcon />
              Clear
            </Button>
          ) : null}
        </div>
      </div>
    </LiveFilterContext.Provider>
  );
}

/** A search box that filters while you type (it waits a moment after the last key so it isn't busy on every letter). */
export function LiveSearch({
  label = "Search",
  placeholder,
  param = "q",
  className,
  delay = 250,
}: {
  label?: string;
  placeholder?: string;
  param?: string;
  className?: string;
  delay?: number;
}) {
  const { update } = useLive();
  const searchParams = useSearchParams();
  const id = React.useId();
  // The box owns what is typed; the address only follows it (so typing is never interrupted by a refresh).
  const [value, setValue] = React.useState(() => searchParams.get(param) ?? "");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // "Clear" (or the browser's back button) changes the address: show it in the box.
  const fromAddress = searchParams.get(param) ?? "";
  const lastSent = React.useRef(fromAddress);
  React.useEffect(() => {
    if (fromAddress !== lastSent.current) {
      lastSent.current = fromAddress;
      setValue(fromAddress);
    }
  }, [fromAddress]);

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const trimmed = next.trim();
      if (trimmed === lastSent.current) return;
      lastSent.current = trimmed;
      update({ [param]: trimmed });
    }, delay);
  }

  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        maxLength={80}
        onKeyDown={(e) => {
          // Enter shouldn't reload the page: the list is already following what was typed.
          if (e.key === "Enter") e.preventDefault();
        }}
      />
    </div>
  );
}

/** A dropdown that filters the moment you pick. */
export function LiveSelect({
  label,
  param,
  options,
  className,
}: {
  label: string;
  param: string;
  options: Option[];
  className?: string;
}) {
  const { update } = useLive();
  const searchParams = useSearchParams();
  // A select's starting value can't change while it is on screen, so it is read once; the select keeps its own choice.
  const fallback = options[0]?.value ?? "all";
  const [start, setStart] = React.useState(() => ({ version: 0, value: searchParams.get(param) ?? fallback }));

  // "Clear" or back/forward changes the address: start the dropdown over from it.
  const fromAddress = searchParams.get(param) ?? fallback;
  const known = React.useRef(start.value);
  React.useEffect(() => {
    if (fromAddress !== known.current) {
      known.current = fromAddress;
      setStart((s) => ({ version: s.version + 1, value: fromAddress }));
    }
  }, [fromAddress]);

  return (
    <FormSelect
      key={start.version}
      label={label}
      name={param}
      options={options}
      defaultValue={start.value}
      className={className}
      onValueChange={(value) => {
        known.current = value || fallback;
        update({ [param]: value });
      }}
    />
  );
}
