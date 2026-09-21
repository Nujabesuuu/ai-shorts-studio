"use client";

import { useActionState } from "react";
import { createContent, updateContent } from "@/app/actions/day3";
import { initialFormState } from "@/lib/form-state";
import {
  CONTENT_FORMATS,
  CONTENT_STATUSES,
  FLOW_VERSIONS,
  PLATFORMS,
  contentStatusLabel,
  hashtagsToInput,
  parseScript,
  type Day1Trend,
  type Day2Topic,
  type Day3Content,
} from "@/lib/db";
import FormFrame, { Field } from "./FormFrame";

const SCRIPT_PLACEHOLDER = `[
  {"n": 1, "t_start": 0, "t_end": 3, "visual": "крупний план портафільтра", "voiceover": "Три секунди — і ти вже знаєш, чи буде смачно"}
]`;

export default function ContentForm({
  projectId,
  projectNiche,
  topics,
  trends,
  record,
}: {
  projectId: string;
  projectNiche: string;
  topics: Pick<Day2Topic, "id" | "title">[];
  trends: Pick<Day1Trend, "id" | "title">[];
  record?: Day3Content;
}) {
  const action = record
    ? updateContent.bind(null, projectId, record.id)
    : createContent.bind(null, projectId);

  const [state, formAction, pending] = useActionState(action, initialFormState);
  const v = state.values;

  const scriptValue =
    v?.script ??
    (record ? JSON.stringify(parseScript(record.script), null, 2) : "");

  return (
    <form action={formAction}>
      <FormFrame
        error={state.error}
        pending={pending}
        submitLabel={record ? "Зберегти зміни" : "Додати контент"}
        cancelHref={record ? `/content/${record.id}` : `/projects/${projectId}`}
        aside={
          <>
            <div className="card p-5">
              <p className="eyebrow mb-3">day 3 · day3_content</p>
              <p className="text-[13px] leading-relaxed text-mid">
                Зазвичай ці рядки пише флоу. Ручне редагування потрібне, коли
                одиниця приїхала зі статусом{" "}
                <span className="text-amber">На перегляд</span> і її треба
                довести руками.
              </p>
            </div>
            <div className="card p-5">
              <p className="eyebrow mb-3">простежуваність</p>
              <p className="text-[13px] leading-relaxed text-mid">
                Привʼязка до теми Day 2 і тренду Day 1 — це не метадані, а
                критерій рубрики. Порожні поля означають, що ланцюг
                обірваний.
              </p>
              {record && (
                <p className="mono mt-4 break-all text-[11px] text-lo">
                  id: {record.id}
                </p>
              )}
            </div>
          </>
        }
      >
        <Field name="title" label="Назва">
          <input
            id="title"
            name="title"
            required
            maxLength={200}
            defaultValue={v?.title ?? record?.title ?? ""}
            className="field"
            placeholder="Ідеальний спешелті-лате за 6 кроків"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field name="format" label="Формат">
            <select
              id="format"
              name="format"
              defaultValue={v?.format ?? record?.format ?? "reels"}
              className="field"
            >
              {CONTENT_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>

          <Field name="platform" label="Платформа">
            <select
              id="platform"
              name="platform"
              defaultValue={v?.platform ?? record?.platform ?? "instagram"}
              className="field"
            >
              <option value="">—</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>

          <Field name="status" label="Статус">
            <select
              id="status"
              name="status"
              defaultValue={v?.status ?? record?.status ?? "needs_review"}
              className="field"
            >
              {CONTENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {contentStatusLabel(s)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field name="niche" label="Ніша">
          <input
            id="niche"
            name="niche"
            required
            defaultValue={v?.niche ?? record?.niche ?? projectNiche}
            className="field"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="hook" label="Хук (0-3 сек)">
            <textarea
              id="hook"
              name="hook"
              rows={2}
              defaultValue={v?.hook ?? record?.hook ?? ""}
              className="field"
              placeholder="Дослівна перша фраза"
            />
          </Field>

          <Field
            name="hook_alt"
            label="Альтернативний хук"
            hint="Інший захід на ту саму ідею — для A/B першого кадру."
          >
            <textarea
              id="hook_alt"
              name="hook_alt"
              rows={2}
              defaultValue={v?.hook_alt ?? record?.hook_alt ?? ""}
              className="field"
            />
          </Field>
        </div>

        <Field
          name="script"
          label="Сценарій (JSON)"
          hint="Масив кадрів: n, t_start, t_end, visual, voiceover. Для carousel таймкоди = 0."
        >
          <textarea
            id="script"
            name="script"
            rows={10}
            defaultValue={scriptValue}
            className="field mono text-[12px]"
            placeholder={SCRIPT_PLACEHOLDER}
            spellCheck={false}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="onscreen_text" label="Текст на екрані">
            <textarea
              id="onscreen_text"
              name="onscreen_text"
              rows={2}
              defaultValue={v?.onscreen_text ?? record?.onscreen_text ?? ""}
              className="field"
            />
          </Field>

          <Field name="cta" label="Заклик до дії">
            <textarea
              id="cta"
              name="cta"
              rows={2}
              defaultValue={v?.cta ?? record?.cta ?? ""}
              className="field"
            />
          </Field>
        </div>

        <Field name="caption" label="Підпис під публікацією">
          <textarea
            id="caption"
            name="caption"
            rows={4}
            defaultValue={v?.caption ?? record?.caption ?? ""}
            className="field"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_160px]">
          <Field
            name="hashtags"
            label="Хештеги"
            hint="Через пробіл або кому. Решітку можна не ставити."
          >
            <input
              id="hashtags"
              name="hashtags"
              defaultValue={v?.hashtags ?? hashtagsToInput(record?.hashtags ?? null)}
              className="field"
              placeholder="спешелтікава кавакиїв baristatips"
            />
          </Field>

          <Field name="duration_sec" label="Тривалість, с">
            <input
              id="duration_sec"
              name="duration_sec"
              type="number"
              min={3}
              max={900}
              defaultValue={v?.duration_sec ?? record?.duration_sec ?? ""}
              className="field"
            />
          </Field>
        </div>

        <div className="ticks opacity-25" />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="topic_id" label="Тема Day 2">
            <select
              id="topic_id"
              name="topic_id"
              defaultValue={v?.topic_id ?? record?.topic_id ?? ""}
              className="field"
            >
              <option value="">— не привʼязано —</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>

          <Field name="source_trend_id" label="Тренд Day 1">
            <select
              id="source_trend_id"
              name="source_trend_id"
              defaultValue={v?.source_trend_id ?? record?.source_trend_id ?? ""}
              className="field"
            >
              <option value="">— не привʼязано —</option>
              {trends.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            name="run_id"
            label="Run ID"
            hint="UUID прогону Dify. Порожній — згенерується автоматично."
          >
            <input
              id="run_id"
              name="run_id"
              defaultValue={v?.run_id ?? record?.run_id ?? ""}
              className="field mono text-[12.5px]"
              placeholder="автоматично"
            />
          </Field>

          <Field name="flow_version" label="Версія флоу">
            <select
              id="flow_version"
              name="flow_version"
              defaultValue={v?.flow_version ?? record?.flow_version ?? "final"}
              className="field"
            >
              <option value="">—</option>
              {FLOW_VERSIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </FormFrame>
    </form>
  );
}
