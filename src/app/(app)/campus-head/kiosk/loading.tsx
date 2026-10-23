import { ElevateLoader } from "@/components/elevate-loader";

export default function KioskLoading() {
  return (
    <div className="grid min-h-[32rem] place-items-center rounded-3xl border bg-background px-4 py-10">
      <ElevateLoader label="Getting the kiosk ready" />
    </div>
  );
}
