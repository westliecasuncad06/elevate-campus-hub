import { requireRole } from "@/lib/auth";

export default async function CampusHeadLayout({ children }: { children: React.ReactNode }) {
  await requireRole("campus_head");
  return children;
}
