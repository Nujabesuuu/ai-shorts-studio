"use client";

import { useActionState } from "react";
import { createTopic, updateTopic } from "@/app/actions/day2";
import { initialFormState } from "@/lib/form-state";
import {
  PLATFORMS,
  TOPIC_STATUSES,
  statusLabel,
  type Day1Trend,
  type Day2Topic,
} from "@/lib/db";
import FormFrame, { Field } from "./FormFrame";

export default function TopicForm({
  projectId,
  projectNiche,
  trends,
  record,
}: {
  projectId: string;
  projectNiche: string;
  trends: Pick<Day1Trend, "id" | "title">[];
  record?: Day2Topic;
}) {
  const action = record
    ? updateTopic.bind(null, projectId, record.id)
    : createTopic.bind(null, projectId);

  const [state, formAction, pending] = useActionState(action, initialFormState);
  const v = state.values;

  return (
    <form action={formAction}>
      <FormFrame
        error={state.error}
        pending={pending}
        submitLabel={record ? "Зберегти зміни" : "Додати тему"}
        cancelHref={`/projects/${projectId}`}
        aside={
          <div className="card p-5">
            <p className="eyebrow mb-3">day 2 · hitl</p>
            <p className="text-[13px] leading-relaxed text-mid">
              Тема проходить ручний гейт: статус{" "}
              <span className="text-amber">На розгляді</span> →{" "}
              <span className="text-emerald">Затверджено</span>. Затверджувати
              можна прямо з картки проєкту.
            </p>
            {record && (
              <p className="mono mt-4 break-all text-[11px] text-lo">
                id: {record.id}
              </p>
            )}
          </div>
        }
      >
        <Field name="title" label="Назва теми">
          <input
            id="title"
            name="title"
            type="text"
            required
            autoFocus
            defaultValue={v?.title ?? record?.title ?? ""}
            placeholder="Як показати результат SaaS у першій секунді"
            className="field"
          />
        </Field>

        <Field
          name="text"
          label="Сценарний опис"
          hint="Хук, хронометраж, що в кадрі. Підтримується markdown: **жирний**, списки, посилання."
        >
          <textarea
            id="text"
            name="text"
            rows={8}
            defaultValue={v?.text ?? record?.text ?? ""}
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

        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="status" label="Статус">
            <select
              id="status"
              name="status"
              required
              defaultValue={v?.status ?? record?.status ?? "pending"}
              className="field"
            >
              {TOPIC_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </Field>

          <Field
            name="source_trend_id"
            label="Тренд-джерело"
            hint="Тренд Day 1, з якого виросла тема."
          >
            <select
              id="source_trend_id"
              name="source_trend_id"
              defaultValue={v?.source_trend_id ?? record?.source_trend_id ?? ""}
              className="field"
            >
              <option value="">— без джерела —</option>
              {trends.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
        </div>

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
      </FormFrame>
    </form>
  );
}
