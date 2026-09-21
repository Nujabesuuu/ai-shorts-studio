import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { deleteProject } from "@/app/actions/projects";
import { deleteTrend } from "@/app/actions/day1";
import { deleteTopic, setTopicStatus } from "@/app/actions/day2";
import DeleteButton from "@/components/DeleteButton";
import Markdown from "@/components/Markdown";
import { EmptyState, Hashtags, PageHeader, Section } from "@/components/ui";
import {
  TONE_TEXT,
  clock,
  contentStatusBadge,
  contentStatusLabel,
  formatBadge,
  formatDateTime,
  num,
  parseScript,
  platformBadge,
  plural,
  scoreTone,
  statusBadge,
  statusLabel,
  type Day1Trend,
  type Day2Topic,
  type Day3Content,
  type Project,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createClient();

  const [projectRes, trendsRes, topicsRes, contentRes] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle<Project>(),
    supabase
      .from("day1_trends")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .returns<Day1Trend[]>(),
    supabase
      .from("day2_topics")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .returns<Day2Topic[]>(),
    supabase
      .from("day3_content")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .returns<Day3Content[]>(),
  ]);

  if (projectRes.error) throw new Error(projectRes.error.message);
  if (!projectRes.data) notFound();
  if (trendsRes.error) throw new Error(trendsRes.error.message);
  if (topicsRes.error) throw new Error(topicsRes.error.message);
  if (contentRes.error) throw new Error(contentRes.error.message);

  const project = projectRes.data;
  const trends = trendsRes.data ?? [];
  const topics = topicsRes.data ?? [];
  const content = contentRes.data ?? [];
  const trendTitles = new Map(trends.map((t) => [t.id, t.title]));
  const topicTitles = new Map(topics.map((t) => [t.id, t.title]));
  const approved = topics.filter((t) => t.status === "approved").length;
  const contentScores = content
    .map((c) => num(c.quality_score))
    .filter((n): n is number => n != null);
  const contentAvg = contentScores.length
    ? Math.round((contentScores.reduce((a, b) => a + b, 0) / contentScores.length) * 10) / 10
    : null;

  return (
    <>
      <PageHeader
        backHref="/"
        eyebrow="проєкт"
        title={project.niche}
        subtitle={
          <span className="mono text-[12px] text-lo">
            {project.id} · створено {formatDateTime(project.created_at)}
          </span>
        }
        actions={
          <>
            <Link href={`/projects/${project.id}/edit`} className="btn btn-ghost">
              Редагувати
            </Link>
            <DeleteButton
              action={deleteProject.bind(null, project.id)}
              label="Видалити проєкт"
              confirmLabel="Так, видалити"
            />
          </>
        }
      />

      {/* смуга прогресу пайплайну */}
      <div className="rise card mb-10 grid gap-px overflow-hidden bg-line sm:grid-cols-3">
        {[
          {
            step: "01",
            label: "Day 1 · Дослідження",
            value: trends.length,
            unit: plural(trends.length, "тренд", "тренди", "трендів"),
            done: trends.length > 0,
          },
          {
            step: "02",
            label: "Day 2 · Теми",
            value: topics.length,
            unit: plural(topics.length, "тема", "теми", "тем"),
            done: topics.length > 0,
          },
          {
            step: "03",
            label: "HITL · Затверджено",
            value: approved,
            unit: `з ${topics.length}`,
            done: topics.length > 0 && approved === topics.length,
          },
        ].map((s) => (
          <div key={s.step} className="bg-surface px-5 py-4">
            <div className="flex items-center justify-between">
              <p className="eyebrow">
                {s.step} — {s.label}
              </p>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  s.done ? "bg-accent" : "bg-surface-3"
                }`}
              />
            </div>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="display text-[24px] leading-none tabular-nums text-hi">
                {s.value}
              </span>
              <span className="text-[12.5px] text-lo">{s.unit}</span>
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-12">
        {/* ---------------- Day 1 ---------------- */}
        <Section
          index="01"
          title="Day 1 · Тренди"
          meta={`${trends.length} ${plural(trends.length, "запис", "записи", "записів")}`}
          delay={80}
          actions={
            <Link
              href={`/projects/${project.id}/day1/new`}
              className="btn btn-ghost btn-sm"
            >
              + Додати тренд
            </Link>
          }
        >
          {trends.length === 0 ? (
            <EmptyState
              title="Трендів ще немає"
              hint="Додайте перший тренд вручну або дочекайтесь запису з пайплайну Day 1."
              action={
                <Link
                  href={`/projects/${project.id}/day1/new`}
                  className="btn btn-primary"
                >
                  + Додати тренд
                </Link>
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {trends.map((trend) => (
                <article
                  key={trend.id}
                  className="card card-hover flex flex-col overflow-hidden"
                >
                  <div className="flex-1 p-5">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span
                        className={`badge badge-dot ${platformBadge(trend.platform)}`}
                      >
                        {trend.platform}
                      </span>
                      <span className="mono text-[10.5px] text-lo">
                        {formatDateTime(trend.created_at)}
                      </span>
                    </div>

                    <h3 className="display text-[16px] leading-snug text-hi">
                      {trend.title}
                    </h3>

                    {trend.format && (
                      <p className="mono mt-2.5 text-[11.5px] leading-relaxed text-mid">
                        {trend.format}
                      </p>
                    )}

                    {trend.hook_idea && (
                      <blockquote className="mt-4 border-l-2 border-accent/60 bg-accent-soft/40 py-2 pl-3.5 pr-3 text-[13.5px] italic leading-relaxed text-hi">
                        {trend.hook_idea}
                      </blockquote>
                    )}

                    {trend.description && (
                      <Markdown className="mt-4 text-[13px]">
                        {trend.description}
                      </Markdown>
                    )}

                    <div className="mt-4">
                      <Hashtags tags={trend.hashtags} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-line bg-canvas-2 px-5 py-2.5">
                    <span className="mono truncate text-[10.5px] text-lo">
                      run {trend.run_id.slice(0, 8)}
                    </span>
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/projects/${project.id}/day1/${trend.id}/edit`}
                        className="btn btn-quiet"
                      >
                        Змінити
                      </Link>
                      <DeleteButton
                        action={deleteTrend.bind(null, project.id, trend.id)}
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Section>

        {/* ---------------- Day 2 ---------------- */}
        <Section
          index="02"
          title="Day 2 · Теми"
          meta={`затверджено ${approved} з ${topics.length}`}
          delay={140}
          actions={
            <Link
              href={`/projects/${project.id}/day2/new`}
              className="btn btn-ghost btn-sm"
            >
              + Додати тему
            </Link>
          }
        >
          {topics.length === 0 ? (
            <EmptyState
              title="Тем ще немає"
              hint="Тема Day 2 виростає з тренду Day 1 і проходить ручне затвердження."
              action={
                <Link
                  href={`/projects/${project.id}/day2/new`}
                  className="btn btn-primary"
                >
                  + Додати тему
                </Link>
              }
            />
          ) : (
            <div className="space-y-4">
              {topics.map((topic) => (
                <article key={topic.id} className="card card-hover overflow-hidden">
                  <div className="p-5 sm:p-6">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className={`badge badge-dot ${statusBadge(topic.status)}`}>
                        {statusLabel(topic.status)}
                      </span>
                      {topic.platform && (
                        <span
                          className={`badge badge-dot ${platformBadge(topic.platform)}`}
                        >
                          {topic.platform}
                        </span>
                      )}
                      <span className="mono text-[10.5px] text-lo">
                        {formatDateTime(topic.created_at)}
                      </span>
                    </div>

                    <h3 className="display max-w-3xl text-[18px] leading-snug text-hi">
                      {topic.title}
                    </h3>

                    {topic.text && (
                      <Markdown className="mt-3.5 max-w-3xl">{topic.text}</Markdown>
                    )}

                    {topic.source_trend_id && (
                      <p className="mt-4 text-[12.5px] text-lo">
                        <span className="eyebrow mr-2">джерело</span>
                        <span className="text-mid">
                          {trendTitles.get(topic.source_trend_id) ??
                            topic.source_trend_id.slice(0, 8)}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas-2 px-5 py-2.5 sm:px-6">
                    <div className="flex items-center gap-1.5">
                      {topic.status !== "approved" && (
                        <form
                          action={setTopicStatus.bind(
                            null,
                            project.id,
                            topic.id,
                            "approved",
                          )}
                        >
                          <button type="submit" className="btn btn-primary btn-sm">
                            Затвердити
                          </button>
                        </form>
                      )}
                      {topic.status !== "rejected" && (
                        <form
                          action={setTopicStatus.bind(
                            null,
                            project.id,
                            topic.id,
                            "rejected",
                          )}
                        >
                          <button type="submit" className="btn btn-quiet">
                            Відхилити
                          </button>
                        </form>
                      )}
                      {topic.status === "approved" && (
                        <form
                          action={setTopicStatus.bind(
                            null,
                            project.id,
                            topic.id,
                            "pending",
                          )}
                        >
                          <button type="submit" className="btn btn-quiet">
                            Повернути на розгляд
                          </button>
                        </form>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Link
                        href={`/projects/${project.id}/day2/${topic.id}/edit`}
                        className="btn btn-quiet"
                      >
                        Змінити
                      </Link>
                      <DeleteButton
                        action={deleteTopic.bind(null, project.id, topic.id)}
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Section>

        {/* ---------------- Day 3 ---------------- */}
        <Section
          index="03"
          title="Day 3 · Контент"
          meta={
            content.length
              ? `середній бал ${contentAvg ?? "—"} · готово ${
                  content.filter((c) => c.status === "ready").length
                } з ${content.length}`
              : undefined
          }
          delay={210}
          actions={
            <Link
              href={`/projects/${project.id}/day3/new`}
              className="btn btn-ghost btn-sm"
            >
              + Додати контент
            </Link>
          }
        >
          {content.length === 0 ? (
            <EmptyState
              title="Контенту ще немає"
              hint="Одиниці Day 3 зʼявляться тут автоматично після прогону флоу — панель читає ту саму таблицю day3_content."
              action={
                <Link
                  href={`/projects/${project.id}/day3/new`}
                  className="btn btn-primary"
                >
                  + Додати контент
                </Link>
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {content.map((item) => {
                const score = num(item.quality_score);
                const frames = parseScript(item.script).length;
                const chain =
                  (item.topic_id && topicTitles.get(item.topic_id)) ||
                  (item.source_trend_id && trendTitles.get(item.source_trend_id)) ||
                  null;

                return (
                  <Link
                    key={item.id}
                    href={`/content/${item.id}`}
                    className="card card-hover block p-5"
                  >
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className={`badge badge-dot ${formatBadge(item.format)}`}>
                        {item.format}
                      </span>
                      <span className={`badge ${contentStatusBadge(item.status)}`}>
                        {contentStatusLabel(item.status)}
                      </span>
                      {item.repaired && (
                        <span className="badge badge-neutral">ремонт</span>
                      )}
                      <span
                        className={`mono ml-auto text-[15px] tabular-nums ${
                          TONE_TEXT[scoreTone(score)]
                        }`}
                      >
                        {score ?? "—"}
                      </span>
                    </div>

                    <h3 className="text-[15px] font-medium leading-snug text-hi">
                      {item.title}
                    </h3>

                    {item.hook && (
                      <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-mid">
                        «{item.hook}»
                      </p>
                    )}

                    <div className="mono mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-lo">
                      <span>
                        {frames} {plural(frames, "кадр", "кадри", "кадрів")}
                      </span>
                      {item.duration_sec ? <span>{clock(item.duration_sec)}</span> : null}
                      {item.flow_version ? <span>{item.flow_version}</span> : null}
                      <span className="ml-auto">{formatDateTime(item.created_at)}</span>
                    </div>

                    {chain && (
                      <p className="mt-3 truncate border-t border-line pt-3 text-[12px] text-lo">
                        ← {chain}
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
