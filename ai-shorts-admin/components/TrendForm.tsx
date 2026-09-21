"use client";

import { useActionState } from "react";
import { createTrend, updateTrend } from "@/app/actions/day1";
import { initialFormState } from "@/lib/form-state";
import { PLATFORMS, hashtagsToInput, type Day1Trend } from "@/lib/db";
import FormFrame, { Field } from "./FormFrame";

export default function TrendForm({
  projectId,
  projectNiche,
  record,
}: {
  projectId: string;
  projectNiche: string;
  record?: Day1Trend;
}) {
  const action = record
    ? updateTrend.bind(null, projectId, record.id)
    : createTrend.bind(null, projectId);

  const [state, formAction, pending] = useActionState(action, initialFormState);
  const v = state.values;

  return (
    <form action={formAction}>
      <FormFrame
        error={state.error}
        pending={pending}
        submitLabel={record ? "Зберегти зміни" : "Додати тренд"}
        cancelHref={`/projects/${projectId}`}
        aside={
          <div className="card p-5">
            <p className="eyebrow mb-3">day 1 · research</p>
            <p className="text-[13px] leading-relaxed text-mid">
              Один рядок таблиці{" "}
              <span className="mono text-[12px] text-hi">day1_trends</span> — це
              один тренд. Пізніше на нього можна послатися з теми Day&nbsp;2.
            </p>
            {record && (
              <p className="mono mt-4 break-all text-[11px] text-lo">
                id: {record.id}
              </p>
            )}
          </div>
        }
      >
        <Field name="title" label="Назва тренду">
          <input
            id="title"
            name="title"
            type="text"
            required
            autoFocus
            defaultValue={v?.title ?? record?.title ?? ""}
            placeholder="Payoff-first demo in frame one"
            className="field"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="niche" label="Ніша">
            <input
              id="niche"
              name="niche"
              type="text"
              required
              defaultValue={v?.niche ?? record?.niche ?? projectNiche}
              className="field"
            />
          </Field>

          <Field name="platform" label="Платформа">
            <select
              id="platform"
              name="platform"
              required
              defaultValue={v?.platform ?? record?.platform ?? "tiktok"}
              className="field"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          name="format"
          label="Формат"
          hint="Хронометраж, спосіб зйомки, монтаж."
        >
          <input
            id="format"
            name="format"
            type="text"
            defaultValue={v?.format ?? record?.format ?? ""}
            placeholder="tiktok · 12-18s, субтитри обов'язково"
            className="field"
          />
        </Field>

        <Field name="hook_idea" label="Ідея хука">
          <textarea
            id="hook_idea"
            name="hook_idea"
            rows={2}
            defaultValue={v?.hook_idea ?? record?.hook_idea ?? ""}
            placeholder="Перші 3 секунди, які зупиняють скрол"
            className="field"
          />
        </Field>

        <Field
          name="description"
          label="Опис і джерело"
          hint="Чому формат працює + посилання на джерело. Підтримується markdown."
        >
          <textarea
            id="description"
            name="description"
            rows={6}
            defaultValue={v?.description ?? record?.description ?? ""}
            className="field"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            name="hashtags"
            label="Хештеги"
            hint="Через пробіл або кому; решітка не обов'язкова."
          >
            <input
              id="hashtags"
              name="hashtags"
              type="text"
              defaultValue={v?.hashtags ?? hashtagsToInput(record?.hashtags ?? null)}
              placeholder="#saas #buildinpublic"
              className="field"
            />
          </Field>

          <Field
            name="run_id"
            label="Run ID"
            hint="Порожньо → згенерується автоматично."
          >
            <input
              id="run_id"
              name="run_id"
              type="text"
              defaultValue={v?.run_id ?? record?.run_id ?? ""}
              placeholder="uuid запуску пайплайну"
              className="field mono text-[12.5px]"
            />
          </Field>
        </div>
      </FormFrame>
    </form>
  );
}
