import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { EmptyState, PageHeader, SearchField, Section } from "@/components/ui";
import { stripMarkdown } from "@/components/Markdown";
import {
  formatDate,
  platformBadge,
  plural,
  statusBadge,
  statusLabel,
  type Day2Topic,
} from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Теми Day 2 — AI Shorts Studio" };

type Row = Day2Topic & {
  projects: { niche: string } | null;
  day1_trends: { title: string } | null;
};

function sanitize(q: string) {
  return q.replace(/[,()%*]/g, " ").trim();
}

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const term = sanitize(q);

  const supabase = createClient();
  let query = supabase
    .from("day2_topics")
    .select("*, projects(niche), day1_trends(title)")
    .order("created_at", { ascending: false });

  if (term) {
    query = query.or(`title.ilike.%${term}%,niche.ilike.%${term}%,text.ilike.%${term}%`);
  }

  const { data, error } = await query.returns<Row[]>();
  if (error) throw new Error(error.message);

  const topics = data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="day 2 · day2_topics"
        title="Теми"
        subtitle="Теми контенту з усіх проєктів і їхній статус ручного затвердження."
        actions={
          <SearchField
            action="/topics"
            defaultValue={q}
            placeholder="Пошук за назвою, текстом, нішею…"
          />
        }
      />

      <Section
        index="01"
        title={term ? `Результати пошуку: «${q}»` : "Усі теми"}
        meta={`${topics.length} ${plural(topics.length, "запис", "записи", "записів")}`}
      >
        {topics.length === 0 ? (
          <EmptyState
            title={term ? "Нічого не знайшлося" : "Тем ще немає"}
            hint={
              term
                ? "Спробуйте інше слово або скиньте фільтр."
                : "Теми з'являться після запуску Day 2 або після ручного додавання."
            }
            action={
              term ? (
                <Link href="/topics" className="btn btn-ghost">
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
                    <th>Тема</th>
                    <th>Проєкт</th>
                    <th>Джерело · Day 1</th>
                    <th>Платформа</th>
                    <th>Статус</th>
                    <th>Створено</th>
                    <th className="text-right">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {topics.map((topic) => (
                    <tr key={topic.id}>
                      <td className="max-w-[300px]">
                        <span className="font-medium text-hi">{topic.title}</span>
                        {topic.text && (
                          <p className="mt-1 line-clamp-1 text-[12.5px] text-lo">
                            {stripMarkdown(topic.text)}
                          </p>
                        )}
                      </td>
                      <td className="max-w-[170px]">
                        {topic.project_id ? (
                          <Link
                            href={`/projects/${topic.project_id}`}
                            className="line-clamp-2 text-[13px] text-mid transition-colors hover:text-accent"
                          >
                            {topic.projects?.niche ?? topic.niche}
                          </Link>
                        ) : (
                          <span className="text-[13px] text-lo">{topic.niche}</span>
                        )}
                      </td>
                      <td className="max-w-[190px]">
                        <span className="line-clamp-2 text-[12.5px] text-lo">
                          {topic.day1_trends?.title ?? "—"}
                        </span>
                      </td>
                      <td>
                        {topic.platform ? (
                          <span className={`badge badge-dot ${platformBadge(topic.platform)}`}>
                            {topic.platform}
                          </span>
                        ) : (
                          <span className="text-lo">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge badge-dot ${statusBadge(topic.status)}`}>
                          {statusLabel(topic.status)}
                        </span>
                      </td>
                      <td className="mono whitespace-nowrap text-[12.5px] text-lo">
                        {formatDate(topic.created_at)}
                      </td>
                      <td>
                        <div className="flex justify-end">
                          {topic.project_id ? (
                            <Link
                              href={`/projects/${topic.project_id}/day2/${topic.id}/edit`}
                              className="btn btn-quiet"
                            >
                              Змінити
                            </Link>
                          ) : (
                            <span className="text-[12.5px] text-lo">—</span>
                          )}
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
