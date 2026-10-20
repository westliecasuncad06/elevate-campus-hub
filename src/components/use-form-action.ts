"use client";

import { startTransition, useActionState, useCallback } from "react";
import type { ActionResult } from "@/lib/types";

/**
 * Like useActionState, but wired through onSubmit instead of the form's `action` prop.
 * React 19 clears every uncontrolled input after a form `action` finishes, even when the server
 * answered with an error, which would wipe what someone just typed. Submitting through onSubmit
 * keeps the inputs as they are, so people only fix the one thing that was wrong.
 *
 * Usage: const { state, pending, formProps } = useFormAction(serverAction);
 *        <form {...formProps}> ... <SubmitButton pending={pending} /> </form>
 */
export function useFormAction<T = undefined>(
  action: (prev: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>,
) {
  const [state, dispatch, pending] = useActionState(action, null);

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      startTransition(() => dispatch(data));
    },
    [dispatch],
  );

  return { state, pending, formProps: { onSubmit } };
}
