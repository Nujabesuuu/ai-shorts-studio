import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { EmptyState, Hashtags, PageHeader, SearchField, Section } from "@/components/ui";
import { formatDate, platformBadge, plural, type Day1Trend } from "@/lib/db";
import { stripMarkdown } from "@/components/Markdown";

export const dynamic = "force-dynamic";
export const metadata = { title: "Тренди Day 1 — AI Shorts Studio" };

type Row = Day1Trend & { projects: { niche: string } | null };

/** PostgREST `or` розбирає кому й дужки як синтаксис — прибираємо їх із запиту. */
function sanitize(q: string) {
  return q.replace(/[,()%*]/g, " ").trim();
}

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const term = sanitize(q);

  const supabase = createClient();
  let query = supabase
    .from("day1_trends")
    .select("*, projects(niche)")
    .order("created_at", { ascending: false });

  if (term) {
    query = query.or(
      `title.ilike.%${term}%,niche.ilike.%${term}%,hook_idea.ilike.%${term}%,description.ilike.%${term}%`,
    );
  }

  const { data, error } = await query.returns<Row[]>();
  if (error) throw new Error(error.message);

  const trends = data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="day 1 · day1_trends"
        title="Тренди"
        subtitle="Усі тренди з усіх проєктів — результати дослідження Day 1."
        actions={
          <SearchField
            action="/trends"
            defaultValue={q}
            placeholder="Пошук за назвою, хуком, нішею…"
          />
        }
      />

      <Section
        index="01"
        title={term ? `Результати пошуку: «${q}»` : "Усі тренди"}
        meta={`${trends.length} ${plural(trends.length, "запис", "записи", "записів")}`}
      >
        {trends.length === 0 ? (
          <EmptyState
            title={term ? "Нічого не знайшлося" : "Трендів ще немає"}
            hint={
              term
                ? "Спробуйте інше слово або скиньте фільтр."
                : "Тренди з'являться після запуску Day 1 або після ручного додавання."
            }
            action={
              term ? (
                <Link href="/trends" className="btn btn-ghost">
                  Скинути пошук
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Тренд</th>
                    <th>Проєкт</th>
                    <th>Платформа</th>
                    <th>Хештеги</th>
                    <th>Створено</th>
                    <th className="text-right">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.map((trend) => (
                    <tr key={trend.id}>
                      <td className="max-w-[320px]">
                        <Link
                          href={`/projects/${trend.project_id}/day1/${trend.id}/edit`}
                          className="font-medium text-hi transition-colors hover:text-accent"
                        >
                          {trend.title}
                        </Link>
                        {trend.hook_idea && (
                          <p className="mt-1 line-clamp-1 text-[12.5px] text-lo">
                            {stripMarkdown(trend.hook_idea)}
                          </p>
                        )}
                      </td>
                      <td className="max-w-[190px]">
                        <Link
                          href={`/projects/${trend.project_id}`}
                          className="line-clamp-2 text-[13px] text-mid transition-colors hover:text-accent"
                        >
                          {trend.projects?.niche ?? trend.niche}
                        </Link>
                      </td>
                      <td>
                        <span className={`badge badge-dot ${platformBadge(trend.platform)}`}>
                          {trend.platform}
                        </span>
                      </td>
                      <td className="max-w-[220px]">
                        <Hashtags tags={trend.hashtags?.slice(0, 3) ?? null} />
                      </td>
                      <td className="mono whitespace-nowrap text-[12.5px] text-lo">
                        {formatDate(trend.created_at)}
                      </td>
                      <td>
                        <div className="flex justify-end">
                          <Link
                            href={`/projects/${trend.project_id}/day1/${trend.id}/edit`}
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
    </>
  );
}
