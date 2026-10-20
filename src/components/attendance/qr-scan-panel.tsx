"use client";

import { useRef, useState } from "react";
import { Scanner, type IDetectedBarcode, type IScannerError } from "@yudiel/react-qr-scanner";
import { CameraOffIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addToBatchByQrAction, type AttendanceOutcome } from "@/app/actions/attendance";

const CAMERA_HELP: Record<string, string> = {
  "permission-denied": "Camera access is blocked. Allow the camera for this site in your browser settings, then reload.",
  "no-camera": "No camera was found on this device.",
  "in-use": "Another app is using the camera. Close it and try again.",
  "insecure-context": "The camera only works on a secure (https) page.",
};

/** Camera viewfinder. Reports a successful mark through onOutcome; shows quick errors inline. */
export function QrScanPanel({
  batchId,
  onOutcome,
  onUseLookup,
}: {
  batchId: string;
  onOutcome: (outcome: AttendanceOutcome) => void;
  onUseLookup: () => void;
}) {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  function handleScan(codes: IDetectedBarcode[]) {
    const value = codes[0]?.rawValue;
    if (!value || busy.current) return;
    busy.current = true;
    setPending(true);
    setScanError(null);

    addToBatchByQrAction(batchId, value)
      .then((result) => {
        if (result.ok && result.data) {
          navigator.vibrate?.(60);
          onOutcome(result.data);
        } else if (!result.ok) {
          setScanError(result.error);
          // Keep scanning, but not so fast that one bad code spams the server.
          setTimeout(() => (busy.current = false), 2500);
        }
      })
      .catch(() => {
        setScanError("Couldn't reach the server. Check your connection and try again.");
        setTimeout(() => (busy.current = false), 2500);
      })
      .finally(() => setPending(false));
  }

  function handleError(error: IScannerError) {
    setCameraError(CAMERA_HELP[error.kind] ?? error.message);
  }

  if (cameraError) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl border border-dashed bg-card p-8 text-center">
        <CameraOffIcon className="size-10 text-muted-foreground" />
        <p className="font-medium">The camera isn&apos;t available</p>
        <p className="text-sm text-muted-foreground">{cameraError}</p>
        <Button onClick={onUseLookup}>Look up by phone or email</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-foreground">
        <Scanner
          onScan={handleScan}
          onError={handleError}
          formats={["qr_code"]}
          constraints={{ facingMode: "environment" }}
          components={{ finder: false }}
          scanDelay={400}
          styles={{ container: { width: "100%", height: "100%" }, video: { objectFit: "cover" } }}
        />

        {/* Viewfinder: red corners and a sweeping line. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-8">
          <span className="absolute top-0 left-0 size-10 rounded-tl-2xl border-t-4 border-l-4 border-brand" />
          <span className="absolute top-0 right-0 size-10 rounded-tr-2xl border-t-4 border-r-4 border-brand" />
          <span className="absolute bottom-0 left-0 size-10 rounded-bl-2xl border-b-4 border-l-4 border-brand" />
          <span className="absolute right-0 bottom-0 size-10 rounded-br-2xl border-r-4 border-b-4 border-brand" />
          <span
            className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-brand shadow-[0_0_12px_var(--brand)]"
            style={{ animation: "scan-sweep 2.4s ease-in-out infinite" }}
          />
        </div>

        {pending ? (
          <div className="absolute inset-0 flex items-center justify-center bg-foreground/60 text-background">
            <Loader2Icon className="size-8 animate-spin" />
            <span className="sr-only">Checking the code…</span>
          </div>
        ) : null}
      </div>

      <p className="mt-4 min-h-10 text-center text-sm text-muted-foreground" role={scanError ? "alert" : undefined}>
        {scanError ? <span className="font-medium text-destructive">{scanError}</span> : "Hold the student's QR card inside the frame."}
      </p>
    </div>
  );
}
