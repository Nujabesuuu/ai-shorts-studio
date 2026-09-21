import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { EmptyState, PageHeader, SearchField, Section, StatTile } from "@/components/ui";
import {
  CONTENT_FORMATS,
  CONTENT_STATUSES,
  TONE_TEXT,
  clock,
  contentStatusBadge,
  contentStatusLabel,
  formatBadge,
  formatDate,
  num,
  parseScript,
  plural,
  scoreTone,
  type Day3Content,
} from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Контент Day 3 — AI Shorts Studio" };

type Row = Day3Content & { projects: { niche: string } | null };
type Params = { q?: string; format?: string; status?: string };

/** PostgREST `or` розбирає кому й дужки як синтаксис — прибираємо їх із запиту. */
function sanitize(q: string) {
  return q.replace(/[,()%*]/g, " ").trim();
}

function href(current: Params, patch: Params) {
  const next = { ...current, ...patch };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) {
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/content?${qs}` : "/content";
}

function Chip({
  active,
  children,
  to,
}: {
  active: boolean;
  children: React.ReactNode;
  to: string;
}) {
  return (
    <Link
      href={to}
      className={`mono rounded-lg border px-2.5 py-1.5 text-[11px] tracking-[0.06em] transition-colors ${
        active
          ? "border-accent/45 bg-accent-soft text-accent"
          : "border-line text-mid hover:border-line-strong hover:text-hi"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const { q = "", format = "", status = "" } = params;
  const term = sanitize(q);

  const supabase = createClient();
  let query = supabase
    .from("day3_content")
    .select("*, projects(niche)")
    .order("created_at", { ascending: false });

  if (term) {
    query = query.or(
      `title.ilike.%${term}%,niche.ilike.%${term}%,hook.ilike.%${term}%,caption.ilike.%${term}%`,
    );
  }
  if ((CONTENT_FORMATS as readonly string[]).includes(format)) {
    query = query.eq("format", format);
  }
  if ((CONTENT_STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query.returns<Row[]>();
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const scores = rows.map((r) => num(r.quality_score)).filter((n): n is number => n != null);
  const avg = scores.length
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
    : null;
  const ready = rows.filter((r) => r.status === "ready").length;
  const repaired = rows.filter((r) => r.repaired).length;
  const filtered = Boolean(term || format || status);

  return (
    <>
      <PageHeader
        eyebrow="day 3 · day3_content"
        title="Контент"
        subtitle="Готові до публікації одиниці — те, що флоу Day 3 записав у базу."
        actions={
          <SearchField
            action="/content"
            defaultValue={q}
            placeholder="Пошук за назвою, хуком, підписом…"
          />
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Одиниць" value={rows.length} delay={0} />
        <StatTile
          label="Готово до зйомки"
          value={ready}
          hint={rows.length ? `з ${rows.length}` : undefined}
          delay={60}
        />
        <StatTile
          label="Середній бал"
          value={avg ?? "—"}
          hint="зважена рубрика, 5 критеріїв"
          tone="accent"
          delay={120}
        />
        <StatTile
          label="Пройшли ремонт"
          value={repaired}
          hint="критик відправив на точкову правку"
          delay={180}
        />
      </div>

      <Section
        index="01"
        title={filtered ? "Відфільтровано" : "Увесь контент"}
        meta={`${rows.length} ${plural(rows.length, "одиниця", "одиниці", "одиниць")}`}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip active={!format} to={href(params, { format: "" })}>
              усі формати
            </Chip>
            {CONTENT_FORMATS.map((f) => (
              <Chip key={f} active={format === f} to={href(params, { format: f })}>
                {f}
              </Chip>
            ))}
            <span className="mx-1 h-4 w-px bg-line-strong" aria-hidden />
            <Chip active={!status} to={href(params, { status: "" })}>
              усі статуси
            </Chip>
            {CONTENT_STATUSES.map((s) => (
              <Chip key={s} active={status === s} to={href(params, { status: s })}>
                {contentStatusLabel(s)}
              </Chip>
            ))}
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            title={filtered ? "Під фільтр нічого не підпадає" : "Контенту ще немає"}
            hint={
              filtered
                ? "Спробуйте інший формат, статус або слово в пошуку."
                : "Контент зʼявиться після прогону флоу Day 3 — панель читає ту саму таблицю."
            }
            action={
              filtered ? (
                <Link href="/content" className="btn btn-ghost">
                  Скинути фільтри
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
                    <th>Одиниця контенту</th>
                    <th>Формат</th>
                    <th>Проєкт</th>
                    <th>Бал</th>
                    <th>Статус</th>
                    <th>Прогін</th>
                    <th>Створено</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const score = num(row.quality_score);
                    const frames = parseScript(row.script).length;
                    return (
                      <tr key={row.id}>
                        <td className="max-w-[340px]">
                          <Link
                            href={`/content/${row.id}`}
                            className="font-medium text-hi transition-colors hover:text-accent"
                          >
                            {row.title}
                          </Link>
                          {row.hook && (
                            <p className="mt-1 line-clamp-1 text-[12.5px] text-lo">
                              {row.hook}
                            </p>
                          )}
                        </td>
                        <td>
                          <span className={`badge badge-dot ${formatBadge(row.format)}`}>
                            {row.format}
                          </span>
                          <p className="mono mt-1.5 text-[10.5px] text-lo">
                            {frames} {plural(frames, "кадр", "кадри", "кадрів")}
                            {row.duration_sec ? ` · ${clock(row.duration_sec)}` : ""}
                          </p>
                        </td>
                        <td className="max-w-[170px]">
                          {row.project_id ? (
                            <Link
                              href={`/projects/${row.project_id}`}
                              className="line-clamp-2 text-[13px] text-mid transition-colors hover:text-accent"
                            >
                              {row.projects?.niche ?? row.niche}
                            </Link>
                          ) : (
                            <span className="text-[13px] text-lo">{row.niche}</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`mono text-[14px] tabular-nums ${TONE_TEXT[scoreTone(score)]}`}
                          >
                            {score ?? "—"}
                          </span>
                          {row.repaired && (
                            <p className="mono mt-1 text-[10px] text-lo">після ремонту</p>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${contentStatusBadge(row.status)}`}>
                            {contentStatusLabel(row.status)}
                          </span>
                        </td>
                        <td className="mono whitespace-nowrap text-[11px] text-lo">
                          {row.flow_version ?? "—"}
                        </td>
                        <td className="mono whitespace-nowrap text-[12.5px] text-lo">
                          {formatDate(row.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>
    </>
  );
}
