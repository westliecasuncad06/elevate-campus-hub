import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/landing";
import { getSessionProfile } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/roles";

export const metadata: Metadata = {
  title: { absolute: "Elevate Campus Hub · Change the campus one student at a time" },
};

// Visitors see the front page; signed-in people go straight to their own home.
export default async function Home() {
  const profile = await getSessionProfile();
  if (profile) redirect(ROLE_HOME[profile.role]);
  return <Landing />;
}
