import Link from "next/link";
import { createClient } from "@/lib/supabase";
import {
  formatDate,
  formatDateTime,
  platformBadge,
  plural,
  statusBadge,
  statusLabel,
  type Day1Trend,
  type Day2Topic,
  type Project,
} from "@/lib/db";
import { EmptyState, PageHeader, Section, StatTile } from "@/components/ui";

export const dynamic = "force-dynamic";

type Counted = { count: number }[];
type ProjectRow = Project & {
  day1_trends: Counted;
  day2_topics: Counted;
};

const countOf = (rel: Counted | null) => rel?.[0]?.count ?? 0;

export default async function DashboardPage() {
  const supabase = createClient();

  const [projectsRes, trendsRes, topicsRes] = await Promise.all([
    supabase
      .from("projects")
      .select("*, day1_trends(count), day2_topics(count)")
      .order("created_at", { ascending: false })
      .returns<ProjectRow[]>(),
    supabase
      .from("day1_trends")
      .select("id, project_id, title, platform, created_at")
      .order("created_at", { ascending: false })
      .returns<Pick<Day1Trend, "id" | "project_id" | "title" | "platform" | "created_at">[]>(),
    supabase
      .from("day2_topics")
      .select("id, project_id, title, status, created_at")
      .order("created_at", { ascending: false })
      .returns<Pick<Day2Topic, "id" | "project_id" | "title" | "status" | "created_at">[]>(),
  ]);

  const error = projectsRes.error ?? trendsRes.error ?? topicsRes.error;
  if (error) throw new Error(error.message);

  const projects = projectsRes.data ?? [];
  const trends = trendsRes.data ?? [];
  const topics = topicsRes.data ?? [];
  const approved = topics.filter((t) => t.status === "approved").length;

  // розподіл трендів за платформами
  const byPlatform = trends.reduce<Record<string, number>>((acc, t) => {
    const key = t.platform ?? "—";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const platformRows = Object.entries(byPlatform).sort((a, b) => b[1] - a[1]);

  // стрічка активності
  const feed = [
    ...trends.map((t) => ({
      id: `t-${t.id}`,
      kind: "Day 1" as const,
      title: t.title,
      href: `/projects/${t.project_id}`,
      at: t.created_at,
    })),
    ...topics.map((t) => ({
      id: `p-${t.id}`,
      kind: "Day 2" as const,
      title: t.title,
      href: t.project_id ? `/projects/${t.project_id}` : "/topics",
      at: t.created_at,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);

  return (
    <>
      <PageHeader
        eyebrow="supabase · school_day1"
        title="Огляд пайплайну"
        subtitle={
          <>
            {projects.length}{" "}
            {plural(projects.length, "проєкт", "проєкти", "проєктів")} ·{" "}
            {trends.length}{" "}
            {plural(trends.length, "тренд", "тренди", "трендів")} Day 1 ·{" "}
            {topics.length} {plural(topics.length, "тема", "теми", "тем")} Day 2
          </>
        }
        actions={
          <Link href="/projects/new" className="btn btn-primary">
            + Новий проєкт
          </Link>
        }
      />

      <div className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Проєкти" value={projects.length} hint="ніші в роботі" delay={0} />
        <StatTile
          label="Тренди · Day 1"
          value={trends.length}
          hint="рядків у day1_trends"
          delay={60}
        />
        <StatTile
          label="Теми · Day 2"
          value={topics.length}
          hint="рядків у day2_topics"
          delay={120}
        />
        <StatTile
          label="Затверджено"
          value={topics.length ? `${approved}/${topics.length}` : "0"}
          hint="пройшли HITL-гейт"
          tone="accent"
          delay={180}
        />
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_318px]">
        <Section
          index="01"
          title="Проєкти"
          meta={`${projects.length} ${plural(projects.length, "запис", "записи", "записів")}`}
          delay={220}
        >
          {projects.length === 0 ? (
            <EmptyState
              title="Ще немає жодного проєкту"
              hint="Створіть нішу — і до неї можна буде додавати тренди Day 1 та теми Day 2."
              action={
                <Link href="/projects/new" className="btn btn-primary">
                  + Новий проєкт
                </Link>
              }
            />
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Ніша</th>
                      <th className="text-center">Day 1</th>
                      <th className="text-center">Day 2</th>
                      <th>Створено</th>
                      <th className="text-right">Дії</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((project) => (
                      <tr key={project.id}>
                        <td>
                          <Link
                            href={`/projects/${project.id}`}
                            className="block font-medium text-hi transition-colors hover:text-accent"
                          >
                            {project.niche}
                          </Link>
                          <span className="mono mt-1 block text-[11px] text-lo">
                            {project.id.slice(0, 8)}
                          </span>
                        </td>
                        <td className="text-center">
                          <span className="mono tabular-nums text-[13px] text-mid">
                            {countOf(project.day1_trends)}
                          </span>
                        </td>
                        <td className="text-center">
                          <span className="mono tabular-nums text-[13px] text-mid">
                            {countOf(project.day2_topics)}
                          </span>
                        </td>
                        <td className="mono text-[12.5px] text-lo">
                          {formatDate(project.created_at)}
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/projects/${project.id}`}
                              className="btn btn-quiet"
                            >
                              Відкрити
                            </Link>
                            <Link
                              href={`/projects/${project.id}/edit`}
                              className="btn btn-quiet"
                            >
                              Змінити
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Section>

        <div className="space-y-8">
          <Section index="02" title="Платформи" delay={280}>
            <div className="card p-5">
              {platformRows.length === 0 ? (
                <p className="text-[13px] text-lo">Даних ще немає.</p>
              ) : (
                <ul className="space-y-3.5">
                  {platformRows.map(([platform, count]) => (
                    <li key={platform}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className={`badge badge-dot ${platformBadge(platform)}`}>
                          {platform}
                        </span>
                        <span className="mono text-[12px] tabular-nums text-mid">
                          {count}
                        </span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className="h-full rounded-full bg-accent/70"
                          style={{ width: `${(count / trends.length) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>

          <Section index="03" title="Активність" delay={340}>
            <div className="card divide-y divide-line overflow-hidden">
              {feed.length === 0 ? (
                <p className="p-5 text-[13px] text-lo">Записів ще немає.</p>
              ) : (
                feed.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block px-5 py-3.5 transition-colors hover:bg-surface-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`badge ${
                          item.kind === "Day 1" ? "badge-accent" : "badge-violet"
                        }`}
                      >
                        {item.kind}
                      </span>
                      <span className="mono text-[10.5px] text-lo">
                        {formatDateTime(item.at)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-mid">
                      {item.title}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </Section>

          {topics.some((t) => t.status !== "approved") && (
            <Section index="04" title="Чекають на гейт" delay={400}>
              <div className="card divide-y divide-line overflow-hidden">
                {topics
                  .filter((t) => t.status !== "approved")
                  .slice(0, 4)
                  .map((t) => (
                    <Link
                      key={t.id}
                      href={t.project_id ? `/projects/${t.project_id}` : "/topics"}
                      className="block px-5 py-3.5 transition-colors hover:bg-surface-2"
                    >
                      <span className={`badge badge-dot ${statusBadge(t.status)}`}>
                        {statusLabel(t.status)}
                      </span>
                      <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-mid">
                        {t.title}
                      </p>
                    </Link>
                  ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
