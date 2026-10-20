"use client";

import { useCallback, useEffect, useState } from "react";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormMessage, FormSelect, SubmitButton, type Option } from "@/components/forms";
import { useFormAction } from "@/components/use-form-action";
import { updateUserAction } from "@/app/actions/users";
import { AccountFields } from "./account-fields";
import { ROLE_LABEL } from "@/lib/roles";
import type { Program, Role } from "@/lib/types";

/** Just what the form needs about a person (a whole profile row stays on the server). */
export interface EditablePerson {
  id: string;
  role: Role;
  campus_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  gender: string | null;
  birthday: string | null;
  church: string | null;
  religion: string | null;
  program_id: string | null;
  course: string | null;
  year_level: number | null;
  student_number: string | null;
  /** A facilitator's other campuses (besides campus_id). */
  extra_campus_ids: string[];
}

const STAFF_ROLES: Option[] = (["campus_head", "facilitator"] as const).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

/** Super Admin: edit a person's details, campus and (for staff) role. */
export function EditUserDialog({
  person,
  campuses,
  programsByCampus,
}: {
  person: EditablePerson;
  campuses: Option[];
  programsByCampus: Record<string, Program[]>;
}) {
  const [open, setOpen] = useState(false);
  // Remount the form each time the dialog opens so it starts from what is saved.
  const [formKey, setFormKey] = useState(0);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <PencilIcon />
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <EditForm key={formKey} person={person} campuses={campuses} programsByCampus={programsByCampus} onDone={close} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditForm({
  person,
  campuses,
  programsByCampus,
  onDone,
}: {
  person: EditablePerson;
  campuses: Option[];
  programsByCampus: Record<string, Program[]>;
  onDone: () => void;
}) {
  const { state, pending, formProps } = useFormAction(updateUserAction.bind(null, person.id));
  // The page refreshes with the saved values the moment the save succeeds, while this form is still on screen. Keep what
  // the form started from, so its inputs aren't handed new defaults mid-flight (the dialog reopens with fresh ones).
  const [initial] = useState(person);
  const [role, setRole] = useState<Role>(initial.role);
  const isStaff = initial.role === "campus_head" || initial.role === "facilitator";
  const isSuperAdmin = initial.role === "super_admin";

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Saved.");
      onDone();
    }
  }, [state, onDone]);

  return (
    <form {...formProps} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>
          Edit {initial.first_name} {initial.last_name}
        </DialogTitle>
        <DialogDescription>
          {isSuperAdmin
            ? "A Super Admin works across every campus, so there is no campus or role to change."
            : "Change their details, the campus they belong to, or (for staff) their role."}
        </DialogDescription>
      </DialogHeader>

      {isStaff ? (
        <FormSelect
          label="Role"
          name="role"
          options={STAFF_ROLES}
          defaultValue={initial.role}
          onValueChange={(value) => setRole(value as Role)}
          className="sm:max-w-xs"
        />
      ) : null}

      <AccountFields
        role={role}
        mode="edit"
        campuses={isSuperAdmin ? undefined : campuses}
        programsByCampus={programsByCampus}
        defaults={initial}
      />

      {!isSuperAdmin ? (
        <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
          Moving someone to another campus, or changing their role, ends their current student assignments (a facilitator
          keeps the students at every campus they still work at). They need to have no open batch first. Their past
          attendance stays with the campus where it happened.
        </p>
      ) : null}

      <FormMessage state={state?.ok ? null : state} />
      <DialogFooter>
        <SubmitButton pending={pending} pendingText="Saving…">
          Save changes
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}
