"use client";

import { useActionState, useEffect, useState } from "react";
import { initialFormState, type FormState } from "@/lib/form-state";

type DeleteAction = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * Двокрокове видалення: перший клік розкриває підтвердження, другий — виконує.
 * Помилка (наприклад, FK-залежність) показується поруч, а не 500-ю сторінкою.
 */
export default function DeleteButton({
  action,
  label = "Видалити",
  confirmLabel = "Підтвердити",
}: {
  action: DeleteAction;
  label?: string;
  confirmLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {state.error && (
        <span className="max-w-[320px] text-right text-[12px] leading-snug text-rose">
          {state.error}
        </span>
      )}
      {armed ? (
        <form action={formAction} className="flex items-center gap-1">
          <button
            type="submit"
            disabled={pending}
            className="btn btn-sm bg-rose/15 text-rose"
          >
            {pending ? "…" : confirmLabel}
          </button>
          <button
            type="button"
            onClick={() => setArmed(false)}
            className="btn btn-quiet"
          >
            Скасувати
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setArmed(true)} className="btn btn-danger">
          {label}
        </button>
      )}
    </div>
  );
}
