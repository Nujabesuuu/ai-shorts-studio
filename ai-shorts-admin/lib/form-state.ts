export type FormState = {
  error: string | null;
  values?: Record<string, string>;
};

export const initialFormState: FormState = { error: null };
