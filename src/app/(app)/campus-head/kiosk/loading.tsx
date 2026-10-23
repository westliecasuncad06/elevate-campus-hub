import { KioskLoader } from "@/components/kiosk/kiosk-loader";

export default function KioskLoading() {
  return (
    <div className="grid min-h-[32rem] place-items-center rounded-3xl border bg-background px-4 py-10">
      <KioskLoader label="Getting the kiosk ready" />
    </div>
  );
}
