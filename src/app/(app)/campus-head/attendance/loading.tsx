import { ElevateLoader } from "@/components/elevate-loader";

/** Shown inside the page (the menu and header stay put) while the attendance sheet is being opened. */
export default function AttendanceLoading() {
  return (
    <div className="grid min-h-[28rem] place-items-center rounded-xl border bg-card px-4 py-10">
      <ElevateLoader label="Loading attendance" />
    </div>
  );
}
