"use client";

import { PlusIcon } from "lucide-react";
import { FormDialog } from "@/components/form-dialog";
import { Field, FormSelect, type Option } from "@/components/forms";
import { inviteStaffAction } from "@/app/actions/accounts";
import { ROLE_LABEL } from "@/lib/roles";
import type { Role } from "@/lib/types";

/**
 * "Add facilitator" / "Add campus head" / (Super Admin only) "Invite student by email": just an email. They register
 * themselves with the 6-digit code they are sent.
 */
export function InviteStaffDialog({ role, campuses }: { role: "campus_head" | "facilitator" | "student"; campuses?: Option[] }) {
  const label = ROLE_LABEL[role as Role].toLowerCase();
  const isStudent = role === "student";

  return (
    <FormDialog
      action={inviteStaffAction.bind(null, role)}
      title={isStudent ? "Invite a student by email" : `Add ${label}`}
      description={
        isStudent
          ? "Just their email. They get an invitation with a registration code, and fill in their own name, course, year level and other details when they register. If their name is on the campus roster, they are matched to it."
          : "Just their email. They get an invitation with a registration code, and fill in their own name and details when they register."
      }
      submitLabel="Send invitation"
      pendingLabel="Sending invitation…"
      triggerLabel={isStudent ? "Invite student by email" : `Add ${label}`}
      triggerIcon={<PlusIcon />}
    >
      <div className="grid gap-4">
        {campuses ? <FormSelect label="Campus" name="campus_id" options={campuses} placeholder="Select a campus" required /> : null}
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="off"
          placeholder="name@example.com"
          hint="The code is sent here, so use an email they can open."
          required
          autoFocus
        />
      </div>
    </FormDialog>
  );
}
