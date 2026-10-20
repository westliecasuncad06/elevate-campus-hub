import { Badge } from "@/components/ui/badge";
import type { Profile } from "@/lib/types";

/** Active / Pending invitation / Deactivated, in one place so every list agrees. */
export function AccountStatusBadge({
  profile,
}: {
  profile: Pick<Profile, "is_active" | "invitation_accepted_at" | "role">;
}) {
  if (!profile.is_active) return <Badge variant="outline">Deactivated</Badge>;
  if (!profile.invitation_accepted_at) {
    return <Badge className="bg-brand/25 text-brand-ink hover:bg-brand/25">Pending invitation</Badge>;
  }
  return <Badge variant="secondary">Active</Badge>;
}

export function isPending(profile: Pick<Profile, "invitation_accepted_at" | "is_active">) {
  return profile.is_active && !profile.invitation_accepted_at;
}
