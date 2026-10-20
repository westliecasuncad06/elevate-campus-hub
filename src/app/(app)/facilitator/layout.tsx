import { requireRole } from "@/lib/auth";

export default async function FacilitatorLayout({ children }: { children: React.ReactNode }) {
  await requireRole("facilitator");
  return children;
}
