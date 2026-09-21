import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { EmptyState, PageHeader, Section } from "@/components/ui";
import {
  formatDateTime,
  parseSegments,
  plural,
  videoStatusBadge,
  videoStatusLabel,
  type Day4Video,
} from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Відео Day 4 — AI Shorts Studio" };

export default async function VideosPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("day4_videos")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<Day4Video[]>();
  if (error) throw new Error(error.message);

  const rows = data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="day 4 · day4_videos"
        title="Відео"
        subtitle="Згенеровані відео зі сценаріїв Day 3 — черга на затвердження перед публікацією."
      />

      <Section
        index="01"
        title="Черга"
        meta={`${rows.length} ${plural(rows.length, "відео", "відео", "відео")}`}
      >
        {rows.length === 0 ? (
          <EmptyState
            title="Відео ще немає"
            hint="Відкрийте одиницю контенту Day 3 і натисніть «Зробити відео» — результат зʼявиться тут."
          />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Відео</th>
                    <th>RAG</th>
                    <th>Сегменти</th>
                    <th>Статус</th>
                    <th>Публікація</th>
                    <th>Створено</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => {
                    const segs = parseSegments(v.segments);
                    return (
                      <tr key={v.id}>
                        <td className="max-w-[340px]">
                          <Link
                            href={`/videos/${v.id}`}
                            className="font-medium text-hi transition-colors hover:text-accent"
                          >
                            {v.title}
                          </Link>
                          <p className="mt-1 line-clamp-1 text-[12.5px] text-lo">{v.niche}</p>
                        </td>
                        <td>
                          <span className={`badge ${v.use_rag ? "badge-accent" : "badge-neutral"}`}>
                            {v.use_rag ? "з бренд-буком" : "без RAG"}
                          </span>
                        </td>
                        <td className="mono text-[12.5px] text-mid">
                          {segs.length} × 8с
                          {v.video_url ? (
                            <span className="text-emerald"> · один файл</span>
                          ) : (
                            <span className="text-amber"> · без файла</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${videoStatusBadge(v.status)}`}>
                            {videoStatusLabel(v.status)}
                          </span>
                        </td>
                        <td className="mono whitespace-nowrap text-[12px] text-lo">
                          {v.publish_at ? formatDateTime(v.publish_at) : "—"}
                        </td>
                        <td className="mono whitespace-nowrap text-[12px] text-lo">
                          {formatDateTime(v.created_at)}
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
