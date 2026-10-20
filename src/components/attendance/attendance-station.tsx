"use client";

import { useCallback, useState } from "react";
import { ScanLineIcon, SearchIcon, UserPlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Program } from "@/lib/types";
import type { AttendanceOutcome } from "@/app/actions/attendance";
import { FirstTimerForm } from "./first-timer-form";
import { LookupPanel } from "./lookup-panel";
import { OutcomeCard } from "./outcome-card";
import { QrScanPanel } from "./qr-scan-panel";

type Mode = "scan" | "lookup" | "first";

const MODES: { id: Mode; label: string; icon: typeof ScanLineIcon }[] = [
  { id: "scan", label: "Scan QR", icon: ScanLineIcon },
  { id: "lookup", label: "Look up", icon: SearchIcon },
  { id: "first", label: "First timer", icon: UserPlusIcon },
];

const NEXT_LABEL: Record<Mode, string> = {
  scan: "Scan next student",
  lookup: "Look up another student",
  first: "Register another student",
};

/** Adds students to one batch: scan a QR, look someone up by phone or email, or register a first timer. */
export function AttendanceStation({ batchId, programs }: { batchId: string; programs: Program[] }) {
  const [mode, setMode] = useState<Mode>("scan");
  const [outcome, setOutcome] = useState<AttendanceOutcome | null>(null);
  // Bumping the key remounts a panel (restarts the camera / clears the form).
  const [panelKey, setPanelKey] = useState(0);

  const next = useCallback(() => {
    setOutcome(null);
    setPanelKey((k) => k + 1);
  }, []);

  const handleOutcome = useCallback((o: AttendanceOutcome) => setOutcome(o), []);

  return (
    <div>
      <div role="tablist" aria-label="How to add a student" className="mx-auto mb-6 grid max-w-md grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => {
              setMode(m.id);
              setOutcome(null);
              setPanelKey((k) => k + 1);
            }}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs font-semibold transition-colors sm:flex-row sm:justify-center sm:gap-2 sm:text-sm",
              mode === m.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <m.icon className="size-4" />
            {m.label}
          </button>
        ))}
      </div>

      {outcome ? (
        <OutcomeCard outcome={outcome} onNext={next} nextLabel={NEXT_LABEL[mode]} />
      ) : mode === "scan" ? (
        <QrScanPanel key={panelKey} batchId={batchId} onOutcome={handleOutcome} onUseLookup={() => setMode("lookup")} />
      ) : mode === "lookup" ? (
        <LookupPanel key={panelKey} batchId={batchId} onOutcome={handleOutcome} />
      ) : (
        <FirstTimerForm key={panelKey} batchId={batchId} programs={programs} onRegistered={handleOutcome} />
      )}
    </div>
  );
}
