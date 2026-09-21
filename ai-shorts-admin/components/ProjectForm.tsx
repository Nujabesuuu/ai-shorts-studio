"use client";

import { useActionState } from "react";
import { createProject, updateProject } from "@/app/actions/projects";
import { initialFormState } from "@/lib/form-state";
import type { Project } from "@/lib/db";
import FormFrame, { Field } from "./FormFrame";

export default function ProjectForm({ project }: { project?: Project }) {
  const action = project
    ? updateProject.bind(null, project.id)
    : createProject;

  const [state, formAction, pending] = useActionState(action, initialFormState);

  return (
    <form action={formAction}>
      <FormFrame
        error={state.error}
        pending={pending}
        submitLabel={project ? "Зберегти зміни" : "Створити проєкт"}
        cancelHref={project ? `/projects/${project.id}` : "/"}
        aside={
          <div className="card p-5">
            <p className="eyebrow mb-3">що це</p>
            <p className="text-[13px] leading-relaxed text-mid">
              Проєкт — це ніша, навколо якої будується пайплайн. До нього
              прив&apos;язуються тренди Day&nbsp;1 і теми Day&nbsp;2.
            </p>
            {project && (
              <p className="mono mt-4 break-all text-[11px] text-lo">
                id: {project.id}
              </p>
            )}
          </div>
        }
      >
        <Field
          name="niche"
          label="Ніша"
          hint="Наприклад: «спешелті-кав'ярня в Києві» або «SaaS / IT-продукт»."
        >
          <input
            id="niche"
            name="niche"
            type="text"
            required
            autoFocus
            maxLength={200}
            defaultValue={state.values?.niche ?? project?.niche ?? ""}
            placeholder="Опишіть нішу проєкту"
            className="field"
          />
        </Field>
      </FormFrame>
    </form>
  );
}
