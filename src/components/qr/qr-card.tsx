"use client";

import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { DownloadIcon } from "lucide-react";
import { LogoMark } from "@/components/brand";
import { Button } from "@/components/ui/button";

/** The student's personal attendance card: their QR token, with a PNG download for printing or saving. */
export function QrCard({
  token,
  name,
  detail,
  campusName,
}: {
  token: string;
  name: string;
  detail: string;
  campusName: string;
}) {
  const wrapper = useRef<HTMLDivElement>(null);

  function download() {
    const canvas = wrapper.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${name.replace(/\s+/g, "-")}-QR.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-3xl border bg-card shadow-sm">
      <div className="flex items-center gap-3 bg-sidebar px-5 py-4 text-white">
        <LogoMark className="h-8" />
        <div className="leading-tight">
          <p className="display text-base">Elevate</p>
          <p className="mt-0.5 text-xs text-white/65">{campusName}</p>
        </div>
      </div>

      <div className="px-6 pt-6 pb-2 text-center">
        <p className="text-2xl font-bold tracking-tight text-balance">{name}</p>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </div>

      <div ref={wrapper} className="mx-auto w-64 rounded-2xl bg-white p-3">
        {/* Rendered at 512px for a crisp download, scaled down on screen. */}
        <QRCodeCanvas
          value={token}
          size={512}
          level="M"
          marginSize={2}
          fgColor="#0A0A0A"
          bgColor="#FFFFFF"
          style={{ width: "100%", height: "auto" }}
          aria-label="Your attendance QR code"
        />
      </div>

      <div className="grid gap-3 px-6 pt-3 pb-6">
        <p className="text-center text-sm text-muted-foreground">Show this code to a facilitator when you arrive.</p>
        <Button variant="outline" onClick={download}>
          <DownloadIcon />
          Download QR card
        </Button>
      </div>
    </div>
  );
}
